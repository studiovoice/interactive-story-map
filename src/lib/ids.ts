import { customAlphabet } from "nanoid"

const nano = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12)

export type IdPrefix = "pt" | "col" | "sty" | "ch" | "med"

/**
 * Prefixed, URL-safe ids ("pt_k3j9x0a1b2c3"): our prefix + 12 random characters from nanoid.
 * Used for every object, on the server and in the browser (e.g. new chapters and media rows that
 * need an id before they're saved). Stored as text primary keys.
 */
export const newId = (prefix: IdPrefix) => `${prefix}_${nano()}`
