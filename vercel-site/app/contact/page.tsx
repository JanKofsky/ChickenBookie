import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact Chicken Bookie about the private barnyard race-day pool tracker.",
  alternates: { canonical: "/contact" }
};

export default function ContactPage() {
  return (
    <main className="shell simple-page">
      <section className="panel">
        <p className="eyebrow">Contact</p>
        <h1>Contact</h1>
        <p className="muted">
          Questions, race-day issues, merch ideas, or chicken-related business can go here once email for the domain is set up.
        </p>
        <p className="muted">
          For now, Chicken Bookie does not collect support messages through a form. That keeps the site simple while the app is still early.
        </p>
        <Link className="text-link" href="/">Back to the coop</Link>
      </section>
    </main>
  );
}
