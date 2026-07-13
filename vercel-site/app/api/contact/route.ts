import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function contactError(status = 502) {
  return NextResponse.json({ error: "Could not send message. Please try again later." }, { status });
}

function redactEmailAddresses(value: string) {
  return value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted email]");
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

    const apiKey = clean(process.env.RESEND_API_KEY);
    const to = clean(process.env.CONTACT_TO_EMAIL);
    const from = process.env.CONTACT_FROM_EMAIL ?? "Chicken Bookie <onboarding@resend.dev>";
    if (!apiKey || !to) {
      console.error("Contact email is not configured", {
        hasApiKey: Boolean(apiKey),
        hasRecipient: Boolean(to)
      });
      return contactError(503);
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
      console.error("Resend contact send failed", {
        status: response.status,
        detail: redactEmailAddresses(detail)
      });
      return contactError();
    }

    return NextResponse.json({ ok: true });
  } catch {
    return contactError(500);
  }
}
