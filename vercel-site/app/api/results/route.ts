import { NextRequest, NextResponse } from "next/server";
import { clearResults, saveResults } from "../../../lib/chickenBookie";

export const runtime = "nodejs";

function errorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (message.includes("missing_connection_string") || message.includes("POSTGRES_URL")) {
    return "The coop database is not connected yet. Add the Supabase Postgres env vars in Vercel, then redeploy.";
  }
  return message;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = await saveResults({
      eventId: Number(body.eventId),
      adminCode: String(body.adminCode ?? ""),
      winningNumber: body.winningNumber == null ? null : Number(body.winningNumber),
      results: body.results ?? {}
    });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not save winners.") }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = await clearResults({
      eventId: Number(body.eventId),
      adminCode: String(body.adminCode ?? "")
    });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not clear winners.") }, { status: 400 });
  }
}


