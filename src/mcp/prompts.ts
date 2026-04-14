// MCP Prompt Handlers for Autotask MCP Server
// Exposes pre-baked prompt templates via ListPrompts and GetPrompt handlers

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

export function registerPromptHandlers(server: Server): void {
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [
      {
        name: 'ticket-queue-review',
        description: 'Review open ticket queue, group by priority, and flag SLA risks',
        arguments: [
          {
            name: 'client_name',
            description: 'Filter to a specific client (optional)',
            required: false,
          },
          {
            name: 'priority',
            description: 'Filter by priority level (optional)',
            required: false,
          },
        ],
      },
      {
        name: 'weekly-sla-report',
        description: 'Generate a weekly SLA performance summary for a client',
        arguments: [
          {
            name: 'client_name',
            description: 'The client to generate the report for',
            required: true,
          },
          {
            name: 'date_range',
            description: 'Date range to cover, e.g. "last 7 days" or "2025-04-07 to 2025-04-14" (optional)',
            required: false,
          },
        ],
      },
      {
        name: 'escalation-summary',
        description: "Summarize a ticket's full history to prepare for an escalation call",
        arguments: [
          {
            name: 'ticket_id',
            description: 'The Autotask ticket ID to summarize',
            required: true,
          },
        ],
      },
      {
        name: 'new-ticket-draft',
        description: 'Draft a well-structured Autotask ticket from a plain-language issue description',
        arguments: [
          {
            name: 'issue_description',
            description: 'Plain-language description of the issue',
            required: true,
          },
          {
            name: 'client_name',
            description: 'The client the ticket is for',
            required: true,
          },
        ],
      },
    ],
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'ticket-queue-review':
        return {
          description: 'Review open ticket queue, group by priority, flag SLA risks',
          messages: [
            {
              role: 'user' as const,
              content: {
                type: 'text' as const,
                text: [
                  `Review the current open ticket queue${args?.client_name ? ` for ${args.client_name}` : ' across all clients'}.`,
                  'Use the available Autotask tools to:',
                  `1. List all open tickets${args?.priority ? ` with priority ${args.priority}` : ''},`,
                  '2. Group them by priority and age (how long since opened),',
                  '3. Identify any tickets approaching or past their SLA due date,',
                  '4. Flag tickets that have had no activity in the last 24 hours,',
                  '5. Suggest an order of work for the next 2 hours based on priority and SLA risk.',
                  '',
                  'Present results in a clear, actionable format with a summary table followed by priority callouts.',
                ].join('\n'),
              },
            },
          ],
        };

      case 'weekly-sla-report': {
        const dateContext = args?.date_range
          ? ` for the period: ${args.date_range}`
          : ' for the last 7 days';
        return {
          description: 'Weekly SLA performance summary',
          messages: [
            {
              role: 'user' as const,
              content: {
                type: 'text' as const,
                text: [
                  `Generate a weekly SLA performance report for ${args?.client_name}${dateContext}.`,
                  '',
                  'Use the available Autotask tools to:',
                  '1. Retrieve all tickets created and/or resolved in that period for the client,',
                  '2. Calculate: total tickets opened, total resolved, average resolution time, SLA compliance rate,',
                  '3. Identify any tickets that breached SLA (resolved late or still open past due),',
                  '4. Highlight the top 3 issue categories by volume,',
                  '5. Note any recurring issues or patterns worth calling out.',
                  '',
                  'Format the output as a concise report suitable for sharing with the client — use tables and bullet points.',
                ].join('\n'),
              },
            },
          ],
        };
      }

      case 'escalation-summary':
        return {
          description: "Ticket history summary for escalation call",
          messages: [
            {
              role: 'user' as const,
              content: {
                type: 'text' as const,
                text: [
                  `Prepare an escalation summary for Autotask ticket #${args?.ticket_id}.`,
                  '',
                  'Use the available Autotask tools to:',
                  '1. Fetch the full ticket details including title, description, status, priority, and SLA dates,',
                  '2. Retrieve all notes and time entries on the ticket in chronological order,',
                  '3. Identify who has worked on the ticket and what actions were taken,',
                  '4. Note any SLA breaches or approaching deadlines,',
                  '5. Summarise the current situation in 2-3 sentences suitable for a manager briefing,',
                  '6. List any outstanding action items or blockers.',
                  '',
                  'Format as a structured escalation brief with sections: Overview, Timeline, Current Status, Outstanding Actions.',
                ].join('\n'),
              },
            },
          ],
        };

      case 'new-ticket-draft':
        return {
          description: 'Draft a well-structured ticket from an issue description',
          messages: [
            {
              role: 'user' as const,
              content: {
                type: 'text' as const,
                text: [
                  `Draft a well-structured Autotask ticket for the following issue reported by ${args?.client_name}:`,
                  '',
                  `"${args?.issue_description}"`,
                  '',
                  'Use the available Autotask tools to:',
                  '1. Look up the company in Autotask to confirm the client name and get their ID,',
                  '2. Check for any existing open tickets that might be duplicates of this issue,',
                  '3. Suggest appropriate values for: Title, Description, Priority, Queue, and Category',
                  '   based on the nature of the issue.',
                  '',
                  'Draft the ticket with:',
                  '- A concise, descriptive title (under 100 characters)',
                  '- A clear description with: Impact, Steps to Reproduce (if applicable), Expected vs Actual behaviour',
                  '- Recommended priority and queue assignment',
                  '- Any immediate next steps the assigned technician should take',
                  '',
                  'Present the draft for review before creating it. Do NOT create the ticket until confirmed.',
                ].join('\n'),
              },
            },
          ],
        };

      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  });
}
