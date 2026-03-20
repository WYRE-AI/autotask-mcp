/**
 * Compact Response Formatter
 * Reduces response size for LLM context windows by selecting only essential fields
 * per entity type and providing pagination metadata.
 */

export type EntityType = 'tickets' | 'companies' | 'contacts' | 'projects' | 'tasks' | 'resources' | 'billingItems' | 'billingItemApprovalLevels' | 'timeEntries';

export interface CompactResponse {
  summary: {
    returned: number;
    hasMore: boolean;
    page: number;
    pageSize: number;
    hint?: string;
  };
  items: Record<string, any>[];
}

/**
 * Fields to include in compact responses, per entity type.
 * These are the minimum fields needed for identification and triage.
 */
const SUMMARY_FIELDS: Record<EntityType, string[]> = {
  tickets: ['id', 'ticketNumber', 'title', 'status', 'priority', 'companyID', 'assignedResourceID', 'createDate', 'dueDateTime'],
  companies: ['id', 'companyName', 'isActive', 'phone', 'city', 'state'],
  contacts: ['id', 'firstName', 'lastName', 'emailAddress', 'companyID'],
  projects: ['id', 'projectName', 'status', 'companyID', 'projectLeadResourceID', 'startDate', 'endDate'],
  tasks: ['id', 'title', 'status', 'projectID', 'assignedResourceID', 'percentComplete'],
  resources: ['id', 'firstName', 'lastName', 'email', 'isActive'],
  billingItems: ['id', 'itemName', 'companyID', 'ticketID', 'projectID', 'postedDate', 'totalAmount', 'invoiceID', 'billingItemType'],
  billingItemApprovalLevels: ['id', 'timeEntryID', 'approvalLevel', 'approvalResourceID', 'approvalDateTime'],
  timeEntries: ['id', 'resourceID', 'ticketID', 'projectID', 'taskID', 'dateWorked', 'hoursWorked', 'summaryNotes'],
};

/**
 * Pick only the summary fields from an item, inlining any _enhanced names.
 */
function pickSummaryFields(item: Record<string, any>, entityType: EntityType): Record<string, any> {
  const fields = SUMMARY_FIELDS[entityType];
  const compact: Record<string, any> = {};

  for (const field of fields) {
    if (item[field] !== undefined && item[field] !== null) {
      compact[field] = item[field];
    }
  }

  // Inline _enhanced names directly into the item (no separate _enhanced object)
  if (item._enhanced) {
    if (item._enhanced.companyName) {
      compact.company = item._enhanced.companyName;
    }
    if (item._enhanced.assignedResourceName) {
      compact.assignedTo = item._enhanced.assignedResourceName;
    }
    if (item._enhanced.resourceName) {
      compact.resourceName = item._enhanced.resourceName;
    }
  }

  return compact;
}

/**
 * Format a list of items into a compact response with pagination metadata.
 */
export function formatCompactResponse(
  items: Record<string, any>[],
  entityType: EntityType,
  options: { page?: number; pageSize?: number; totalFetched?: number }
): CompactResponse {
  const page = options.page || 1;
  const pageSize = options.pageSize || 25;
  const hasMore = items.length >= pageSize;

  const compactItems = items.map(item => pickSummaryFields(item, entityType));

  const hint = hasMore
    ? `Use page:${page + 1} for more results, or use get_ticket_details/show commands for full data on specific items`
    : undefined;

  return {
    summary: {
      returned: compactItems.length,
      hasMore,
      page,
      pageSize,
      ...(hint && { hint }),
    },
    items: compactItems,
  };
}

/**
 * Detect entity type from tool name.
 */
export function detectEntityType(toolName: string): EntityType | null {
  // Order matters - check more specific patterns first
  if (toolName.includes('billing_item_approval')) return 'billingItemApprovalLevels';
  if (toolName.includes('billing_item')) return 'billingItems';
  if (toolName.includes('time_entr')) return 'timeEntries';
  if (toolName.includes('ticket')) return 'tickets';
  if (toolName.includes('compan')) return 'companies';
  if (toolName.includes('contact')) return 'contacts';
  if (toolName.includes('project')) return 'projects';
  if (toolName.includes('task')) return 'tasks';
  if (toolName.includes('resource')) return 'resources';
  return null;
}

/**
 * List of search tool names that should use compact formatting.
 */
export const COMPACT_SEARCH_TOOLS = new Set([
  'autotask_search_tickets',
  'autotask_search_companies',
  'autotask_search_contacts',
  'autotask_search_projects',
  'autotask_search_tasks',
  'autotask_search_resources',
  'autotask_search_billing_items',
  'autotask_search_billing_item_approval_levels',
  'autotask_search_time_entries',
  'autotask_search_ticket_charges',
]);
