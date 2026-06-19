import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// -----------------------------------------------------------------------------
// Gravação no cadastro do cliente no Omie (Fase 2 do módulo de feedbacks):
//  - GET   ?codigo_omie=X   → lê dados cadastrais + tags + inativo (ConsultarCliente)
//  - PATCH { codigo_omie, cadastro?, tags?, inativo? } → grava (AlterarCliente)
// A empresa (conta Omie) é resolvida pela tabela portal_nt_clientes_cadastro_omie.
// Tags são REPLACE-total no Omie, então sempre lemos as atuais e mesclamos.
// -----------------------------------------------------------------------------

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

const OMIE_BASE_URL = "https://app.omie.com.br/api/v1";
const OMIE_ACCOUNTS: Record<string, { key: string; secret: string }> = {
  "Nova Tratores": { key: process.env.OMIE_APP_KEY || "2729522270475", secret: process.env.OMIE_APP_SECRET || "113d785bb86c48d064889d4d73348131" },
  "Castro Peças": { key: "2730028269969", secret: "dc270bf5348b40d3ed1398ef70beb628" },
};
// O nome da empresa varia entre tabelas ("Castro Peças" vs "Castro Pecas").
const ALIASES: Record<string, string> = { "Castro Pecas": "Castro Peças" };

const soDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");

function parseTelefone(tel?: string): { ddd: string; num: string } {
  const d = soDigitos(tel);
  if (d.length < 10) return { ddd: "", num: "" };
  return { ddd: d.slice(0, 2), num: d.slice(2) };
}

function fmtTelefone(ddd?: string, num?: string): string {
  if (!num) return "";
  return ddd ? `(${ddd}) ${num}` : String(num);
}

