import { confirm, input } from "@inquirer/prompts";
import type { Command } from "commander";
import pc from "picocolors";
import { UivoidApi } from "./api.js";
import type { Config, ListingState, RegistryListing } from "./types.js";

type AuthenticatedConfig = (token?: string) => Promise<Config>;
interface PublishOptions { title?: string; description?: string; website?: string; status?: boolean; token?: string; json?: boolean }
interface UnpublishOptions { yes?: boolean; token?: string; json?: boolean }

const TOKEN_OPTION = ["--token <token>", "personal access token (or use UIVOID_TOKEN)"] as const;
const JSON_OPTION = ["--json", "print a machine-readable JSON object instead of formatted text"] as const;
export const LISTING_TEXT_LIMIT = 100;

const STATUS_LABELS: Record<RegistryListing["status"], string> = {
  pending: "In review", published: "Published", rejected: "Rejected", unlisted: "Unlisted",
};

export function checkListingText(flag: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`--${flag} can't be empty.`);
  if (trimmed.length > LISTING_TEXT_LIMIT) {
    throw new Error(`--${flag} must be at most ${LISTING_TEXT_LIMIT} characters (it has ${trimmed.length}).`);
  }
  return trimmed;
}

export function describeListing(project: string, state: ListingState): string[] {
  const { listing } = state;
  if (!listing || listing.status === "unlisted") {
    return [
      `${pc.bold(project)} is not listed in the MCP Registry.`,
      state.eligible
        ? pc.dim(`List it with: uivoid publish ${project} --title "..." --description "..."`)
        : `It can't be listed yet: ${state.ineligible_reason}`,
    ];
  }
  const lines = [`${pc.bold(listing.server_name)}  ${STATUS_LABELS[listing.status]}`, `${listing.title}: ${listing.description}`];
  if (listing.status === "pending") lines.push(pc.dim("uivoid reviews new listings before they go public."));
  if (listing.status === "rejected" && listing.rejection_reason) lines.push(`Reason: ${listing.rejection_reason}`);
  if (listing.version) lines.push(`Version ${listing.version} · ${listing.registry_url}`);
  if (listing.last_error) lines.push(pc.yellow(`Last publish failed: ${listing.last_error}`));
  return lines;
}

async function askIfMissing(value: string | undefined, flag: string, message: string): Promise<string> {
  if (value !== undefined) return checkListingText(flag, value);
  if (!process.stdin.isTTY) throw new Error(`Pass --${flag}.`);
  return checkListingText(flag, await input({ message, validate: (v) => {
    try { checkListingText(flag, v); return true; } catch (error) { return (error as Error).message; }
  } }));
}

export function registerPublishCommands(program: Command, authenticatedConfig: AuthenticatedConfig): void {
  async function projectContext(name: string, token?: string) {
    const api = new UivoidApi(await authenticatedConfig(token));
    const { projects } = await api.listProjects();
    const project = projects.find((candidate) => candidate.subdomain === name || candidate.id === name);
    if (!project) throw new Error(`No project named ${JSON.stringify(name)} in your organizations.`);
    return { api, project };
  }

  function print(project: string, state: ListingState, json?: boolean) {
    console.log(json ? JSON.stringify(state) : describeListing(project, state).join("\n"));
  }

  program.command("publish")
    .description("List a project in the official MCP Registry so agents and directories can discover it")
    .argument("<project>", "project subdomain")
    .option("--title <title>", `listing title, up to ${LISTING_TEXT_LIMIT} characters`)
    .option("--description <text>", `one line on what the tools do, up to ${LISTING_TEXT_LIMIT} characters`)
    .option("--website <url>", "optional https:// page about the server")
    .option("--status", "show the listing's status instead of changing it")
    .option(...TOKEN_OPTION)
    .option(...JSON_OPTION)
    .action(async (name: string, options: PublishOptions) => {
      const title = options.status ? "" : await askIfMissing(options.title, "title", "Listing title");
      const description = options.status ? "" : await askIfMissing(options.description, "description", "One-line description");
      const { api, project } = await projectContext(name, options.token);
      if (options.status) return print(project.subdomain, await api.getListing(project.id), options.json);
      const state = await api.requestListing(project.id, {
        title, description, ...(options.website ? { website_url: options.website.trim() } : {}),
      });
      print(project.subdomain, state, options.json);
    });

  program.command("unpublish")
    .description("Remove a project from the MCP Registry, or withdraw a listing request in review")
    .argument("<project>", "project subdomain")
    .option("-y, --yes", "skip the confirmation prompt")
    .option(...TOKEN_OPTION)
    .option(...JSON_OPTION)
    .action(async (name: string, options: UnpublishOptions) => {
      if (!options.yes) {
        if (!process.stdin.isTTY) throw new Error("No interactive terminal detected. Pass --yes to confirm.");
        if (!await confirm({ message: `Remove ${name} from the MCP Registry?`, default: false })) return;
      }
      const { api, project } = await projectContext(name, options.token);
      await api.unlist(project.id);
      console.log(options.json ? JSON.stringify({ unlisted: project.subdomain })
        : `${pc.green("✓")} ${pc.bold(project.subdomain)} is no longer listed in the MCP Registry`);
    });
}
