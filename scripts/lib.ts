// Shared by the setup scripts. They connect as the database owner, and so see
// everyone's data: nothing here belongs in the app itself.
import { config } from "dotenv";
import { ensureUser } from "../src/lib/db/accounts";
import { createDbClient } from "../src/lib/db/client";
import { ownerRunner } from "../src/lib/db/neon";

config({ path: ".env.local" });

export function need(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Add it to .env.local (see .env.example).`);
    process.exit(1);
  }
  return value;
}

export const owner = () => createDbClient(ownerRunner());

/** The account for someone who has already signed in with Google. */
export async function accountFor(email: string): Promise<string> {
  const run = ownerRunner();
  const { rows } = await run.query(`select id from neon_auth."user" where lower(email) = lower($1)`, [email]);
  const user = await ensureUser(run, (rows[0] as { id: string } | undefined)?.id, email);
  if (!user) throw new Error(`No login for ${email} yet. Sign in to Vitrine with Google once, then run this again.`);
  return user.id;
}
