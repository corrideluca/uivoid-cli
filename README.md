# uivoid CLI

Create an organization-owned [UIvoid](https://www.uivoid.app/) MCP project from an existing API.

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

`npx uivoid prompt` prints a prompt that a coding agent can use to prepare the current project and run the integration. The npm package also ships a Codex skill. Install it with:

```bash
npx uivoid skill --install
```

## Backend contract

The CLI uses these control-plane endpoints:

- `GET /api/auth/me`
- `POST /api/projects`
- `POST /api/projects/:id/keys`
- `POST /api/projects/:id/tools`

Browser login expects the portal route `/cli/auth?callback=...&state=...` to return the personal access token to the loopback callback. The route is intentionally documented here because it is the only portal/API addition still needed for the default login UX; `uivoid login --token` and `UIVOID_TOKEN` work with the current control plane.

## Development

```bash
npm install
npm test
npm run build
node dist/cli.js --help
```
