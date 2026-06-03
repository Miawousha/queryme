import type { Route } from "next";
import { redirect } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function SettingsIndexPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  // Cast for `typedRoutes`: the destination is built from a dynamic segment,
  // so it can't be statically verified against the generated route union.
  redirect(`/${username}/admin/settings/content` as Route);
}
