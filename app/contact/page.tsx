import Link from "next/link";
import type { Metadata } from "next";
import ContactForm from "./ContactForm";
import SiteHeader from "../components/SiteHeader";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact Chicken Bookie about the private chicken race and Chicken Drop pool tracker.",
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
          Questions, event-day issues, good ideas, or chicken-related business? Send it along.
        </p>
        <ContactForm />
        <Link className="text-link" href="/">Back to the coop</Link>
      </section>
    </main>
  );
}
