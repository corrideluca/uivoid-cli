export const integrationPrompt = `Integrate this project with uivoid: expose its existing API as scoped MCP tools.

0. Discover BASE_URL and auth from the codebase — don't ask the user by rote, and don't assume
   an OpenAPI doc exists.
   - Grep the actual request-auth path (middleware/guard/decorator/handler-level checks,
     whatever the framework calls it) for how it validates requests: header names, cookie/
     session logic, comparison against an env var or secrets store.
   - Check env/config files and README/setup docs for BASE_URL and any static secret's real
     value.
   - If an OpenAPI/Swagger doc happens to exist, use its security/securitySchemes as a
     cross-check, not a substitute for reading the code.
   - Only ask the user directly when it's genuinely undiscoverable (managed/external auth,
     multiple plausible targets, conflicting signals).

1. Look for an OpenAPI document at <BASE_URL>/openapi.json, /api/openapi.json, /swagger.json,
   or a documented equivalent. Not finding one is a normal outcome, not a blocker — go to
   step 5.

2. Run \`npx uivoid whoami\`. Show the user the account/org it prints and confirm that's the
   right one before creating anything. Wrong account → tell the user to run
   \`npx uivoid logout && npx uivoid login\` themselves, then re-check.

3. Have a spec (found or generated in step 5) → before running \`create\`, pick the credential
   flag based on what step 0 found:
   - Header is \`Authorization: Bearer\`/basic/oauth2 → \`--auth-key <value>\` is fine.
   - Any other header (x-api-key, custom, etc.) → \`--auth-header "Header-Name:value"\`
     instead. \`--auth-key\` always sends "Authorization: Bearer <value>" regardless of what
     the API actually checks — a silent mismatch \`create\` won't flag.
   Run: \`npx uivoid create <name> --base-url <BASE_URL>\` (add \`--openapi <path>\` if the doc
   isn't at a default location). No real TTY (a sandboxed/non-interactive shell)? The CLI
   detects this and tells you so; pick one of \`--include <op1>,<op2>,...\`,
   \`--exclude-destructive\`, or \`--yes\` (accepts everything including destructive ops — call
   this out to the user before using it). With a real interactive terminal, just run it and
   let the checkbox prompt drive.

4. Project name already taken → tell the user and ask for a different one, don't silently pick
   your own suffix.

5. No OpenAPI doc → enumerate the actual API routes directly from the code, on whatever stack
   it is. No routes at all: stop, say there's nothing to integrate, don't fabricate a spec.
   Routes exist: show them to the user with a one-line description each, ask which to expose,
   generate operationIds/descriptions only for the chosen ones (using the auth mechanism found
   in step 0, per route), then continue at step 3 with the generated doc.

6. Verify the credential works — make one real request against a live endpoint with the
   determined header — before declaring success.

7. Report back: the MCP URL and a summary of what's exposed (tool count, scopes:
   read/write/destructive). 401s on first real use are almost always the outbound credential
   (step 0/3), not the MCP login — check \`npx uivoid credentials <name> --auth-key <value>\`
   (or \`--auth-header\`) before anything else. Full reference: https://portal.uivoid.app/docs/cli

Return the generated MCP URL and summarize the exposed read, write, and destructive tools.`;
