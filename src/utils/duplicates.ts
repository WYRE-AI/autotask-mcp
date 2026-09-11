// Duplicate-ticket detection
//
// Adapted from work by @Loffler-NOC in Loffler-NOC/autotask-mcp (Apache-2.0).
//
// Boards grow duplicates one specific way: an email reply (human or
// auto-reply) misses the ticket-number tag and the incoming-email processor
// opens a NEW ticket for the same issue. Two tickets, two engineers, one
// problem. Detection therefore leans on the signals that pattern leaves
// behind: same company, near-identical title once reply prefixes are
// stripped, same contact, created close together — plus the unambiguous case
// where one ticket's text quotes another open ticket's number.
//
// Everything here is pure (no I/O) so it can be unit-tested without an
// Autotask tenant; the MCP handler feeds it the open-ticket list.

// `| undefined` on every optional field: rows come from the Autotask API
// layer (and tests) where keys are often present-but-undefined, which
// exactOptionalPropertyTypes would otherwise reject.
export interface DuplicateCandidate {
  id?: number | undefined;
  ticketNumber?: string | undefined;
  title?: string | undefined;
  description?: string | undefined;
  status?: number | undefined;
  companyID?: number | undefined;
  contactID?: number | undefined;
  assignedResourceID?: number | undefined;
  createDate?: string | undefined;
  lastActivityDate?: string | undefined;
  [key: string]: any;
}

export interface DuplicateCluster {
  /** Member tickets, original objects, recommended primary first. */
  tickets: DuplicateCandidate[];
  /** Highest pair score inside the cluster (0..1). */
  confidence: number;
  /** Human-readable match reasons, deduplicated across pairs. */
  reasons: string[];
  /** True when two or more DIFFERENT engineers are assigned inside the cluster. */
  multipleEngineers: boolean;
  /** Ticket to keep: one an engineer is already working, oldest first. */
  recommendedPrimaryId: number;
  /** The rest of the cluster — candidates to consolidate into the primary. */
  suspectedDuplicateIds: number[];
}

export interface DuplicateOptions {
  /** Pair score needed to link two tickets (0.5..1). Default 0.7. */
  threshold?: number;
  /**
   * Ignore pairs created further apart than this, unless one explicitly
   * references the other's ticket number. Recurring alerts ("Backup failed")
   * legitimately reuse identical titles for weeks; reply-spawned duplicates
   * arrive within hours. Default 336h (14 days). 0 disables the limit.
   */
  maxSpreadHours?: number;
}

// Prefixes email clients (and Autotask's own notifications) stack onto a
// subject line. Stripped repeatedly: "RE: FW: Automatic reply: X" -> "X".
const REPLY_PREFIX =
  /^\s*(?:re|fw|fwd|automatic reply|auto-?reply|out of office|read|accepted|declined|undeliverable)\s*:\s*/i;
