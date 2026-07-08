import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { exigirAdmin } from "@/lib/auth/server";
import { montarAtualizacaoOS, aplicarNaOS } from "@/lib/pos/atualizar-relatorio";
import { aplicarMudancaFase } from "@/lib/pos/fase";
import { TBL_OS } from "@/lib/pos/constants";

// Tratorilson — processa EM LOTE todas as OS em "Relatório Concluído".
// Normais → "Enviar Omie"; de garantia → "Preenchido" (separadas). Só admin/dev.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const FASE_ORIGEM = "Relatório Concluído";
const FASE_ENVIAR_OMIE = "Enviar Omie";
const FASE_PREENCHIDO = "Preenchido";

export async function POST(req: NextRequest) {
  const auth = await exigirAdmin(req);
  if (!auth) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const quem = auth.email || "Tratorilson (lote)";

  const { data: osList } = await supabase.from(TBL_OS).select("Id_Ordem").eq("Status", FASE_ORIGEM);
  const ids = (osList || []).map((o) => String((o as { Id_Ordem: string }).Id_Ordem));

  const resultados: { os: string; ok: boolean; fase?: string; garantia?: boolean; duvidas?: number; erro?: string }[] = [];

  for (const id of ids) {
    try {
      const prop = await montarAtualizacaoOS(id, quem);
      if (!prop.ok) { resultados.push({ os: id, ok: false, erro: prop.erro }); continue; }

      const r = await aplicarNaOS(prop, quem);
      if (!r.ok) { resultados.push({ os: id, ok: false, erro: r.erro }); continue; }

      // É de garantia? (tem registro em garantias com esse id_ordem)
      const { data: gar } = await supabase.from("garantias").select("id").eq("id_ordem", prop.osId).limit(1);
      const ehGarantia = !!(gar && gar.length > 0);
      const faseDestino = ehGarantia ? FASE_PREENCHIDO : FASE_ENVIAR_OMIE;

      await aplicarMudancaFase(prop.osId, faseDestino, quem, {
        notificar: false, // lote: não notifica a cada uma pra não spammar
        acaoLog: "Atualizada em lote pelo Tratorilson (relatório do técnico)",
      });

      resultados.push({ os: prop.osId, ok: true, fase: faseDestino, garantia: ehGarantia, duvidas: prop.duvidas.length });
    } catch (e) {
      resultados.push({ os: id, ok: false, erro: e instanceof Error ? e.message : String(e) });
    }
  }

  const ok = resultados.filter((r) => r.ok).length;
  return NextResponse.json({
    total: ids.length,
    ok,
    erros: resultados.length - ok,
    paraEnviarOmie: resultados.filter((r) => r.ok && !r.garantia).length,
    paraPreenchido: resultados.filter((r) => r.ok && r.garantia).length,
    resultados,
  });
}
