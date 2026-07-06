import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy",
  description: "Privacy policy for Chicken Bookie, including event data, payment notes, and Vercel Web Analytics.",
  alternates: { canonical: "/privacy" }
};

export default function PrivacyPage() {
  return (
    <main className="shell simple-page">
      <section className="panel">
        <p className="eyebrow">Chicken Bookie</p>
        <h1>Privacy</h1>
        <p className="muted">
          Chicken Bookie stores event setup, chicken names, race details, pool entries, results, and settlement math so race hosts can run their event.
        </p>
        <p className="muted">
          Do not put sensitive personal information in event names, participant names, chicken names, or race details. Payment, if any, happens outside Chicken Bookie between the people in the event.
        </p>
        <p className="muted">
          The site uses Vercel Web Analytics for basic traffic measurement. It does not need ad tracking or malware-like redirects to work.
        </p>
        <Link className="text-link" href="/">Back to the coop</Link>
      </section>
    </main>
  );
}
