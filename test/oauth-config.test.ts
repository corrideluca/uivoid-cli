import assert from "node:assert/strict";
import test from "node:test";
import { parseOAuthConfigOptions } from "../src/oauth-config.js";

const base = { issuer: "https://idp.example.com", jwksUrl: "https://idp.example.com/.well-known/jwks.json", audience: "uivoid" };

test("valid oauth mode payload includes issuer/jwks/audience and the target_* fields", () => {
  assert.deepEqual(
    parseOAuthConfigOptions({
      ...base,
      loginMode: "oauth",
      authorizeUrl: "https://idp.example.com/authorize",
      tokenUrl: "https://idp.example.com/token",
      clientId: "client-123",
      clientSecret: "secret-456",
      scope: "offline_access",
    }),
    {
      issuer: "https://idp.example.com",
      jwks_url: "https://idp.example.com/.well-known/jwks.json",
      audience: "uivoid",
      login_mode: "oauth",
      target_authorize_url: "https://idp.example.com/authorize",
      target_token_url: "https://idp.example.com/token",
      target_client_id: "client-123",
      target_client_secret: "secret-456",
      target_scope: "offline_access",
    }
  );
});

test("valid oauth mode payload omits target_scope when --scope is not given", () => {
  const result = parseOAuthConfigOptions({
    ...base,
    loginMode: "oauth",
    authorizeUrl: "https://idp.example.com/authorize",
    tokenUrl: "https://idp.example.com/token",
    clientId: "client-123",
    clientSecret: "secret-456",
  });
  assert.equal("target_scope" in result, false);
});

test("valid custom_handoff mode payload includes issuer/jwks/audience and handoff_url", () => {
  assert.deepEqual(
    parseOAuthConfigOptions({ ...base, loginMode: "custom_handoff", handoffUrl: "https://app.example.com/uivoid/handoff" }),
    {
      issuer: "https://idp.example.com",
      jwks_url: "https://idp.example.com/.well-known/jwks.json",
      audience: "uivoid",
      login_mode: "custom_handoff",
      handoff_url: "https://app.example.com/uivoid/handoff",
    }
  );
});

test("rejects a --login-mode that isn't oauth or custom_handoff", () => {
  assert.throws(
    () => parseOAuthConfigOptions({ ...base, loginMode: "saml" }),
    /--login-mode must be "oauth" or "custom_handoff"/
  );
});

test("rejects missing --issuer/--jwks-url/--audience before even looking at --login-mode", () => {
  assert.throws(
    () => parseOAuthConfigOptions({ loginMode: "oauth" }),
    /--issuer, --jwks-url, --audience are required/
  );
});

test("oauth mode missing a required field (--client-secret) is rejected locally", () => {
  assert.throws(
    () => parseOAuthConfigOptions({
      ...base,
      loginMode: "oauth",
      authorizeUrl: "https://idp.example.com/authorize",
      tokenUrl: "https://idp.example.com/token",
      clientId: "client-123",
    }),
    /--login-mode oauth requires --client-secret/
  );
});

test("oauth mode with --handoff-url also given is rejected (cross-mode field contamination)", () => {
  assert.throws(
    () => parseOAuthConfigOptions({
      ...base,
      loginMode: "oauth",
      authorizeUrl: "https://idp.example.com/authorize",
      tokenUrl: "https://idp.example.com/token",
      clientId: "client-123",
      clientSecret: "secret-456",
      handoffUrl: "https://app.example.com/uivoid/handoff",
    }),
    /--handoff-url doesn't apply to --login-mode oauth/
  );
});

test("custom_handoff mode missing --handoff-url is rejected locally", () => {
  assert.throws(
    () => parseOAuthConfigOptions({ ...base, loginMode: "custom_handoff" }),
    /--login-mode custom_handoff requires --handoff-url/
  );
});

test("custom_handoff mode with --client-id also given is rejected (cross-mode field contamination)", () => {
  assert.throws(
    () => parseOAuthConfigOptions({
      ...base,
      loginMode: "custom_handoff",
      handoffUrl: "https://app.example.com/uivoid/handoff",
      clientId: "client-123",
    }),
    /--client-id don't apply to --login-mode custom_handoff/
  );
});

test("custom_handoff mode with --scope also given is rejected (cross-mode field contamination)", () => {
  assert.throws(
    () => parseOAuthConfigOptions({
      ...base,
      loginMode: "custom_handoff",
      handoffUrl: "https://app.example.com/uivoid/handoff",
      scope: "offline_access",
    }),
    /--scope don't apply to --login-mode custom_handoff/
  );
});
