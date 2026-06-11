export type EmailMessage = {
  to: string;
  from: string;
  subject: string;
  text: string;
};

export type EmailTransport = {
  send(msg: EmailMessage): Promise<{ id: string }>;
};

export type ForwardNotification = {
  to: string;
  from: string;
  question: string;
  contact: string | null;
  conversationId: string | null;
};

export async function sendForwardNotification(
  transport: EmailTransport,
  input: ForwardNotification,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const lines = [
    `A visitor forwarded a question through queritae.`,
    ``,
    `Question:`,
    input.question,
  ];
  if (input.contact) {
    lines.push(``, `Contact: ${input.contact}`);
  }
  if (input.conversationId) {
    lines.push(``, `Conversation: ${input.conversationId}`);
  }
  const subject = `[queritae] forwarded question`;
  try {
    const r = await transport.send({
      to: input.to,
      from: input.from,
      subject,
      text: lines.join("\n"),
    });
    return { ok: true, id: r.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type UsageAlert = {
  to: string;
  from: string;
  /** UTC calendar day ("YYYY-MM-DD") the alert covers. */
  day: string;
  totals: { messages: number; tokens: number };
  topAccounts: { username: string; messages: number; tokens: number }[];
};

export async function sendUsageAlert(
  transport: EmailTransport,
  input: UsageAlert,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const lines = [
    `Platform usage for ${input.day} (UTC) crossed the daily alert threshold.`,
    ``,
    `Totals: ${input.totals.messages} messages, ${input.totals.tokens} tokens`,
  ];
  if (input.topAccounts.length > 0) {
    lines.push(``, `Top accounts:`);
    for (const a of input.topAccounts) {
      lines.push(`- ${a.username}: ${a.messages} messages, ${a.tokens} tokens`);
    }
  }
  const subject = `[queritae] daily usage alert — ${input.day}`;
  try {
    const r = await transport.send({
      to: input.to,
      from: input.from,
      subject,
      text: lines.join("\n"),
    });
    return { ok: true, id: r.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type UpgradeNudge = {
  to: string;
  from: string;
  username: string;
  freeAllowance: number;
  billingUrl: string;
};

export async function sendUpgradeNudge(
  transport: EmailTransport,
  input: UpgradeNudge,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const lines = [
    `Your queritae persona has answered all ${input.freeAllowance} of this month's free questions — and a visitor just asked another one.`,
    ``,
    `Until you upgrade, new visitors are offered the forward-a-question flow instead of live answers (you'll still receive their questions by email).`,
    ``,
    `Upgrade to Pro to keep the conversation going:`,
    input.billingUrl,
  ];
  const subject = `[queritae] your free questions for this month are used up`;
  try {
    const r = await transport.send({
      to: input.to,
      from: input.from,
      subject,
      text: lines.join("\n"),
    });
    return { ok: true, id: r.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Resend transport. Reads `RESEND_API_KEY` lazily so unit tests can swap a
 * fake transport without setting env. Throws at first use if the key is
 * missing — callers in non-test paths should ensure it is set.
 */
export function resendTransport(): EmailTransport {
  return {
    async send(msg) {
      const key = process.env.RESEND_API_KEY;
      if (!key) throw new Error("RESEND_API_KEY is not set");
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: msg.from,
          to: msg.to,
          subject: msg.subject,
          text: msg.text,
        }),
      });
      if (!r.ok) {
        const body = await r.text();
        throw new Error(`Resend ${r.status}: ${body}`);
      }
      const j = (await r.json()) as { id: string };
      return { id: j.id };
    },
  };
}
