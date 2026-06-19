/** The artifact formats the KB viewer can render. */
export type KbFileType = "md" | "yaml" | "html" | "pdf";

/** The app's shipped content locales — mirrors the sidecar set in `isLocaleSidecar`. */
export type KbLocale = "en" | "fr";

/** Narrows a raw `lang` query param to a `KbLocale`, defaulting to `en`. */
export function parseKbLocale(v: string | null): KbLocale {
  return v === "fr" ? "fr" : "en";
}

/** True for localized sidecar files like `foo.fr.md` / `foo.fr.yaml`. The
 * locale set is fixed to the app's shipped locales — a two-letter suffix like
 * `web.ui.md` is content, not a sidecar. */
export function isLocaleSidecar(relPath: string): boolean {
  return /\.(en|fr)\.(md|yaml)$/.test(relPath);
}

/**
 * Maps a file path to its `KbFileType`, or `null` if the extension is not a
 * supported artifact type.
 */
export function fileTypeFromPath(path: string): KbFileType | null {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  if (ext === "md") return "md";
  if (ext === "yaml" || ext === "yml") return "yaml";
  if (ext === "html" || ext === "htm") return "html";
  if (ext === "pdf") return "pdf";
  return null;
}
