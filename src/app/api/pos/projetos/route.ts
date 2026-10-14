// Busca de PROJETOS (tratores) do botão "Buscar trator" do header do POS.
// UM campo só (José, 13/10/2026): cada palavra tem que aparecer no modelo,
// chassis, cliente, CNPJ ou nome do projeto. Sem texto = os projetos usados
// recentemente nas ordens de serviço (mais recente primeiro).
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { autenticar } from "@/lib/auth/server";
import { TBL_OS } from "@/lib/pos/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

const COLS = "chassis, modelo, projeto, empresa, cod_cli_ultimo, cnpj_cpf_ultimo, cliente_nome_ultimo";
type Linha = Record<string, unknown>;
interface Projeto {
  chassis: string; modelo: string; projeto: string; empresa: string; cliente: string; cnpj: string; codCli: number | null;
  ultimaOS?: string; ultimaData?: string;
}

const limpar = (s: string) => s.replace(/[%,()*]/g, " ").trim();
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function paraProjeto(r: Linha): Projeto {
  return {
    chassis: String(r.chassis || ""), modelo: String(r.modelo || ""), projeto: String(r.projeto || ""),
    empresa: String(r.empresa || ""), cliente: String(r.cliente_nome_ultimo || ""), cnpj: String(r.cnpj_cpf_ultimo || ""),
    codCli: (r.cod_cli_ultimo as number | null) ?? null,
  };
}

/** a palavra aparece em algum campo do projeto (sem acento; CNPJ só dígitos) */
function casaPalavra(p: Projeto, w: string): boolean {
  const alvo = semAcento([p.modelo, p.chassis, p.cliente, p.projeto].join(" "));
  if (alvo.includes(semAcento(w))) return true;
  const dig = w.replace(/\D/g, "");
  return dig.length >= 3 && p.cnpj.replace(/\D/g, "").includes(dig);
}

async function recentes(): Promise<Projeto[]> {
  const { data: oss } = await supabase.from(TBL_OS).select("Id_Ordem, Projeto, Data, Os_Cliente")
    .neq("Projeto", "").not("Projeto", "is", null).order("Id_Ordem", { ascending: false }).limit(300);
  const vistos = new Map<string, { os: string; data: string; cliente: string }>();
  for (const o of oss || []) {
    const nome = String(o.Projeto || "").trim();
    if (!nome || vistos.has(nome)) continue;
    vistos.set(nome, { os: String(o.Id_Ordem || ""), data: String(o.Data || ""), cliente: String(o.Os_Cliente || "") });
    if (vistos.size >= 25) break;
  }
  const nomes = [...vistos.keys()];
  if (!nomes.length) return [];
  const { data } = await supabase.from("portal_nt_projetos_chassis").select(COLS).in("projeto", nomes);
  const porNome = new Map<string, Projeto>();
  for (const r of data || []) if (!porNome.has(String(r.projeto))) porNome.set(String(r.projeto), paraProjeto(r));
  return nomes.map((nome) => {
    const u = vistos.get(nome)!;
    // projeto da OS que (ainda) não está no espelho: monta do texto "MODELO CHASSI"
    const p = porNome.get(nome) || (() => {
      const partes = nome.split(/\s+/);
      const chassis = partes.length > 1 ? partes[partes.length - 1] : "";
      return { chassis, modelo: partes.length > 1 ? partes.slice(0, -1).join(" ") : nome, projeto: nome, empresa: "", cliente: u.cliente, cnpj: "", codCli: null };
    })();
    return { ...p, cliente: p.cliente || u.cliente, ultimaOS: u.os, ultimaData: u.data };
  });
}

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!auth.isAdmin && !auth.modulos.includes("pos")) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const q = limpar(req.nextUrl.searchParams.get("q") || "");
  try {
    if (!q) return NextResponse.json({ projetos: await recentes(), recentes: true });

    // a palavra mais longa vai ao banco; as outras filtram aqui (todas têm que casar)
    const palavras = q.split(/\s+/).filter(Boolean);
    const chave = [...palavras].sort((a, b) => b.length - a.length)[0];
    const dig = chave.replace(/\D/g, "");
    const ors = [`modelo.ilike.*${chave}*`, `chassis.ilike.*${chave}*`, `cliente_nome_ultimo.ilike.*${chave}*`, `projeto.ilike.*${chave}*`];
    if (dig.length >= 3 && dig.length === chave.length) ors.push(`cnpj_cpf_ultimo.ilike.*${dig}*`);
    const { data, error } = await supabase.from("portal_nt_projetos_chassis").select(COLS).or(ors.join(",")).limit(400);
    if (error) throw new Error(error.message);
    const projetos = (data || []).map(paraProjeto)
      .filter((p) => palavras.every((w) => casaPalavra(p, w)))
      .sort((a, b) => a.modelo.localeCompare(b.modelo, "pt-BR") || a.chassis.localeCompare(b.chassis))
      .slice(0, 60);
    return NextResponse.json({ projetos, recentes: false });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro na busca de projetos." }, { status: 502 });
  }
}
