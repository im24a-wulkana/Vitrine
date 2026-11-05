import { cache } from "react";
import { redirect } from "next/navigation";
import { createDbClient, type DbClient } from "@/lib/db/client";
import { isLocalMode } from "@/lib/mode";

export interface SessionUser {
  id: string;
  email: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Neon Auth can't turn off public sign-up yet, so anyone can create a login. A
 * login isn't enough to get in: the account must also be on this app's own list,
 * which only the add-user script writes to.
 */
export async function findAllowedUser(id: string | undefined | null): Promise<SessionUser | null> {
  if (!id || !UUID.test(id)) return null;
  const { ownerRunner } = await import("@/lib/db/neon");
  const { rows } = await ownerRunner().query(`select id, email from auth.users where id = $1`, [id]);
  const row = rows[0] as { id: string; email: string | null } | undefined;
  return row ? { id: row.id, email: row.email ?? "" } : null;
}

const currentUser = cache(async (): Promise<{ db: DbClient; user: SessionUser | null; loggedIn: boolean }> => {
  if (isLocalMode) {
    const [{ getLocalDb, localRunner }, { LOCAL_USER_ID }] = await Promise.all([import("@/lib/local/db"), import("@/lib/local/paths")]);
    return { db: createDbClient(localRunner(await getLocalDb())), user: { id: LOCAL_USER_ID, email: "Local mode" }, loggedIn: true };
  }

  const [{ getAuth }, { userRunner }] = await Promise.all([import("@/lib/auth"), import("@/lib/db/neon")]);
  const { data: session } = await getAuth().getSession();
  const user = await findAllowedUser(session?.user?.id);
  return { db: createDbClient(userRunner(user?.id ?? null)), user, loggedIn: !!session?.user };
});

/** For pages: returns the user, or redirects to sign-in. */
export async function requireUser() {
  const { db, user, loggedIn } = await currentUser();
  if (!user) redirect(loggedIn ? "/login?denied=1" : "/login");
  return { db, user };
}

/** For server actions and route handlers: user is null instead of redirecting. */
export async function getUser() {
  const { db, user } = await currentUser();
  return { db, user };
}
