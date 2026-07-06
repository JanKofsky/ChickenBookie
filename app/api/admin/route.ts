import { NextRequest, NextResponse } from "next/server";
import { deleteBet } from "../../../lib/chickenBookie";

export const runtime = "nodejs";

function errorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (message.includes("missing_connection_string") || message.includes("POSTGRES_URL")) {
    return "The coop database is not connected yet. Add Vercel Postgres/Neon env vars to this preview deployment, then redeploy.";
  }
  return message;
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = await deleteBet({
      eventId: Number(body.eventId),
      adminCode: String(body.adminCode ?? ""),
      betId: Number(body.betId)
    });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not delete bet.") }, { status: 400 });
  }
}


