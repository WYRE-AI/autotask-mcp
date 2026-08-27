// MCP Protocol Type Definitions
// Based on Model Context Protocol specification

export interface McpServerConfig {
  name: string;
  version: string;
  autotask: {
    username?: string;
    integrationCode?: string;
    secret?: string;
    apiUrl?: string;
    /**
     * Autotask resource ID to act on behalf of. When set, requests carry
     * Autotask's `ImpersonationResourceId` header, so Autotask attributes the
     * action to that resource rather than to the API user, and records it in
     * the entity's read-only `impersonatorCreatorResourceID` field.
     */
    impersonationResourceId?: number;
  };
}

 