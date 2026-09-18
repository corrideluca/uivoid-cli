---
name: uivoid
description: Integrate an existing HTTP API with UIvoid, expose selected operations as scoped MCP tools, and return the project's MCP URL. Use when a user asks to remove or replace a backoffice UI, connect a project to UIvoid, or run `uivoid create`.
---

# UIvoid integration

UIvoid turns an existing API into a project-specific MCP server. Treat the existing service as the source of truth; do not recreate its business logic in UIvoid.

## Workflow

1. Run `npx uivoid whoami` and confirm the account/org it prints is the right one before creating anything. Wrong account: tell the user to `uivoid logout && uivoid login` themselves.
2. Inspect the project for its API base URL and OpenAPI document. Prefer an existing OpenAPI document over inferring routes from source. Also determine what auth the existing API expects: none, or a static credential (get the actual value now if so).
3. Ensure operations have stable `operationId` values and concise descriptions that explain intent, important constraints, and side effects to an agent.
4. Run `npx uivoid create <name> --base-url <url>`. Pass `--openapi <url-or-path>` when the document is not at `/openapi.json`, `/api/openapi.json`, or `/swagger.json`, and `--auth-key <value>` (or `--auth-header "Header-Name:value"` for a non-Authorization header) if the target API already expects a static credential. With a real interactive terminal, let the checkbox prompt drive selection. Without one, the CLI detects it and errors instead of hanging — pass `--include tool1,tool2,...`, `--exclude-destructive`, or `--yes` (accepts everything including destructive ops; call this out to the user first).
5. Review proposed tools. UIvoid defaults GET to `read`, POST/PUT/PATCH to `write`, and DELETE to `destructive`. Correct any operation whose semantics differ from that default.
6. Return the generated `https://<name>.uivoid.app/mcp` URL and summarize exposed scopes.

Authentication happens through the UIvoid portal in the user's browser. Never ask the user to paste a password into an agent conversation. `UIVOID_TOKEN` is supported for non-interactive environments; do not print or commit it.

If the service has no OpenAPI document, add one using its existing framework when this is within the user's requested scope. Otherwise run `npx uivoid create <name> --no-discover` and explain that endpoint mapping remains.

If the first real tool call 401s, that's almost always the outbound credential, not the MCP login: run `npx uivoid credentials <name> --auth-key <value>` to fix it without recreating the project.

For reusable project instructions, `npx uivoid prompt` prints a compact integration prompt.
