import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Alexandre Collet — queryable CV",
  description: "Ask the agent about Alexandre's background, experience, and projects.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
