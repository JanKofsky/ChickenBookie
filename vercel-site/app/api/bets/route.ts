import { NextRequest, NextResponse } from "next/server";
import { addBet } from "../../../lib/chickenBookie";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = await addBet({
      eventId: Number(body.eventId),
      bettor: String(body.bettor ?? ""),
      betType: body.betType,
      stake: Number(body.stake),
      race: body.race == null ? null : Number(body.race),
      picks: Array.isArray(body.picks) ? body.picks.map(Number) : []
    });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not add bet." }, { status: 400 });
  }
}
