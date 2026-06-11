import type { KbFile } from "@/lib/kb/manifest";
import type { KbFileType } from "@/lib/kb/file-type";
import type { CitedRef } from "@/lib/kb/cited-paths";
import type { KbGroup } from "@/lib/kb/meta-format";
import { humanizeSlug, metaSubtitle } from "@/lib/kb/meta-format";
import { anchorMatches } from "@/lib/kb/slug";

/** One row of the KB tree. Ids are deterministic:
 * `col:<name>`, `dir:<dir/path>`, `doc:<file path>`, `sec:<file path>#<slug>`. */
export type KbTreeNode = {
  id: string;
  kind: "collection" | "folder" | "doc" | "section";
  label: string;
  /** Doc path (doc and section nodes). */
  path?: string;
  /** Resolved section slug (section nodes). */
  anchor?: string;
  fileType?: KbFileType;
  subtitle?: string | null;
  /** Citation indices pinned to this exact node. */
  chips: number[];
  /** True when a descendant carries chips — visible while collapsed. */
  dot: boolean;
  /** Docs under this container (collection/folder nodes). */
  count?: number;
  children: KbTreeNode[];
};

export type KbResolvedGroup = { name: string; label: string };

/** Fallback when the config carries no groups: the resume preset. */
const DEFAULT_GROUP_NAMES = ["experience", "projects", "talks", "recommendations"];

/** Resolves config groups to display labels for a locale, appending the
 * reserved `other` catch-all. `sectionLabels` is the localized
 * `strings.sections` map used as a label fallback. */
export function resolveGroups(
  configGroups: KbGroup[],
  lang: "en" | "fr",
  sectionLabels: Record<string, string | undefined>,
  otherLabel: string,
): KbResolvedGroup[] {
  const base: KbGroup[] =
    configGroups.length > 0 ? configGroups : DEFAULT_GROUP_NAMES.map((name) => ({ name }));
  const resolved = base.map((g) => ({
    name: g.name,
    label:
      (lang === "fr" ? g.label?.fr : undefined) ??
      g.label?.en ??
      sectionLabels[g.name] ??
      humanizeSlug(g.name),
  }));
  if (!resolved.some((g) => g.name === "other")) {
    resolved.push({ name: "other", label: otherLabel });
  }
  return resolved;
}

/** Deterministic ancestor chain (collection, folders…, doc) for a file path. */
export function ancestorIdsFor(path: string, groupNames: ReadonlySet<string>): string[] {
  const segs = path.split("/");
  const dirs = segs.slice(0, -1);
  const known = dirs.length > 0 && groupNames.has(dirs[0]);
  const ids: string[] = [`col:${known ? dirs[0] : "other"}`];
  for (let i = known ? 1 : 0; i < dirs.length; i++) {
    ids.push(`dir:${dirs.slice(0, i + 1).join("/")}`);
  }
  ids.push(`doc:${path}`);
  return ids;
}

/** Breadcrumb labels for the viewer header: collection label + intermediate dirs. */
export function breadcrumbFor(
  path: string,
  groups: KbResolvedGroup[],
  otherLabel: string,
): string[] {
  const dirs = path.split("/").slice(0, -1);
  const group =
    dirs.length > 0 ? groups.find((g) => g.name === dirs[0] && g.name !== "other") : undefined;
  if (!group) return [otherLabel, ...dirs];
  return [group.label, ...dirs.slice(1)];
}

export type BuildKbTreeInput = {
  /** Real files only — virtual (pinned) entries render outside the tree. */
  files: KbFile[];
  /** Resolved groups in display order, catch-all included. */
  groups: KbResolvedGroup[];
  citedRefs: CitedRef[];
  /** Case-insensitive substring filter; empty = off. */
  filter: string;
  /** When true, prune to branches that carry citations. */
  lens: boolean;
};

/** Derives the full KB tree: grouping, nesting, citation chips, ancestor
 * dots, then filter/lens pruning. Pure — memoize on inputs at the call site. */
