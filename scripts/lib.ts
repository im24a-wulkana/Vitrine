// Shared by the setup scripts. They connect as the database owner, and so see
// everyone's data: nothing here belongs in the app itself.
import { config } from "dotenv";
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

/**
 * Makes sure a login exists for this email and is on the app's list of allowed
 * accounts. Neon Auth has public sign-up, so this creates the login the same way.
 * Adding to auth.users also creates the account's settings and default platforms.
 */
export async function ensureAccount(email: string, password: string, name: string): Promise<{ id: string; createdLogin: boolean }> {
  const run = ownerRunner();
  const { rows } = await run.query(`select id from neon_auth."user" where lower(email) = lower($1)`, [email]);
  let id = (rows[0] as { id: string } | undefined)?.id;
  const createdLogin = !id;

  if (!id) {
    const response = await fetch(`${need("NEON_AUTH_BASE_URL").replace(/\/$/, "")}/sign-up/email`, {
      method: "POST",
      // Localhost is pre-approved as a trusted origin in Neon Auth.
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ email, password, name }),
    });
    const body = await response.json().catch(() => null);
    id = body?.user?.id;
    if (!response.ok || !id) throw new Error(`Couldn't create the login: ${body?.message ?? response.status}`);
  }

  await run.query(`insert into auth.users (id, email) values ($1, $2) on conflict (id) do update set email = excluded.email`, [id, email]);
  return { id, createdLogin };
}
