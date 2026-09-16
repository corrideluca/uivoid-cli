export interface Config {
  apiUrl: string;
  portalUrl: string;
  token?: string;
  email?: string;
  organization?: { id: string; name: string; slug: string };
}

export interface Project {
  id: string;
  subdomain: string;
  status: string;
  auth_mode: string;
  tools_version: number;
  mcp_url: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url_template: string;
  parameters: Record<string, unknown>;
  scope: "read" | "write" | "destructive";
  auth_ref: string;
  is_active: boolean;
}

export interface OpenApiDocument {
  openapi?: string;
  swagger?: string;
  info?: { title?: string };
  paths?: Record<string, Record<string, OpenApiOperation | unknown>>;
}

export interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: Array<Record<string, unknown>>;
  requestBody?: Record<string, unknown>;
}
