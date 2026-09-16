import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Config } from "./types.js";

const defaultApiUrl = process.env.UIVOID_API_URL ?? "https://api.uivoid.app";
const defaultPortalUrl = process.env.UIVOID_PORTAL_URL ?? "https://portal.uivoid.app";

export function configPath(): string {
  return process.env.UIVOID_CONFIG_PATH ?? join(homedir(), ".config", "uivoid", "config.json");
}

export async function readConfig(): Promise<Config> {
  try {
    const value = JSON.parse(await readFile(configPath(), "utf8")) as Partial<Config>;
    return {
      apiUrl: process.env.UIVOID_API_URL ?? value.apiUrl ?? defaultApiUrl,
      portalUrl: process.env.UIVOID_PORTAL_URL ?? value.portalUrl ?? defaultPortalUrl,
      ...(value.token ? { token: value.token } : {}),
      ...(value.email ? { email: value.email } : {}),
      ...(value.organization ? { organization: value.organization } : {}),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { apiUrl: defaultApiUrl, portalUrl: defaultPortalUrl };
  }
}

export async function writeConfig(config: Config): Promise<void> {
  const path = configPath();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}
