/**
 * With no Supabase URL configured, Vitrine runs in local mode: no sign-in, and
 * data stays in .vitrine-data on this computer. Adding the Supabase keys to
 * .env.local switches the whole app to Supabase with no code changes.
 */
export const isLocalMode = !process.env.NEXT_PUBLIC_SUPABASE_URL;
