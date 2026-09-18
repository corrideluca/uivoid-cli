import type { PassthroughConfigInput } from "./types.js";

export interface OAuthConfigOptions {
  issuer?: string;
  jwksUrl?: string;
  audience?: string;
  loginMode?: string;
  authorizeUrl?: string;
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;
  scope?: string;
  handoffUrl?: string;
}

function present(flag: string | false | undefined): flag is string {
  return Boolean(flag);
}

export function parseOAuthConfigOptions(options: OAuthConfigOptions): PassthroughConfigInput {
  const missingBase = [
    !options.issuer && "--issuer",
    !options.jwksUrl && "--jwks-url",
    !options.audience && "--audience",
  ].filter(present);
  if (missingBase.length) {
    throw new Error(`${missingBase.join(", ")} ${missingBase.length === 1 ? "is" : "are"} required.`);
  }
  if (options.loginMode !== "oauth" && options.loginMode !== "custom_handoff") {
    throw new Error(`--login-mode must be "oauth" or "custom_handoff", got ${JSON.stringify(options.loginMode ?? "")}`);
  }

  const base = { issuer: options.issuer!, jwks_url: options.jwksUrl!, audience: options.audience! };

  if (options.loginMode === "oauth") {
    const missing = [
      !options.authorizeUrl && "--authorize-url",
      !options.tokenUrl && "--token-url",
      !options.clientId && "--client-id",
      !options.clientSecret && "--client-secret",
    ].filter(present);
    if (missing.length) {
      throw new Error(`--login-mode oauth requires ${missing.join(", ")}.`);
    }
    if (options.handoffUrl) {
      throw new Error("--handoff-url doesn't apply to --login-mode oauth.");
    }
    return {
      ...base,
      login_mode: "oauth",
      target_authorize_url: options.authorizeUrl!,
      target_token_url: options.tokenUrl!,
      target_client_id: options.clientId!,
      target_client_secret: options.clientSecret!,
      ...(options.scope ? { target_scope: options.scope } : {}),
    };
  }

  const contaminating = [
    options.authorizeUrl && "--authorize-url",
    options.tokenUrl && "--token-url",
    options.clientId && "--client-id",
    options.clientSecret && "--client-secret",
    options.scope && "--scope",
  ].filter(present);
  if (contaminating.length) {
    throw new Error(`${contaminating.join(", ")} don't apply to --login-mode custom_handoff.`);
  }
  if (!options.handoffUrl) {
    throw new Error("--login-mode custom_handoff requires --handoff-url.");
  }

  return { ...base, login_mode: "custom_handoff", handoff_url: options.handoffUrl };
}
