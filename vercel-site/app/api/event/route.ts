import { NextRequest, NextResponse } from "next/server";
import { getEventByCode } from "../../../lib/chickenBookie";

export const runtime = "nodejs";

function errorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (message.includes("missing_connection_string") || message.includes("POSTGRES_URL")) {
    return "The coop database is not connected yet. Add Vercel Postgres/Neon env vars to this preview deployment, then redeploy.";
  }
  return message;
}

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code") ?? "corn hub";
    const payload = await getEventByCode(code);
    if (!payload) return NextResponse.json({ error: "No event found with that code." }, { status: 404 });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not load event.") }, { status: 500 });
  }
}


