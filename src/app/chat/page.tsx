import type { Metadata } from "next";

import { TorontoOne } from "@/components/concierge/toronto-one";

export const metadata: Metadata = {
  title: "Chat — Toronto One",
  description:
    "Find Toronto recreation activities, check current City listings and plan your next outing with Toronto One.",
};

export default function ChatPage() {
  return <TorontoOne />;
}
