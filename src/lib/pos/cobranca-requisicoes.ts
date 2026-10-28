// Robô de cobrança de requisições (José, 26/10/2026). Só servidor.
// Requisição que deveria ser cobrada (regra em cobranca-requisicoes-regras.ts) e está sem valor cobrado:
//  → lembrete no POS ligado à OS e à requisição (lembretes_clientes tipo 'cobranca_requisicao', origem 'robo')
//  → cobranca_status = 'a_cobrar' e aviso no sino do Pós-Vendas (uma vez por requisição).
// Fecha sozinho: ganhou valor cobrado → 'cobrada'; foi para lixeira/cancelada → lembrete concluído.
// O Pós-Vendas resolve pela rota POST /api/pos/requisicoes/cobranca (cobrada / não cobrada com motivo / reabrir).
import { supabaseAdmin as sb } from "@/lib/server/supabase-admin";
import { paginar, emLotes } from "@/lib/db/paginar";
import { codigosDoDocumento } from "@/lib/clientes/info-pasta";
import { usuariosPosVendas, notificarUsuarios } from "@/lib/faturamento/alerta-ti";
import {
  INICIO_CONTROLE_COBRANCA, ROBO_COBRANCA, MOTIVO_MIN, deveSerCobrada, ehCobravel, ehOsTeste, reqCancelada, reqCustoDaLoja,
  temValorCobrado, textoLembreteCobranca, valorCobradoTexto, type ReqCobranca,
} from "./cobranca-requisicoes-regras";

export * from "./cobranca-requisicoes-regras";

const TBL_LEMBRETES = "lembretes_clientes";
const TIPO_LEMBRETE = "cobranca_requisicao";
const COLS_REQ = "id, titulo, tipo, setor, status, valor_despeza, valor_cobrado_cliente, ordem_servico, cliente, cliente_cnpj, created_at, cobranca_status, cobranca_motivo";

type Req = ReqCobranca & { id: number; cliente?: string | null; cliente_cnpj?: string | null; cobranca_motivo?: string | null };
type OS = { Id_Ordem: string; Os_Cliente: string | null; Cnpj_Cliente: string | null };

const agora = () => new Date().toISOString();
const semMigracao = (m?: string) => /cobranca_status|requisicao_id|id_ordem|conclusao_nota|does not exist|schema cache/i.test(m || "");

/** Conclui os lembretes de cobrança ABERTOS da requisição. Devolve quantos fechou. */
export async function concluirLembretesDaRequisicao(reqId: number, nota: string, por: string, idOrdem?: string | null): Promise<number> {
  const { data, error } = await sb.from(TBL_LEMBRETES)
    .update({ concluido: true, concluido_em: agora(), concluido_por: por, concluido_em_ordem: idOrdem || null, conclusao_nota: nota.slice(0, 500), updated_at: agora() })
    .eq("requisicao_id", reqId).eq("tipo", TIPO_LEMBRETE).eq("concluido", false)
    .select("id");
  if (error) throw new Error(`concluir lembrete da Req #${reqId}: ${error.message}`);
  return (data || []).length;
}

/** Reabre o lembrete mais recente da requisição (ou cria um, se nunca houve). */
async function reabrirLembrete(req: Req, os: OS | null): Promise<void> {
  const { data: abertos } = await sb.from(TBL_LEMBRETES).select("id").eq("requisicao_id", req.id).eq("tipo", TIPO_LEMBRETE).eq("concluido", false).limit(1);
  if (abertos?.length) return;
  const { data: ult } = await sb.from(TBL_LEMBRETES).select("id").eq("requisicao_id", req.id).eq("tipo", TIPO_LEMBRETE).order("id", { ascending: false }).limit(1);
  if (ult?.length) {
    const { error } = await sb.from(TBL_LEMBRETES)
      .update({ concluido: false, concluido_em: null, concluido_por: null, concluido_em_ordem: null, conclusao_nota: null, ativo: true, updated_at: agora() })
      .eq("id", ult[0].id);
    if (error) throw new Error(error.message);
    return;
  }
  await criarLembrete(req, os);
}

/** Cliente do lembrete: CNPJ/nome da OS (senão da requisição) + chaves OMIE:<cod> de todas as contas do CNPJ (igual ao POST de lembretes). */
async function clienteDoLembrete(req: Req, os: OS | null) {
  const doc = String(os?.Cnpj_Cliente || req.cliente_cnpj || "").replace(/\D/g, "");
  const nome = String(os?.Os_Cliente || req.cliente || "").trim();
  const codigos = doc ? await codigosDoDocumento(doc).catch(() => [] as string[]) : [];
  return {
    cliente_chaves: codigos.map((c) => `OMIE:${c}`),
    cliente_nomes: codigos.length ? codigos.map(() => nome).join(", ") : nome,
    cliente_cnpj_cpf: codigos.length ? codigos.map(() => doc).join(",") : doc,
  };
}

