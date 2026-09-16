#!/usr/bin/env node
import { mkdir, copyFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { input, confirm, checkbox } from "@inquirer/prompts";
import { Command } from "commander";
import ora from "ora";
import pc from "picocolors";
import { UivoidApi, ApiError } from "./api.js";
import { readConfig, writeConfig } from "./config.js";
import { discoverOpenApi, toolsFromOpenApi } from "./discovery.js";
import { browserLogin } from "./login.js";
import type { LoginResult } from "./login.js";
import { integrationPrompt } from "./prompt.js";
import type { Config, ToolDefinition } from "./types.js";

const program = new Command();
program.name("uivoid").description("Turn an existing API into scoped MCP tools").version("0.1.0");

async function authenticatedConfig(tokenOption?: string) {
  const config = await readConfig();
  if (tokenOption) return { ...config, token: tokenOption };
  if (process.env.UIVOID_TOKEN) return { ...config, token: process.env.UIVOID_TOKEN };
  if (config.token) return config;
  console.log(pc.dim("Opening portal.uivoid.app to connect this CLI…"));
  const login = await browserLogin(config);
  const next: Config = { ...config, token: login.token };
  if (login.email) next.email = login.email;
  if (login.organization) next.organization = login.organization;
  await writeConfig(next);
  return next;
}

program.command("login")
  .description("Log in through the UIvoid portal")
  .option("--token <token>", "use an existing personal access token")
  .action(async ({ token }: { token?: string }) => {
    const config = await readConfig();
    const result: LoginResult = token ? { token } : await browserLogin(config);
    const next: Config = { ...config, token: result.token };
    if (result.email) next.email = result.email;
    if (result.organization) next.organization = result.organization;
    const me = await new UivoidApi(next).me();
    next.email = me.email;
    if (me.organizations[0]) next.organization = me.organizations[0];
    await writeConfig(next);
    console.log(`${pc.green("✓")} Logged in as ${pc.bold(me.email)}`);
  });

program.command("logout").description("Remove the locally stored UIvoid session").action(async () => {
  const config = await readConfig();
  await writeConfig({ apiUrl: config.apiUrl, portalUrl: config.portalUrl });
  console.log(`${pc.green("✓")} Logged out locally`);
});

program.command("whoami").description("Show the current UIvoid account").action(async () => {
  const config = await authenticatedConfig();
  const me = await new UivoidApi(config).me();
  console.log(`${me.email}${me.organizations[0] ? ` · ${me.organizations[0].name}` : ""}`);
});

program.command("create")
  .description("Create a project and map an existing OpenAPI surface")
  .argument("[name]", "project name and desired uivoid.app subdomain")
  .option("--base-url <url>", "base URL of the existing API")
  .option("--openapi <url>", "OpenAPI URL or path")
  .option("--token <token>", "personal access token (or use UIVOID_TOKEN)")
  .option("--yes", "accept all discovered endpoints")
  .option("--no-discover", "create the project without mapping endpoints")
  .action(async (providedName: string | undefined, options: { baseUrl?: string; openapi?: string; token?: string; yes?: boolean; discover: boolean }) => {
    const config = await authenticatedConfig(options.token);
    const api = new UivoidApi(config);
    const name = providedName ?? await input({ message: "Project name", validate: (value) => value.trim() ? true : "Enter a project name" });
    const subdomain = name.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
    let baseUrl = options.baseUrl;
    if (options.discover && !baseUrl) baseUrl = await input({ message: "Existing API base URL", validate: validHttpUrl });
    if (baseUrl) baseUrl = normalizeUrl(baseUrl);

    const createSpinner = ora("Creating project").start();
    const project = await api.createProject(subdomain);
    createSpinner.succeed(`Created ${pc.bold(project.subdomain)}`);

    let mapped: ToolDefinition[] = [];
    let setupComplete = !options.discover;
    if (options.discover && baseUrl) {
      const discoverySpinner = ora("Discovering API endpoints").start();
      try {
        const discovered = await discoverOpenApi(baseUrl, options.openapi);
        discoverySpinner.succeed(`Found OpenAPI document at ${discovered.url}`);
        const key = await api.createKey(project.id);
        const candidates = toolsFromOpenApi(discovered.document, baseUrl, key.id);
        if (!candidates.length) throw new Error("The OpenAPI document contains no supported operations.");
        const selected = options.yes ? candidates.map((tool) => tool.name) : await checkbox({
          message: "Select endpoints to expose",
          choices: candidates.map((tool) => ({ name: `${tool.name} ${pc.dim(`${tool.method} · ${tool.scope}`)}`, value: tool.name, checked: tool.scope !== "destructive" })),
          required: true,
        });
        mapped = candidates.filter((tool) => selected.includes(tool.name));
        if (!options.yes && mapped.some((tool) => tool.scope === "destructive")) {
          const approved = await confirm({ message: "Expose the selected destructive operations?", default: false });
          if (!approved) mapped = mapped.filter((tool) => tool.scope !== "destructive");
        }
        const mappingSpinner = ora(`Mapping ${mapped.length} endpoints`).start();
        for (const tool of mapped) await api.createTool(project.id, tool);
        mappingSpinner.succeed(`Mapped ${mapped.length} scoped tools`);
        setupComplete = true;
      } catch (error) {
        discoverySpinner.stop();
        console.warn(`${pc.yellow("!")} Project created, but endpoint discovery did not finish: ${(error as Error).message}`);
      }
    }

    if (setupComplete) {
      const activateSpinner = ora("Activating MCP server").start();
      await api.activateProject(project.id);
      activateSpinner.succeed("MCP server active");
      console.log(`\n${pc.green(pc.bold("Ready"))}  ${pc.cyan(project.mcp_url)}`);
      console.log(pc.dim(`Auth: organization login · ${mapped.length} tool${mapped.length === 1 ? "" : "s"} mapped`));
    } else {
      console.log(`\n${pc.yellow(pc.bold("Created, not active"))}  Endpoint setup must finish before ${project.mcp_url} can accept connections.`);
    }
  });

program.command("prompt").description("Print the agent prompt for integrating the current project").action(() => console.log(integrationPrompt));

program.command("skill")
  .description("Print or install the bundled UIvoid Codex skill")
  .option("--install", "install into ~/.codex/skills/uivoid")
  .action(async ({ install }: { install?: boolean }) => {
    const source = join(dirname(fileURLToPath(import.meta.url)), "skill", "SKILL.md");
    if (!install) return console.log(source);
    const target = join(homedir(), ".codex", "skills", "uivoid", "SKILL.md");
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
    console.log(`${pc.green("✓")} Installed ${target}`);
  });

function validHttpUrl(value: string): true | string {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? true : "Use an http(s) URL"; }
  catch { return "Enter a valid URL"; }
}

function normalizeUrl(value: string): string {
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  if (validHttpUrl(candidate) !== true) throw new Error("Base URL must be an HTTP(S) URL.");
  return candidate.replace(/\/$/, "");
}

program.configureOutput({ outputError: (text, write) => write(pc.red(text)) });
program.parseAsync().catch((error: unknown) => {
  if (error instanceof ApiError && error.status === 401) console.error(pc.red("Your UIvoid session is invalid. Run `uivoid login` again."));
  else console.error(pc.red(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
