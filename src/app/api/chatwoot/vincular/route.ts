import { NextRequest, NextResponse } from "next/server";

// Salva o cliente do portal escolhido nos atributos personalizados do contato
// do Chatwoot. O token do Chatwoot fica SOMENTE aqui no servidor (env), nunca
// exposto no navegador.
const CHATWOOT_URL = process.env.CHATWOOT_URL || "";
const ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID || "";
const TOKEN = process.env.CHATWOOT_API_TOKEN || "";
const APP_SECRET = process.env.CHATWOOT_APP_SECRET || "";

type Cliente = {
  cod_cli?: number | string;
  empresa?: number | string;
  razao_social?: string;
  nome_fantasia?: string;
  cnpj_cpf?: string;
  cidade?: string;
  estado?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      contactId,
      cliente,
      secret,
      accountId,
    }: {
      contactId?: number | string;
      cliente?: Cliente;
      secret?: string;
      accountId?: number | string;
    } = body || {};

    if (!APP_SECRET || secret !== APP_SECRET) {
      return NextResponse.json({ error: "não autorizado" }, { status: 401 });
    }
    if (!contactId || !cliente) {
      return NextResponse.json(
        { error: "contactId e cliente são obrigatórios" },
        { status: 400 }
      );
    }
    if (!CHATWOOT_URL || !TOKEN) {
      return NextResponse.json(
        { error: "integração não configurada (CHATWOOT_URL/TOKEN)" },
        { status: 500 }
      );
    }

    const acc = accountId || ACCOUNT_ID;
    const base = `${CHATWOOT_URL.replace(/\/$/, "")}/api/v1/accounts/${acc}/contacts/${contactId}`;
    const headers = {
      "Content-Type": "application/json",
      api_access_token: TOKEN,
    };

    // Busca os atributos atuais para não sobrescrever outros já preenchidos
    const getRes = await fetch(base, { headers });
    const current = getRes.ok ? await getRes.json() : null;
    const existing =
      current?.payload?.custom_attributes ||
      current?.custom_attributes ||
      {};

    const nome = cliente.nome_fantasia || cliente.razao_social || "";
    const custom_attributes = {
      ...existing,
      // Campo visível "Cliente" (nome + código do portal)
      cliente: nome ? `${nome} (cód ${cliente.cod_cli})` : String(cliente.cod_cli ?? ""),
      // Referência interna p/ a "ficha viva" (fase 2): identifica o cliente no portal
      cliente_ref: `${cliente.cod_cli ?? ""}:${cliente.empresa ?? ""}`,
    };

    const putRes = await fetch(base, {
      method: "PUT",
      headers,
      body: JSON.stringify({ custom_attributes }),
    });

    if (!putRes.ok) {
      const txt = await putRes.text();
      return NextResponse.json(
        { error: `Chatwoot respondeu ${putRes.status}: ${txt}` },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, custom_attributes });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
