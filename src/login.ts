import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import open from "open";
import type { Config } from "./types.js";

export interface LoginResult {
  token: string;
  email?: string;
  organization?: Config["organization"];
}

export async function browserLogin(config: Config, timeoutMs = 5 * 60_000): Promise<LoginResult> {
  const state = randomBytes(24).toString("base64url");
  return await new Promise<LoginResult>((resolve, reject) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/callback") {
        response.writeHead(404).end("Not found");
        return;
      }
      if (url.searchParams.get("state") !== state) {
        response.writeHead(400).end("Invalid login state. Return to the terminal and try again.");
        return;
      }
      const token = url.searchParams.get("token");
      if (!token) {
        response.writeHead(400).end("UIvoid did not return a token. Return to the terminal and try again.");
        return;
      }
      const organizationId = url.searchParams.get("organization_id");
      const organizationName = url.searchParams.get("organization_name");
      const organizationSlug = url.searchParams.get("organization_slug");
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end("<!doctype html><title>UIvoid CLI</title><style>body{font:18px system-ui;background:#09090b;color:#fafafa;display:grid;place-items:center;height:100vh;margin:0}main{max-width:36rem}small{color:#a1a1aa}</style><main><h1>CLI connected.</h1><small>You can close this tab and return to your terminal.</small></main>");
      server.close();
      resolve({
        token,
        ...(url.searchParams.get("email") ? { email: url.searchParams.get("email")! } : {}),
        ...(organizationId && organizationName && organizationSlug
          ? { organization: { id: organizationId, name: organizationName, slug: organizationSlug } }
          : {}),
      });
    });
    server.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("Could not start the login callback."));
      const callback = `http://127.0.0.1:${address.port}/callback`;
      const loginUrl = new URL("cli/auth", `${config.portalUrl.replace(/\/$/, "")}/`);
      loginUrl.searchParams.set("callback", callback);
      loginUrl.searchParams.set("state", state);
      try { await open(loginUrl.toString()); } catch (error) { server.close(); reject(error); }
    });
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error("Login timed out. Run `uivoid login` to try again."));
    }, timeoutMs);
    timeout.unref();
    server.on("close", () => clearTimeout(timeout));
    server.on("error", reject);
  });
}
