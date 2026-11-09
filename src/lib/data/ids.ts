import { customAlphabet } from "nanoid"

const nano = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12)

export type IdPrefix = "pt" | "col" | "sty" | "ch" | "med"

/** Prefixed, URL-safe ids ("pt_k3j9x0a1b2c3"). Works as a text primary key in Postgres too. */
export const newId = (prefix: IdPrefix) => `${prefix}_${nano()}`
