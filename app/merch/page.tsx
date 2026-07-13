import { redirect } from "next/navigation";

export const metadata = {
  title: "Merch",
  description: "Chicken Bookie merch shop.",
  robots: {
    index: false,
    follow: false
  }
};

export default function MerchPage() {
  redirect("https://shop.chickenbookie.com");
}
