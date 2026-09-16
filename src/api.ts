import type { Config, Project, ToolDefinition } from "./types.js";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export class UivoidApi {
  constructor(private readonly config: Config) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (init.body) headers.set("Content-Type", "application/json");
    if (this.config.token) headers.set("Authorization", `Bearer ${this.config.token}`);
    let response: Response;
    try {
      response = await fetch(new URL(path, `${this.config.apiUrl.replace(/\/$/, "")}/`), {
        ...init,
        headers,
      });
    } catch (error) {
      throw new ApiError(`Could not reach UIvoid at ${this.config.apiUrl}: ${(error as Error).message}`, 0);
    }
    const text = await response.text();
    let body: unknown = undefined;
    if (text) {
      try { body = JSON.parse(text); } catch { body = text; }
    }
    if (!response.ok) {
      const message = typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: unknown }).error)
        : `UIvoid returned ${response.status}`;
      throw new ApiError(message, response.status);
    }
    return body as T;
  }

  me(): Promise<{ id: string; email: string; organizations: Array<NonNullable<Config["organization"]>> }> {
    return this.request("api/auth/me");
  }

  createProject(subdomain: string): Promise<Project> {
    return this.request("api/projects", { method: "POST", body: JSON.stringify({ subdomain }) });
  }

  createKey(projectId: string): Promise<{ id: string; key: string }> {
    return this.request(`api/projects/${projectId}/keys`, {
      method: "POST",
      body: JSON.stringify({ direction: "outbound", scopes: [], secret_type: "bearer" }),
    });
  }

  createTool(projectId: string, tool: ToolDefinition): Promise<{ id: string; name: string }> {
    return this.request(`api/projects/${projectId}/tools`, {
      method: "POST",
      body: JSON.stringify(tool),
    });
  }
}
