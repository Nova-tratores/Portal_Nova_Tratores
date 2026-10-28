import { NextRequest, NextResponse } from "next/server";
import { protegerRota } from "@/lib/ajustes/permissao-server";
import { supabaseAdmin as sb } from "@/lib/server/supabase-admin";
import { tagsDoCadastro } from "@/lib/feedbacks/atendimento/puro";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Tela "Hoje" do módulo Feedbacks (página de teste /feedbacks/crm/teste/hoje — José, 23/10/2026).
// GET → tudo o que a fila única por cliente e o Painel do gerente precisam, numa ida só e SÓ LEITURA:
//   registros CRM/RFM (todos: abertos para a fila, fechados para "feitos hoje" e notas baixas),
//   oportunidades abertas (paginadas: são mais de 1.000) + atendidas nos últimos 7 dias,
//   cadastro Omie (telefone/e-mail/cidade), tags (Não contatar), ligações do cockpit (abertas e
//   últimos 30 dias), áreas e nomes dos usuários. As revisões vêm de /api/feedbacks/crm/revisoes.
// Service role porque o cadastro Omie e a feedback_chamada não são lidos pelo navegador com filtro
// de quem pode. As GRAVAÇÕES continuam pelos caminhos de sempre (atualizarRegistro, PATCH das
// oportunidades, POST das revisões).
// Quem lê: a tela Hoje (/feedbacks = crm|rfm|atendimento|agenda — lib/feedbacks/telas) e o Painel do gerente (relatorios).
const ACESSO = [{ modulo: "feedbacks", acao: "crm" }, { modulo: "feedbacks", acao: "rfm" }, { modulo: "feedbacks", acao: "atendimento" }, { modulo: "feedbacks", acao: "agenda" }, { modulo: "feedbacks", acao: "relatorios" }];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Consulta = any;
async function lerTudo<T>(tabela: string, select: string, filtro?: (q: Consulta) => Consulta): Promise<T[]> {
  const out: T[] = [];
  for (let off = 0; ; off += 1000) {
    let q: Consulta = sb.from(tabela).select(select).order("id", { ascending: true }).range(off, off + 999);
    if (filtro) q = filtro(q);
    const { data, error } = await q;
    if (error) throw new Error(`${tabela}: ${error.message}`);
    out.push(...((data || []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const COLS_OP = "id, regra, codigo_omie, cliente_nome, trator, chassis, detalhes, prioridade, status, atendida_por, atendida_em, feedback_id, dispensada_motivo, computado_em";
const COLS_CHAMADA = "id, atendente_id, atendente_nome, cliente_key, feedback_id, oportunidade_id, iniciada_em, encerrada_em, duracao_seg, desfecho, humor_cliente, qualidade_conversa";

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, ACESSO);
  if (g.resposta) return g.resposta;
  const avisos: string[] = [];
  const agora = Date.now();
  const desde7 = new Date(agora - 7 * 86_400_000).toISOString();
  const desde30 = new Date(agora - 30 * 86_400_000).toISOString();
  try {
    const [registros, abertas, atendidas, infos, chamadas, cfgAreas, usuarios] = await Promise.all([
      lerTudo<Record<string, unknown>>("feedback_registros", "*"),
      lerTudo<Record<string, unknown>>("feedback_oportunidades", COLS_OP, (q) => q.eq("status", "aberta")),
      lerTudo<Record<string, unknown>>("feedback_oportunidades", COLS_OP, (q) => q.eq("status", "atendida").gte("atendida_em", desde7)),
      lerTudo<{ cliente_key: string; tags: unknown }>("feedback_clientes_info", "id, cliente_key, tags"),
      sb.from("feedback_chamada").select(COLS_CHAMADA).or(`encerrada_em.is.null,iniciada_em.gte.${desde30}`).order("iniciada_em", { ascending: false }).limit(3000)
        .then(({ data, error }) => { if (error) { avisos.push(`ligações do cockpit: ${error.message}`); return []; } return data || []; }),
      sb.from("feedback_config_regras").select("parametros").eq("regra", "areas").maybeSingle()
        .then(({ data }) => (data as { parametros?: Record<string, unknown> } | null)?.parametros ?? null),
      sb.from("financeiro_usu").select("id, nome").limit(1000).then(({ data }) => (data || []) as { id: string; nome: string }[]),
    ]);

    const codigos = [...new Set([...abertas.map((o) => o.codigo_omie), ...registros.map((r) => r.codigo_omie)].filter((c): c is string => !!c).map(String))];
    const cadastro: Record<string, { telefone: string | null; email: string | null; cidade: string | null }> = {};
    for (let i = 0; i < codigos.length; i += 200) {
      const { data, error } = await sb.from("portal_nt_clientes_cadastro_omie").select("cod_cli, telefone, email, cidade").in("cod_cli", codigos.slice(i, i + 200));
      if (error) { avisos.push(`cadastro Omie: ${error.message}`); break; }
      for (const c of (data || []) as { cod_cli: unknown; telefone: string | null; email: string | null; cidade: string | null }[]) {
        if (c.cod_cli != null) cadastro[String(c.cod_cli)] = { telefone: c.telefone || null, email: c.email || null, cidade: c.cidade || null };
      }
    }
    const tags: Record<string, string[]> = {};
    for (const i of infos) tags[i.cliente_key] = tagsDoCadastro(i.tags).filter(Boolean);
    const nomes: Record<string, string> = {};
    for (const u of usuarios) nomes[u.id] = u.nome;

    return NextResponse.json({
      registros, oportunidades: abertas, atendidasRecentes: atendidas, cadastro, tags, chamadas, areas: cfgAreas, nomes, avisos,
      gerado_em: new Date(agora).toISOString(),
    });
  } catch (e) {
    console.error("[feedbacks/crm/hoje]", e);
    return NextResponse.json({ erro: (e as Error)?.message || "falha ao montar a fila de hoje" }, { status: 500 });
  }
}
