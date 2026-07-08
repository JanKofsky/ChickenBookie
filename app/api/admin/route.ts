import { NextRequest, NextResponse } from "next/server";
import { checkAdmin, deleteBet, updateEventConfig } from "../../../lib/chickenBookie";

export const runtime = "nodejs";

function errorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (message.includes("missing_connection_string") || message.includes("POSTGRES_URL")) {
    return "The coop database is not connected yet. Add the Supabase Postgres env vars in Vercel, then redeploy.";
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = await checkAdmin({
      eventId: Number(body.eventId),
      adminCode: String(body.adminCode ?? "")
    });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not unlock admin.") }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = await updateEventConfig({
      eventId: Number(body.eventId),
      adminCode: String(body.adminCode ?? ""),
      name: String(body.name ?? ""),
      bettingCloseAt: String(body.bettingCloseAt ?? ""),
      bettingTimezone: String(body.bettingTimezone ?? ""),
      officialRule: String(body.officialRule ?? ""),
      resultMode: body.resultMode === "full_order" ? "full_order" : "winner",
      chickens: Array.isArray(body.chickens) ? body.chickens : [],
      races: Array.isArray(body.races) ? body.races : []
    });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not save event settings.") }, { status: 400 });
  }
}

