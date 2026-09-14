import { defineConfig } from "drizzle-kit";

// Requires DATABASE_URL in the environment. See ../../.env.example.
export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
