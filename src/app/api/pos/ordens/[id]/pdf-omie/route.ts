// GET /api/pos/ordens/[id]/pdf-omie — devolve o link do PDF da Ordem de
// Serviço NO OMIE (depois do "Enviar Omie"):
//   1. lê Ordem_Omie da OS (número salvo no envio)
//   2. ConsultarOS (cNumOS; fallback cCodIntOS = Id_Ordem) → nCodOS interno
//   3. /servicos/osdocs/ · ObterOS { nIdOs } → cPdfOs (link do PDF)
// Permissão: admin OU módulo 'pos'.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { autenticar } from "@/lib/auth/server";
import { TBL_OS } from "@/lib/pos/constants";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

const OMIE_BASE = "https://app.omie.com.br/api/v1";
const OMIE_KEY = process.env.OMIE_APP_KEY || "";
const OMIE_SECRET = process.env.OMIE_APP_SECRET || "";

async function omieCall<T>(ep: string, call: string, param: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${OMIE_BASE}${ep}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call, app_key: OMIE_KEY, app_secret: OMIE_SECRET, param: [param] }),
  });
  const data = await res.json().catch(() => ({}));
  if (data?.faultstring) throw new Error(data.faultstring);
  if (data?.status === "error") throw new Error(data.message || "Erro Omie");
  return data as T;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!auth.isAdmin && !auth.modulos.includes("pos")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const { id } = await params;
  const { data: rows } = await supabase.from(TBL_OS)
    .select("Id_Ordem, Ordem_Omie").eq("Id_Ordem", id).limit(1);
  const os = rows?.[0];
  if (!os) return NextResponse.json({ error: "OS não encontrada." }, { status: 404 });
  if (!os.Ordem_Omie) {
    return NextResponse.json({ error: "Esta OS ainda não foi enviada ao Omie." }, { status: 400 });
  }

  try {
    // Resolve o id interno (nCodOS): pelo número salvo; se falhar, pelo código
    // de integração (o Id_Ordem do portal vira cCodIntOS na criação).
    let nCodOS = 0;
    try {
      const c = await omieCall<{ Cabecalho?: { nCodOS?: number } }>(
        "/servicos/os/", "ConsultarOS", { cNumOS: String(os.Ordem_Omie) });
      nCodOS = Number(c?.Cabecalho?.nCodOS || 0);
    } catch { /* tenta pelo cCodIntOS */ }
    if (!nCodOS) {
      const c = await omieCall<{ Cabecalho?: { nCodOS?: number } }>(
        "/servicos/os/", "ConsultarOS", { cCodIntOS: id });
      nCodOS = Number(c?.Cabecalho?.nCodOS || 0);
    }
    if (!nCodOS) return NextResponse.json({ error: "OS não localizada no Omie." }, { status: 404 });

    const doc = await omieCall<{ cPdfOs?: string; cDesStatus?: string }>(
      "/servicos/osdocs/", "ObterOS", { nIdOs: nCodOS });
    const url = String(doc?.cPdfOs || "");
    if (!url) {
      return NextResponse.json({ error: doc?.cDesStatus || "Omie não devolveu o PDF da ordem." }, { status: 502 });
    }
    return NextResponse.json({ url, nCodOS });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao consultar o Omie." }, { status: 502 });
  }
}
