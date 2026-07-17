// Ticket-card payload builder for the MCP Apps (SEP-1865) UI surface.
//
// autotask_get_ticket_details results get a normalized `_card` object attached
// (see tool.handler.ts) that the ui:// ticket card renders from. The card is
// progressive enhancement: every step here is best-effort, and a null return
// simply means the host renders no card while the JSON payload is unchanged.

import { AutotaskService } from '../services/autotask.service.js';
import { PicklistCache } from '../services/picklist.cache.js';
import { Logger } from '../utils/logger.js';

export const TICKET_CARD_RESOURCE_URI = 'ui://autotask/ticket-card.html';

/** MCP Apps resource MIME (RESOURCE_MIME_TYPE in @modelcontextprotocol/ext-apps). */
export const MCP_APP_RESOURCE_MIME = 'text/html;profile=mcp-app';

/**
 * Tool `_meta` advertising the card. Carries both the canonical flat key
 * (RESOURCE_URI_META_KEY in ext-apps) and the nested form ext-apps'
 * registerAppTool emits, so any MCP Apps host revision finds it.
 */
export const TICKET_CARD_META = {
  'ui/resourceUri': TICKET_CARD_RESOURCE_URI,
  ui: { resourceUri: TICKET_CARD_RESOURCE_URI },
} as const;

/** Mirror of Brand in ui/ticket-card.ts — keep in sync. */
export interface CardBrand {
  name?: string;
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  bg?: string;
  text?: string;
}

const BRAND_INJECT_MARKER = /<!--\s*BRAND_INJECT[\s\S]*?-->/;

/**
 * Operator branding from MCP_BRAND_* env vars. The card ships neutral (this is
 * a published server); self-hosters brand it without rebuilding by setting
 * these, and a gateway can inject window.__BRAND__ per-org the same way.
 */
export function resolveBrandFromEnv(
  env: Record<string, string | undefined> = typeof process !== 'undefined' ? process.env : {},
): CardBrand {
  const brand: CardBrand = {};
  if (env.MCP_BRAND_NAME) brand.name = env.MCP_BRAND_NAME;
  if (env.MCP_BRAND_LOGO_URL) brand.logoUrl = env.MCP_BRAND_LOGO_URL;
  if (env.MCP_BRAND_PRIMARY_COLOR) brand.primaryColor = env.MCP_BRAND_PRIMARY_COLOR;
  if (env.MCP_BRAND_ACCENT_COLOR) brand.accentColor = env.MCP_BRAND_ACCENT_COLOR;
  if (env.MCP_BRAND_BG) brand.bg = env.MCP_BRAND_BG;
  if (env.MCP_BRAND_TEXT) brand.text = env.MCP_BRAND_TEXT;
  return brand;
}

/**
 * Replace the card's BRAND_INJECT marker with a window.__BRAND__ script.
 * An empty brand returns the HTML unchanged (neutral defaults). "<" is
 * escaped so brand values can never break out of the script element.
 */
export function applyBrandInjection(html: string, brand: CardBrand): string {
  if (Object.keys(brand).length === 0) return html;
  const json = JSON.stringify(brand).replace(/</g, '\\u003c');
  return html.replace(BRAND_INJECT_MARKER, `<script>window.__BRAND__=${json}</script>`);
}

/** Mirror of TicketCard in ui/ticket-card.ts — keep in sync. */
export interface TicketCard {
  id: number;
  ticketNumber: string;
  title: string;
  status?: string;
  priority?: string;
  company?: string;
  assignedTo?: string;
  queue?: string;
  createDate?: string;
  dueDateTime?: string;
  estimatedHours?: number;
  notes: Array<{ title?: string; description: string }>;
  noteDefaults?: { noteType: number; publish: number };
}

const CARD_NOTE_LIMIT = 5;
const CARD_NOTE_MAX_LENGTH = 500;

/**
 * Build the renderable card from an (already enhanced) ticket. `ticket` is the
 * enhanceItems output, so `company` / `assignedTo` are resolved name strings
 * when the mapping succeeded.
 */
