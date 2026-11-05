/**
 * With no database configured, Vitrine runs in local mode: no sign-in, and data
 * stays in .vitrine-data on this computer. Adding DATABASE_URL and the Neon Auth
 * settings to .env.local switches the whole app to Neon with no code changes.
 * Server only: this value isn't available in the browser.
 */
export const isLocalMode = !process.env.DATABASE_URL;
