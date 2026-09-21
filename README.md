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
npx uivoid create [name] [--base-url URL] [--openapi URL] [--yes]
npx uivoid create [name] [--auth-key VALUE] [--auth-header "Header-Name:value"]
npx uivoid create [name] [--include tool1,tool2,...] [--exclude-destructive] [--json]
npx uivoid create [name] --no-discover
npx uivoid credentials <project> [--auth-key VALUE] [--auth-header "Header-Name:value"]
npx uivoid prompt
npx uivoid skill [--install]
npx uivoid logout
```

`create` discovers `/openapi.json`, `/api/openapi.json`, or `/swagger.json`. Use `--openapi` for another location. GET operations default to `read`, POST/PUT/PATCH to `write`, and DELETE to `destructive`; the interactive review keeps destructive tools unselected by default.

For CI, provide `UIVOID_TOKEN` and one non-interactive endpoint-selection flag: `--yes` (accept everything, including destructive), `--include tool1,tool2,...` (an explicit allowlist), or `--exclude-destructive` (everything except DELETE-derived tools). If none of those is passed and the CLI can't detect a real interactive terminal — or `--json` is set, since an interactive prompt would otherwise write to stdout ahead of the JSON line — it prints a clear error explaining which flag to add, instead of hanging waiting for input. `UIVOID_API_URL` and `UIVOID_PORTAL_URL` override the production services for local development. Credentials are stored at `~/.config/uivoid/config.json` with mode `0600`.

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
- `POST /api/projects`
- `POST /api/projects/:id/keys`
- `POST /api/projects/:id/tools`
- `PATCH /api/projects/:id/credentials`

Browser login uses `/cli/auth?callback=...&state=...` to return a revocable personal access token to a loopback callback. `uivoid login --token` and `UIVOID_TOKEN` are also available for non-interactive environments.

## Development

```bash
npm install
npm test
npm run build
node dist/cli.js --help
```
