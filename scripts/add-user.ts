// Creates an account or lets an existing login in.
//   npm run add-user -- you@example.com "Your Name"
// A password is generated and printed once, unless the login already exists.
import { randomBytes } from "node:crypto";
import { ensureAccount, need } from "./lib";

async function main() {
  const [email, name] = process.argv.slice(2);
  if (!email || !email.includes("@")) {
    console.error('Usage: npm run add-user -- you@example.com "Your Name"');
    process.exit(1);
  }
  need("DATABASE_URL");
  const password = randomBytes(18).toString("base64url");
  const { id, createdLogin } = await ensureAccount(email, password, name ?? email.split("@")[0]);
  console.log(createdLogin ? `Created ${email} (${id}).\nPassword, shown only now: ${password}` : `${email} already had a login, and can now use the app (${id}).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
