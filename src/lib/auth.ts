// Server only. A single Neon Auth instance, created on first use so that local
// mode, which has no auth settings, never touches it.
import { createNeonAuth } from "@neon/auth/next/server";

type NeonAuth = ReturnType<typeof createNeonAuth>;
let instance: NeonAuth | null = null;

export function getAuth(): NeonAuth {
  instance ??= createNeonAuth({
    baseUrl: process.env.NEON_AUTH_BASE_URL as string,
    cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET as string },
  });
  return instance;
}
