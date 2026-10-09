import { NextRequest, NextResponse } from "next/server";

// Repassa o PDF de um documento externo (DANFE no storage, nota no CDN da Omie,
// boleto) pela MESMA origem do portal, para o visualizador poder mostrar,
// imprimir e baixar sem abrir outra guia (iframe de outra origem não deixa
// imprimir, e o CDN da Omie não libera CORS).
//
// Segurança: só hosts conhecidos (em cada salto de redirecionamento) e só PDF —
// HTML de fora nunca é servido pela origem do portal.
export const dynamic = "force-dynamic";

const LIMITE_BYTES = 25 * 1024 * 1024;
const MAX_SALTOS = 4;

function hostsPermitidos(): string[] {
  const hosts = [
    "cdn.omie.com.br", "app.omie.com.br", "connect.omie.com.br",
    // o link da NFS-e (connect.omie) redireciona pro PDF neste bucket da Omie
    "prod-blue-bill-stalker.s3.amazonaws.com",
  ];
  try {
    const sb = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (sb) hosts.push(new URL(sb).host);
  } catch { /* env inválida: segue só com a Omie */ }
  return hosts;
}

function permitido(u: URL): boolean {
  return u.protocol === "https:" && hostsPermitidos().includes(u.host);
}

function nomeSeguro(nome: string | null): string {
  const n = (nome || "documento").replace(/[^\w.\- ]+/g, "_").slice(0, 80).trim() || "documento";
  return n.toLowerCase().endsWith(".pdf") ? n : `${n}.pdf`;
}

export async function GET(req: NextRequest) {
  const bruto = req.nextUrl.searchParams.get("url") || "";
  let alvo: URL;
  try { alvo = new URL(bruto); } catch {
    return NextResponse.json({ error: "URL inválida" }, { status: 400 });
  }
  if (alvo.host.endsWith("nfse.gov.br")) {
    return NextResponse.json({ error: "Esta é a NFS-e nacional: o site do governo pede captcha (ou login no Emissor Nacional) e não deixa mostrar a nota aqui. Abra em outra guia ou anexe o PDF da nota na OS.", abrirFora: true }, { status: 415 });
  }
  if (!permitido(alvo)) {
    return NextResponse.json({ error: "Este endereço não está liberado para visualização no portal." }, { status: 403 });
  }

  try {
    let resp: Response | null = null;
    for (let i = 0; i <= MAX_SALTOS; i++) {
      resp = await fetch(alvo, { redirect: "manual", cache: "no-store" });
      const loc = resp.headers.get("location");
      if (resp.status >= 300 && resp.status < 400 && loc) {
        alvo = new URL(loc, alvo);
        if (!permitido(alvo)) {
          return NextResponse.json({ error: "Este documento fica no site da prefeitura / Omie e só abre em outra guia.", abrirFora: true }, { status: 415 });
        }
        continue;
      }
      break;
    }
    if (!resp || !resp.ok) {
      return NextResponse.json({ error: `Documento indisponível (${resp?.status ?? "sem resposta"})` }, { status: 502 });
    }
    const tamanho = Number(resp.headers.get("content-length") || 0);
    if (tamanho > LIMITE_BYTES) {
      return NextResponse.json({ error: "Arquivo grande demais", abrirFora: true }, { status: 413 });
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length > LIMITE_BYTES) {
      return NextResponse.json({ error: "Arquivo grande demais", abrirFora: true }, { status: 413 });
    }
    // só PDF de verdade (a assinatura do arquivo, não o content-type que o host diz)
    if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") {
      return NextResponse.json({ error: "Não é um PDF", abrirFora: true }, { status: 415 });
    }
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${nomeSeguro(req.nextUrl.searchParams.get("nome"))}"`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
