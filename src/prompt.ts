export const integrationPrompt = `Integrate this project with uivoid: expose its existing API as scoped MCP tools.

0. Ask the user two things up front (don't guess):
   - BASE_URL of the API (e.g. https://myapp.vercel.app). Check for a deployed URL or an .env
     file, or ask directly — don't assume localhost.
   - Auth type on that API: none / static API key (a secret it already checks server-side) /
     OAuth-backed. If static key, get the actual value now — you'll need it in step 3.

1. Find the API's OpenAPI document at <BASE_URL>/openapi.json, /api/openapi.json, or
   /swagger.json.

2. Run \`npx uivoid whoami\`. Show the user the account/org it prints and confirm that's the
   right one before creating anything. Wrong account → tell the user to run
   \`npx uivoid logout && npx uivoid login\` themselves, then re-check.

3. Found an OpenAPI doc → run:
   \`npx uivoid create <name> --base-url <BASE_URL>\`
   Add \`--openapi <path>\` if the doc isn't at a default location, and \`--auth-key <value>\`
   (or \`--auth-header "Header-Name:value"\` for a non-Authorization header) if you collected a
   static key in step 0. No real TTY (a sandboxed/non-interactive shell)? The CLI detects this
   and tells you so; pick one of \`--include <op1>,<op2>,...\`, \`--exclude-destructive\`, or
   \`--yes\` (accepts everything including destructive ops — call this out to the user before
   using it). With a real interactive terminal, just run it and let the checkbox prompt drive.

4. Project name already taken → tell the user and ask for a different one, don't silently pick
   your own suffix.

5. No OpenAPI doc → check for existing API routes. None: stop, say there's nothing to
   integrate. Some: show them to the user with a one-line description each, ask which to
   expose, generate OpenAPI operations only for those (stable operationId, concise
   agent-facing description), then continue at step 3.

6. Report back: the MCP URL and a summary of what's exposed (tool count, scopes:
   read/write/destructive). 401s on first real use are almost always the outbound credential
   (step 0/3), not the MCP login — check \`npx uivoid credentials <name> --auth-key <value>\`
   before anything else. Full reference: https://portal.uivoid.app/docs/cli

Return the generated MCP URL and summarize the exposed read, write, and destructive tools.`;
