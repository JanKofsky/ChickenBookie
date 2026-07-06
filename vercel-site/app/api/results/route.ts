import { NextRequest, NextResponse } from "next/server";
import { saveResults } from "../../../lib/chickenBookie";

export const runtime = "nodejs";

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
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save winners." }, { status: 400 });
  }
}
