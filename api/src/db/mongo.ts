import { MongoClient, type Collection, type Db } from "mongodb";

import { env } from "../lib/env.js";
import type {
  AccountDocument,
  InviteDocument,
  SessionDocument,
  StrikeDocument,
  UserDocument
} from "./types.js";

let client: MongoClient | null = null;
let db: Db | null = null;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function connectMongo(): Promise<Db> {
  if (db) {
    return db;
  }

  let attempt = 0;

  for (;;) {
    try {
      client = new MongoClient(env.MONGODB);
      await client.connect();
      db = client.db("revolt");
      return db;
    } catch (error) {
      const waitMs = Math.min(1000 * 2 ** attempt, 30_000);
      attempt += 1;
      console.error(
        `MongoDB connection failed. Retrying in ${waitMs}ms.`,
        error
      );
      await delay(waitMs);
    }
  }
}

export function getDb(): Db {
  if (!db) {
    throw new Error("MongoDB has not been connected yet");
  }

  return db;
}

export function accounts(): Collection<AccountDocument> {
  return getDb().collection<AccountDocument>("accounts");
}

export function users(): Collection<UserDocument> {
  return getDb().collection<UserDocument>("users");
}

export function sessions(): Collection<SessionDocument> {
  return getDb().collection<SessionDocument>("sessions");
}

export function invites(): Collection<InviteDocument> {
  return getDb().collection<InviteDocument>("invites");
}

export function safetyStrikes(): Collection<StrikeDocument> {
  return getDb().collection<StrikeDocument>("safety_strikes");
}

export async function closeMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
