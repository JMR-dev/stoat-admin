import "dotenv/config";

import argon2 from "argon2";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { parseArgs } from "node:util";

import { statements } from "./db/sqlite.js";

type SeedArgs = {
  username?: string;
  password?: string;
  "reset-password"?: boolean;
};

async function promptForMissing(
  args: SeedArgs
): Promise<{ username: string; password: string }> {
  const readline = createInterface({ input, output });

  try {
    const username = args.username ?? (await readline.question("Username: "));
    const password = args.password ?? (await readline.question("Password: "));

    return {
      username: username.trim(),
      password: password.trim()
    };
  } finally {
    readline.close();
  }
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const normalizedArgs = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;

  const parsed = parseArgs({
    args: normalizedArgs,
    options: {
      username: {
        type: "string"
      },
      password: {
        type: "string"
      },
      "reset-password": {
        type: "boolean",
        default: false
      }
    }
  });

  const args = parsed.values as SeedArgs;
  const existingUser = statements.getFirstAdminUser.get();

  if (existingUser && !args["reset-password"]) {
    console.error(
      "An admin user already exists. Use --reset-password to update it."
    );
    process.exit(1);
  }

  const { username, password } = await promptForMissing({
    username: args.username ?? existingUser?.username,
    password: args.password,
    "reset-password": args["reset-password"]
  });

  if (!username || !password) {
    console.error("Username and password are required.");
    process.exit(1);
  }

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id
  });

  if (args["reset-password"]) {
    if (!existingUser) {
      console.error(
        "No admin user exists yet. Run the seed script without --reset-password first."
      );
      process.exit(1);
    }

    const targetUsername = existingUser?.username ?? username;
    statements.updateAdminPasswordByUsername.run(passwordHash, targetUsername);
    console.log(`Password updated for ${targetUsername}.`);
    return;
  }

  statements.insertAdminUser.run(username, passwordHash);
  console.log(`Admin user ${username} created.`);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
