import { confirm } from "@inquirer/prompts";
import type { Command } from "commander";
import pc from "picocolors";
import { UivoidApi } from "./api.js";
import { readConfig, writeConfig } from "./config.js";
import {
  MANAGE_ROLES, defaultOrg, findInvitation, findMember, parseInviteToken, parseRole, resolveOrg, toStoredOrg,
} from "./orgs.js";
import type { Config, Organization } from "./types.js";

type AuthenticatedConfig = (token?: string) => Promise<Config>;
interface CommonOptions { org?: string; token?: string; json?: boolean; yes?: boolean }

const TOKEN_OPTION = ["--token <token>", "personal access token (or use UIVOID_TOKEN)"] as const;
const JSON_OPTION = ["--json", "print a machine-readable JSON object instead of formatted text"] as const;
const ORG_OPTION = ["--org <org>", "organization slug or id (defaults to the one set with `uivoid org use`)"] as const;

/** Persist the default org without saving any --token/UIVOID_TOKEN override to disk. */
async function storeDefaultOrg(organization: Organization | undefined): Promise<void> {
  const { organization: _previous, ...stored } = await readConfig();
  await writeConfig(organization ? { ...stored, organization: toStoredOrg(organization) } : stored);
}

function expiresIn(iso: string): string {
  const days = Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 86_400_000));
  return days === 1 ? "1 day" : `${days} days`;
}

async function confirmOrRequireYes(options: CommonOptions, message: string): Promise<boolean> {
  if (options.yes) return true;
  if (!process.stdin.isTTY) throw new Error("No interactive terminal detected. Pass --yes to confirm.");
  return confirm({ message, default: false });
}

