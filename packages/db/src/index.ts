import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Lazy on purpose: this module is imported by every route that touches the
// database, including during `next build`'s page-data-collection pass --
// which happens in the Docker build stage, where DATABASE_URL is not set
// (only the runtime stage has it, via Coolify). Constructing the
// postgres.js client and validating the env var eagerly at module load
// would throw during `pnpm build` itself, before the app ever runs.
// postgres.js's own connections are already lazy (no TCP on construction),
// so the only thing that needed deferring was this file's own env check.
let cached: ReturnType<typeof drizzle<typeof schema>> | undefined;

function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (cached) return cached;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — see .env.example at the repo root");
  }
  const client = postgres(connectionString);
  cached = drizzle(client, { schema });
  return cached;
}

// A Proxy so every existing `db.select()/.insert()/.transaction()` call
// site works unchanged, while the real client is only created on first
// property access -- i.e. at request time, never at import/build time.
export const db: ReturnType<typeof drizzle<typeof schema>> = new Proxy(
  {} as ReturnType<typeof drizzle<typeof schema>>,
  {
    get(_target, prop, receiver) {
      const real = getDb();
      const value = Reflect.get(real, prop, receiver);
      return typeof value === "function" ? value.bind(real) : value;
    },
  },
);

export * from "./schema";
