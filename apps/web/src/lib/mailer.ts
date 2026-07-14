/**
 * Email delivery: SMTP (dev → Mailpit) or Microsoft Graph sendMail (prod).
 * Selected via MAIL_TRANSPORT=smtp|graph.
 */
import nodemailer from "nodemailer";
import { graphFetch } from "./graph/app-client";

export interface Mail {
  to: string;
  subject: string;
  html: string;
}

export async function sendMail(mail: Mail): Promise<void> {
  const transport = process.env.MAIL_TRANSPORT ?? "smtp";
  if (transport === "graph") {
    const sender = process.env.GRAPH_SENDER_UPN;
    if (!sender) throw new Error("GRAPH_SENDER_UPN not configured");
    const res = await graphFetch(`/users/${encodeURIComponent(sender)}/sendMail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: mail.subject,
          body: { contentType: "HTML", content: mail.html },
          toRecipients: [{ emailAddress: { address: mail.to } }],
        },
        saveToSentItems: false,
      }),
    });
    if (!res.ok) throw new Error(`Graph sendMail failed: ${res.status} ${await res.text()}`);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "localhost",
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: false,
  });
  await transporter.sendMail({
    from: process.env.GRAPH_SENDER_UPN || "intranet@aitim.local",
    to: mail.to,
    subject: mail.subject,
    html: mail.html,
  });
}
