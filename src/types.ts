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
  organization_id?: string;
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

export interface PassthroughConfigInput {
  issuer: string;
  jwks_url: string;
  audience: string;
  login_mode: "oauth" | "custom_handoff";
  target_authorize_url?: string;
  target_token_url?: string;
  target_client_id?: string;
  target_client_secret?: string;
  target_scope?: string;
  handoff_url?: string;
}

export interface PassthroughConfig {
  issuer: string;
  jwks_url: string;
  audience: string;
  login_mode: "oauth" | "custom_handoff";
  target_authorize_url?: string;
  target_token_url?: string;
  target_client_id?: string;
  has_target_client_secret?: boolean;
  target_scope?: string;
  handoff_url?: string;
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

export type Role = "owner" | "admin" | "member";

export type Organization = NonNullable<Config["organization"]>;

export interface Membership extends Organization {
  role: Role;
}

export interface Member {
  user_id: string;
  email: string;
  role: Role;
  joined_at: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: Role;
  invited_by: string | null;
  created_at: string;
  expires_at: string;
}

export interface CreatedInvitation extends Invitation {
  invite_url: string;
}

export interface HostedDatabase {
  id: string;
  name: string;
  project_id: string;
  organization_id: string;
  status: string;
  size_bytes: number | null;
  max_size_bytes: number;
  remaining_bytes: number | null;
}
export interface HostedTable {
  id: string;
  database_id: string;
  name: string;
  columns: Record<string, { type: "text" | "integer" | "number" | "boolean"; required?: boolean }>;
}
export interface DatabaseToolInput {
  kind: "database";
  name: string;
  description: string;
  hosted_table_id: string;
  operation: "list" | "get" | "insert" | "update" | "delete";
  route: string;
}
