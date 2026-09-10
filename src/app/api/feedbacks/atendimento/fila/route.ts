import { NextRequest, NextResponse } from "next/server";
import { exigirPermissao } from "@/lib/ajustes/permissao-server";
import { supabaseAdmin as sb } from "@/lib/server/supabase-admin";
import { agruparFila, type LinhaFila } from "@/lib/feedbacks/atendimento/puro";
import type { FeedbackRegistro, Oportunidade } from "@/lib/feedbacks/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Fila de atendimento: UMA linha por cliente, unindo oportunidades abertas
// (motor R1..R7) e registros CRM/RFM em aberto. Ordem: prioridade → mais
// antigo; clientes com a caveira ("Não contatar") vão para o fim, marcados.
export interface FilaResposta { linhas: LinhaFila[]; gerado_em: string; areas: Record<string, unknown> | null }

export async function GET(req: NextRequest) {
  try {
    await exigirPermissao(req, "feedbacks", "atendimento");
  } catch (e) {
    const err = e as { message?: string; http?: number };
    return NextResponse.json({ erro: err.message || "não autorizado" }, { status: err.http ?? 401 });
  }
  try {
    const [ops, regs, infos, abertas, cfgAreas, humores] = await Promise.all([
      lerTudo<Oportunidade>("feedback_oportunidades", "*", (q) => q.eq("status", "aberta")),
      lerTudo<FeedbackRegistro>("feedback_registros", "id, nome, codigo_omie, telefone, status_atendimento, atendente_nome, aberto_em, data_contato, data_servico, ultimo_servico, criado_em, prioridade"),
      lerTudo<{ cliente_key: string; tags: string[] | null }>("feedback_clientes_info", "cliente_key, tags"),
      sb.from("feedback_chamada").select("cliente_key, atendente_id, atendente_nome").is("encerrada_em", null).then(({ data, error }) => { if (error) throw new Error(error.message); return (data || []) as { cliente_key: string; atendente_id: string; atendente_nome: string }[]; }),
      sb.from("feedback_config_regras").select("parametros").eq("regra", "areas").maybeSingle().then(({ data }) => (data as { parametros?: Record<string, unknown> } | null)?.parametros ?? null),
      // último humor por cliente: ligações encerradas com humor, mais recentes primeiro (teto 2000)
      sb.from("feedback_chamada").select("cliente_key, humor_cliente, encerrada_em").not("humor_cliente", "is", null).not("encerrada_em", "is", null).order("encerrada_em", { ascending: false }).limit(2000).then(({ data, error }) => { if (error) throw new Error(error.message); return (data || []) as { cliente_key: string; humor_cliente: number }[]; }),
    ]);

    // telefone do cadastro Omie para quem só tem oportunidade (sem registro)
    const codigos = [...new Set(ops.map((o) => o.codigo_omie).filter((c): c is string => !!c))];
    const telefonePorCodigo = new Map<string, string>();
    for (let i = 0; i < codigos.length; i += 200) {
      const { data } = await sb.from("portal_nt_clientes_cadastro_omie").select("cod_cli, telefone").in("cod_cli", codigos.slice(i, i + 200));
      for (const c of (data || []) as { cod_cli: unknown; telefone: string | null }[]) {
        if (c.telefone && c.cod_cli != null) telefonePorCodigo.set(String(c.cod_cli), c.telefone);
      }
    }
    const tagsPorCliente = new Map(infos.map((i) => [i.cliente_key, i.tags || []] as const));
    const chamadasAbertas = new Map(abertas.map((c) => [c.cliente_key, { atendente_id: c.atendente_id, atendente_nome: c.atendente_nome }] as const));
    const humorPorCliente = new Map<string, number>();
    for (const h of humores) if (!humorPorCliente.has(h.cliente_key)) humorPorCliente.set(h.cliente_key, Number(h.humor_cliente));
    const linhas = agruparFila({ oportunidades: ops, registros: regs, tagsPorCliente, telefonePorCodigo, chamadasAbertas, humorPorCliente });
    const out: FilaResposta = { linhas, gerado_em: new Date().toISOString(), areas: cfgAreas };
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message || "falha ao montar a fila" }, { status: 500 });
  }
}

// PostgREST corta em 1000 — pagina até acabar.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Consulta = any;
async function lerTudo<T>(tabela: string, select: string, filtro?: (q: Consulta) => Consulta): Promise<T[]> {
  const out: T[] = [];
  for (let off = 0; ; off += 1000) {
    let q: Consulta = sb.from(tabela).select(select).order("id", { ascending: true }).range(off, off + 999);
    if (filtro) q = filtro(q);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    out.push(...((data || []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}
