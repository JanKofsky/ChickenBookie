import { NextRequest, NextResponse } from "next/server";
import { createEvent } from "../../../lib/chickenBookie";

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
    const payload = await createEvent({
      code: String(body.code ?? ""),
      name: String(body.name ?? ""),
      adminCode: String(body.adminCode ?? ""),
      copyCode: body.copyCode ? String(body.copyCode) : undefined
    });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not create event.") }, { status: 400 });
  }
}


