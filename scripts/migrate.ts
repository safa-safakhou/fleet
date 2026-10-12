import { connect, migrate } from "../src/db.js";

const url = process.env.DATABASE_URL;
if (!url) throw Error("DATABASE_URL_REQUIRED");
const pool = connect(url);
try {
  await migrate(pool);
  console.log("Fleet migrations complete.");
} finally {
  await pool.end();
}