export function registerTeamCommands(program: Command, authenticatedConfig: AuthenticatedConfig): void {
  async function orgContext(options: CommonOptions) {
    const config = await authenticatedConfig(options.token);
    const api = new UivoidApi(config);
    const me = await api.me();
    return { api, me, org: resolveOrg(me.organizations, options.org, config.organization) };
  }

  const org = program.command("org").description("List your organizations and choose the default one");

  org.command("list")
    .description("List the organizations you belong to")
    .option(...TOKEN_OPTION)
    .option(...JSON_OPTION)
    .action(async (options: CommonOptions) => {
      const config = await authenticatedConfig(options.token);
      const me = await new UivoidApi(config).me();
      const current = defaultOrg(me.organizations, config.organization);
      if (options.json) {
        console.log(JSON.stringify({ organizations: me.organizations.map((o) => ({ ...o, default: o.id === current?.id })) }));
        return;
      }
      if (!me.organizations.length) return console.log(pc.dim("You don't belong to any organization yet."));
      for (const o of me.organizations) {
        console.log(`${o.id === current?.id ? pc.green("●") : " "} ${pc.bold(o.slug)}  ${o.name} ${pc.dim(`· ${o.role}`)}`);
      }
      if (!current) console.log(pc.dim("\nNo default set. Run `uivoid org use <slug>`."));
    });

  org.command("use")
    .description("Set the organization commands use when --org isn't passed")
    .argument("<org>", "organization slug or id")
    .option(...TOKEN_OPTION)
    .action(async (flag: string, options: CommonOptions) => {
      const config = await authenticatedConfig(options.token);
      const me = await new UivoidApi(config).me();
      const chosen = resolveOrg(me.organizations, flag, config.organization);
      await storeDefaultOrg(chosen);
      console.log(`${pc.green("✓")} Default organization is now ${pc.bold(chosen.name)} ${pc.dim(`(${chosen.slug} · ${chosen.role})`)}`);
    });

  const team = program.command("team").description("See and manage who belongs to an organization");

  team.command("list")
    .description("List members, and pending invites if you're an owner or admin")
    .option(...ORG_OPTION)
    .option(...TOKEN_OPTION)
    .option(...JSON_OPTION)
    .action(async (options: CommonOptions) => {
      const { api, org } = await orgContext(options);
      const { members } = await api.listMembers(org.id);
      const invitations = MANAGE_ROLES.includes(org.role) ? (await api.listInvitations(org.id)).invitations : null;
      if (options.json) {
        console.log(JSON.stringify({ organization: org, members, invitations }));
        return;
      }
      console.log(`${pc.bold(org.name)} ${pc.dim(`· you are ${org.role}`)}`);
      for (const member of members) console.log(`  ${member.email}  ${pc.dim(member.role)}`);
      if (invitations?.length) {
        console.log(pc.bold("\nPending invites"));
        for (const invite of invitations) {
          console.log(`  ${invite.email}  ${pc.dim(`${invite.role} · expires in ${expiresIn(invite.expires_at)}`)}`);
        }
      }
    });

  team.command("invite")
    .description("Create an invite link for someone to join the organization")
    .argument("<email>", "email address the invite is for; only that account can accept it")
    .option("--role <role>", "owner, admin or member", "member")
    .option(...ORG_OPTION)
    .option(...TOKEN_OPTION)
    .option(...JSON_OPTION)
    .action(async (email: string, options: CommonOptions & { role: string }) => {
      const role = parseRole(options.role);
      const { api, org } = await orgContext(options);
      const invitation = await api.createInvitation(org.id, email, role);
      if (options.json) {
        console.log(JSON.stringify(invitation));
        return;
      }
      console.log(`${pc.green("✓")} Invited ${pc.bold(invitation.email)} to ${pc.bold(org.name)} as ${invitation.role}`);
      console.log(`\n  ${pc.cyan(invitation.invite_url)}\n`);
      console.log(pc.dim(`Send this link to them yourself. It works once, only for ${invitation.email}, and expires in ${expiresIn(invitation.expires_at)}. Inviting the same email again replaces it.`));
    });

  team.command("revoke")
    .description("Cancel a pending invite")
    .argument("<email-or-id>", "the invitee's email or the invite id")
    .option(...ORG_OPTION)
    .option(...TOKEN_OPTION)
    .action(async (emailOrId: string, options: CommonOptions) => {
      const { api, org } = await orgContext(options);
      const invitation = findInvitation((await api.listInvitations(org.id)).invitations, emailOrId);
      await api.revokeInvitation(org.id, invitation.id);
      console.log(`${pc.green("✓")} Revoked the invite for ${pc.bold(invitation.email)}`);
    });

  team.command("role")
    .description("Change a member's role (owners only)")
    .argument("<email>", "the member's email")
    .argument("<role>", "owner, admin or member")
    .option(...ORG_OPTION)
    .option(...TOKEN_OPTION)
    .action(async (email: string, roleValue: string, options: CommonOptions) => {
      const role = parseRole(roleValue);
      const { api, org } = await orgContext(options);
      const member = findMember((await api.listMembers(org.id)).members, email);
      const updated = await api.changeMemberRole(org.id, member.user_id, role);
      console.log(`${pc.green("✓")} ${pc.bold(updated.email)} is now ${updated.role} in ${org.name}`);
    });

  team.command("remove")
    .description("Remove a member from the organization")
    .argument("<email>", "the member's email")
    .option("--yes", "skip the confirmation prompt")
    .option(...ORG_OPTION)
    .option(...TOKEN_OPTION)
    .action(async (email: string, options: CommonOptions) => {
      const { api, me, org } = await orgContext(options);
      const member = findMember((await api.listMembers(org.id)).members, email);
      if (member.user_id === me.id) throw new Error("To remove yourself, use `uivoid team leave`.");
      if (!(await confirmOrRequireYes(options, `Remove ${member.email} from ${org.name}? They lose access to its projects and MCP servers.`))) return;
      await api.removeMember(org.id, member.user_id);
      console.log(`${pc.green("✓")} Removed ${pc.bold(member.email)} from ${org.name}`);
    });

  team.command("leave")
    .description("Leave an organization")
    .option("--yes", "skip the confirmation prompt")
    .option(...ORG_OPTION)
    .option(...TOKEN_OPTION)
    .action(async (options: CommonOptions) => {
      const { api, me, org } = await orgContext(options);
      if (!(await confirmOrRequireYes(options, `Leave ${org.name}? You lose access to its projects and MCP servers.`))) return;
      await api.removeMember(org.id, me.id);
      if ((await readConfig()).organization?.id === org.id) await storeDefaultOrg(undefined);
      console.log(`${pc.green("✓")} You left ${pc.bold(org.name)}`);
    });

  const invite = program.command("invite").description("Respond to an invite someone sent you");

  invite.command("accept")
    .description("Join an organization using an invite link")
    .argument("<link>", "the invite link (or just its token)")
    .option("--use", "make the organization your default without asking")
    .option(...TOKEN_OPTION)
    .option(...JSON_OPTION)
    .action(async (link: string, options: CommonOptions & { use?: boolean }) => {
      const token = parseInviteToken(link);
      const config = await authenticatedConfig(options.token);
      const { organization } = await new UivoidApi(config).acceptInvitation(token);
      let makeDefault = Boolean(options.use);
      if (!makeDefault && !options.json && process.stdin.isTTY) {
        makeDefault = await confirm({ message: `Make ${organization.name} your default organization?`, default: true });
      }
      if (makeDefault) await storeDefaultOrg(organization);
      if (options.json) {
        console.log(JSON.stringify({ organization, default: makeDefault }));
        return;
      }
      console.log(`${pc.green("✓")} Joined ${pc.bold(organization.name)} as ${organization.role}`);
      if (makeDefault) console.log(pc.dim(`Default organization is now ${organization.slug}.`));
      else console.log(pc.dim(`Use it with --org ${organization.slug}, or run \`uivoid org use ${organization.slug}\`.`));
    });
}
