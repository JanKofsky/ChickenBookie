import { NextRequest, NextResponse } from "next/server";
import { getEventByCode } from "../../../lib/chickenBookie";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code") ?? "corn hub";
    const payload = await getEventByCode(code);
    if (!payload) return NextResponse.json({ error: "No event found with that code." }, { status: 404 });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load event." }, { status: 500 });
  }
}
