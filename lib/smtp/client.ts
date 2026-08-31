import nodemailer from "nodemailer";
import { getSmtpSettings } from "@/lib/integration-settings";

export interface SmtpSendInput {
  html: string;
  idempotencyKey?: string;
  subject: string;
  text?: string;
  to: string | string[];
}

export interface SmtpSendResult {
  id: string;
  status: string;
}

export async function isSmtpConfigured() {
  return (await getSmtpSettings()) !== null;
}

export async function sendEmailViaSmtp(
  input: SmtpSendInput
): Promise<SmtpSendResult> {
  const smtp = await getSmtpSettings();
  if (!smtp) {
    // Extract the URL from the plain-text body (first http/https link found)
    const linkMatch = input.text?.match(/https?:\/\/\S+/);
    console.log("[email:dev] SMTP not configured — email NOT sent");
    console.log("[email:dev] to:", input.to);
    console.log("[email:dev] subject:", input.subject);
    if (linkMatch) {
      console.log("[email:dev] link:", linkMatch[0]);
    } else {
      console.log("[email:dev] body:", input.text);
    }
    return {
      id: `dev_${input.idempotencyKey ?? Date.now()}`,
      status: "logged",
    };
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
  });

  const info = await transporter.sendMail({
    from: smtp.from,
    to: Array.isArray(input.to) ? input.to.join(", ") : input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    headers: input.idempotencyKey
      ? { "X-Idempotency-Key": input.idempotencyKey }
      : undefined,
  });

  return {
    id: info.messageId ?? `smtp_${Date.now()}`,
    status: "sent",
  };
}
