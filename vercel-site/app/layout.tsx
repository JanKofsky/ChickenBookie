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
  description: "A private pool tracker for chicken races, Chicken Drop, and event-day settlement.",
  alternates: {
    canonical: "/"
  },
  icons: {
    icon: [
      { url: "/search-icon-dark-green.png", type: "image/png" }
    ],
    shortcut: ["/search-icon-dark-green.png"],
    apple: [{ url: "/search-icon-dark-green.png", type: "image/png" }]
  },
  openGraph: {
    title: "Chicken Bookie",
    description: "A private pool tracker for chicken races, Chicken Drop, and event-day settlement.",
    url: "https://chickenbookie.com",
    siteName: "Chicken Bookie",
    type: "website",
    images: [
      {
        url: "/assets/chicken_bookie_logo.png",
        width: 363,
        height: 339,
        alt: "Chicken Bookie logo"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Chicken Bookie",
    description: "A private pool tracker for chicken races, Chicken Drop, and event-day settlement.",
    images: ["/assets/chicken_bookie_logo.png"]
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
