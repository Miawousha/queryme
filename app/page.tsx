import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "queryme — a CV you can talk to",
  description:
    "Turn a public GitHub repo of your experience into a grounded AI agent — and an MCP endpoint — that answers recruiters' questions and cites its sources.",
};

// The bare domain serves the platform landing page. Individual accounts live at
// /{username}; the house/featured account is linked via ROOT_ACCOUNT_USERNAME.
export default function Home() {
  return <LandingPage seeItLiveUsername={process.env.ROOT_ACCOUNT_USERNAME ?? null} />;
}