/** Cria o lembrete de cobrança. false = já existia um aberto (índice único). */
async function criarLembrete(req: Req, os: OS | null): Promise<boolean> {
  const cli = await clienteDoLembrete(req, os);
  const { error } = await sb.from(TBL_LEMBRETES).insert({
    ...cli,
    lembrete: textoLembreteCobranca(req),
    criado_por: ROBO_COBRANCA,
    ativo: true,
    concluido: false,
    tipo: TIPO_LEMBRETE,
    origem: "robo",
    id_ordem: req.ordem_servico ? String(req.ordem_servico).trim() : null,
    requisicao_id: req.id,
    responsavel: "Pós-Vendas",
    created_at: agora(),
    updated_at: agora(),
  });
  if (error) {
    if (error.code === "23505") return false;
    throw new Error(`lembrete da Req #${req.id}: ${error.message}`);
  }
  return true;
}

async function lerOS(ids: string[]): Promise<Map<string, OS>> {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return new Map();
  const { data } = await emLotes<OS, string>(unicos, (p) => sb.from("Ordem_Servico").select("Id_Ordem, Os_Cliente, Cnpj_Cliente").in("Id_Ordem", p));
  return new Map(data.map((o) => [o.Id_Ordem, o]));
}

const linkDe = (r: Req) => r.ordem_servico ? `/pos?id=${encodeURIComponent(String(r.ordem_servico).trim())}` : `/requisicoes?req=${r.id}`;

/** Robô (agendador 'pos-requisicoes-cobranca', a cada 30 min). */
export async function vigiarCobrancas(): Promise<{ resumo?: string; pular?: string }> {
  const { data: reqs, error } = await paginar<Req>((de, ate) => sb.from("Requisicao").select(COLS_REQ)
    .gte("created_at", INICIO_CONTROLE_COBRANCA)
    .or("cobranca_status.is.null,cobranca_status.eq.a_cobrar")
    .order("id").range(de, ate));
  if (error) {
    if (semMigracao(error.message)) return { pular: "aplicar sql/requisicoes-cobranca.sql" };
    throw new Error(error.message);
  }

  const osMap = await lerOS(reqs.map((r) => String(r.ordem_servico || "").trim()));
  let novos = 0, cobradas = 0, canceladas = 0, recriados = 0;
  const erros: string[] = [];
  const avisar: Req[] = [];

  for (const r of reqs) {
    if (ehOsTeste(r.ordem_servico)) continue;
    const idOs = r.ordem_servico ? String(r.ordem_servico).trim() : null;
    try {
      if (reqCancelada(r)) {
        // foi para a lixeira/cancelada: fecha o lembrete e sai da vigia
        if (r.cobranca_status === "a_cobrar") {
          await concluirLembretesDaRequisicao(r.id, "Requisição cancelada/na lixeira", ROBO_COBRANCA, idOs);
          await sb.from("Requisicao").update({ cobranca_status: null, cobranca_por: ROBO_COBRANCA, cobranca_em: agora() }).eq("id", r.id);
          canceladas++;
        }
        continue;
      }
      if (reqCustoDaLoja(r)) {
        // abastecimento/manutenção de veículo e trator da loja: custo da loja, sai da vigia
        if (r.cobranca_status === "a_cobrar") {
          await concluirLembretesDaRequisicao(r.id, "Custo da loja (não se cobra do cliente)", ROBO_COBRANCA, idOs);
          await sb.from("Requisicao").update({ cobranca_status: null, cobranca_por: ROBO_COBRANCA, cobranca_em: agora() }).eq("id", r.id);
          canceladas++;
        }
        continue;
      }
      if (temValorCobrado(r)) {
        if (r.cobranca_status === "a_cobrar" || ehCobravel(r)) {
          await sb.from("Requisicao").update({ cobranca_status: "cobrada", cobranca_motivo: null, cobranca_por: ROBO_COBRANCA, cobranca_em: agora() }).eq("id", r.id);
          await concluirLembretesDaRequisicao(r.id, "Valor cobrado preenchido", ROBO_COBRANCA, idOs);
          cobradas++;
        }
        continue;
      }
      if (!deveSerCobrada(r)) continue;
      const criou = await (async () => {
        const { data: aberto } = await sb.from(TBL_LEMBRETES).select("id").eq("requisicao_id", r.id).eq("tipo", TIPO_LEMBRETE).eq("concluido", false).limit(1);
        if (aberto?.length) return false;
        return criarLembrete(r, idOs ? osMap.get(idOs) || null : null);
      })();
      if (r.cobranca_status !== "a_cobrar") {
        const { error: e } = await sb.from("Requisicao").update({ cobranca_status: "a_cobrar", cobranca_por: ROBO_COBRANCA, cobranca_em: agora() }).eq("id", r.id);
        if (e) throw new Error(e.message);
        novos++;
        avisar.push(r); // primeira vez que a requisição entra na vigia → sino uma vez só
      } else if (criou) recriados++; // lembrete concluído à mão sem resolver a cobrança: volta
    } catch (e) {
      erros.push(`#${r.id}: ${e instanceof Error ? e.message : e}`);
    }
  }

  if (avisar.length) {
    const ids = await usuariosPosVendas().catch(() => [] as string[]);
    for (const r of avisar) {
      await notificarUsuarios(ids, {
        titulo: `Requisição a cobrar do cliente — Req #${r.id}${r.ordem_servico ? ` (${String(r.ordem_servico).trim()})` : ""}`,
        descricao: textoLembreteCobranca(r),
        link: linkDe(r),
      }).catch(() => 0);
    }
  }

  if (erros.length && !novos && !cobradas && !canceladas) throw new Error(erros.slice(0, 5).join(" | "));
  const partes = [`${reqs.length} na vigia`, `${novos} nova(s) a cobrar`, `${cobradas} cobrada(s)`];
  if (canceladas) partes.push(`${canceladas} fechada(s) (cancelada ou custo da loja)`);
  if (recriados) partes.push(`${recriados} lembrete(s) reaberto(s)`);
  if (erros.length) partes.push(`${erros.length} erro(s): ${erros.slice(0, 3).join(" | ")}`);
  return { resumo: partes.join(" · ") };
}

