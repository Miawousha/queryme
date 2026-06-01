import { redirect } from "next/navigation";

export const runtime = "nodejs";

export default async function AdminPage() {
  const username = process.env.ROOT_ACCOUNT_USERNAME;
  redirect(username ? `/${username}/admin` : "/api/auth/github/login");
}
