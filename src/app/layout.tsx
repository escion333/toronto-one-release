import { appPath } from "@/lib/app-path";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = localFont({
  src: "./fonts/inter-latin.woff2",
  weight: "400 700",
  variable: "--font-inter",
  display: "swap",
});
const instrument = localFont({
  src: "./fonts/instrumentsans-latin.woff2",
  weight: "400 700",
  variable: "--font-instrument",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-visual",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FCFBF9" },
    { media: "(prefers-color-scheme: dark)", color: "#111216" },
  ],
};

export const metadata: Metadata = {
  title: "Toronto One — Get city life done.",
  description:
    "Your Toronto companion. Find real voting information and recreation, with help preparing City bookings.",
  robots: { index: false, follow: false },
  icons: {
    icon: { url: appPath("/brand/toronto-one-wide-lens.svg"), type: "image/svg+xml" },
    apple: appPath("/brand/toronto-one-apple.png"),
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-CA" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${instrument.variable} font-sans antialiased`}
      >
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
