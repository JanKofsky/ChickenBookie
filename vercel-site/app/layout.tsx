import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://chickenbookie.com"),
  title: {
    default: "Chicken Bookie",
    template: "%s | Chicken Bookie"
  },
  description: "A private race-day pool tracker for chicken races, party events, and simple settlement.",
  alternates: {
    canonical: "/"
  },
  openGraph: {
    title: "Chicken Bookie",
    description: "A private race-day pool tracker for chicken races, party events, and simple settlement.",
    url: "https://chickenbookie.com",
    siteName: "Chicken Bookie",
    type: "website"
  },
  robots: {
    index: true,
    follow: true
  },
  verification: {
    google: "trn2tmxuiiLfixuinJ4NiTHMBr4WTjXo4l4S6K_oIWM"
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
