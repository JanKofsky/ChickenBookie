import { NextRequest, NextResponse } from "next/server";
import { checkAdmin, deleteBet, updateBettors, updateEventConfig, verifyBetPayment, verifyBettorPayments } from "../../../lib/chickenBookie";

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

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    if (body.action === "verify_payment") {
      const payload = await verifyBetPayment({
        eventId: Number(body.eventId),
        adminCode: String(body.adminCode ?? ""),
        betId: Number(body.betId),
        verified: body.verified !== false
      });
      return NextResponse.json(payload);
    }
    if (body.action === "verify_bettor_payments") {
      const payload = await verifyBettorPayments({
        eventId: Number(body.eventId),
        adminCode: String(body.adminCode ?? ""),
        paymentId: String(body.paymentId ?? ""),
        verified: body.verified !== false
      });
      return NextResponse.json(payload);
    }
    const payload = await updateBettors({
      eventId: Number(body.eventId),
      adminCode: String(body.adminCode ?? ""),
      bettors: Array.isArray(body.bettors) ? body.bettors : []
    });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not save Venmo handles.") }, { status: 400 });
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
      poolMode: body.poolMode === "host_managed" ? "host_managed" : "peer_to_peer",
      hostVenmo: String(body.hostVenmo ?? ""),
      hostVenmoLink: String(body.hostVenmoLink ?? ""),
      dropMaxNumber: body.dropMaxNumber == null ? undefined : Number(body.dropMaxNumber),
      dropGridColumns: body.dropGridColumns == null ? undefined : Number(body.dropGridColumns),
      dropGridRows: body.dropGridRows == null ? undefined : Number(body.dropGridRows),
      dropTicketPrice: body.dropTicketPrice == null ? undefined : Number(body.dropTicketPrice),
      chickens: Array.isArray(body.chickens) ? body.chickens : [],
      races: Array.isArray(body.races) ? body.races : []
    });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not save event settings.") }, { status: 400 });
  }
}

