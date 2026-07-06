import { NextRequest, NextResponse } from "next/server";
import { deleteBet } from "../../../lib/chickenBookie";

export const runtime = "nodejs";

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
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not delete bet." }, { status: 400 });
  }
}
