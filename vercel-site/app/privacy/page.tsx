import Link from "next/link";
import type { Metadata } from "next";
import SiteHeader from "../components/SiteHeader";

export const metadata: Metadata = {
  title: "Privacy & Terms",
  description: "Privacy and terms for Chicken Bookie, including event data, Cluck Bucks, payment notes, and basic site analytics.",
  alternates: { canonical: "/privacy" }
};

export default function PrivacyPage() {
  return (
    <main className="shell simple-page">
      <SiteHeader />
      <section className="panel">
        <p className="eyebrow">Chicken Bookie</p>
        <h1>Privacy & Terms</h1>
        <h2>privacy disclosure</h2>
        <p className="muted">
          Chicken Bookie stores event setup, chicken names, race details, pool entries, Venmo handles supplied by hosts and bettors, an official host Venmo profile link for host-maintained pools, payment reference IDs, bettor-submitted and host-confirmed payment statuses, results, and settlement math so race hosts can run their event.
        </p>
        <p className="muted">
          Do not put sensitive personal information in event names, participant names, chicken names, or race details. Venmo handles, payment reference IDs, and payment-confirmation status are visible to people who can open the event. Payment, if any, happens outside Chicken Bookie between the people in the event.
        </p>
        <p className="muted">
          The site may use basic privacy-friendly analytics to understand visits and keep the app working well.
        </p>
        <h2>terms and conditions</h2>
        <p className="muted">
          Chicken Bookie is a private event scorekeeping and pool-tracking tool. It does not collect, hold, transfer, process, or guarantee any money.
        </p>
        <p className="muted">
          Cluck Bucks are event scorekeeping units entered by the host or participants. They are not purchased through Chicken Bookie and have no value inside the app.
        </p>
        <p className="muted">
          Event hosts are responsible for following the rules where they live and where their guests participate. Do not use Chicken Bookie for unlawful wagering, commercial gambling, public sportsbook activity, or anything involving minors.
        </p>
        <p className="muted">
          If your event uses real money, keep it private, voluntary, no-rake, and legal for everyone involved. When in doubt, do not use real money.
        </p>
        <p className="muted">
          Chicken Bookie settlement output is informational only. People handle any payments outside the app at their own discretion.
        </p>
        <Link className="text-link" href="/">Back to the coop</Link>
      </section>
    </main>
  );
}
