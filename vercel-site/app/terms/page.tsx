import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms for Chicken Bookie, a private race-day pool tracker that does not process payments or operate wagering.",
  alternates: { canonical: "/terms" }
};

export default function TermsPage() {
  return (
    <main className="shell simple-page">
      <section className="panel">
        <p className="eyebrow">Terms</p>
        <h1>Terms</h1>
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
