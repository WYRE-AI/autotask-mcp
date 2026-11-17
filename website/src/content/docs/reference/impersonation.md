---
title: Impersonation
description: Attribute Autotask writes to a specific resource instead of the API user.
---

Autotask can record a write as made by another resource when the request carries the [`ImpersonationResourceId` header](https://ww1.autotask.net/help/developerhelp/Content/APIs/REST/General_Topics/REST_Swagger_UI.htm). The Autotask MCP server supports two ways to set it. **Both are off by default**: unless you configure one, every call runs as the API user.

## Autotask prerequisites

1. The **API user's** security level must allow impersonation for the entities you write (for example TicketNote, ProjectNote, CompanyNote, TimeEntry, Ticket).
2. The **impersonated resource's** security level must have "Allow impersonation of resources with this security level" turned on, and must permit the action itself.
3. For acting-user impersonation, the resource's email must match the acting user's email exactly.

## Explicit resource ID (strict)

| Mode | How to set it |
|------|---------------|
| Env mode (stdio, HTTP, Worker) | `AUTOTASK_IMPERSONATION_RESOURCE_ID=<id>` |
| Env mode over HTTP | Per request: `X-Impersonation-Resource-Id: <id>` (overrides the env value for that request) |
| Gateway mode | Per request: `X-Impersonation-Resource-Id: <id>` (there's no env default) |

The ID applies to every call. If Autotask refuses, the call fails with a hint naming the resource. It is **never** retried as the API user.

## Acting-user impersonation (gateway mode, best-effort)

The gateway sends the signed-in user's verified email in `X-Conduit-Acting-User-Email`. The server uses it only when **both** of these are true:

- The request passed `X-Gateway-S2S` verification (Node HTTP with `CONDUIT_S2S_SECRET`). It's never used on the Cloudflare Worker or an insecure-dev listener.
- Impersonation is opted in:
  - per connection, with `X-Autotask-Impersonate-Acting-User: on` (also `true` or `1`), which the gateway sets from the connection's stored setting (in Conduit: **Connections → Autotask → Manage → Settings → Post writes as the signed-in person**); or
  - for every tenant, with `AUTOTASK_IMPERSONATE_ACTING_USER=true`.

When it applies:

1. On the first **write** of a request, the server looks up active `Resources` with that exact email, as the API user. Reads are never impersonated.
2. If exactly one active resource matches, the write carries its `ImpersonationResourceId`.
3. If there's no single match (none, several, or only inactive ones), the write runs as the API user.
4. If Autotask refuses with a 403, a 4xx that mentions impersonation, or an HTTP 500 saying the logged-in resource "does not have the adequate permissions", the write is **retried once as the API user**.
5. Any other impersonation-related HTTP 500 is not retried (Autotask may have applied it). The call fails, and impersonation is paused for that user and operation, six hours by default.

An explicit resource ID always wins over the acting-user email.

## v2.40.0 regression

v2.40.0 turned acting-user impersonation on for every gateway request and didn't retry Autotask's "does not have the adequate permissions" 500. Tenants whose API user can't impersonate couldn't post ticket notes. v2.41.1 made the feature opt-in and added the retry, and v2.42.0 added the per-connection header. Use v2.41.1 or later.
