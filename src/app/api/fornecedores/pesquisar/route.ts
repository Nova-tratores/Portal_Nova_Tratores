import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { protegerRota } from "@/lib/ajustes/permissao-server";
import {
  candidatoDaBrasilApi, cnpjValido, extrairCnpjs, ordenarCandidatos, soDigitos, type CandidatoCnpj,
} from "@/lib/requisicoes/cnpj-busca";

// Cadastro de fornecedor na hora (Requisições → Mapa de cotações → Empresa; 16/11/2026).
// GET ?q=<nome ou CNPJ>
//  - CNPJ (14 dígitos): confere direto na Receita (BrasilAPI → minhareceita de reserva).
//  - nome: pesquisa "<nome> cnpj" no DuckDuckGo (Bing de reserva), tira os CNPJs citados nos resultados
//    e confere até 6 na Receita. Devolve razão social, fantasia, situação, cidade e endereço de cada um,
//    marcando quem já está no cadastro de Fornecedores.
// Nada é gravado aqui: quem cadastra é a tela, depois que a pessoa escolhe.

const ACESSO = [{ modulo: "requisicoes" }, { modulo: "pos" }, { modulo: "financeiro" }];
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function buscarTexto(url: string, ms = 9000): Promise<string> {
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9" }, signal: AbortSignal.timeout(ms), cache: "no-store" });
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`); // DuckDuckGo responde 202 quando desconfia de robô
  return r.text();
}

/** página de resultados → texto (o link real do DuckDuckGo vem codificado em uddg=) */
const textoDaPagina = (html: string) => {
  try { return decodeURIComponent(html.replace(/%(?![0-9A-Fa-f]{2})/g, "%25")); } catch { return html; }
};

async function cnpjsDaInternet(nome: string): Promise<{ cnpjs: string[]; fonte: string }> {
  const q = encodeURIComponent(`${nome} cnpj`);
  const fontes: [string, string][] = [
    ["DuckDuckGo", `https://html.duckduckgo.com/html/?q=${q}&kl=br-pt`],
    ["Bing", `https://www.bing.com/search?q=${q}&setlang=pt-BR&cc=BR`],
    ["DuckDuckGo", `https://lite.duckduckgo.com/lite/?q=${q}`],
  ];
  for (const [fonte, url] of fontes) {
    try {
      const cnpjs = extrairCnpjs(textoDaPagina(await buscarTexto(url)), 10);
      if (cnpjs.length) return { cnpjs, fonte };
    } catch { /* tenta o próximo buscador */ }
  }
  return { cnpjs: [], fonte: "" };
}

async function naReceita(cnpj: string): Promise<CandidatoCnpj | null> {
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (r.ok) return candidatoDaBrasilApi(await r.json());
  } catch { /* reserva abaixo */ }
  try {
    // minhareceita devolve os mesmos campos da BrasilAPI
    const r = await fetch(`https://minhareceita.org/${cnpj}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (r.ok) return candidatoDaBrasilApi(await r.json());
  } catch { /* sem dados */ }
  return null;
}

export async function GET(req: NextRequest) {
  const guarda = await protegerRota(req, ACESSO);
  if (guarda.resposta) return guarda.resposta;
  const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 120);
  const dig = soDigitos(q);

  if (dig.length === 11) {
    return NextResponse.json({ candidatos: [], aviso: "CPF de pessoa não se pesquisa na internet: preencha o nome e o CPF à mão." });
  }

  let cnpjs: string[] = [];
  let fonte = "Receita Federal";
  if (dig.length === 14) {
    if (!cnpjValido(dig)) return NextResponse.json({ candidatos: [], aviso: "Esse CNPJ tem os dígitos errados. Confira o número." });
    cnpjs = [dig];
  } else {
    if (q.replace(/[^\p{L}\p{N}]/gu, "").length < 3) return NextResponse.json({ candidatos: [], aviso: "Digite pelo menos 3 letras do nome." });
    const r = await cnpjsDaInternet(q);
    cnpjs = r.cnpjs.slice(0, 6);
    fonte = r.fonte;
    if (!cnpjs.length) {
      return NextResponse.json({ candidatos: [], aviso: "Não achei nenhum CNPJ com esse nome na internet. Tente com a cidade junto (ex.: \"Auto Peças Martins Piraju\") ou digite o CNPJ." });
    }
  }

  const achados = (await Promise.all(cnpjs.map(naReceita))).filter((c): c is CandidatoCnpj => !!c);

  // quem já está no cadastro (a coluna "cpf/cnpj" tem barra no nome e vem formatada de vários jeitos)
  const { data: forn } = await supabase.from("Fornecedores").select('id, nome, "cpf/cnpj"');
  const porDoc = new Map<string, { id: number | string; nome: string }>();
  for (const f of (forn || []) as Record<string, unknown>[]) {
    const d = soDigitos(String(f["cpf/cnpj"] || ""));
    if (d) porDoc.set(d, { id: f.id as number, nome: String(f.nome || "") });
  }
  const candidatos = ordenarCandidatos(dig.length === 14 ? "" : q, achados).map((c) => ({ ...c, ja_cadastrado: porDoc.get(c.cnpj) || null }));

  return NextResponse.json({
    candidatos,
    fonte,
    aviso: candidatos.length ? undefined : "Achei CNPJs na internet, mas a Receita não respondeu agora. Tente de novo em instantes ou digite o CNPJ.",
  });
}
