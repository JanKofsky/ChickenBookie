import Link from "next/link";
import type { Metadata } from "next";
import ContactForm from "./ContactForm";
import SiteHeader from "../components/SiteHeader";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact Chicken Bookie about the private barnyard race-day pool tracker.",
  alternates: { canonical: "/contact" }
};

export default function ContactPage() {
  return (
    <main className="shell simple-page">
      <SiteHeader />
      <section className="panel">
        <p className="eyebrow">Contact</p>
        <h1>hit us up</h1>
        <p className="muted">
          Questions, race-day issues, merch ideas, or chicken-related business can go here.
        </p>
        <p className="muted">
          Got a good idea for Chicken Bookie? Send it along.
        </p>
        <p className="muted">
          Messages are relayed privately. The inbox address stays off the page.
        </p>
        <ContactForm />
        <Link className="text-link" href="/">Back to the coop</Link>
      </section>
    </main>
  );
}
