export const integrationPrompt = `Integrate this project with uivoid: expose its existing API as scoped MCP tools.

0. Discover BASE_URL and auth from the codebase — don't ask by rote, and don't assume an OpenAPI doc exists.
   - Grep the actual request-auth path (middleware/guard/decorator/handler-level checks, whatever the framework calls it) for how it validates requests: header names, cookie/session logic, comparison against an env var or secrets store — or JWT/JWKS-based verification (issuer, audience, a JWKS/well-known endpoint), which means the API already has its own end-users authenticating through a real login system, not one shared secret.
   - Check env/config files and README/setup docs for BASE_URL, a static secret's real value, or an already-configured OAuth issuer/JWKS/audience.
   - If an OpenAPI/Swagger doc happens to exist, use its security/securitySchemes as a cross-check, not a substitute for reading the code.
   - Only ask me directly when it's genuinely undiscoverable (managed/external auth, multiple plausible targets, conflicting signals).

1. Look for an OpenAPI document at <BASE_URL>/openapi.json, /api/openapi.json, /swagger.json, or a documented equivalent. Not finding one is a normal outcome, not a blocker — go to step 4.

2. Run \`npx uivoid whoami\`, show me the account/org, confirm before creating anything.

3. Have a spec (found or generated in step 4) → before running \`create\`, pick the auth approach based on what step 0 found:
   - One static secret, header is \`Authorization: Bearer\`/basic/oauth2 → \`--auth-key\` is fine.
   - One static secret, any other header (x-api-key, custom, etc.) → \`--auth-header "<HeaderName>:<value>"\` instead. (\`--auth-key\` always sends "Authorization: Bearer <value>" regardless of what the API actually checks — a silent mismatch that \`create\` won't flag.)
   - Real per-user auth (JWT/JWKS validation, a real identity provider, or the app's own login issuing tokens) → don't collapse every caller into one shared key. Run \`create\` as usual (no credential flag needed — passthrough auth is configured separately), then run \`uivoid oauth-config <project> --issuer <issuer> --jwks-url <jwks_url> --audience <audience> --login-mode oauth|custom_handoff ...\`. The provider's own authorize/token URLs and issuer/JWKS/audience are usually discoverable from the code or its config; a \`--client-id\`/\`--client-secret\` for \`--login-mode oauth\` is NOT — that's a new OAuth client the identity provider issues specifically for uivoid, so stop and ask me for it (or ask me to create one first). Same for \`--login-mode custom_handoff\`'s \`--handoff-url\` — that's a page the team building the target app has to implement, not something already in this codebase; confirm it exists before configuring it.
   No real terminal → \`--include\`/\`--exclude-destructive\`/\`--yes\` (flag destructive-ops inclusion first) instead of the interactive checkbox.

4. No OpenAPI doc → enumerate the actual API routes directly from the code, on whatever stack it is. No routes at all: stop, say so, don't fabricate a spec. Routes exist: show them one-by-one with a description, ask which to expose, generate operationIds/descriptions only for the chosen ones (using the auth mechanism found in step 0 per-route), then proceed to step 3 with the generated doc.

5. Verify the credential works — make one real request against a live endpoint with the determined header (or, for passthrough auth, confirm \`oauth-config\` reports the config as saved, and note the callback URL it prints still needs registering with the identity provider) — before declaring success. Report: MCP URL, tool count, scopes (read/write/destructive). Full reference: portal.uivoid.app/docs/authentication`;
