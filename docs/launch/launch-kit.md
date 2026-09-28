# UIvoid launch kit

## Positioning

**Headline:** Turn your OpenAPI API into a hosted MCP server.

**GitHub description:** Turn an OpenAPI API into a hosted MCP server with scoped tools. Includes a CLI and an agent skill.

**Topics:** mcp, model-context-protocol, openapi, rest-api, ai-agents, developer-tools, cli, typescript

Lead with an existing API and a successful agent tool call. Be explicit that UIvoid hosts the gateway and requires an account. Avoid “any API,” “free hosting,” or a setup-time promise until verified.

## Before posting

- Merge and publish the README and inventory example so every linked page exists on the default branch.
- Run the inventory example through the hosted gateway and a real MCP client. Record a successful tool call; local fixture checks do not verify the hosted integration.
- Confirm current signup, pricing, and client login behavior; put any material restrictions next to the demo.
- Capture a 15–30 second edited recording: command → selected tools → MCP URL → agent answers the stock question. Hide the generated outbound credential. Label cuts/speedups.
- Check each community's current submission rules. These are drafts for manual posting from your own account.

## Show HN draft

**Title:** Show HN: UIvoid – turn an OpenAPI API into a hosted MCP server

I built UIvoid for the case where an API already exists and you want an agent to use it without maintaining a separate MCP server implementation.

Run `npx uivoid create my-app`, point it at your API, and choose the operations to expose. The CLI maps the OpenAPI operations into scoped tools and returns a hosted MCP URL. Your API stays on its existing hosting.

The CLI is MIT licensed. The gateway is a UIvoid hosted service and requires an account. The current mapper reads OpenAPI JSON with inline schemas; it does not resolve $ref schemas yet.

Repo and quick start: https://github.com/corrideluca/uivoid-cli
Inventory example: https://github.com/corrideluca/uivoid-cli/tree/main/examples/inventory

I'd like feedback from people connecting existing APIs to agents: which parts of your OpenAPI spec would this need to support before you'd try it?

## Reddit draft

**Title:** I built a CLI to expose selected OpenAPI operations as hosted MCP tools

I maintain UIvoid. The problem I'm working on: you already have an API, but connecting an agent means defining and running another layer of MCP tools.

The CLI discovers your OpenAPI JSON, lets you select operations, and creates a hosted MCP endpoint. It assigns read/write/destructive scopes from HTTP methods, so you still need to review what the operations actually do.

I added a small inventory example: two GET endpoints become list_products and get_product. The walkthrough ends with an agent checking which products have fewer than five units in stock.

The CLI is MIT licensed; using the hosted gateway requires a UIvoid account. The mapper currently expects inline schemas rather than $ref references.

Code: https://github.com/corrideluca/uivoid-cli

Where does this approach break down for your API: schema mapping, authentication, or hosting requirements?

## X / LinkedIn draft

Your API already has the endpoints. Give an agent tools to call them.

I built UIvoid CLI to map selected OpenAPI operations into a hosted MCP server:

`npx uivoid create my-app`

Choose the operations → get an MCP URL → connect your client.

Includes an inventory example and an agent skill. Requires a UIvoid account and an API reachable by the hosted gateway.

https://github.com/corrideluca/uivoid-cli

## A focused first week

1. Publish the repo improvements and verify the full demo. Record the starting star count and available GitHub traffic metrics.
2. Share the recorded demo with your existing audience. Ask people what API they would connect.
3. Submit Show HN when you can spend time answering technical questions.
4. Write one community-specific post in a community that permits project sharing. Explain the mapping limits and ask for concrete feedback.
5. Turn the most common setup failure into a documentation fix or issue.
6. Publish a short technical walkthrough using the real inventory run and its tool trace.
7. Review referral traffic, visitors, clones, star growth, and reported successful setups. Repeat the channel that brought developers who actually tried it.

Post when the preceding step is ready, rather than forcing a daily launch. Reply personally; avoid duplicate posts across communities. Do not ask for upvotes or coordinate votes.

## Measurement sheet

Use GitHub Insights → Traffic if available to your account. Record snapshots promptly because traffic history is limited. Visitor-to-star ratios are directional: stars and visits are not linked to the same people.

| Date | Channel / post URL | Stars before | Stars after 24h | Repo visitors | Clones | Reported successful setups | Main friction |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | |

Measure success by useful feedback and successful integrations alongside stars. No specific star count is guaranteed.
