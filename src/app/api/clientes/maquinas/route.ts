import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Máquinas/tratores do cliente para a aba do Chatwoot — mesma fonte dos
// PROJETOS da Pasta Clientes (portal_nt_projetos_PRINCIPAL, nome =
// "MODELO CHASSIS"): chassis, última revisão (revisao_emails) e último
// serviço (OS mais recente do projeto).
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ""
);

const CHATWOOT_ORIGIN =
  process.env.CHATWOOT_URL || "https://chatwoot-production-e3ef.up.railway.app";
const CORS = {
  "Access-Control-Allow-Origin": CHATWOOT_ORIGIN,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

type Servico = { desc?: string };

function parseServicos(raw: unknown): Servico[] {
  try {
    if (typeof raw === "string") return JSON.parse(raw) || [];
    return (raw as Servico[]) || [];
  } catch {
    return [];
  }
}

function resumoServicos(servicos: Servico[]): string {
  const desc = servicos[0]?.desc || "";
  const limpo = desc
    .split("|")
    .filter(p => !/chassis:|modelo:/i.test(p))
    .join("|")
    .trim();
  return limpo.length > 90 ? `${limpo.slice(0, 90)}…` : limpo;
}

// "6075E CAB MDI07513AT0006263" -> modelo "6075E CAB", chassis "MDI07513AT0006263"
function separarModeloChassis(nome: string): { modelo: string; chassis: string } {
  const tokens = String(nome || "").trim().split(/\s+/);
  const ultimo = tokens[tokens.length - 1] || "";
  if (tokens.length > 1 && /^[A-Z0-9-]{8,}$/i.test(ultimo)) {
    return { modelo: tokens.slice(0, -1).join(" "), chassis: ultimo };
  }
  return { modelo: nome, chassis: "" };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  const cod = (req.nextUrl.searchParams.get("cod") || "").trim();
  const empresa = (req.nextUrl.searchParams.get("empresa") || "").trim();
  if (!cod) {
    return NextResponse.json({ maquinas: [] }, { headers: CORS });
  }

  try {
    // 1) Projetos (máquinas) do cliente — igual à Pasta Clientes
    let qProj = supabase
      .from("portal_nt_projetos_PRINCIPAL")
      .select("codigo, nome, empresa, inativo")
      .eq("cod_cli_ultimo", cod);
    if (empresa) qProj = qProj.eq("empresa", empresa);
    const { data: projRows, error: errProj } = await qProj;
    if (errProj) throw new Error(errProj.message);

    const projetos = (projRows || []).filter(p => p.inativo !== "S" && p.nome);
    if (!projetos.length) {
      return NextResponse.json({ maquinas: [] }, { headers: CORS });
    }

    // 2) OS mais recente de cada projeto (último serviço)
    const nomes = projetos.map(p => p.nome);
    let qOs = supabase
      .from("portal_nt_clientes_os")
      .select("num_os, projeto, empresa, data_previsao, servicos, cancelada, status")
      .in("projeto", nomes)
      .order("data_previsao", { ascending: false })
      .limit(500);
    if (empresa) qOs = qOs.eq("empresa", empresa);
    const { data: osRows } = await qOs;

    const ultimaOs = new Map<string, { num_os: string; data: string; resumo: string }>();
    for (const os of osRows || []) {
      if (os.cancelada) continue;
      const chave = `${os.projeto}|${os.empresa}`;
      if (ultimaOs.has(chave)) continue; // já ordenado desc
      ultimaOs.set(chave, {
        num_os: String(os.num_os || ""),
        data: os.data_previsao || "",
        resumo: resumoServicos(parseServicos(os.servicos)),
      });
    }

    // 3) Última revisão por chassis (controle de revisão)
    const chassisList = nomes
      .map(n => separarModeloChassis(n).chassis)
      .filter(Boolean);
    const ultimaRevisao = new Map<string, { horas: string; data: string }>();
    if (chassisList.length) {
      const { data: revisoes } = await supabase
        .from("revisao_emails")
        .select("chassis, horas, created_at")
        .in("chassis", chassisList)
        .order("created_at", { ascending: false });
      for (const r of revisoes || []) {
        if (!ultimaRevisao.has(r.chassis)) {
          ultimaRevisao.set(r.chassis, {
            horas: String(r.horas || ""),
            data: r.created_at || "",
          });
        }
      }
    }

    const maquinas = projetos.map(p => {
      const { modelo, chassis } = separarModeloChassis(p.nome);
      return {
        projeto: p.nome,
        modelo,
        chassis,
        empresa: p.empresa || "",
        ultima_revisao: (chassis && ultimaRevisao.get(chassis)) || null,
        ultimo_servico: ultimaOs.get(`${p.nome}|${p.empresa}`) || null,
      };
    });

    return NextResponse.json({ maquinas }, { headers: CORS });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ error: msg }, { status: 500, headers: CORS });
  }
}
