import { NextRequest, NextResponse } from "next/server";
import { addBet } from "../../../lib/chickenBookie";

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
    const payload = await addBet({
      eventId: Number(body.eventId),
      bettor: String(body.bettor ?? ""),
      venmo: String(body.venmo ?? ""),
      betType: body.betType,
      stake: Number(body.stake),
      race: body.race == null ? null : Number(body.race),
      dropNumber: body.dropNumber == null ? null : Number(body.dropNumber),
      picks: Array.isArray(body.picks) ? body.picks.map(Number) : []
    });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not add bet.") }, { status: 400 });
  }
}


