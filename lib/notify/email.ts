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
