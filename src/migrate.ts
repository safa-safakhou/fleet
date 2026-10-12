import { connect, migrate } from "./db.js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL_REQUIRED");
const pool = connect(process.env.DATABASE_URL);
try {
  await migrate(pool);
} finally {
  await pool.end();
}
