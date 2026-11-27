import { describe, expect, it } from "vitest"
import { can, type Permissions, type Role } from "../permissions"

/**
 * The permission matrix from docs/plans/auth-and-roles.md. A change to a role shows up here, so it's
 * a deliberate decision, not an accident.
 */
const matrix: [Permissions, { public: boolean; curator: boolean; admin: boolean }][] = [
  [{ point: ["create"] }, { public: false, curator: true, admin: true }],
  [{ point: ["edit-metadata"] }, { public: false, curator: true, admin: true }],
  [{ point: ["edit"] }, { public: false, curator: false, admin: true }],
  [{ point: ["delete"] }, { public: false, curator: false, admin: true }],
  [{ point: ["approve"] }, { public: false, curator: false, admin: true }],
  [{ story: ["create"] }, { public: false, curator: true, admin: true }],
  [{ story: ["edit"] }, { public: false, curator: true, admin: true }],
  [{ story: ["publish"] }, { public: false, curator: true, admin: true }],
  [{ story: ["delete"] }, { public: false, curator: true, admin: true }],
  [{ collection: ["create"] }, { public: false, curator: true, admin: true }],
  [{ collection: ["edit"] }, { public: false, curator: true, admin: true }],
  [{ collection: ["delete"] }, { public: false, curator: true, admin: true }],
  [{ user: ["create"] }, { public: false, curator: false, admin: true }],
  [{ user: ["set-role"] }, { public: false, curator: false, admin: true }],
  [{ user: ["ban"] }, { public: false, curator: false, admin: true }],
  [{ user: ["impersonate"] }, { public: false, curator: false, admin: false }],
  [{ session: ["revoke"] }, { public: false, curator: false, admin: true }],
]

describe("permission matrix", () => {
  for (const [permissions, expected] of matrix) {
    const label = JSON.stringify(permissions)
    it(label, () => {
      expect(can(null, permissions), `public ${label}`).toBe(expected.public)
      expect(can("curator", permissions), `curator ${label}`).toBe(expected.curator)
      expect(can("admin", permissions), `admin ${label}`).toBe(expected.admin)
    })
  }

  it("needs every listed action", () => {
    expect(can("curator", { point: ["create", "edit-metadata"] })).toBe(true)
    expect(can("curator", { point: ["edit-metadata", "edit"] })).toBe(false)
  })

  it("refuses unknown roles", () => {
    expect(can("owner" as Role, { story: ["edit"] })).toBe(false)
    expect(can(undefined, { story: ["edit"] })).toBe(false)
  })
})
