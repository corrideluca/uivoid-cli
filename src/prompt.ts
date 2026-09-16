export const integrationPrompt = `Integrate this project with UIvoid so its existing API can be exposed as scoped MCP tools.

1. Inspect the project and identify its HTTP API base URL.
2. Ensure the API publishes an OpenAPI document at /openapi.json (or note its existing URL).
3. Give every operation a stable operationId and a concise description written for an AI agent.
4. Mark sensitive/delete operations clearly; UIvoid maps GET to read, POST/PUT/PATCH to write, and DELETE to destructive by default.
5. Run: npx uivoid create <project-name> --base-url <BASE_URL>
6. Review the discovered tools before confirming. Never place database credentials or private API keys in source control.

Return the generated MCP URL and summarize the exposed read, write, and destructive tools.`;
