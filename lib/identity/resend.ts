import { Resend } from "resend";
import { render } from "@react-email/render";
import { VerificationCodeEmail } from "@/emails/verification-code";

export type SendCodeInput = {
  to: string;
  code: string;
  recipientName?: string;
};

let cachedClient: Resend | null = null;

function getResend(): Resend {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  cachedClient = new Resend(apiKey);
  return cachedClient;
}

export async function sendVerificationCode(input: SendCodeInput): Promise<void> {
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const appName = process.env.APP_NAME ?? "Queryme";
  if (!fromEmail) throw new Error("RESEND_FROM_EMAIL is not set");

  const html = await render(
    VerificationCodeEmail({ appName, code: input.code, recipientName: input.recipientName }),
  );

  const { error } = await getResend().emails.send({
    from: fromEmail,
    to: input.to,
    subject: `${appName} verification code: ${input.code}`,
    html,
  });

  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }
}