// Bracketed NOISE tags only: "[EXTERNAL]", "[SPAM?]", "[Ticket #T2026...]".
// Deliberately not all brackets — subject lines like "Opportunity
// Closed:[Quote Q10029]" carry their distinguishing detail inside the
// brackets, and stripping it makes unrelated tickets look identical.
const NOISE_TAG =
  /\[\s*(?:external|spam\??|caution|secured?|encrypted?|phishing|automated|bulk|ticket\s*#?\s*t?[\d.]*)\s*\]/gi;
// Autotask ticket numbers, e.g. T20260708.0004.
const TICKET_NUMBER = /T\d{8}\.\d{4}/gi;
// Child-ticket numbers: T20260528.0006.004 is the 4th child of parent
// T20260528.0006. Siblings are bulk-created on purpose (one per device or
// placement) with identical titles — never duplicates of each other.
const CHILD_TICKET = /^(T\d{8}\.\d{4})\.\d+$/i;

/** Parent ticket number if this is a child ticket, else null. */
export function parentTicketNumber(ticketNumber: string | undefined): string | null {
  const match = CHILD_TICKET.exec(String(ticketNumber ?? '').trim());
  return match ? match[1].toUpperCase() : null;
}

/** True if the raw title arrived as a reply/forward/auto-reply. */
export function hasReplyPrefix(title: string | undefined): boolean {
  // Look past leading noise tags: "[EXTERNAL] RE: foo" is still a reply.
  return REPLY_PREFIX.test(String(title ?? '').replace(NOISE_TAG, ' ').trimStart());
}

/**
 * Reduce a subject line to its comparable core: strip reply prefixes,
 * bracket tags, and ticket numbers; lowercase; keep only alphanumerics.
 */
export function normalizeTitle(title: string | undefined): string {
  let text = String(title ?? '');
  for (let guard = 0; guard < 10; guard++) {
    const next = text.replace(REPLY_PREFIX, '').replace(NOISE_TAG, ' ').trimStart();
    if (next === text) break;
    text = next;
  }
  return text
    .replace(TICKET_NUMBER, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenSet(normalized: string): Set<string> {
  return new Set(normalized.split(' ').filter(word => word.length > 0));
}

/**
 * Similarity of two normalized titles in 0..1. Dice coefficient over token
 * sets, with a containment fallback so "printer jam" still matches
 * "printer jam 3rd floor" strongly.
 */
export function titleSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const tokensA = tokenSet(a);
  const tokensB = tokenSet(b);
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let common = 0;
  for (const word of tokensA) if (tokensB.has(word)) common++;
  if (common === 0) return 0;
  const dice = (2 * common) / (tokensA.size + tokensB.size);
  const containment = common / Math.min(tokensA.size, tokensB.size);
  return Math.max(dice, containment * 0.9);
}

function parseDate(value: string | undefined): number | null {
  const ms = value ? Date.parse(value) : NaN;
  return Number.isNaN(ms) ? null : ms;
}

interface PairEdge {
  a: number; // index into tickets[]
  b: number;
  score: number;
  reasons: string[];
}

function hoursBetween(x: DuplicateCandidate, y: DuplicateCandidate): number | null {
  const dx = parseDate(x.createDate);
  const dy = parseDate(y.createDate);
  return dx !== null && dy !== null ? Math.abs(dx - dy) / 3_600_000 : null;
}

function scorePair(
  x: DuplicateCandidate,
  y: DuplicateCandidate,
  opts: Required<DuplicateOptions>,
  crossReferenced: boolean
): { score: number; reasons: string[] } | null {
  const reasons: string[] = [];
  // Assigned by both branches below (each of which either sets it or returns
  // null), so there is no meaningful zero to start from.
  let score: number;
  // Only hard evidence may score above 0.9: an explicit cross-reference or an
  // identical normalized title. Bonuses must not promote a fuzzy title match
  // to "near-certain" — a threshold of 0.95 means exactly that.
  let cap = 0.9;
  const hoursApart = hoursBetween(x, y);

  if (crossReferenced) {
    score = 0.95;
    cap = 1;
    reasons.push("one ticket's text references the other's ticket number");
  } else {
    if (opts.maxSpreadHours > 0 && hoursApart !== null && hoursApart > opts.maxSpreadHours) {
      return null; // too far apart — likely a recurring issue, not a duplicate
    }
    const similarity = titleSimilarity(normalizeTitle(x.title), normalizeTitle(y.title));
    if (similarity < 0.45) return null; // unrelated titles; no bonus should link them
    score = similarity;
    if (similarity === 1) cap = 1;
    reasons.push(similarity === 1
      ? 'identical title (after stripping RE:/FW:/tags)'
      : `similar titles (${Math.round(similarity * 100)}% match)`);
    if (hasReplyPrefix(x.title) || hasReplyPrefix(y.title)) {
      score += 0.05;
      reasons.push('at least one arrived as an email reply/auto-reply (RE:/FW:)');
    }
  }

  if (x.contactID != null && x.contactID === y.contactID) {
    score += 0.1;
    reasons.push('same contact');
  }
  if (hoursApart !== null && hoursApart <= 72) {
    score += 0.1;
    reasons.push(`created within ${Math.max(1, Math.round(hoursApart))}h of each other`);
  }

  score = Math.min(cap, score);
  return score >= opts.threshold ? { score, reasons } : null;
}

/** Undirected pair keys ("i:j", i < j) where one ticket quotes the other's number. */
function findCrossReferences(tickets: DuplicateCandidate[]): Set<string> {
  const byNumber = new Map<string, number>();
  tickets.forEach((ticket, index) => {
    if (ticket.ticketNumber) byNumber.set(String(ticket.ticketNumber).toUpperCase(), index);
  });
  const links = new Set<string>();
  tickets.forEach((ticket, index) => {
    const text = `${ticket.title ?? ''} ${ticket.description ?? ''}`;
    for (const match of text.match(TICKET_NUMBER) ?? []) {
      const other = byNumber.get(match.toUpperCase());
      if (other !== undefined && other !== index) links.add(pairKey(index, other));
    }
  });
  return links;
}

function pairKey(i: number, j: number): string {
  return i < j ? `${i}:${j}` : `${j}:${i}`;
}

/** Minimal union-find used to merge pairwise matches into clusters. */
class UnionFind {
  private parent: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }

  find(x: number): number {
    let node = x;
    while (this.parent[node] !== node) {
      this.parent[node] = this.parent[this.parent[node]];
      node = this.parent[node];
    }
    return node;
  }

  union(a: number, b: number): void {
    this.parent[this.find(a)] = this.find(b);
  }
}

/**
 * Cluster open tickets into likely-duplicate groups.
 *
 * Pairwise comparison runs within each company bucket (plus explicit
 * ticket-number cross-references, which may span companies). Pairs at or
 * above the threshold are merged with union-find; each cluster reports its
 * strongest evidence, whether two engineers are working it, and which ticket
 * to keep.
 */
export function findDuplicateClusters(
  tickets: DuplicateCandidate[],
  options: DuplicateOptions = {}
): { clusters: DuplicateCluster[]; pairsCompared: number } {
  const opts: Required<DuplicateOptions> = {
    threshold: Math.min(1, Math.max(0.5, options.threshold ?? 0.7)),
    maxSpreadHours: options.maxSpreadHours ?? 336,
  };

  const crossReferences = findCrossReferences(tickets);
  const unionFind = new UnionFind(tickets.length);
  const edges: PairEdge[] = [];
  const compared = new Set<string>();
  let pairsCompared = 0;

  const tryPair = (i: number, j: number): void => {
    pairsCompared++;
    // Children of the SAME parent ticket are deliberate siblings (bulk-created
    // one per device/placement, identical titles) — never duplicates.
    const parent = parentTicketNumber(tickets[i].ticketNumber);
    if (parent !== null && parent === parentTicketNumber(tickets[j].ticketNumber)) return;
    const match = scorePair(tickets[i], tickets[j], opts, crossReferences.has(pairKey(i, j)));
    if (!match) return;
    edges.push({ a: i, b: j, score: match.score, reasons: match.reasons });
    unionFind.union(i, j);
  };

  // Company buckets: reply-spawned duplicates always land in the same company,
  // so comparing across companies only adds noise (and O(n^2) work).
  const buckets = new Map<string, number[]>();
  tickets.forEach((ticket, index) => {
    const key = ticket.companyID != null ? String(ticket.companyID) : 'none';
    const bucket = buckets.get(key) ?? [];
    bucket.push(index);
    buckets.set(key, bucket);
  });

  for (const indices of buckets.values()) {
    for (let x = 0; x < indices.length; x++) {
      for (let y = x + 1; y < indices.length; y++) {
        compared.add(pairKey(indices[x], indices[y]));
        tryPair(indices[x], indices[y]);
      }
    }
  }
  // Cross-references not already covered by a same-company comparison.
  for (const key of crossReferences) {
    if (compared.has(key)) continue;
    const [i, j] = key.split(':').map(Number);
    tryPair(i, j);
  }

  const groups = new Map<number, number[]>();
  tickets.forEach((_, index) => {
    const root = unionFind.find(index);
    const group = groups.get(root) ?? [];
    group.push(index);
    groups.set(root, group);
  });

  const clusters: DuplicateCluster[] = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const memberSet = new Set(members);
    const clusterEdges = edges.filter(edge => memberSet.has(edge.a) && memberSet.has(edge.b));
    const memberTickets = members.map(index => tickets[index]);
    const assignees = new Set(
      memberTickets
        .map(ticket => ticket.assignedResourceID)
        .filter((resource): resource is number => resource != null)
    );

    // Primary = the ticket someone is already working (assigned), oldest
    // first so history and time entries stay on the original thread.
    const byPreference = [...memberTickets].sort((x, y) => {
      const xAssigned = x.assignedResourceID != null ? 0 : 1;
      const yAssigned = y.assignedResourceID != null ? 0 : 1;
      if (xAssigned !== yAssigned) return xAssigned - yAssigned;
      const dx = parseDate(x.createDate) ?? Number.MAX_SAFE_INTEGER;
      const dy = parseDate(y.createDate) ?? Number.MAX_SAFE_INTEGER;
      if (dx !== dy) return dx - dy;
      return (x.id ?? 0) - (y.id ?? 0);
    });
    const [primary, ...duplicates] = byPreference;

    clusters.push({
      tickets: byPreference,
      confidence: Math.max(...clusterEdges.map(edge => edge.score)),
      reasons: [...new Set(clusterEdges.flatMap(edge => edge.reasons))],
      multipleEngineers: assignees.size >= 2,
      recommendedPrimaryId: primary.id ?? -1,
      suspectedDuplicateIds: duplicates.map(ticket => ticket.id ?? -1),
    });
  }

  // Most urgent first: double-assigned issues, then strongest evidence, then
  // bigger clusters.
  clusters.sort((a, b) => {
    if (a.multipleEngineers !== b.multipleEngineers) return a.multipleEngineers ? -1 : 1;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.tickets.length - a.tickets.length;
  });

  return { clusters, pairsCompared };
}
