/**
 * Shared fixtures for KB component tests.
 *
 * KB_STRINGS — a complete KbStrings literal used as a stable stub.
 * makeKbContext — factory that returns a ReturnType<typeof useKb>-compatible
 *   object with a real, functional jump-listener channel. The internal
 *   listener Set is exposed as `_jumpListeners` so tests can assert on
 *   subscribe/unsubscribe without firing jumps.
 *
 * Usage:
 *   const ctx = makeKbContext();               // real functional channel
 *   const ctx = makeKbContext({ openTarget: { path: "x.md", anchor: null } });
 *   const ctx = makeKbContext({ jumpToMessage: vi.fn() }); // spy on calls
 */
import { vi } from "vitest";
import { useKb } from "@/components/kb/kb-context";
import type { KbStrings } from "@/lib/language";

// ---------------------------------------------------------------------------
// Strings stub
// ---------------------------------------------------------------------------

export const KB_STRINGS: KbStrings = {
  title: "knowledge base",
  unavailable: "The knowledge base is unavailable.",
  referenced: "Referenced in this conversation",
  allDocuments: "All documents",
  notInKb: "That document isn't in the knowledge base.",
  back: "files",
  loading: "Loading…",
  loadError: "Couldn't load this file.",
  github: "GitHub",
  expand: "expand",
  minimize: "minimize",
  close: "close",
  details: "File details",
  showDetails: "Show file details",
  hideDetails: "Hide file details",
  backToList: "Back to the file list",
  expandFocus: "Expand to focus mode",
  exitFocus: "Exit focus mode",
  showPanel: "Show the knowledge base panel",
  closePanel: "Close the knowledge base panel",
  resizePanel: "Resize the knowledge base panel",
  panelLabel: "Knowledge base",
  copy: "Copy",
  copied: "Copied",
  copyAria: "Copy document content",
  download: "Download",
  downloadAria: "Download document",
  print: "Print",
  printAria: "Print or save as PDF",
  share: "Share",
  shareAria: "Share a link to this CV",
  cv: "Curriculum Vitae",
  openCv: "Open CV",
  filterPlaceholder: "Filter…",
  clearFilter: "Clear filter",
  noMatches: "No documents match.",
  referencedLens: "Referenced",
  referencedLensAria: "Show only documents referenced in this conversation",
  outline: "Outline",
  outlineAria: "Jump to a section",
  citationJump: "Show citation {n} in chat",
  sections: {
    experience: "Experience",
    projects: "Projects",
    talks: "Talks",
    recommendations: "Recommendations",
    other: "Other",
  },
  expandGroup: "Expand",
  collapseGroup: "Collapse",
  meta: {
    company: "Company",
    role: "Role",
    period: "Period",
    location: "Location",
    year: "Year",
    link: "Link",
    stack: "Stack",
    tags: "Tags",
  },
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** KbContext value extended with the internal listener Set for assertions. */
export type KbFixture = ReturnType<typeof useKb> & {
  /** The live Set of jump listeners — size is 0 after all subscribers unmount. */
  _jumpListeners: Set<(messageId: string) => void>;
};

/**
 * Build a KbContext-compatible fixture with a real, functional jump-listener
 * channel. The `_jumpListeners` field exposes the internal Set so tests can
 * verify subscribe/unsubscribe without triggering a jump.
 *
 * Any field can be overridden; if `jumpToMessage` is overridden (e.g. to a
 * vi.fn() spy), it replaces the channel-aware implementation entirely — callers
 * that need both spying AND listener cleanup should compose manually.
 */
export function makeKbContext(overrides?: Partial<ReturnType<typeof useKb>>): KbFixture {
  const jumpListeners = new Set<(messageId: string) => void>();

  const base: ReturnType<typeof useKb> = {
    lang: "en",
    strings: KB_STRINGS,
    manifest: [],
    groups: [],
    citedRefs: [],
    setCitedRefs: vi.fn(),
    seenAutoReveal: { current: new Set() },
    openTarget: null,
    openFile: vi.fn(),
    closeFile: vi.fn(),
    jumpToMessage: (messageId: string) => {
      for (const listener of jumpListeners) listener(messageId);
    },
    onJumpToMessage: (listener: (messageId: string) => void) => {
      jumpListeners.add(listener);
      return () => {
        jumpListeners.delete(listener);
      };
    },
    apiBasePath: "/api",
    cvPrintBase: "",
    contentRepoUrl: null,
    contentRepoBranch: null,
    ...overrides,
  };

  return { ...base, _jumpListeners: jumpListeners };
}
