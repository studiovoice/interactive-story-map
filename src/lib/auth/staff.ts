import "server-only"

import { asc } from "drizzle-orm"
import { connection } from "next/server"
import { cache } from "react"
import { getDb } from "@/lib/data/drizzle/client"
import { users } from "@/lib/data/drizzle/auth-schema"
import { isRole, type Role } from "./permissions"

export type StaffMember = { id: string; name: string; email: string; role: Role | null; banned: boolean }

/**
 * Every staff account, for showing who added a point and filtering by it. Staff pages only: it
 * includes emails. Small (a team), so it's read whole.
 */
export const listStaff = cache(async (): Promise<StaffMember[]> => {
  await connection()
  const rows = await getDb()
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, banned: users.banned })
    .from(users)
    .orderBy(asc(users.name))
  return rows.map((r) => ({ ...r, role: isRole(r.role) ? r.role : null, banned: !!r.banned }))
})
