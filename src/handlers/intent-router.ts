// Helpers for autotask_router / routeIntent().
//
// Ticket search is the easy-to-get-wrong case: autotask_search_tickets.searchTerm
// is a ticket-NUMBER prefix (beginsWith on ticketNumber), not a free-text or
// company-name filter. Company names belong on companyID; "today" belongs on
// createdAfter. See WYREAI-368.

export const WYRE_ROOT_COMPANY_ID = 0;

/** Local aliases for WYRE Technology, Autotask's root company (id 0). No API lookup. */
const WYRE_ALIASES = new Set([
  'wyre',
  'wyre technology',
  'wyre tech',
]);

const TICKET_NUMBER_PREFIX = /\b(T\d{6,}(?:\.\d+)?)\b/i;
const TICKET_NUMBER_ONLY = /^T\d{6,}(?:\.\d+)?$/i;
const DATE_WORD = /^(today|yesterday|tomorrow)$/i;
const COMPANY_STOPWORDS = new Set([
  'me',
  'us',
  'them',
  'all',
  'open',
  'closed',
  'new',
  'today',
  'yesterday',
  'tomorrow',
]);

export interface CompanySearchHit {
  id?: number | undefined;
  companyName?: string | undefined;
}

export type CompanySearcher = (searchTerm: string) => Promise<CompanySearchHit[]>;

export interface TicketSearchRoute {
  suggestedParams: Record<string, string | number>;
  requiredParams: string[];
}

export function utcDateString(now: Date = new Date()): string {
  return now.toISOString().split('T')[0];
}

export function extractCreatedAfter(rawIntent: string, now: Date = new Date()): string | undefined {
  if (/\btoday\b/i.test(rawIntent)) {
    return utcDateString(now);
  }
  return undefined;
}

export function isTicketNumberPrefix(value: string): boolean {
  return TICKET_NUMBER_ONLY.test(value.trim());
}

export function extractTicketNumberPrefix(rawIntent: string): string | undefined {
  const match = rawIntent.match(TICKET_NUMBER_PREFIX);
  return match?.[1];
}

function normalizeCompanyAlias(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function isSkippableCompanyPhrase(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return true;
  if (DATE_WORD.test(trimmed)) return true;
  if (isTicketNumberPrefix(trimmed)) return true;
  if (COMPANY_STOPWORDS.has(trimmed.toLowerCase())) return true;
  return false;
}

/**
 * Pull a company name out of ticket-search phrasing.
 * Quoted names win; otherwise the phrase after at/for/from, stopping at a date word.
 * Ticket-number prefixes are never treated as company names.
 */
export function extractCompanyName(rawIntent: string): string | undefined {
  const quoted = rawIntent.match(/["']([^"']+)["']/);
  if (quoted?.[1] && !isSkippableCompanyPhrase(quoted[1])) {
    return quoted[1].trim();
  }

  const match = rawIntent.match(
    /\b(?:at|for|from)\s+(.+?)(?=\s+(?:today|yesterday|tomorrow)\b|[.,;]|$)/i
  );
  if (!match?.[1]) return undefined;

  let name = match[1].trim().replace(/^["']+|["']+$/g, '').trim();
  name = name.replace(/^(?:the\s+)?(?:company|client|account)\s+/i, '').trim();
  if (isSkippableCompanyPhrase(name)) return undefined;
  return name;
}

export function resolveWyreAlias(name: string): number | undefined {
  if (WYRE_ALIASES.has(normalizeCompanyAlias(name))) {
    return WYRE_ROOT_COMPANY_ID;
  }
  return undefined;
}

function pickUniqueCompanyId(hits: CompanySearchHit[], name: string): number | undefined {
  const withId = hits.filter((c): c is CompanySearchHit & { id: number } => typeof c.id === 'number');
  if (withId.length === 0) return undefined;
  if (withId.length === 1) return withId[0].id;

  const needle = normalizeCompanyAlias(name);
  const exact = withId.filter(
    (c) => normalizeCompanyAlias(c.companyName ?? '') === needle
  );
  if (exact.length === 1) return exact[0].id;

  const prefixed = withId.filter((c) =>
    normalizeCompanyAlias(c.companyName ?? '').startsWith(needle)
  );
  if (prefixed.length === 1) return prefixed[0].id;

  return undefined;
}

/**
 * Map a spoken company name to an Autotask companyID.
 * WYRE aliases short-circuit to 0 (no API). Pure digits are used as-is.
 * Anything else goes through searchCompanies; 0/ambiguous results return undefined.
 */
export async function resolveCompanyId(
  name: string,
  searchCompanies: CompanySearcher
): Promise<number | undefined> {
  const aliasId = resolveWyreAlias(name);
  if (aliasId !== undefined) return aliasId;

  const trimmed = name.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);

  try {
    const hits = await searchCompanies(trimmed);
    return pickUniqueCompanyId(hits, trimmed);
  } catch {
    return undefined;
  }
}

export async function buildTicketSearchParams(
  rawIntent: string,
  searchCompanies: CompanySearcher,
  now: Date = new Date()
): Promise<TicketSearchRoute> {
  const suggestedParams: Record<string, string | number> = {};
  const requiredParams: string[] = [];

  const ticketNumber = extractTicketNumberPrefix(rawIntent);
  if (ticketNumber) {
    suggestedParams.searchTerm = ticketNumber;
  }

  const createdAfter = extractCreatedAfter(rawIntent, now);
  if (createdAfter) {
    suggestedParams.createdAfter = createdAfter;
  }

  const companyName = extractCompanyName(rawIntent);
  if (companyName) {
    const companyID = await resolveCompanyId(companyName, searchCompanies);
    if (companyID !== undefined) {
      suggestedParams.companyID = companyID;
    } else {
      requiredParams.push('companyID');
    }
  }

  return { suggestedParams, requiredParams };
}
