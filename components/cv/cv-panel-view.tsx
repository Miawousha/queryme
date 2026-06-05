"use client";

import { useState } from "react";
import { useKb } from "@/components/kb/kb-context";
import { allRepos } from "@/lib/kb/repos";
import { useDialog } from "@/lib/use-dialog";
import { cn } from "@/lib/utils";
import {
  CopyIcon,
  DownloadIcon,
  KbDocToolbar,
  PrintIcon,
  type KbDocAction,
} from "@/components/kb/kb-doc-toolbar";
import { LanguageToggle } from "@/components/language-toggle";
import type { UiLang } from "@/lib/language";
import { CvDocumentClient } from "./cv-document-client";

/**
 * Panel rendering of the synthesized CV document. Mirrors `KbViewer`'s
 * structure (toolbar + scrollable body + focus mode) so it feels like any
 * other document in the KB panel, but with a language toggle and CV-specific
 * actions (copy markdown / download .md / print via `/cv`).
 */
export function CvPanelView({
  onLangChange,
}: {
  onLangChange: (next: UiLang) => void;
}) {
  const { lang, strings, closeFile, apiBasePath, cvPrintBase } = useKb();
  const [focus, setFocus] = useState(false);
  const focusRef = useDialog<HTMLDivElement>(focus, () => setFocus(false));

  async function copyCvMarkdown(): Promise<string> {
    const res = await fetch(`${apiBasePath}/cv?lang=${lang}`);
    const { kb } = await res.json();
    const md = assembleCvMarkdown(kb, lang);
    await navigator.clipboard.writeText(md);
    return strings.copied;
  }

  async function downloadCvMarkdown(): Promise<void> {
    const res = await fetch(`${apiBasePath}/cv?lang=${lang}`);
    const { kb } = await res.json();
    const md = assembleCvMarkdown(kb, lang);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `alexandre-collet-cv${lang === "fr" ? ".fr" : ""}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function openPrintView(): void {
    // Open the standalone CV route in a new tab — the print stylesheet there
    // is tuned for A4. Auto-trigger print via the `?print=1` flag.
    window.open(`${cvPrintBase}/cv?lang=${lang}&print=1`, "_blank", "noopener");
  }

  const actions: KbDocAction[] = [
    {
      key: "copy",
      label: strings.copy,
      ariaLabel: strings.copyAria,
      icon: <CopyIcon />,
      onClick: copyCvMarkdown,
    },
    {
      key: "download",
      label: strings.download,
      ariaLabel: strings.downloadAria,
      icon: <DownloadIcon />,
      onClick: downloadCvMarkdown,
    },
    {
      key: "print",
      label: strings.print,
      ariaLabel: strings.printAria,
      icon: <PrintIcon />,
      onClick: openPrintView,
    },
  ];

  return (
    <div
      ref={focusRef}
      tabIndex={-1}
      role={focus ? "dialog" : undefined}
      aria-modal={focus ? "true" : undefined}
      aria-label={focus ? strings.cv : undefined}
      className={cn(
        "flex flex-col outline-none",
        focus ? "fixed inset-0 z-50 bg-[var(--color-background)] p-4 sm:p-8" : "h-full",
      )}
    >
      <KbDocToolbar
        title={strings.cv}
        typeBadge="CV"
        backLabel={strings.back}
        onBack={closeFile}
        actions={actions}
        focused={focus}
        onToggleFocus={() => setFocus((v) => !v)}
        expandLabel={strings.expandFocus}
        minimizeLabel={strings.exitFocus}
      />
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mb-4 flex items-center justify-end">
          <LanguageToggle value={lang} onChange={onLangChange} />
        </div>
        <CvDocumentClient lang={lang} />
      </div>
    </div>
  );
}

/** Lightweight CV → markdown serializer for copy/download. Mirrors the layout
 * of `CvDocumentView`: profile header, then each section as a `##` heading
 * with bullets. Deliberately compact so the clipboard copy reads cleanly. */
function assembleCvMarkdown(kb: import("@/lib/kb/loader").Kb, lang: UiLang): string {
  const lines: string[] = [];
  lines.push(`# ${kb.profile.name}`);
  lines.push("");
  lines.push(kb.profile.headline);
  if (kb.profile.location) lines.push(kb.profile.location);
  const contact: string[] = [];
  if (kb.publicContact.email) contact.push(kb.publicContact.email);
  if (kb.publicContact.links?.linkedin) contact.push(kb.publicContact.links.linkedin);
  if (kb.publicContact.links?.github) contact.push(kb.publicContact.links.github);
  if (contact.length > 0) lines.push(contact.join("  ·  "));
  lines.push("");

  const expLabel = lang === "fr" ? "Expérience" : "Experience";
  lines.push(`## ${expLabel}`);
  for (const e of kb.experience) {
    lines.push("");
    lines.push(`### ${e.frontmatter.role} · ${e.frontmatter.company}`);
    const period = `${e.frontmatter.start} – ${e.frontmatter.end}`;
    const loc = e.frontmatter.location ? ` · ${e.frontmatter.location}` : "";
    lines.push(`_${period}${loc}_`);
    if (e.frontmatter.summary) lines.push(e.frontmatter.summary);
    const bullets = e.frontmatter.highlights ?? firstBulletList(e.body, 6);
    for (const b of bullets) lines.push(`- ${b}`);
    if (e.frontmatter.stack?.length) lines.push(`*Stack: ${e.frontmatter.stack.join(", ")}*`);
  }

  if (kb.education.entries.length > 0) {
    lines.push("");
    lines.push(`## ${lang === "fr" ? "Formation" : "Education"}`);
    for (const ed of kb.education.entries) {
      lines.push(`- **${ed.degree}** · ${ed.institution} — ${ed.start} – ${ed.end}${ed.notes ? `. ${ed.notes}` : ""}`);
    }
  }

  if (kb.skills.skills.length > 0) {
    lines.push("");
    lines.push(`## ${lang === "fr" ? "Compétences" : "Skills"}`);
    lines.push(kb.skills.skills.map((s) => s.name).join(" · "));
  }

  if (kb.projects.length > 0) {
    lines.push("");
    lines.push(`## ${lang === "fr" ? "Projets" : "Projects"}`);
    for (const p of kb.projects) {
      const url = p.frontmatter.url ? ` (${p.frontmatter.url})` : "";
      const year = p.frontmatter.year ? `, ${p.frontmatter.year}` : "";
      lines.push(`- **${p.frontmatter.name}**${url}${year}`);
    }
  }

  const repos = allRepos(kb);
  if (repos.length > 0) {
    lines.push("");
    lines.push(`## Open source`);
    for (const o of repos) {
      const url = o.url ? ` (${o.url})` : "";
      lines.push(`- **${o.name}**${url} — ${o.role}${o.description ? `: ${o.description}` : ""}`);
    }
  }

  return lines.join("\n");
}

function firstBulletList(body: string, max: number): string[] {
  const lines = body.split("\n");
  let inList = false;
  const out: string[] = [];
  for (const line of lines) {
    if (/^\s*[-*]\s+/.test(line)) {
      inList = true;
      out.push(line.replace(/^\s*[-*]\s+/, "").trim());
      if (out.length >= max) break;
    } else if (inList && line.trim() === "") {
      break;
    } else if (inList) {
      out[out.length - 1] += " " + line.trim();
    }
  }
  return out;
}
