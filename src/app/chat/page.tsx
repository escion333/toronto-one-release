import type { Metadata } from "next";

import { TorontoOne } from "@/components/concierge/toronto-one";

export const metadata: Metadata = {
  title: "Chat — Toronto One",
  description:
    "Find real Toronto voting information and recreation, with help preparing City bookings.",
};

export default function ChatPage() {
  return <TorontoOne />;
}
