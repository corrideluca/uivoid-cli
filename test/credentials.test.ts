import assert from "node:assert/strict";
import test from "node:test";
import { parseCredentialOption } from "../src/credentials.js";

test("returns undefined when neither flag is set", () => {
  assert.equal(parseCredentialOption({}), undefined);
});

test("--auth-key becomes a secret with no explicit header name", () => {
  assert.deepEqual(parseCredentialOption({ authKey: "sk_live_abc" }), { secret: "sk_live_abc" });
});

test("--auth-header splits on the first colon into header name and value", () => {
  assert.deepEqual(
    parseCredentialOption({ authHeader: "x-api-key:sk_live_abc" }),
    { headerName: "x-api-key", secret: "sk_live_abc" }
  );
});

test("--auth-header value may itself contain colons", () => {
  assert.deepEqual(
    parseCredentialOption({ authHeader: "Authorization:Bearer abc:def" }),
    { headerName: "Authorization", secret: "Bearer abc:def" }
  );
});

test("rejects --auth-header with no colon", () => {
  assert.throws(
    () => parseCredentialOption({ authHeader: "not-a-header" }),
    /must be formatted "Header-Name:value"/
  );
});

test("rejects both --auth-key and --auth-header together", () => {
  assert.throws(
    () => parseCredentialOption({ authKey: "a", authHeader: "x:b" }),
    /Use either --auth-key or --auth-header, not both/
  );
});
