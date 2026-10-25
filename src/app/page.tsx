import type { Metadata, Viewport } from "next";

import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "Toronto One — City services, one message away.",
  description:
    "Hey, Toronto. I'll do the running around. Explore Toronto One, a demo bringing Voting and Recreation into one conversation.",
};

export const viewport: Viewport = {
  themeColor: "#FCFBF9",
  colorScheme: "light",
};

export default function Home() {
  return <LandingPage />;
}
