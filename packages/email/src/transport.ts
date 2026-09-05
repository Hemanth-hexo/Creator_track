import nodemailer, { type Transporter } from "nodemailer";
import { ProviderError, loadEnv } from "@photography-outreach/shared";

let cachedTransport: Transporter | undefined;

export function getTransport(): Transporter {
  if (cachedTransport) return cachedTransport;
  const env = loadEnv();
  if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) {
    throw new Error("GMAIL_USER and GMAIL_APP_PASSWORD are required to send email (see .env.example)");
  }

  cachedTransport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD },
  });
  return cachedTransport;
}

export function setTransportForTesting(transport: Transporter | undefined): void {
  cachedTransport = transport;
}

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
}

export interface SendMailResult {
  messageId: string;
}

export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  const env = loadEnv();
  const transport = getTransport();
  try {
    const info = await transport.sendMail({
      from: env.EMAIL_FROM_ADDRESS
        ? `"${env.EMAIL_FROM_NAME}" <${env.EMAIL_FROM_ADDRESS}>`
        : env.GMAIL_USER,
      to: input.to,
      subject: input.subject,
      text: input.text,
    });
    return { messageId: info.messageId };
  } catch (error) {
    throw new ProviderError("smtp", "Failed to send email", {
      cause: error instanceof Error ? error.message : error,
    });
  }
}
