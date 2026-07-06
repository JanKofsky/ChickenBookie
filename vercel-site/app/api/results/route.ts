import { NextRequest, NextResponse } from "next/server";
import { saveResults } from "../../../lib/chickenBookie";

export const runtime = "nodejs";

function errorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (message.includes("missing_connection_string") || message.includes("POSTGRES_URL")) {
    return "The coop database is not connected yet. Add Vercel Postgres/Neon env vars to this preview deployment, then redeploy.";
  }
  return message;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = await saveResults({
      eventId: Number(body.eventId),
      adminCode: String(body.adminCode ?? ""),
      results: body.results ?? {}
    });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not save winners.") }, { status: 400 });
  }
}