export async function buildTicketCard(
  ticket: Record<string, any>,
  picklists: PicklistCache,
  service: AutotaskService,
  logger: Logger,
): Promise<TicketCard | null> {
  if (typeof ticket?.id !== 'number' || !ticket.ticketNumber || !ticket.title) {
    return null;
  }

  const card: TicketCard = {
    id: ticket.id,
    ticketNumber: String(ticket.ticketNumber),
    title: String(ticket.title),
    notes: [],
  };
  if (typeof ticket.company === 'string') card.company = ticket.company;
  if (typeof ticket.assignedTo === 'string') card.assignedTo = ticket.assignedTo;
  if (ticket.createDate) card.createDate = String(ticket.createDate);
  if (ticket.dueDateTime) card.dueDateTime = String(ticket.dueDateTime);
  if (typeof ticket.estimatedHours === 'number') card.estimatedHours = ticket.estimatedHours;

  // Picklist labels — one cached getFieldInfo('Tickets') behind all three.
  const status = await picklistLabel(picklists, 'Tickets', 'status', ticket.status, logger);
  const priority = await picklistLabel(picklists, 'Tickets', 'priority', ticket.priority, logger);
  const queue = await picklistLabel(picklists, 'Tickets', 'queueID', ticket.queueID, logger);
  if (status) card.status = status;
  if (priority) card.priority = priority;
  if (queue) card.queue = queue;

  // Recent notes give the card (and its add-note round-trip) visible context.
  try {
    const notes = await service.searchTicketNotes(ticket.id, { pageSize: CARD_NOTE_LIMIT });
    card.notes = notes.slice(0, CARD_NOTE_LIMIT).map((n) => {
      const note: TicketCard['notes'][number] = {
        description: String(n.description ?? '').slice(0, CARD_NOTE_MAX_LENGTH),
      };
      if (n.title) note.title = String(n.title);
      return note;
    });
  } catch (error) {
    logger.debug('Ticket card: note fetch failed, rendering without notes', error);
  }

  const noteDefaults = await resolveNoteDefaults(picklists, logger);
  if (noteDefaults) card.noteDefaults = noteDefaults;

  return card;
}

async function picklistLabel(
  picklists: PicklistCache,
  entity: string,
  fieldName: string,
  value: unknown,
  logger: Logger,
): Promise<string | undefined> {
  if (value == null) return undefined;
  try {
    const values = await picklists.getPicklistValues(entity, fieldName);
    return values.find((v) => String(v.value) === String(value))?.label ?? `#${value}`;
  } catch (error) {
    logger.debug(`Ticket card: picklist lookup failed for ${entity}.${fieldName}`, error);
    return undefined;
  }
}

/**
 * Resolve tenant-safe defaults for the card's "Add note" button.
 * autotask_create_ticket_note requires noteType + publish picklist IDs, which
 * are tenant-specific — the card must never guess them.
 *
 * publish controls client-portal visibility, so only an explicitly
 * internal-labeled value is acceptable as a default. No internal option →
 * no noteDefaults → the card renders read-only. Fail-safe by construction.
 */
async function resolveNoteDefaults(
  picklists: PicklistCache,
  logger: Logger,
): Promise<{ noteType: number; publish: number } | undefined> {
  try {
    const [noteTypes, publishValues] = await Promise.all([
      picklists.getPicklistValues('TicketNotes', 'noteType'),
      picklists.getPicklistValues('TicketNotes', 'publish'),
    ]);

    const noteType =
      noteTypes.find((v) => /task note|general|note/i.test(v.label)) ?? noteTypes[0];
    const publish = publishValues.find((v) => /internal/i.test(v.label));
    if (!noteType || !publish) return undefined;

    const noteTypeId = parseInt(noteType.value, 10);
    const publishId = parseInt(publish.value, 10);
    if (!Number.isFinite(noteTypeId) || !Number.isFinite(publishId)) return undefined;

    return { noteType: noteTypeId, publish: publishId };
  } catch (error) {
    logger.debug('Ticket card: note-default resolution failed, card renders read-only', error);
    return undefined;
  }
}
