/**
 * Iframe bridge + renderer for the Autotask ticket card (MCP Apps, SEP-1865).
 *
 * Runs inside the host's sandboxed iframe. Uses the official MCP Apps client
 * (`App`) to receive the tool result from the host and to call
 * autotask_create_ticket_note back (the "Add note" round-trip).
 *
 * The server attaches a normalized `_card` payload to
 * autotask_get_ticket_details results (see src/handlers/card.builder.ts) so
 * this renderer never needs to resolve picklist IDs or entity names itself.
 *
 * Rendering uses DOM construction (no innerHTML) — ticket titles and notes
 * are untrusted PSA data, so text only ever lands in text nodes.
 *
 * Branding: the card is neutral by default (this is a published server) and
 * applies an injected `window.__BRAND__` override — set by the server from
 * MCP_BRAND_* env vars at serve time, or by a gateway per-org — so the same
 * card can render in any operator's brand.
 */
import { App } from "@modelcontextprotocol/ext-apps";

interface Brand {
  name?: string;
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  bg?: string;
  text?: string;
}
declare global {
  interface Window {
    __BRAND__?: Brand;
  }
}

/** Mirror of TicketCard in src/handlers/card.builder.ts — keep in sync. */
interface TicketCard {
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

const brand: Brand = window.__BRAND__ ?? {};
// No brand injected → no brand identity rendered (neutral default).
const brandName = brand.name ?? "";

// Apply any injected brand overrides onto the CSS custom properties.
function applyBrand(): void {
  const root = document.documentElement.style;
  if (brand.primaryColor) root.setProperty("--brand-primary", brand.primaryColor);
  if (brand.accentColor) root.setProperty("--brand-accent", brand.accentColor);
  if (brand.bg) root.setProperty("--brand-bg", brand.bg);
  if (brand.text) root.setProperty("--brand-text", brand.text);
}

const app = new App({ name: "Autotask Ticket Card", version: "1.0.0" });
let current: TicketCard | null = null;

/** Create an element with a class and (safe, text-node) children. */
function el(
  tag: string,
  className = "",
  ...children: Array<Node | string | null>
): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const child of children) {
    if (child == null) continue;
    node.append(child); // strings become text nodes — never parsed as HTML
  }
  return node;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function field(label: string, value: string | undefined, withDot = false): HTMLElement | null {
  if (!value) return null;
  const valueEl = el("div", withDot ? "field__value sla" : "field__value");
  if (withDot) valueEl.append(el("span", "dot"));
  valueEl.append(value);
  return el("div", "field", el("div", "field__label", label), valueEl);
}

function badge(text: string | undefined, cls: string): HTMLElement | null {
  return text ? el("span", `badge ${cls}`, text) : null;
}

function noteEl(n: { title?: string; description: string }): HTMLElement {
  return el(
    "div",
    "note",
    n.title ? el("span", "note__title", `${n.title}: `) : null,
    n.description,
  );
}

function render(t: TicketCard): void {
  current = t;

  // Empty when no brand is injected — the span still occupies the flex slot
  // so the ticket number stays right-aligned.
  const brandId = el("span", "brandid");
  if (brand.logoUrl) {
    const logo = document.createElement("img");
    logo.src = brand.logoUrl;
    logo.alt = brandName || "logo";
    logo.style.display = "inline-block";
    brandId.append(logo);
  }
  if (brandName) brandId.append(el("span", "brand", brandName));

  const notesSection = el("div", "notes", el("div", "notes__h", `Notes (${t.notes.length})`));
  for (const n of t.notes) notesSection.append(noteEl(n));

  if (t.noteDefaults) {
    const input = document.createElement("input");
    input.id = "note-input";
    input.type = "text";
    input.placeholder = "Add an internal note to this ticket…";
    const btn = el("button", "btn", "Add note") as HTMLButtonElement;
    btn.id = "note-btn";

    const submit = async () => {
      const description = input.value.trim();
      if (!description || !current?.noteDefaults) return;
      btn.disabled = true;
      btn.textContent = "Adding…";
      try {
        // The server resolved tenant-safe (internal-visibility) picklist
        // defaults into noteDefaults; the card never guesses IDs itself.
        await app.callServerTool({
          name: "autotask_create_ticket_note",
          arguments: {
            ticketId: current.id,
            description,
            noteType: current.noteDefaults.noteType,
            publish: current.noteDefaults.publish,
          },
        });
        // The note tool returns the created note ID, not the ticket — append
        // optimistically and re-render.
        current.notes = [...current.notes, { description }];
        render(current);
      } catch {
        btn.disabled = false;
        btn.textContent = "Add note";
      }
    };
    btn.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });
    notesSection.append(el("div", "addnote", input, btn));
  }

  const body = el(
    "div",
    "card__body",
    el("div", "brandrow", brandId, el("span", "ticketno", `${t.ticketNumber} · Autotask PSA`)),
    el("h1", "", t.title),
    el("div", "badges", badge(t.status, "badge--status"), badge(t.priority, "badge--prio")),
    el(
      "div",
      "grid",
      field("Company", t.company),
      field("Assigned", t.assignedTo ?? "Unassigned"),
      field("Queue", t.queue, true),
      field("Created", t.createDate && fmtDate(t.createDate)),
      field("Due", t.dueDateTime && fmtDate(t.dueDateTime)),
      field("Est. hours", t.estimatedHours != null ? String(t.estimatedHours) : undefined),
    ),
    notesSection,
  );

  const root = document.getElementById("root")!;
  root.replaceChildren(el("div", "card", el("div", "card__bar"), body));
}

// autotask-mcp wraps tool results as { message, data } and attaches the
// normalized card to ticket-details results as data._card.
function extractCard(obj: unknown): TicketCard | null {
  const o = obj as { data?: { _card?: TicketCard } };
  const card = o?.data?._card;
  return card && typeof card.id === "number" && card.ticketNumber ? card : null;
}

applyBrand();

// Must be set before connect() so the initial tool-result isn't missed.
app.ontoolresult = (result: { content?: Array<{ type: string; text?: string }> }) => {
  const payload = (result.content ?? []).find((c) => c.type === "text");
  if (!payload?.text) return;
  try {
    const card = extractCard(JSON.parse(payload.text));
    if (card) render(card);
  } catch {
    /* ignore malformed payloads */
  }
};

app.connect();
