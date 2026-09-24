# uivoid CLI

Create an organization-owned [UIvoid](https://www.uivoid.app/) MCP project from an existing API.

UIvoid is model-agnostic. The generated URL is a standard remote MCP server, so it can be used by Claude, OpenAI clients, and other agents or applications that support remote MCP servers. It does not require a particular model provider; the host application only needs MCP support.

```bash
npx uivoid create my-app
```

The CLI opens the UIvoid portal for login, asks for the existing API's base URL, discovers its OpenAPI document, lets you review the operations and scopes, creates the project in your organization, activates its MCP server, and prints its MCP URL:

```text
✓ Created my-app
✓ Found OpenAPI document at https://api.example.com/openapi.json
✓ Mapped 9 scoped tools
✓ MCP server active

Ready  https://my-app.uivoid.app/mcp
Auth: organization login · 9 tools mapped
```

## Commands

```bash
npx uivoid login
npx uivoid whoami [--json]
npx uivoid org list [--json]
npx uivoid org use <slug>
npx uivoid team list [--org SLUG] [--json]
npx uivoid team invite <email> [--role member|admin|owner] [--org SLUG] [--json]
npx uivoid team revoke <email-or-invite-id> [--org SLUG]
npx uivoid team role <email> <owner|admin|member> [--org SLUG]
npx uivoid team remove <email> [--org SLUG] [--yes]
npx uivoid team leave [--org SLUG] [--yes]
npx uivoid invite accept <link> [--use] [--json]
npx uivoid create [name] [--base-url URL] [--openapi URL] [--yes]
npx uivoid create [name] [--auth-key VALUE] [--auth-header "Header-Name:value"]
npx uivoid create [name] [--include tool1,tool2,...] [--exclude-destructive] [--json]
npx uivoid create [name] [--org SLUG] --no-discover
npx uivoid credentials <project> [--auth-key VALUE] [--auth-header "Header-Name:value"]
npx uivoid prompt
npx uivoid skill [--install]
npx uivoid logout
```

`create` discovers `/openapi.json`, `/api/openapi.json`, or `/swagger.json`. Use `--openapi` for another location. GET operations default to `read`, POST/PUT/PATCH to `write`, and DELETE to `destructive`; the interactive review keeps destructive tools unselected by default.

For CI, provide `UIVOID_TOKEN` and one non-interactive endpoint-selection flag: `--yes` (accept everything, including destructive), `--include tool1,tool2,...` (an explicit allowlist), or `--exclude-destructive` (everything except DELETE-derived tools). If none of those is passed and the CLI can't detect a real interactive terminal — or `--json` is set, since an interactive prompt would otherwise write to stdout ahead of the JSON line — it prints a clear error explaining which flag to add, instead of hanging waiting for input. `UIVOID_API_URL` and `UIVOID_PORTAL_URL` override the production services for local development. Credentials are stored at `~/.config/uivoid/config.json` with mode `0600`.

### Teams and organizations

An account can belong to several organizations. Commands that act on one take `--org <slug>`; without it they use the default set by `uivoid org use <slug>` (or your only organization). `uivoid whoami` shows the current default and your role.

Roles: **owner** (everything, including roles and owner invites), **admin** (manage projects, keys and credentials; invite members and admins) and **member** (read-only in the control plane; can use the organization's MCP servers with read and write tools, but not destructive ones).

`uivoid team invite teammate@company.com --role admin` prints a one-time invite link. Send it yourself — it works only for that email address and expires after 7 days; inviting the same address again replaces it. The teammate runs `uivoid invite accept <link>` (or opens the link in the portal).

### Outbound credentials

The MCP tools uivoid generates call back into your existing API, and that API usually expects its own credential. Pass `--auth-key <value>` (sent as `Authorization: Bearer <value>`) or `--auth-header "Header-Name:value"` (a custom header) at `create` time, or set/replace it later without recreating the project:

```bash
npx uivoid credentials my-app --auth-key sk_live_...
```

If you pass neither flag at `create` time, uivoid generates a credential for you and prints it once — save it immediately, since it isn't shown again.

## Hosted MCP domain and existing API hosting

Each project gets a dedicated `https://<project>.uivoid.app/mcp` subdomain. UIvoid hosts the MCP gateway; your existing API can stay self-hosted wherever UIvoid can reach it. The CLI does not purchase a domain or deploy the gateway onto your infrastructure.

Manage projects at [portal.uivoid.app](https://portal.uivoid.app). In addition to static outbound credentials, `npx uivoid oauth-config --help` describes per-user OAuth/JWT passthrough configuration. Register the callback URL printed by that command with your identity provider and test login before treating the integration as ready.

## Agent prompt and skill

`npx uivoid prompt` prints a provider-neutral prompt that Claude, Codex, or another coding agent can use to prepare the current project and run the integration.

The [UIvoid skill](skill/uivoid/SKILL.md) guides API discovery, missing `BASE_URL` questions, endpoint selection, dedicated subdomain provisioning, authentication, and verification. Install the GitHub version with the skills CLI:

```bash
npx skills add corrideluca/uivoid-cli --skill uivoid
```

The npm package also ships an optional `SKILL.md` for clients that support agent skills. Its bundled copy follows the installed npm release; use the GitHub command above for the latest skill. Install it into Codex's personal skills directory with:

```bash
npx uivoid skill --install
```

## Backend contract

The CLI uses these control-plane endpoints:

- `GET /api/auth/me`
- `GET /api/projects`
- `POST /api/projects` (accepts `organization_id`)
- `POST /api/projects/:id/keys`
- `POST /api/projects/:id/tools`
- `PATCH /api/projects/:id/credentials`
- `GET /api/orgs/:id/members`, `PATCH|DELETE /api/orgs/:id/members/:userId`
- `GET|POST /api/orgs/:id/invitations`, `DELETE /api/orgs/:id/invitations/:inviteId`
- `POST /api/invitations/:token/accept`

Browser login uses `/cli/auth?callback=...&state=...` to return a revocable personal access token to a loopback callback. `uivoid login --token` and `UIVOID_TOKEN` are also available for non-interactive environments.

## Development

```bash
npm install
npm test
npm run build
node dist/cli.js --help
```

## Hosted databases

Requires a backend configured with hosted PostgreSQL support. Database commands
output JSON and accept `--project <subdomain-or-UUID>` and `--token` (or your stored
login / `UIVOID_TOKEN`). Database credentials stay on the backend.

```bash
uivoid create sowe --no-discover --json
uivoid db create inventory --project sowe
uivoid db table create products --project sowe --db inventory --schema products.schema.json
uivoid db expose products --project sowe --db inventory --operation insert --name add_product --path /products --description "Create a product"
uivoid db expose products --project sowe --db inventory --operation list --name list_products --path /products --description "List products"
uivoid db call add_product --project sowe --args '{"data":{"name":"Book","stock":5}}'
uivoid db call list_products --project sowe
uivoid db size inventory --project sowe
```

`products.schema.json` contains column definitions:

```json
{"name":{"type":"text","required":true},"stock":{"type":"integer"}}
```

Supported types: text, integer, number, boolean. The server creates an `id` UUID.
Operations are `list`, `get`, `insert`, `update`, `delete`. Get/delete require
`{"id":"<UUID>"}`; update requires `{"id":"<UUID>","data":{...}}`. Deleting a row
requires the destructive scope. Use `--file arguments.json` for sensitive values.
Reads/deletes stay available at the hardcoded 500 MB limit; growth is rejected.

Use `db list` and `db table list --db <name>` to discover resources. Database/table
creation can be retried with the same name/definition. Row inserts are not
idempotent: inspect results before retrying an ambiguous failure. Schema edits,
physical database deletion and unrestricted SQL are not supported. Existing tools
API endpoints manage endpoint descriptions, activation and removal.
