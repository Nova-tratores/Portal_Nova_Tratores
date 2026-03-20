import { NextRequest, NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

const CACHE_DIR = path.join(os.tmpdir(), "revisao-attachment-cache");

async function ensureCacheDir() {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch {}
}

function getCacheKey(uid: string, part: string) {
  return `${uid}-${part.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const uid = searchParams.get("uid");
  const part = searchParams.get("part");
  const filename = searchParams.get("filename") || "anexo";
  let contentType = searchParams.get("type") || "application/octet-stream";
  // Corrigir content-types malformados do IMAP (ex: "application/pdf/octet-stream")
  if (contentType.split("/").length > 2) {
    contentType = contentType.split("/").slice(0, 2).join("/");
  }
  // Garantir PDF correto pela extensão do arquivo
  const fname = searchParams.get("filename") || "";
  if (fname.toLowerCase().endsWith(".pdf")) {
    contentType = "application/pdf";
  }

  if (!uid || !part) {
    return NextResponse.json(
      { error: "Parâmetros uid e part são obrigatórios." },
      { status: 400 }
    );
  }

  await ensureCacheDir();
  const cachePath = path.join(CACHE_DIR, getCacheKey(uid, part));

  try {
    const cached = await fs.readFile(cachePath);
    const headers = new Headers();
    headers.set("Content-Type", contentType);
    headers.set("Content-Length", cached.length.toString());

    headers.set("Cache-Control", "private, max-age=86400, immutable");
    return new Response(cached, { status: 200, headers });
  } catch {
    // Não está no cache, baixar do Gmail
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

    const pastasEnviados = [
      "[Gmail]/Sent Mail",
      "[Gmail]/E-mails enviados",
      "[Gmail]/Enviados",
      "INBOX.Sent",
      "Sent",
    ];
    let lock;
    for (const pasta of pastasEnviados) {
      try {
        lock = await client.getMailboxLock(pasta);
        break;
      } catch {}
    }
    if (!lock) {
      await client.logout();
      return NextResponse.json({ error: "Pasta de enviados não encontrada." }, { status: 500 });
    }

    try {
      const { content } = await client.download(uid, part, { uid: true });

      const chunks: Buffer[] = [];
      for await (const chunk of content) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);

      lock.release();
      await client.logout();

      try {
        await fs.writeFile(cachePath, buffer);
      } catch {}

      const headers = new Headers();
      headers.set("Content-Type", contentType);
      headers.set("Content-Length", buffer.length.toString());
  
      headers.set("Cache-Control", "private, max-age=86400, immutable");

      return new Response(buffer, { status: 200, headers });
    } catch (err) {
      try { lock.release(); } catch {}
      try { await client.logout(); } catch {}
      throw err;
    }
  } catch (error: any) {
    console.error("Erro ao baixar anexo:", error);
    return NextResponse.json(
      { error: "Falha ao baixar anexo." },
      { status: 500 }
    );
  }
}
