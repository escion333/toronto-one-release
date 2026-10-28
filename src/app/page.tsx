import type { Metadata, Viewport } from "next";

import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "Toronto One — Find your next activity in Toronto.",
  description:
    "Explore City of Toronto recreation programs, check the details and plan your next outing—all in one conversation.",
};

export const viewport: Viewport = {
  themeColor: "#FCFBF9",
  colorScheme: "light",
};

export default function Home() {
  return <LandingPage />;
}
