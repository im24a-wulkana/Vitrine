// Sets up a Neon database: npm run db:migrate. Safe to run again.
import { Client, neonConfig } from "@neondatabase/serverless";
import { BOOTSTRAP_SQL, grantRolesTo, migrate } from "../src/lib/db/migrate";
import { need } from "./lib";

neonConfig.webSocketConstructor = WebSocket;

async function main() {
  const client = new Client(process.env.DATABASE_URL_UNPOOLED || need("DATABASE_URL"));
  await client.connect();
  try {
    const current = await client.query<{ current_user: string }>("select current_user");
    await client.query(BOOTSTRAP_SQL);
    await client.query(grantRolesTo(current.rows[0].current_user));
    const ran = await migrate({
      exec: (sql) => client.query(sql),
      query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await client.query(sql, params)).rows as T[] }),
    });
    console.log(ran.length ? `Applied: ${ran.join(", ")}` : "Already up to date.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
