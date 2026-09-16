# uivoid CLI

Create an organization-owned [UIvoid](https://www.uivoid.app/) MCP project from an existing API.

UIvoid is model-agnostic. The generated URL is a standard remote MCP server, so it can be used by Claude, OpenAI clients, and other agents or applications that support remote MCP servers. It does not require a particular model provider; the host application only needs MCP support.

```bash
npx uivoid create my-app
```

The CLI opens the UIvoid portal for login, asks for the existing API's base URL, discovers its OpenAPI document, lets you review the operations and scopes, creates the project in your organization, and prints its MCP URL:

```text
✓ Created my-app
✓ Found OpenAPI document at https://api.example.com/openapi.json
✓ Mapped 9 scoped tools

Ready  https://my-app.uivoid.app/mcp
Auth: organization login · 9 tools mapped
```

## Commands

```bash
npx uivoid login
npx uivoid whoami
npx uivoid create [name] [--base-url URL] [--openapi URL] [--yes]
npx uivoid create [name] --no-discover
npx uivoid prompt
npx uivoid skill [--install]
npx uivoid logout
```

`create` discovers `/openapi.json`, `/api/openapi.json`, or `/swagger.json`. Use `--openapi` for another location. GET operations default to `read`, POST/PUT/PATCH to `write`, and DELETE to `destructive`; the interactive review keeps destructive tools unselected by default.

For CI, provide `UIVOID_TOKEN` and pass `--yes`. `UIVOID_API_URL` and `UIVOID_PORTAL_URL` override the production services for local development. Credentials are stored at `~/.config/uivoid/config.json` with mode `0600`.

## Agent prompt and skill

`npx uivoid prompt` prints a provider-neutral prompt that Claude, Codex, or another coding agent can use to prepare the current project and run the integration.

The npm package also ships an optional `SKILL.md` for clients that support agent skills. Install it into Codex's personal skills directory with:

```bash
npx uivoid skill --install
```

## Backend contract

The CLI uses these control-plane endpoints:

- `GET /api/auth/me`
- `POST /api/projects`
- `POST /api/projects/:id/keys`
- `POST /api/projects/:id/tools`

Browser login uses `/cli/auth?callback=...&state=...` to return a revocable personal access token to a loopback callback. `uivoid login --token` and `UIVOID_TOKEN` are also available for non-interactive environments.

## Development

```bash
npm install
npm test
npm run build
node dist/cli.js --help
```
