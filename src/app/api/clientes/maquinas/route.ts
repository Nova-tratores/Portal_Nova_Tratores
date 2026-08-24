import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Máquinas/tratores vinculados a um cliente (últimos faturados/atendidos
// no CNPJ), para a aba do Chatwoot: chassis, modelo, última revisão
// (revisao_emails) e último serviço (OS do cliente que cita o chassis).
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

function resumoServico(servicos: Servico[], chassis: string): string {
  const alvo = servicos.find(s =>
    (s.desc || "").toLowerCase().includes(chassis.toLowerCase())
  );
  const desc = alvo?.desc || servicos[0]?.desc || "";
  // Tira os marcadores "Chassis: ... | Modelo: ..." do texto
  const limpo = desc
    .split("|")
    .filter(p => !/chassis:|modelo:/i.test(p))
    .join("|")
    .trim();
  return limpo.length > 90 ? `${limpo.slice(0, 90)}…` : limpo;
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
    // 1) Máquinas cujo último cliente é este código
    let qMaq = supabase
      .from("portal_nt_projetos_chassis")
      .select("chassis, projeto, modelo, empresa, cnpj_cpf_ultimo")
      .eq("cod_cli_ultimo", cod);
    if (empresa) qMaq = qMaq.eq("empresa", empresa);
    const { data: maqRows, error: errMaq } = await qMaq;
    if (errMaq) throw new Error(errMaq.message);

    const chassisList = (maqRows || []).map(m => m.chassis).filter(Boolean);
    if (!chassisList.length) {
      return NextResponse.json({ maquinas: [] }, { headers: CORS });
    }

    // 2) Última revisão de cada chassis (controle de revisão)
    const { data: revisoes } = await supabase
      .from("revisao_emails")
      .select("chassis, horas, created_at")
      .in("chassis", chassisList)
      .order("created_at", { ascending: false });
    const ultimaRevisao = new Map<string, { horas: string; data: string }>();
    for (const r of revisoes || []) {
      if (!ultimaRevisao.has(r.chassis)) {
        ultimaRevisao.set(r.chassis, {
          horas: String(r.horas || ""),
          data: r.created_at || "",
        });
      }
    }

    // 3) OSs do cliente — último serviço que cita cada chassis
    let qOs = supabase
      .from("portal_nt_clientes_os")
      .select("num_os, data_previsao, servicos")
      .eq("cod_cli", cod)
      .order("data_previsao", { ascending: false })
      .limit(400);
    if (empresa) qOs = qOs.eq("empresa", empresa);
    const { data: osRows } = await qOs;

    const maquinas = (maqRows || []).map(m => {
      let ultimoServico: {
        num_os: string;
        data: string;
        resumo: string;
      } | null = null;
      for (const os of osRows || []) {
        const servicos = parseServicos(os.servicos);
        const cita = servicos.some(s =>
          (s.desc || "").toLowerCase().includes(m.chassis.toLowerCase())
        );
        if (cita) {
          ultimoServico = {
            num_os: String(os.num_os || ""),
            data: os.data_previsao || "",
            resumo: resumoServico(servicos, m.chassis),
          };
          break; // já ordenado do mais recente pro mais antigo
        }
      }
      return {
        chassis: m.chassis,
        modelo: m.modelo || "",
        projeto: m.projeto || "",
        empresa: m.empresa || "",
        ultima_revisao: ultimaRevisao.get(m.chassis) || null,
        ultimo_servico: ultimoServico,
      };
    });

    return NextResponse.json({ maquinas }, { headers: CORS });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ error: msg }, { status: 500, headers: CORS });
  }
}
