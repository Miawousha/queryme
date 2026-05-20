import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export type VerificationCodeEmailProps = {
  appName: string;
  code: string;
  recipientName?: string;
};

export function VerificationCodeEmail({ appName, code, recipientName }: VerificationCodeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{`${appName} verification code: ${code}`}</Preview>
      <Body style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif", background: "#fff", color: "#111" }}>
        <Container style={{ maxWidth: 480, margin: "40px auto", padding: 24 }}>
          <Heading style={{ fontSize: 18, marginBottom: 16 }}>
            {recipientName ? `Hi ${recipientName},` : "Hi,"}
          </Heading>
          <Text style={{ fontSize: 14, lineHeight: 1.6 }}>
            You requested access to sensitive details on {appName}. Enter the code below in the chat to continue:
          </Text>
          <Section
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
              fontSize: 32,
              letterSpacing: 8,
              padding: "16px 24px",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              textAlign: "center",
              margin: "16px 0",
            }}
          >
            {code}
          </Section>
          <Text style={{ fontSize: 12, color: "#6b7280" }}>
            This code expires in 10 minutes. If you didn't request it, you can ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default VerificationCodeEmail;
