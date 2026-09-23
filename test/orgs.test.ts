import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultOrg, findInvitation, findMember, parseInviteToken, parseRole, resolveOrg, toStoredOrg,
} from "../src/orgs.js";
import type { Invitation, Member, Membership } from "../src/types.js";

const acme: Membership = { id: "org-acme", name: "Acme", slug: "acme", role: "owner" };
const side: Membership = { id: "org-side", name: "Side", slug: "side", role: "member" };
const token = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde";

test("parseRole accepts known roles case-insensitively and rejects others", () => {
  assert.equal(parseRole("Admin"), "admin");
  assert.throws(() => parseRole("superuser"), /Unknown role "superuser"\. Use one of: owner, admin, member\./);
});

test("defaultOrg prefers the stored org while still a member, else the only org", () => {
  assert.equal(defaultOrg([acme, side], { id: "org-side", name: "Side", slug: "side" }), side);
  assert.equal(defaultOrg([acme], { id: "org-gone", name: "Gone", slug: "gone" }), acme);
  assert.equal(defaultOrg([acme, side], undefined), undefined);
  assert.equal(defaultOrg([], undefined), undefined);
});

test("resolveOrg matches --org by slug or id", () => {
  assert.equal(resolveOrg([acme, side], "side"), side);
  assert.equal(resolveOrg([acme, side], "org-acme"), acme);
  assert.throws(() => resolveOrg([acme, side], "nope"), /not a member of an organization called "nope"\. Yours: acme, side\./);
});

test("resolveOrg falls back to the default and explains ambiguity", () => {
  assert.equal(resolveOrg([acme], undefined), acme);
  assert.equal(resolveOrg([acme, side], undefined, { id: "org-acme", name: "Acme", slug: "acme" }), acme);
  assert.throws(() => resolveOrg([acme, side], undefined), /several organizations \(acme, side\)\. Pass --org <slug> or run `uivoid org use <slug>`\./);
  assert.throws(() => resolveOrg([], undefined), /doesn't belong to any organization/);
});

test("toStoredOrg drops the role", () => {
  assert.deepEqual(toStoredOrg(acme), { id: "org-acme", name: "Acme", slug: "acme" });
});

test("parseInviteToken accepts a raw token or an invite link", () => {
  assert.equal(parseInviteToken(token), token);
  assert.equal(parseInviteToken(` https://portal.uivoid.app/invite/${token} `), token);
  assert.equal(parseInviteToken(`http://localhost:3000/invite/${token}/?utm=x`), token);
  assert.throws(() => parseInviteToken("https://portal.uivoid.app/projects/abc"), /doesn't look like a UIvoid invite link or token/);
  assert.throws(() => parseInviteToken("short"), /doesn't look like a UIvoid invite link or token/);
  assert.throws(() => parseInviteToken("not a url://"), /doesn't look like a UIvoid invite link or token/);
});

test("findMember matches email case-insensitively", () => {
  const members: Member[] = [{ user_id: "7", email: "Ada@acme.io", role: "admin", joined_at: "2026-09-01T00:00:00Z" }];
  assert.equal(findMember(members, " ada@ACME.io ").user_id, "7");
  assert.throws(() => findMember(members, "bob@acme.io"), /bob@acme\.io isn't a member of this organization\./);
});

test("findInvitation matches by id or email", () => {
  const invitations: Invitation[] = [{
    id: "inv-1", email: "new@acme.io", role: "member", invited_by: "ada@acme.io",
    created_at: "2026-09-20T00:00:00Z", expires_at: "2026-09-27T00:00:00Z",
  }];
  assert.equal(findInvitation(invitations, "inv-1").email, "new@acme.io");
  assert.equal(findInvitation(invitations, "NEW@acme.io").id, "inv-1");
  assert.throws(() => findInvitation(invitations, "x@acme.io"), /No pending invite for x@acme\.io\./);
});
