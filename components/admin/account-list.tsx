import Link from "next/link";
import type { AccountSummary } from "@/lib/accounts/repo";

const TH = "py-2 pr-4 text-left font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]";
const TD = "py-2 pr-4 text-[13px] text-[var(--color-text-secondary)]";

export function AccountList({ accounts }: { accounts: AccountSummary[] }) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b border-[var(--color-border)]">
          <th className={TH}>Username</th>
          <th className={TH}>GitHub id</th>
          <th className={TH}>Role</th>
          <th className={TH}>Repo</th>
          <th className={TH}>Convos</th>
          <th className={TH}>Created</th>
        </tr>
      </thead>
      <tbody>
        {accounts.map((a) => (
          <tr key={a.id} className="border-b border-[var(--color-border)]/40">
            <td className={TD}>
              <Link href={`/${a.username}/admin`} className="text-[var(--color-primary)] hover:underline">
                {a.username}
              </Link>
            </td>
            <td className={TD}>{a.githubId ?? "—"}</td>
            <td className={TD}>{a.role}</td>
            <td className={TD}>{a.repoLinked ? "linked" : "—"}</td>
            <td className={TD}>{a.conversationCount}</td>
            <td className={TD}>{new Date(a.createdAt).toLocaleDateString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
