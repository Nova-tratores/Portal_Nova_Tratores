import { NextResponse } from "next/server";
import { ImapFlow } from "imapflow";

interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  part: string;
}

interface EmailRevisao {
  subject: string;
  date: string;
  uid: number;
  horas: string | null;
  modelo: string | null;
  chassisFinal: string | null;
  attachments: EmailAttachment[];
  body: string;
}

function parseSubject(subject: string): {
  horas: string | null;
  modelo: string | null;
  chassisFinal: string | null;
} {
  const regex = /(\d+)\s*HORAS?\s*-\s*(.+?)\s+(\S+)\s*$/i;
  const match = subject.match(regex);

  if (match) {
    return {
      horas: match[1],
      modelo: match[2].trim(),
      chassisFinal: match[3].trim(),
    };
  }

  return { horas: null, modelo: null, chassisFinal: null };
}

function findTextPart(node: any): string | null {
  if (!node || typeof node !== "object") return null;

  if (node.childNodes && Array.isArray(node.childNodes)) {
    for (const child of node.childNodes) {
      const found = findTextPart(child);
      if (found) return found;
    }
    return null;
  }

  const type = (node.type || "").toLowerCase();
  const subtype = (node.subtype || "").toLowerCase();

  if (type === "text" && subtype === "plain") {
    return node.part || "1";
  }
  if (type === "text" && subtype === "html") {
    return node.part || "1";
  }

  return null;
}

function extractAttachmentsFromStructure(node: any): EmailAttachment[] {
  const attachments: EmailAttachment[] = [];

  function walk(part: any) {
    if (!part || typeof part !== "object") return;

    if (part.childNodes && Array.isArray(part.childNodes)) {
      for (const child of part.childNodes) {
        walk(child);
      }
      return;
    }

    const disposition = (part.disposition || "").toLowerCase();
    const filename =
      part.dispositionParameters?.filename ||
      part.parameters?.name ||
      "";

    if (
      disposition === "attachment" ||
      (filename && part.type !== "text")
    ) {
      attachments.push({
        filename: filename || "sem-nome",
        contentType: `${part.type || "application"}/${part.subtype || "octet-stream"}`,
        size: part.size || 0,
        part: part.part || "",
      });
    }
  }

  walk(node);
  return attachments;
}

export async function GET() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    return NextResponse.json(
      { error: "Credenciais do Gmail não configuradas." },
      { status: 500 }
    );
  }

  try {
    const client = new ImapFlow({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: { user, pass },
      logger: false,
    });

    await client.connect();

    const lock = await client.getMailboxLock("[Gmail]/E-mails enviados");
    const emails: EmailRevisao[] = [];

    try {
      const messages = client.fetch("1:*", {
        envelope: true,
        bodyStructure: true,
        uid: true,
      });

      const textParts: Map<number, string> = new Map();

      for await (const msg of messages) {
        const subject = msg.envelope?.subject || "";

        if (/cheque de revis/i.test(subject)) {
          const parsed = parseSubject(subject);
          const attachments = msg.bodyStructure
            ? extractAttachmentsFromStructure(msg.bodyStructure)
            : [];

          const textPart = msg.bodyStructure
            ? findTextPart(msg.bodyStructure)
            : null;
          if (textPart) {
            textParts.set(msg.uid, textPart);
          }

          emails.push({
            subject,
            date: msg.envelope?.date?.toISOString() || "",
            uid: msg.uid,
            attachments,
            body: "",
            ...parsed,
          });
        }
      }

      for (const email of emails) {
        const partNumber = textParts.get(email.uid);
        if (!partNumber) continue;

        try {
          const { content } = await client.download(
            String(email.uid),
            partNumber,
            { uid: true }
          );

          if (content) {
            const chunks: Buffer[] = [];
            for await (const chunk of content) {
              chunks.push(Buffer.from(chunk));
              const totalSize = chunks.reduce((s, c) => s + c.length, 0);
              if (totalSize > 2000) break;
            }
            const fullText = Buffer.concat(chunks).toString("utf-8");
            email.body = fullText.substring(0, 2000);
          }
        } catch (err) {
          console.error(`Erro ao baixar corpo do email UID ${email.uid}:`, err);
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();

    return NextResponse.json({
      total: emails.length,
      emails,
    });
  } catch (error: any) {
    console.error("Erro IMAP:", error);

    let message = "Falha ao conectar ao Gmail.";
    if (error.authenticationFailed) {
      message = "Autenticação falhou. Verifique email e senha de app.";
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
