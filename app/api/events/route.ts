import { NextRequest, NextResponse } from "next/server";
import { createEvent } from "../../../lib/chickenBookie";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = await createEvent({
      code: String(body.code ?? ""),
      name: String(body.name ?? ""),
      adminCode: String(body.adminCode ?? ""),
      copyCode: body.copyCode ? String(body.copyCode) : undefined
    });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create event." }, { status: 400 });
  }
}