export function buildKbTree(input: BuildKbTreeInput): KbTreeNode[] {
  const { files, groups, citedRefs, filter, lens } = input;
  const groupNames = new Set(groups.filter((g) => g.name !== "other").map((g) => g.name));

  // 1. Citation chips per node id. Anchored refs land on the section whose
  //    slug matches loosely; everything else lands on the doc.
  const chipsByNode = new Map<string, number[]>();
  for (const r of citedRefs) {
    const file = files.find((f) => f.path === r.path);
    if (!file) continue;
    const section = r.anchor
      ? file.sections?.find((s) => anchorMatches(r.anchor!, s.slug))
      : undefined;
    const id = section ? `sec:${file.path}#${section.slug}` : `doc:${file.path}`;
    chipsByNode.set(id, [...(chipsByNode.get(id) ?? []), r.index]);
  }

  // 2. Assemble the unpruned tree.
  const roots: KbTreeNode[] = groups.map((g) => ({
    id: `col:${g.name}`,
    kind: "collection",
    label: g.label,
    chips: [],
    dot: false,
    children: [],
  }));
  const byId = new Map(roots.map((n) => [n.id, n] as const));

  for (const file of files) {
    const ids = ancestorIdsFor(file.path, groupNames);
    let parent = byId.get(ids[0]);
    if (!parent) continue;
    for (const id of ids.slice(1, -1)) {
      let node = byId.get(id);
      if (!node) {
        const dirPath = id.slice("dir:".length);
        node = {
          id,
          kind: "folder",
          label: dirPath.split("/").pop()!,
          chips: [],
          dot: false,
          children: [],
        };
        byId.set(id, node);
        parent.children.push(node);
      }
      parent = node;
    }
    const docId = `doc:${file.path}`;
    parent.children.push({
      id: docId,
      kind: "doc",
      label: file.title,
      path: file.path,
      fileType: file.type,
      subtitle: metaSubtitle(file.meta),
      chips: chipsByNode.get(docId) ?? [],
      dot: false,
      children: (file.sections ?? []).map((s) => {
        const secId = `sec:${file.path}#${s.slug}`;
        return {
          id: secId,
          kind: "section" as const,
          label: s.title,
          path: file.path,
          anchor: s.slug,
          chips: chipsByNode.get(secId) ?? [],
          dot: false,
          children: [],
        };
      }),
    });
  }

  // 3. Ancestor dots (post-order): dot = a DESCENDANT carries chips.
  function markDots(node: KbTreeNode): boolean {
    let descendants = false;
    for (const c of node.children) descendants = markDots(c) || descendants;
    node.dot = descendants;
    return descendants || node.chips.length > 0;
  }
  for (const r of roots) markDots(r);

  // 4. Prune: filter (label/meta match keeps node + subtree-anchor) AND lens
  //    (only cited branches). Containers vanish when emptied; counts are
  //    recalculated to reflect surviving doc descendants only.
  const needle = filter.trim().toLowerCase();
  const fileByPath = new Map(files.map((f) => [f.path, f] as const));

  function matches(node: KbTreeNode): boolean {
    if (node.label.toLowerCase().includes(needle)) return true;
    if (node.kind === "doc") {
      if (node.subtitle?.toLowerCase().includes(needle)) return true;
      const meta = fileByPath.get(node.path!)?.meta;
      const hay = [meta?.company, meta?.role, ...(meta?.tags ?? []), ...(meta?.stack ?? [])];
      return hay.some((h) => h?.toLowerCase().includes(needle));
    }
    return false;
  }

  function prune(node: KbTreeNode, ancestorMatched: boolean): KbTreeNode | null {
    const self = needle === "" ? true : ancestorMatched || matches(node);
    const childAnchor = needle === "" ? false : ancestorMatched || matches(node);
    const children = node.children
      .map((c) => prune(c, childAnchor))
      .filter((c): c is KbTreeNode => c !== null);
    const lensOk = !lens || node.chips.length > 0 || node.dot;
    if (node.kind === "collection" || node.kind === "folder") {
      const count = children.reduce(
        (s, c) => s + (c.kind === "doc" ? 1 : (c.count ?? 0)),
        0,
      );
      return children.length > 0 ? { ...node, children, count } : null;
    }
    if (node.kind === "doc") {
      return (self && lensOk) || children.length > 0 ? { ...node, children } : null;
    }
    return self && lensOk ? { ...node, children: [] } : null;
  }

  return roots
    .map((r) => prune(r, false))
    .filter((r): r is KbTreeNode => r !== null);
}
