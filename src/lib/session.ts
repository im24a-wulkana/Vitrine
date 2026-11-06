import { cache } from "react";
import { redirect } from "next/navigation";
import { ensureUser, type SessionUser } from "@/lib/db/accounts";
import { createDbClient, type DbClient } from "@/lib/db/client";
import { isLocalMode } from "@/lib/mode";

export type { SessionUser };

const currentUser = cache(async (): Promise<{ db: DbClient; user: SessionUser | null }> => {
  if (isLocalMode) {
    const [{ getLocalDb, localRunner }, { LOCAL_USER_ID }] = await Promise.all([import("@/lib/local/db"), import("@/lib/local/paths")]);
    return { db: createDbClient(localRunner(await getLocalDb())), user: { id: LOCAL_USER_ID, email: "Local mode" } };
  }

  const [{ getAuth }, { ownerRunner, userRunner }] = await Promise.all([import("@/lib/auth"), import("@/lib/db/neon")]);
  const { data: session } = await getAuth().getSession();
  const user = await ensureUser(ownerRunner(), session?.user?.id, session?.user?.email);
  return { db: createDbClient(userRunner(user?.id ?? null)), user };
});

/** For pages: returns the user, or redirects to sign-in. */
export async function requireUser() {
  const { db, user } = await currentUser();
  if (!user) redirect("/login");
  return { db, user };
}

/** For server actions and route handlers: user is null instead of redirecting. */
export async function getUser() {
  return currentUser();
}