async function omieCall<T>(call: string, param: Record<string, unknown>, empresa: string, tentativa = 1): Promise<T> {
  const acc = OMIE_ACCOUNTS[empresa];
  if (!acc) throw new Error(`Empresa desconhecida: ${empresa}`);
  const payload = { call, app_key: acc.key, app_secret: acc.secret, param: [param] };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  let response: Response;
  try {
    response = await fetch(`${OMIE_BASE_URL}/geral/clientes/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error("O Omie demorou demais para responder (timeout de 25s). Tente novamente.");
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 429 && tentativa < 3) {
    await new Promise((r) => setTimeout(r, tentativa * 8000));
    return omieCall(call, param, empresa, tentativa + 1);
  }
  const data = await response.json();
  if (data?.faultstring) throw new Error(`Omie [${data.faultcode}]: ${data.faultstring}`);
  return data as T;
}

// Resolve a conta Omie (empresa) de um cliente pelo seu código.
async function resolverEmpresa(codigoOmie: number): Promise<string | null> {
  const { data } = await supabase
    .from("portal_nt_clientes_cadastro_omie")
    .select("empresa")
    .eq("cod_cli", codigoOmie)
    .limit(1)
    .maybeSingle();
  const raw = (data as { empresa?: string } | null)?.empresa;
  if (!raw) return null;
  const nome = ALIASES[raw] || raw;
  return OMIE_ACCOUNTS[nome] ? nome : null;
}

interface OmieClienteRaw {
  codigo_cliente_omie?: number;
  razao_social?: string; nome_fantasia?: string;
  telefone1_ddd?: string; telefone1_numero?: string;
  telefone2_ddd?: string; telefone2_numero?: string;
  fax_ddd?: string; fax_numero?: string;
  email?: string;
  endereco?: string; endereco_numero?: string; complemento?: string;
  bairro?: string; cidade?: string; estado?: string; cep?: string;
  inativo?: string;
  tags?: Array<{ tag?: string }>;
}

function tagsDoOmie(cli: OmieClienteRaw): string[] {
  return (cli.tags || []).map((t) => t?.tag).filter((t): t is string => !!t);
}

function normalizar(cli: OmieClienteRaw, empresa: string) {
  return {
    empresa,
    nome_fantasia: cli.nome_fantasia || "",
    razao_social: cli.razao_social || "",
    inativo: cli.inativo === "S",
    tags: tagsDoOmie(cli),
    cadastro: {
      telefone1: fmtTelefone(cli.telefone1_ddd, cli.telefone1_numero),
      telefone2: fmtTelefone(cli.telefone2_ddd, cli.telefone2_numero),
      fax: fmtTelefone(cli.fax_ddd, cli.fax_numero),
      email: cli.email || "",
      endereco: cli.endereco || "",
      numero: cli.endereco_numero || "",
      complemento: cli.complemento || "",
      bairro: cli.bairro || "",
      cidade: cli.cidade || "",
      estado: cli.estado || "",
      cep: cli.cep || "",
    },
  };
}

export async function GET(req: NextRequest) {
  const cod = Number(req.nextUrl.searchParams.get("codigo_omie") || "");
  if (!cod) return NextResponse.json({ error: "codigo_omie é obrigatório" }, { status: 400 });
  try {
    const empresa = await resolverEmpresa(cod);
    if (!empresa) return NextResponse.json({ error: "Cliente sem cadastro Omie vinculado no Portal." }, { status: 404 });
    const cli = await omieCall<OmieClienteRaw>("ConsultarCliente", { codigo_cliente_omie: cod }, empresa);
    return NextResponse.json(normalizar(cli, empresa));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}

interface CadastroInput {
  telefone1?: string; telefone2?: string; fax?: string; email?: string;
  endereco?: string; numero?: string; complemento?: string;
  bairro?: string; cidade?: string; estado?: string; cep?: string;
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const cod = Number(body.codigo_omie || "");
    if (!cod) return NextResponse.json({ error: "codigo_omie é obrigatório" }, { status: 400 });

    const empresa = await resolverEmpresa(cod);
    if (!empresa) return NextResponse.json({ error: "Cliente sem cadastro Omie vinculado no Portal." }, { status: 404 });

    const cadastro: CadastroInput | undefined = body.cadastro;
    const tagsDesejadas: string[] | undefined = Array.isArray(body.tags) ? body.tags : undefined;
    const inativo: string | undefined = body.inativo === "S" || body.inativo === "N" ? body.inativo : undefined;

    const param: Record<string, unknown> = { codigo_cliente_omie: cod };

    // --- Dados cadastrais (telefones / fax / endereço) ---
    if (cadastro) {
      if (cadastro.telefone1 !== undefined) { const { ddd, num } = parseTelefone(cadastro.telefone1); param.telefone1_ddd = ddd; param.telefone1_numero = num; }
      if (cadastro.telefone2 !== undefined) { const { ddd, num } = parseTelefone(cadastro.telefone2); param.telefone2_ddd = ddd; param.telefone2_numero = num; }
      if (cadastro.fax !== undefined) { const { ddd, num } = parseTelefone(cadastro.fax); param.fax_ddd = ddd; param.fax_numero = num; }
      if (cadastro.email !== undefined) param.email = cadastro.email.trim();
      if (cadastro.endereco !== undefined) param.endereco = cadastro.endereco.trim();
      if (cadastro.numero !== undefined) param.endereco_numero = String(cadastro.numero).trim();
      if (cadastro.complemento !== undefined) param.complemento = cadastro.complemento.trim();
      if (cadastro.bairro !== undefined) param.bairro = cadastro.bairro.trim();
      if (cadastro.cidade !== undefined) param.cidade = cadastro.cidade.trim();
      if (cadastro.estado !== undefined) param.estado = cadastro.estado.trim().toUpperCase().slice(0, 2);
      if (cadastro.cep !== undefined) param.cep = soDigitos(cadastro.cep);
    }

    // --- Tags (read + merge: preserva tags do Omie fora do nosso conjunto) ---
    let tagsFinais: string[] | undefined;
    if (tagsDesejadas) {
      const atual = await omieCall<OmieClienteRaw>("ConsultarCliente", { codigo_cliente_omie: cod }, empresa);
      const atuais = tagsDoOmie(atual);
      const gerenciadas: string[] = Array.isArray(body.tags_gerenciadas) ? body.tags_gerenciadas : [];
      const preservadas = gerenciadas.length
        ? atuais.filter((t) => !gerenciadas.includes(t))
        : atuais.filter((t) => !tagsDesejadas.includes(t)); // fallback: une
      tagsFinais = Array.from(new Set([...preservadas, ...tagsDesejadas]));
      param.tags = tagsFinais.map((t) => ({ tag: t }));
    }

    // --- Inativar / reativar ---
    if (inativo !== undefined) param.inativo = inativo;

    const temAlteracao = Object.keys(param).length > 1;
    if (!temAlteracao) return NextResponse.json({ error: "Nada para alterar." }, { status: 400 });

    await omieCall("AlterarCliente", param, empresa);

    // Espelha localmente (best-effort) pra refletir sem esperar o webhook.
    const espelho: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (cadastro?.email !== undefined) espelho.email = cadastro.email.trim() || null;
    if (cadastro?.telefone1 !== undefined) espelho.telefone = cadastro.telefone1.trim() || null;
    if (cadastro?.endereco !== undefined) espelho.endereco = cadastro.endereco.trim() || null;
    if (cadastro?.bairro !== undefined) espelho.bairro = cadastro.bairro.trim() || null;
    if (cadastro?.cidade !== undefined) espelho.cidade = cadastro.cidade.trim() || null;
    if (cadastro?.estado !== undefined) espelho.estado = cadastro.estado.trim().toUpperCase().slice(0, 2) || null;
    if (cadastro?.cep !== undefined) espelho.cep = soDigitos(cadastro.cep) || null;
    if (inativo !== undefined) espelho.inativo = inativo;
    if (Object.keys(espelho).length > 1) {
      await supabase.from("portal_nt_clientes_cadastro_omie").update(espelho).eq("cod_cli", cod).then(() => {}, () => {});
    }

    return NextResponse.json({ ok: true, empresa, tags: tagsFinais, inativo });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
