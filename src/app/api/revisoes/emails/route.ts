import { NextResponse } from "next/server";
import { ImapFlow } from "imapflow";

// Cache em memória para evitar refetch IMAP a cada request
let emailCache: { emails: EmailRevisao[]; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

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
  // Limpar prefixos (Fwd:, Re:) e espaços
  const clean = subject.replace(/^(Fwd?:|Re:)\s*/gi, "").trim();

  // Extrair horas — pegar o PRIMEIRO número após "revisão" / "revisao"
  const horasMatch = clean.match(/revis[aã]o\s+(?:de\s+)?(?:[-–]\s*)?(\d+)\s*(?:hrs?|horas?)?/i);
  const horas = horasMatch ? horasMatch[1] : null;

  // Extrair chassis final — último número com 3+ dígitos no subject
  let chassisFinal: string | null = null;
  const chassisPatterns = [
    /CHASSI\s+(?:MDI\w+)?(\d{3,})/i,       // "CHASSI 00610" ou "CHASSI MDI...02454"
    /FINAL\s+(?:CHASSI\s+)?(\d{3,})/i,       // "FINAL 0443" ou "FINAL CHASSI 001419"
    /[-,\/]\s*(\d{3,})\s*[.\-]?\s*$/,         // "- 01135" ou "/ 1712" no final
    /[-,]\s*(\d{3,})\s*$/,                     // ", 02409" no final
    /\s(\d{4,})\s*[.\-]?\s*$/,                // número longo no final
  ];
  for (const pat of chassisPatterns) {
    const m = clean.match(pat);
    if (m) { chassisFinal = m[1].replace(/^0+/, "0"); break; }
  }
  // Fallback: último grupo de 3+ dígitos no subject
  if (!chassisFinal) {
    const allNums = [...clean.matchAll(/(\d{3,})/g)];
    // Ignorar o número de horas
    const candidates = allNums.filter(m => m[1] !== horas);
    if (candidates.length > 0) {
      chassisFinal = candidates[candidates.length - 1][1];
    }
  }

  // Extrair modelo — texto entre horas e chassis
  let modelo: string | null = null;
  if (horas) {
    // Cortar tudo até depois do número de horas + sufixo (hrs/horas/h)
    const afterHoras = clean.replace(
      /^.*?revis[aã]o\s+(?:de\s+)?(?:[-–]\s*)?\d+\s*(?:hrs?|horas?)?\s*[-,]?\s*/i,
      ""
    );
    if (afterHoras) {
      let m = afterHoras
        .replace(/\bTRATOR\b/gi, "")
        .replace(/\bMAHINDRA\b/gi, "")
        .replace(/\bCHASSI\b/gi, "")
        .replace(/\bFINAL\b/gi, "")
        .replace(/[-,\/]\s*\d{3,}\s*[.\-]?\s*$/, "")
        .replace(/\s+\d{3,}\s*$/, "")
        .replace(/\bMDI\w+/gi, "")
        .trim()
        .replace(/^[-,\/\s]+|[-,\/\s]+$/g, "")
        .trim();
      if (m && m.length > 1) modelo = m;
    }
  }

  return { horas, modelo, chassisFinal };
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("refresh") === "1";

  // Retornar cache se ainda válido (a menos que refresh forçado)
  if (!forceRefresh && emailCache && Date.now() - emailCache.timestamp < CACHE_TTL) {
    return NextResponse.json({
      total: emailCache.emails.length,
      emails: emailCache.emails,
      cached: true,
    });
  }

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

    // Tentar pasta de enviados — nome varia por idioma da conta
    let lock;
    const pastasEnviados = [
      "[Gmail]/Sent Mail",
      "[Gmail]/E-mails enviados",
      "[Gmail]/Enviados",
      "INBOX.Sent",
      "Sent",
    ];

    let pastaUsada = "";
    for (const pasta of pastasEnviados) {
      try {
        lock = await client.getMailboxLock(pasta);
        pastaUsada = pasta;
        break;
      } catch {
        // tenta a próxima
      }
    }

    if (!lock) {
      // Listar pastas disponíveis para debug
      const list = await client.list();
      const nomes = list.map((l: any) => l.path).join(", ");
      await client.logout();
      return NextResponse.json(
        { error: `Nenhuma pasta de enviados encontrada. Pastas disponíveis: ${nomes}` },
        { status: 500 }
      );
    }

    console.log(`[revisoes/emails] Usando pasta: ${pastaUsada}`);
    const emails: EmailRevisao[] = [];

    try {
      // Tentar SEARCH primeiro; se retornar vazio, fazer fetch de todos e filtrar
      let uids: number[] = [];
      try {
        const searchResult = await client.search(
          { subject: "cheque de revis" },
          { uid: true }
        );
        if (searchResult && Array.isArray(searchResult)) {
          uids = searchResult;
        }
      } catch {
        console.log("[revisoes/emails] SEARCH falhou, fazendo fetch completo");
      }

      const textParts: Map<number, string> = new Map();

      if (uids.length > 0) {
        // SEARCH encontrou resultados — buscar só esses
        const uidRange = uids.join(",");
        const messages = client.fetch(uidRange, {
          envelope: true,
          bodyStructure: true,
          uid: true,
        });

        for await (const msg of messages) {
          const subject = msg.envelope?.subject || "";
          const parsed = parseSubject(subject);
          const attachments = msg.bodyStructure
            ? extractAttachmentsFromStructure(msg.bodyStructure)
            : [];
          const textPart = msg.bodyStructure ? findTextPart(msg.bodyStructure) : null;
          if (textPart) textParts.set(msg.uid, textPart);

          emails.push({
            subject,
            date: msg.envelope?.date?.toISOString() || "",
            uid: msg.uid,
            attachments,
            body: "",
            ...parsed,
          });
        }
      } else {
        // SEARCH vazio — fallback: buscar todos e filtrar por subject
        console.log("[revisoes/emails] SEARCH retornou 0, fazendo fetch completo com filtro client-side");
        const messages = client.fetch("1:*", {
          envelope: true,
          bodyStructure: true,
          uid: true,
        });

        for await (const msg of messages) {
          const subject = msg.envelope?.subject || "";
          if (!/cheque de revis/i.test(subject)) continue;

          const parsed = parseSubject(subject);
          const attachments = msg.bodyStructure
            ? extractAttachmentsFromStructure(msg.bodyStructure)
            : [];
          const textPart = msg.bodyStructure ? findTextPart(msg.bodyStructure) : null;
          if (textPart) textParts.set(msg.uid, textPart);

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

      // Baixar corpo dos emails (limitado a 2KB cada)
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

    // Salvar no cache
    emailCache = { emails, timestamp: Date.now() };

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
