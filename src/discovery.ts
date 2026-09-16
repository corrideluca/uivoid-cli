import type { OpenApiDocument, OpenApiOperation, ToolDefinition } from "./types.js";

const httpMethods = ["get", "post", "put", "delete", "patch"] as const;

function toolName(method: string, path: string, operationId?: string): string {
  const raw = operationId || `${method}_${path.replace(/[{}]/g, "").replace(/[^a-zA-Z0-9]+/g, "_")}`;
  return raw.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[^a-zA-Z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").toLowerCase().slice(0, 64);
}

function scopeFor(method: string): ToolDefinition["scope"] {
  if (method === "get") return "read";
  if (method === "delete") return "destructive";
  return "write";
}

function inputSchema(operation: OpenApiOperation): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const parameter of operation.parameters ?? []) {
    const name = typeof parameter.name === "string" ? parameter.name : undefined;
    if (!name) continue;
    properties[name] = parameter.schema ?? { type: "string" };
    if (parameter.required === true) required.push(name);
  }
  const content = (operation.requestBody?.content as Record<string, { schema?: unknown }> | undefined)?.["application/json"];
  if (content?.schema && typeof content.schema === "object") {
    const body = content.schema as Record<string, unknown>;
    Object.assign(properties, (body.properties as Record<string, unknown> | undefined) ?? { body });
    if (Array.isArray(body.required)) required.push(...body.required.filter((x): x is string => typeof x === "string"));
  }
  return { type: "object", properties, ...(required.length ? { required: [...new Set(required)] } : {}) };
}

export function toolsFromOpenApi(document: OpenApiDocument, baseUrl: string, authRef: string): ToolDefinition[] {
  const tools: ToolDefinition[] = [];
  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    for (const method of httpMethods) {
      const candidate = pathItem[method];
      if (!candidate || typeof candidate !== "object") continue;
      const operation = candidate as OpenApiOperation;
      tools.push({
        name: toolName(method, path, operation.operationId),
        description: operation.summary || operation.description || `${method.toUpperCase()} ${path}`,
        method: method.toUpperCase() as ToolDefinition["method"],
        url_template: new URL(path.replace(/^\//, ""), `${baseUrl.replace(/\/$/, "")}/`).toString()
          .replaceAll("%7B", "{").replaceAll("%7D", "}"),
        parameters: inputSchema(operation),
        scope: scopeFor(method),
        auth_ref: authRef,
        is_active: true,
      });
    }
  }
  return tools;
}

export async function discoverOpenApi(baseUrl: string, explicitSpec?: string): Promise<{ document: OpenApiDocument; url: string }> {
  const candidates = explicitSpec
    ? [new URL(explicitSpec, `${baseUrl.replace(/\/$/, "")}/`).toString()]
    : ["openapi.json", "api/openapi.json", "swagger.json"].map((path) => new URL(path, `${baseUrl.replace(/\/$/, "")}/`).toString());
  for (const url of candidates) {
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) continue;
      const document = await response.json() as OpenApiDocument;
      if (document.paths && (document.openapi || document.swagger)) return { document, url };
    } catch {
      // Try the next conventional OpenAPI location.
    }
  }
  throw new Error(`No OpenAPI document found. Tried: ${candidates.join(", ")}`);
}
