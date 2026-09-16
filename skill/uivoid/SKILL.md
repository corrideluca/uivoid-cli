---
name: uivoid
description: Integrate an existing HTTP API with UIvoid, expose selected operations as scoped MCP tools, and return the project's MCP URL. Use when a user asks to remove or replace a backoffice UI, connect a project to UIvoid, or run `uivoid create`.
---

# UIvoid integration

UIvoid turns an existing API into a project-specific MCP server. Treat the existing service as the source of truth; do not recreate its business logic in UIvoid.

## Workflow

1. Inspect the project for its API base URL and OpenAPI document. Prefer an existing OpenAPI document over inferring routes from source.
2. Ensure operations have stable `operationId` values and concise descriptions that explain intent, important constraints, and side effects to an agent.
3. Run `npx uivoid create <name> --base-url <url>`. Pass `--openapi <url-or-path>` when the document is not at `/openapi.json`, `/api/openapi.json`, or `/swagger.json`.
4. Review proposed tools. UIvoid defaults GET to `read`, POST/PUT/PATCH to `write`, and DELETE to `destructive`. Correct any operation whose semantics differ from that default.
5. Return the generated `https://<name>.uivoid.app/mcp` URL and summarize exposed scopes.

Authentication happens through the UIvoid portal in the user's browser. Never ask the user to paste a password into an agent conversation. `UIVOID_TOKEN` is supported for non-interactive environments; do not print or commit it.

If the service has no OpenAPI document, add one using its existing framework when this is within the user's requested scope. Otherwise run `npx uivoid create <name> --no-discover` and explain that endpoint mapping remains.

For reusable project instructions, `npx uivoid prompt` prints a compact integration prompt.
