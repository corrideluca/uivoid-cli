import assert from "node:assert/strict";
import test from "node:test";
import { toolsFromOpenApi } from "../src/discovery.js";

test("maps OpenAPI operations to stable scoped tools", () => {
  const tools = toolsFromOpenApi({
    openapi: "3.1.0",
    paths: {
      "/customers/{id}": {
        get: {
          operationId: "getCustomer",
          summary: "Get a customer",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        },
        delete: { operationId: "deleteCustomer", summary: "Delete a customer" },
      },
      "/orders": { post: { operationId: "createOrder", summary: "Create an order" } },
    },
  }, "https://api.example.com/v1", "key-id");

  assert.deepEqual(tools.map(({ name, scope }) => [name, scope]), [
    ["get_customer", "read"],
    ["delete_customer", "destructive"],
    ["create_order", "write"],
  ]);
  assert.equal(tools[0]?.url_template, "https://api.example.com/v1/customers/{id}");
  assert.deepEqual(tools[0]?.parameters, {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
  });
});

test("preserves PATCH semantics", () => {
  const [tool] = toolsFromOpenApi({ openapi: "3.1.0", paths: { "/orders/{id}": { patch: { operationId: "updateOrder" } } } }, "https://api.example.com", "key-id");
  assert.equal(tool?.method, "PATCH");
  assert.equal(tool?.scope, "write");
});
