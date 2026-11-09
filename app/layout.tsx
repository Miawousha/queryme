import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, JetBrains_Mono } from "next/font/google";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import "./globals.css";

// Runs before first paint so the page never flashes the wrong theme: an
// explicitly stored choice wins, otherwise the OS `prefers-color-scheme`.
const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('${THEME_STORAGE_KEY}');var t=(s==='light'||s==='dark')?s:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark';}})();`;

// Matrice's faces (matrice-website-v2): Geist for text, JetBrains Mono for
// headings, the uppercase label strips and code.
const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

import { getPersonaStore } from "@/lib/persona/store";
import { resolveRootAccountId } from "@/lib/accounts/root";
import { loadPersona } from "@/lib/persona";

const FALLBACK_METADATA: Metadata = {
  title: "queritae",
  description: "A queryable CV — interview the agent.",
};

export async function generateMetadata(): Promise<Metadata> {
  // Metadata generation runs on every route (root layout). It must never throw —
  // an unresolved root account or a cold-start persona fetch failure would
  // otherwise crash the entire render — so any failure falls back to generic
  // platform metadata. (The landing at `/` also overrides title/description via
  // its own `metadata` export.)
  try {
    const accountId = await resolveRootAccountId();
    await getPersonaStore().ensureReady(accountId);
    const root = getPersonaStore().getRoot(accountId);
    if (!root) return FALLBACK_METADATA;
    const persona = loadPersona(root);
    return {
      title: `${persona.fullName} — queryable CV`,
      description: `Ask the agent about ${persona.givenName}'s background, experience, and projects.`,
    };
  } catch {
    return FALLBACK_METADATA;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The CSP nonce set by middleware — required for the inline theme script.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      className={`${geist.variable} ${jetbrainsMono.variable}`}
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
