import assert from "node:assert/strict";
import test from "node:test";
import { resolveNonInteractiveSelection } from "../src/selection.js";

const candidates = [
  { name: "get_customer", scope: "read" },
  { name: "create_order", scope: "write" },
  { name: "delete_customer", scope: "destructive" },
];

test("returns undefined when no selection flag is set", () => {
  assert.equal(resolveNonInteractiveSelection(candidates, {}), undefined);
});

test("--yes selects everything including destructive", () => {
  assert.deepEqual(
    resolveNonInteractiveSelection(candidates, { yes: true }),
    ["get_customer", "create_order", "delete_customer"]
  );
});

test("--exclude-destructive selects everything except destructive", () => {
  assert.deepEqual(
    resolveNonInteractiveSelection(candidates, { excludeDestructive: true }),
    ["get_customer", "create_order"]
  );
});

test("--include selects only the named tools, in candidate order", () => {
  assert.deepEqual(
    resolveNonInteractiveSelection(candidates, { include: "delete_customer,get_customer" }),
    ["get_customer", "delete_customer"]
  );
});

test("--include rejects unknown tool names with the available list", () => {
  assert.throws(
    () => resolveNonInteractiveSelection(candidates, { include: "get_customer,not_a_tool" }),
    /Unknown tool name\(s\) in --include: not_a_tool\. Available: get_customer, create_order, delete_customer/
  );
});

test("rejects combining more than one selection flag", () => {
  assert.throws(
    () => resolveNonInteractiveSelection(candidates, { yes: true, excludeDestructive: true }),
    /Use only one of --yes, --include, or --exclude-destructive/
  );
});
