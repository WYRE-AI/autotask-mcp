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
    /**
     * Verified email of the acting Conduit user, from the S2S-authenticated
     * X-Conduit-Acting-User-Email header. Used only when
     * impersonationResourceId is unset: writes impersonate the single active
     * Autotask resource with this email, else run as the API user.
     */
    actingUserEmail?: string;
  };
}

 