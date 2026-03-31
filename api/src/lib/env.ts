import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  MONGODB: z.string().min(1, "MONGODB is required"),
  RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required"),
  RESEND_FROM_EMAIL: z
    .string()
    .email("RESEND_FROM_EMAIL must be a valid email"),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters"),
  INSTANCE_URL: z.string().url("INSTANCE_URL must be a valid URL"),
  INSTANCE_NAME: z.string().min(1, "INSTANCE_NAME is required"),
  ADMIN_API_PORT: z.coerce.number().int().positive().default(5181),
  ADMIN_WEB_ORIGIN: z.string().url("ADMIN_WEB_ORIGIN must be a valid URL")
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("Invalid environment configuration.");
  console.error(JSON.stringify(parsedEnv.error.flatten().fieldErrors, null, 2));
  throw new Error("Environment validation failed");
}

export const env = parsedEnv.data;
