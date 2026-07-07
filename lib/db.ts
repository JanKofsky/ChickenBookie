import postgres from "postgres";

type QueryRows = Array<Record<string, any>> & { count?: number };
type QueryResult = { rows: Array<Record<string, any>>; rowCount: number };

let client: ReturnType<typeof postgres> | null = null;

function getConnectionString() {
  const connectionString =
    process.env.POSTGRES_URL ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_PRISMA_URL ??
    process.env.SUPABASE_DB_URL;

  if (!connectionString) {
    throw new Error("POSTGRES_URL is missing. Add the Supabase pooled Postgres connection string in Vercel.");
  }

  return connectionString;
}

function getClient() {
  if (!client) {
    client = postgres(getConnectionString(), {
      max: 5,
      prepare: false,
      ssl: "require"
    });
  }

  return client;
}

export async function sql(strings: TemplateStringsArray, ...values: any[]): Promise<QueryResult> {
  const query = getClient() as any;
  const rows = (await query(strings, ...values)) as QueryRows;
  return { rows, rowCount: typeof rows.count === "number" ? rows.count : rows.length };
}
