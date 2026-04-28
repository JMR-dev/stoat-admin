declare module "better-sqlite3-session-store" {
  import type session from "express-session";

  interface SqliteStoreOptions {
    client: unknown;
    expired?: {
      clear?: boolean;
      intervalMs?: number;
    };
  }

  interface SqliteStoreConstructor {
    new (options: SqliteStoreOptions): session.Store;
  }

  export default function connectSqlite3(
    sessionModule: typeof session
  ): SqliteStoreConstructor;
}
