/**
 * Load .env files for scripts and drizzle-kit the way Next.js does for the app:
 * `.env.local` wins over `.env`, and real environment variables win over both.
 */
import { existsSync } from "node:fs"

for (const file of [".env.local", ".env"]) {
  // loadEnvFile never overwrites variables that are already set, so load the strongest file first.
  if (existsSync(file)) process.loadEnvFile(file)
}
