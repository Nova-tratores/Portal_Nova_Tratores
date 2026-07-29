// Gera a FOTO semanal dos "cards sem nota": OS/PV faturados sem NF anexada
// (mesmo critério da tela Clientes → Projetos: faturado && !cancelado && sem num_nf/link_nf).
// Grava em clientes_relatorios_semanais (uma linha por semana) e dispara UMA
// notificação (admins + quem tem o módulo Clientes). Chamado pelo cron de sexta 08:00.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

async function fetchAll<T>(table: string, select: string, filters?: (q: any) => any): Promise<T[]> {
  const all: T[] = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    let q = supabase.from(table).select(select).range(from, from + PAGE - 1);
    if (filters) q = filters(q);
    const { data } = await q;
    if (data && data.length) {
      all.push(...(data as T[]));
      if (data.length < PAGE) break;
      from += PAGE;
    } else break;
  }
  return all;
}

// Módulos podem vir como array jsonb ou texto ("a,b,c" / '["a","b"]').
function temModulo(modulos: unknown, alvo: string): boolean {
  if (Array.isArray(modulos)) return modulos.map(String).map((s) => s.trim()).includes(alvo);
  if (typeof modulos === "string") {
    try { const arr = JSON.parse(modulos); if (Array.isArray(arr)) return arr.map(String).map((s) => s.trim()).includes(alvo); } catch { /* texto simples */ }
    return modulos.split(",").map((s) => s.trim()).includes(alvo);
  }
  return false;
}

async function gerar(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret");
    if (provided !== secret) return NextResponse.json({ ok: false, erro: "unauthorized" }, { status: 401 });
  }

  try {
    // OS faturadas sem NF de serviço
    const osAll = await fetchAll<Record<string, any>>(
      "portal_nt_clientes_os",
      "num_os, empresa, cod_cli, valor_total, faturada, cancelada, num_nf, link_nf, data_faturamento, data_previsao, cliente_nome",
      (q: any) => q.eq("faturada", true)
    );
    const osSem = osAll.filter((o) => !o.cancelada && !o.num_nf && !o.link_nf);

    // PV faturados sem NF de peça
    const pvAll = await fetchAll<Record<string, any>>(
      "portal_nt_clientes_pv",
      "num_pedido, empresa, cod_cli, valor_total, faturado, cancelado, numero_nf, link_nf, data_previsao, cliente_nome",
      (q: any) => q.eq("faturado", true)
    );
    const pvSem = pvAll.filter((p) => !p.cancelado && !p.numero_nf && !p.link_nf);

    const itens = [
      ...osSem.map((o) => ({
        tipo: "OS" as const, numero: String(o.num_os || ""), empresa: o.empresa || "",
        cliente: o.cliente_nome || "", valor: Number(o.valor_total) || 0,
        data: o.data_faturamento || o.data_previsao || "",
      })),
      ...pvSem.map((p) => ({
        tipo: "PV" as const, numero: String(p.num_pedido || ""), empresa: p.empresa || "",
        cliente: p.cliente_nome || "", valor: Number(p.valor_total) || 0,
        data: p.data_previsao || "",
      })),
    ].sort((a, b) => (a.cliente || "").localeCompare(b.cliente || "") || b.valor - a.valor);

    const totalValor = itens.reduce((s, i) => s + i.valor, 0);
    const semana = new Date().toISOString().slice(0, 10); // a sexta em que roda

    const { error: upErr } = await supabase
      .from("clientes_relatorios_semanais")
      .upsert(
        { semana, gerado_em: new Date().toISOString(), total_cards: itens.length, total_valor: totalValor, dados: itens },
        { onConflict: "semana" }
      );
    if (upErr) return NextResponse.json({ ok: false, erro: upErr.message }, { status: 500 });

    // Notificar admins + quem tem o módulo Clientes (uma notificação só)
    const { data: perms } = await supabase
      .from("portal_permissoes")
      .select("user_id, is_admin, is_dev, modulos_permitidos");
    const alvos = [...new Set(
      (perms || [])
        .filter((p) => p.is_admin || p.is_dev || temModulo(p.modulos_permitidos, "clientes"))
        .map((p) => p.user_id)
        .filter(Boolean)
    )];

    if (alvos.length) {
      const desc = itens.length
        ? `${itens.length} card(s) faturado(s) sem NF — R$ ${totalValor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
        : "Nenhum card sem NF nesta semana — tudo em dia!";
      const rows = alvos.map((user_id) => ({
        user_id, tipo: "clientes",
        titulo: "Relatório semanal pronto",
        descricao: desc,
        link: `/clientes/relatorios/${semana}`,
        icone: "📄",
      }));
      await supabase.from("portal_notificacoes").insert(rows);
    }

    return NextResponse.json({ ok: true, semana, total_cards: itens.length, total_valor: totalValor, notificados: alvos.length });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) { return gerar(req); }
export async function GET(req: NextRequest) { return gerar(req); }
