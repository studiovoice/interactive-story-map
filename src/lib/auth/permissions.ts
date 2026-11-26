/**
 * Roles and what they may do. One list for the server (Better Auth's admin plugin checks it) and
 * the browser (to hide buttons). Pure: no `server-only`, scripts and client components import it.
 *
 * Only staff have accounts. The public never signs in (see docs/plans/auth-and-roles.md).
 *
 *   admin    everything: content, approving uploads, users and roles
 *   curator  stories and collections (incl. publishing and deleting), adding points,
 *            and a point's metadata (tags, time, time precision)
 */
import { createAccessControl } from "better-auth/plugins/access"
import { defaultStatements } from "better-auth/plugins/admin/access"

export const statements = {
  // Better Auth's own: managing users and their sessions.
  ...defaultStatements,
  point: ["create", "edit-metadata", "edit", "delete", "approve"],
  story: ["create", "edit", "publish", "delete"],
  collection: ["create", "edit", "delete"],
} as const

export const ac = createAccessControl(statements)

export const roles = {
  admin: ac.newRole({
    // No impersonation: with sensitive content, every action should be the admin's own.
    user: ["create", "list", "set-role", "ban", "delete", "set-email", "get", "update"],
    session: ["list", "revoke", "delete"],
    point: ["create", "edit-metadata", "edit", "delete", "approve"],
    story: ["create", "edit", "publish", "delete"],
    collection: ["create", "edit", "delete"],
  }),
  curator: ac.newRole({
    point: ["create", "edit-metadata"],
    story: ["create", "edit", "publish", "delete"],
    collection: ["create", "edit", "delete"],
  }),
}

export type Role = keyof typeof roles
export const roleNames = Object.keys(roles) as Role[]

export const roleLabels: Record<Role, string> = { admin: "Admin", curator: "Curator" }

export const isRole = (value: unknown): value is Role => typeof value === "string" && value in roles
