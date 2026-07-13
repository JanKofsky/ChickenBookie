import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = clean(body.name);
    const email = clean(body.email);
    const message = clean(body.message);
    const website = clean(body.website);

    if (website) return NextResponse.json({ ok: true });
    if (!name || !email || !message) {
      return NextResponse.json({ error: "Name, email, and message are required." }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    const to = process.env.CONTACT_TO_EMAIL ?? "www.chickenbookie@gmail.com";
    const from = process.env.CONTACT_FROM_EMAIL ?? "Chicken Bookie <onboarding@resend.dev>";
    if (!apiKey) {
      return NextResponse.json({ error: "Email is not configured: RESEND_API_KEY is missing." }, { status: 503 });
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to,
        reply_to: email,
        subject: `Chicken Bookie message from ${name}`,
        text: `Name: ${name}\nEmail: ${email}\n\n${message}`
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("Resend contact send failed", { status: response.status, detail });
      let message = detail;
      try {
        const parsed = JSON.parse(detail);
        message = parsed.message ?? detail;
      } catch {
        // keep raw detail
      }
      return NextResponse.json({ error: `Email send failed: ${message}` }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not send message." }, { status: 500 });
  }
}
