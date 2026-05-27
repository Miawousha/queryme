/** The artifact formats the KB viewer can render. `cv` is reserved for the
 * synthesized printable CV document — not a real file on disk. */
export type KbFileType = "md" | "yaml" | "html" | "pdf" | "cv";

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
