import path from "node:path";
import { createPostgresAdapter } from "./postgres.js";
import { createSqliteAdapter } from "./sqlite.js";

export async function createDatabase({ rootDir, dataDir, hashPassword, nowIso }) {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    return createPostgresAdapter({ databaseUrl, hashPassword, nowIso, rootDir });
  }

  const dbFile = path.join(dataDir, "fieldsight.sqlite");
  return createSqliteAdapter({ dataDir, dbFile, hashPassword, nowIso });
}
