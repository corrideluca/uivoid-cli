export interface CredentialOption {
  authKey?: string;
  authHeader?: string;
}

export interface OutboundCredential {
  secret: string;
  headerName?: string;
}

export function parseCredentialOption(options: CredentialOption): OutboundCredential | undefined {
  if (options.authKey && options.authHeader) {
    throw new Error("Use either --auth-key or --auth-header, not both.");
  }
  if (options.authHeader) {
    const separatorIndex = options.authHeader.indexOf(":");
    if (separatorIndex < 1) {
      throw new Error(`--auth-header must be formatted "Header-Name:value", got ${JSON.stringify(options.authHeader)}`);
    }
    const headerName = options.authHeader.slice(0, separatorIndex).trim();
    const secret = options.authHeader.slice(separatorIndex + 1).trim();
    if (!secret) {
      throw new Error(`--auth-header must include a non-empty value after the colon, got ${JSON.stringify(options.authHeader)}`);
    }
    return { headerName, secret };
  }
  if (options.authKey) return { secret: options.authKey };
  return undefined;
}
