import type { Invitation, Member, Membership, Organization, Role } from "./types.js";

export const ROLES: readonly Role[] = ["owner", "admin", "member"];
/** Roles that can see and send invites; matches the backend's MANAGE_ROLES. */
export const MANAGE_ROLES: readonly Role[] = ["owner", "admin"];

export function parseRole(value: string): Role {
  const role = value.trim().toLowerCase();
  if (!(ROLES as readonly string[]).includes(role)) {
    throw new Error(`Unknown role ${JSON.stringify(value)}. Use one of: ${ROLES.join(", ")}.`);
  }
  return role as Role;
}

/** The org commands use without --org: the stored default while still a member, else the only org. */
export function defaultOrg(orgs: Membership[], stored?: Organization): Membership | undefined {
  return orgs.find((org) => org.id === stored?.id) ?? (orgs.length === 1 ? orgs[0] : undefined);
}

export function resolveOrg(orgs: Membership[], flag?: string, stored?: Organization): Membership {
  if (!orgs.length) {
    throw new Error("Your account doesn't belong to any organization. Accept an invite with `uivoid invite accept <link>` or create one in the portal.");
  }
  const choices = orgs.map((org) => org.slug).join(", ");
  if (flag) {
    const match = orgs.find((org) => org.slug === flag || org.id === flag);
    if (!match) throw new Error(`You're not a member of an organization called ${JSON.stringify(flag)}. Yours: ${choices}.`);
    return match;
  }
  const fallback = defaultOrg(orgs, stored);
  if (!fallback) throw new Error(`You belong to several organizations (${choices}). Pass --org <slug> or run \`uivoid org use <slug>\`.`);
  return fallback;
}

export function toStoredOrg(org: Organization): Organization {
  return { id: org.id, name: org.name, slug: org.slug };
}

export function parseInviteToken(input: string): string {
  const value = input.trim();
  let token = value;
  if (/^https?:\/\//i.test(value)) {
    try {
      const segments = new URL(value).pathname.split("/").filter(Boolean);
      const at = segments.indexOf("invite");
      token = at >= 0 ? segments[at + 1] ?? "" : "";
    } catch {
      token = "";
    }
  }
  if (!/^[A-Za-z0-9_-]{16,}$/.test(token)) throw new Error("That doesn't look like a UIvoid invite link or token.");
  return token;
}

export function findMember(members: Member[], email: string): Member {
  const needle = email.trim().toLowerCase();
  const match = members.find((member) => member.email.toLowerCase() === needle);
  if (!match) throw new Error(`${email.trim()} isn't a member of this organization.`);
  return match;
}

export function findInvitation(invitations: Invitation[], emailOrId: string): Invitation {
  const needle = emailOrId.trim();
  const match = invitations.find((invite) => invite.id === needle || invite.email.toLowerCase() === needle.toLowerCase());
  if (!match) throw new Error(`No pending invite for ${needle}.`);
  return match;
}
