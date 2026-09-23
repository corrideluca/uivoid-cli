import type {
  Config, CreatedInvitation, Invitation, Member, Membership, PassthroughConfig, PassthroughConfigInput, Project, Role, ToolDefinition,
} from "./types.js";

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

  me(): Promise<{ id: string; email: string; organizations: Membership[] }> {
    return this.request("api/auth/me");
  }

  createProject(subdomain: string, organizationId?: string): Promise<Project> {
    return this.request("api/projects", {
      method: "POST",
      body: JSON.stringify({ subdomain, ...(organizationId ? { organization_id: organizationId } : {}) }),
    });
  }

  updateProject(projectId: string, patch: Record<string, unknown>): Promise<Project> {
    return this.request(`api/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  }

  deleteProject(projectId: string): Promise<void> {
    return this.request(`api/projects/${projectId}`, { method: "DELETE" });
  }

  activateProject(projectId: string): Promise<Project> {
    return this.updateProject(projectId, { status: "active" });
  }

  createKey(projectId: string, credential?: { secret: string; headerName?: string }): Promise<{ id: string; key: string }> {
    return this.request(`api/projects/${projectId}/keys`, {
      method: "POST",
      body: JSON.stringify({
        direction: "outbound", scopes: [], secret_type: "bearer",
        ...(credential ? { secret: credential.secret, ...(credential.headerName ? { header_name: credential.headerName } : {}) } : {}),
      }),
    });
  }

  listProjects(): Promise<{ projects: Project[] }> {
    return this.request("api/projects");
  }

  setOutboundCredential(projectId: string, secret: string, headerName?: string): Promise<{ id: string; header_name: string }> {
    return this.request(`api/projects/${projectId}/credentials`, {
      method: "PATCH",
      body: JSON.stringify({ secret, ...(headerName ? { header_name: headerName } : {}) }),
    });
  }

  createTool(projectId: string, tool: ToolDefinition): Promise<{ id: string; name: string }> {
    return this.request(`api/projects/${projectId}/tools`, {
      method: "POST",
      body: JSON.stringify(tool),
    });
  }

  setPassthroughConfig(projectId: string, config: PassthroughConfigInput): Promise<PassthroughConfig> {
    return this.request(`api/projects/${projectId}/passthrough-config`, {
      method: "PATCH",
      body: JSON.stringify(config),
    });
  }

  listMembers(orgId: string): Promise<{ members: Member[] }> {
    return this.request(`api/orgs/${orgId}/members`);
  }

  changeMemberRole(orgId: string, userId: string, role: Role): Promise<Member> {
    return this.request(`api/orgs/${orgId}/members/${userId}`, { method: "PATCH", body: JSON.stringify({ role }) });
  }

  removeMember(orgId: string, userId: string): Promise<void> {
    return this.request(`api/orgs/${orgId}/members/${userId}`, { method: "DELETE" });
  }

  listInvitations(orgId: string): Promise<{ invitations: Invitation[] }> {
    return this.request(`api/orgs/${orgId}/invitations`);
  }

  createInvitation(orgId: string, email: string, role: Role): Promise<CreatedInvitation> {
    return this.request(`api/orgs/${orgId}/invitations`, { method: "POST", body: JSON.stringify({ email, role }) });
  }

  revokeInvitation(orgId: string, invitationId: string): Promise<void> {
    return this.request(`api/orgs/${orgId}/invitations/${invitationId}`, { method: "DELETE" });
  }

  acceptInvitation(token: string): Promise<{ organization: Membership }> {
    return this.request(`api/invitations/${encodeURIComponent(token)}/accept`, { method: "POST" });
  }
}
