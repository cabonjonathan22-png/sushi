import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";

/**
 * Envoi d'e-mails transactionnels :
 *  - Resend (RESEND_API_KEY) ;
 *  - sinon SMTP (SMTP_URL, ex. smtps://user:pass@smtp.example.com:465) ;
 *  - sinon (développement) : écrit le message dans storage/mails/ et l'affiche dans la console.
 */

export interface Mail {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

const from = () => process.env.MAIL_FROM ?? "Yaoma Sushi <commandes@yaoma-sushi.com>";

export async function sendMail(mail: Mail): Promise<void> {
  const to = (Array.isArray(mail.to) ? mail.to : [mail.to]).filter(Boolean);
  if (!to.length) return;

  if (process.env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: from(), to, subject: mail.subject, html: mail.html, text: mail.text, reply_to: mail.replyTo }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status} : ${await res.text()}`);
    return;
  }

  if (process.env.SMTP_URL) {
    const transport = nodemailer.createTransport(process.env.SMTP_URL);
    await transport.sendMail({ from: from(), to, subject: mail.subject, html: mail.html, text: mail.text, replyTo: mail.replyTo });
    return;
  }

  const dir = path.resolve(process.env.STORAGE_DIR ?? "storage", "mails");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 7)}.html`);
  await writeFile(file, `<!-- À : ${to.join(", ")} | Objet : ${mail.subject} -->\n${mail.html}`);
  console.log(`[mail:dev] « ${mail.subject} » → ${to.join(", ")} (${file})`);
}
