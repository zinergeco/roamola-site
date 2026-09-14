import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roamola — build",
  description: "Roamola in-progress build. Not for public consumption.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
