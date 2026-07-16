import Link from "next/link";
import type { Metadata } from "next";
import SiteHeader from "../components/SiteHeader";

export const metadata: Metadata = {
  title: "About",
  description: "About Chicken Bookie, a private pool tracker for chicken races, Chicken Drop, shared pots, and simple settlement.",
  alternates: { canonical: "/about" }
};

export default function AboutPage() {
  return (
    <main className="shell simple-page">
      <SiteHeader />
      <section className="panel">
        <p className="eyebrow">About</p>
        <h1>Chicken Bookie</h1>
        <p className="muted">
          Chicken Bookie is a small private tool for chicken races, Chicken Drop (also known as Chicken Shit Bingo), backyard party pools, and bawk-worthy coop chaos.
        </p>
        <p className="muted">
          It lets hosts create an event, track pool entries in one shared feed bucket, enter official winners, and produce a short settlement list so people know who pays who.
        </p>
        <p className="muted">
          The app is built for friendly private events. Payment happens outside Chicken Bookie between the people in the event.
        </p>
        <Link className="text-link" href="/">Back to the coop</Link>
      </section>
    </main>
  );
}