export type AcaoCobranca = "nao_cobrada" | "cobrada" | "reabrir";

/** Ação manual do Pós-Vendas (rota POST /api/pos/requisicoes/cobranca). */
export async function resolverCobranca(p: { requisicaoId: number; acao: AcaoCobranca; motivo?: string; valor?: unknown; por: string }):
  Promise<{ ok: true; requisicao: Record<string, unknown>; lembretes: number } | { ok: false; status: number; erro: string }> {
  const { data: req, error } = await sb.from("Requisicao").select(COLS_REQ).eq("id", p.requisicaoId).maybeSingle();
  if (error) return { ok: false, status: semMigracao(error.message) ? 503 : 500, erro: semMigracao(error.message) ? "Falta aplicar sql/requisicoes-cobranca.sql." : error.message };
  if (!req) return { ok: false, status: 404, erro: "Requisição não encontrada." };
  const r = req as Req;
  const idOs = r.ordem_servico ? String(r.ordem_servico).trim() : null;
  const motivo = String(p.motivo || "").trim();
  let upd: Record<string, unknown>;
  let lembretes = 0;

  if (p.acao === "nao_cobrada") {
    if (motivo.length < MOTIVO_MIN) return { ok: false, status: 400, erro: `Escreva o motivo de não cobrar (mín. ${MOTIVO_MIN} caracteres).` };
    if (temValorCobrado(r)) return { ok: false, status: 409, erro: "A requisição já tem valor cobrado. Apague o valor antes de marcar como não cobrada." };
    upd = { cobranca_status: "nao_cobrada", cobranca_motivo: motivo.slice(0, 500), cobranca_por: p.por, cobranca_em: agora() };
  } else if (p.acao === "cobrada") {
    const v = p.valor === undefined || p.valor === null || String(p.valor).trim() === "" ? null : valorCobradoTexto(p.valor);
    if (v === null && !temValorCobrado(r)) return { ok: false, status: 400, erro: "Informe o valor cobrado do cliente." };
    upd = { cobranca_status: "cobrada", cobranca_motivo: null, cobranca_por: p.por, cobranca_em: agora(), ...(v !== null ? { valor_cobrado_cliente: v } : {}) };
  } else if (p.acao === "reabrir") {
    if (temValorCobrado(r)) return { ok: false, status: 409, erro: "A requisição tem valor cobrado; apague o valor para reabrir a cobrança." };
    upd = { cobranca_status: "a_cobrar", cobranca_motivo: null, cobranca_por: p.por, cobranca_em: agora() };
  } else {
    return { ok: false, status: 400, erro: "Ação inválida (nao_cobrada | cobrada | reabrir)." };
  }

  const { data: nova, error: e2 } = await sb.from("Requisicao").update(upd).eq("id", r.id).select("*").single();
  if (e2) return { ok: false, status: 500, erro: e2.message };

  try {
    if (p.acao === "reabrir") {
      const os = idOs ? (await lerOS([idOs])).get(idOs) || null : null;
      await reabrirLembrete(r, os);
    } else {
      const nota = p.acao === "nao_cobrada" ? `Não cobrada: ${motivo}` : `Cobrada do cliente${upd.valor_cobrado_cliente ? ` (R$ ${upd.valor_cobrado_cliente})` : ""}`;
      lembretes = await concluirLembretesDaRequisicao(r.id, nota, p.por, idOs);
    }
  } catch (e) {
    return { ok: false, status: 500, erro: `Cobrança gravada, mas o lembrete falhou: ${e instanceof Error ? e.message : e}` };
  }
  return { ok: true, requisicao: nova as unknown as Record<string, unknown>, lembretes };
}
