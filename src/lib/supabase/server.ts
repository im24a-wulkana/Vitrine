import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { isLocalMode } from "@/lib/mode";

export async function createClient() {
  if (isLocalMode) {
    // Loaded on demand, so a Supabase deployment never touches the embedded database.
    const [{ getLocalDb }, { createLocalClient }] = await Promise.all([import("@/lib/local/db"), import("@/lib/local/client")]);
    return createLocalClient(await getLocalDb()) as unknown as ReturnType<typeof createServerClient>;
  }
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Components cannot set cookies. The middleware refreshes the session.
          }
        },
      },
    },
  );
}

/** For pages: returns the session user or redirects to login. */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

/** For server actions and route handlers: returns null instead of redirecting. */
export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}
