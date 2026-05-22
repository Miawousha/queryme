import type { Metadata } from "next";
import { headers } from "next/headers";
import { DM_Sans, Instrument_Serif, JetBrains_Mono, Sora } from "next/font/google";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import "./globals.css";

// Runs before first paint so the page never flashes the wrong theme: an
// explicitly stored choice wins, otherwise the OS `prefers-color-scheme`.
const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('${THEME_STORAGE_KEY}');var t=(s==='light'||s==='dark')?s:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark';}})();`;

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});

export const metadata: Metadata = {
  title: "Alexandre Collet — queryable CV",
  description: "Ask the agent about Alexandre's background, experience, and projects.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The CSP nonce set by middleware — required for the inline theme script.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      className={`${sora.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} ${dmSans.variable}`}
      suppressHydrationWarning
    >
      <body>
        {/*
          The browser blanks the `nonce` attribute in the DOM once the script
          is processed, so server (`nonce="…"`) and client (`nonce=""`) differ
          at hydration — suppress that expected mismatch.
        */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
        {children}
      </body>
    </html>
  );
}
