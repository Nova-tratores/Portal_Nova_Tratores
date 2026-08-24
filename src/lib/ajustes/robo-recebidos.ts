// ============================================================================
// Robô de classificação de produtos RECÉM-RECEBIDOS.
//
// Produtos criados via recebimento de NF nascem SEM FAMÍLIA na Omie. Este robô
// (cron diário) pega os produtos incluídos nos últimos N dias, sem família e com
// valor unitário < R$10.000 (≥10k = máquina → deixa p/ revisão manual), e:
//   1. seta a família = "Peças" (alterarFamiliaProduto, reusa /ajustes/familias);
//   2. sugere o "Tipo:" pela descrição (sugerirTipoDaDescricao, reusa a lógica do
//      botão "Sugerir Tipo:");
//   3. cria 2 tarefas em portal_tarefas (confirmar localização + confirmar Tipo)
//      atribuídas ao RESPONSÁVEL de peças (recebimento_tipo_responsavel tipo='pecas').
//
// Idempotência: ao setar a família, o produto sai de "sem família" e não reaparece.
// O filtro por data de inclusão evita reprocessar todo o histórico (só o recente).
// ============================================================================

import type { Conta } from './conta';
import { getContasOmie } from './conta';
import { supabase } from './supabase';
import { sleep } from './omie';
import { hoje, addDias, parseAnyDate } from './dates';
import { listarSemFamilia, alterarFamiliaProduto } from './familias';
import { sugerirTipoDaDescricao } from './caracteristicas';

const FAMILIA_PECAS = 5553603814;         // codigo_familia "Peças" (mesma nas 2 empresas)
const LIMIAR_MAQUINA = 10000;             // >= 10k = máquina (ignora)
const THROTTLE_MS = 700;                   // respeita rate-limit da Omie (AlterarProduto)
function diasRecentes(): number {
  const n = parseInt(process.env.RECEBIDOS_ROBO_DIAS || '', 10);
  return Number.isFinite(n) && n > 0 ? n : 15;
}
const contaLow = (c: Conta): string => String(c).toLowerCase();

/** Responsável fixo de PEÇAS da conta (recebimento_tipo_responsavel, tipo='pecas'). */
async function responsavelPecas(conta: Conta): Promise<string | null> {
  const { data } = await supabase
    .from('recebimento_tipo_responsavel')
    .select('responsavel_user_id')
    .eq('conta_omie', contaLow(conta))
    .eq('tipo', 'pecas')
    .maybeSingle();
  return (data as any)?.responsavel_user_id || null;
}

async function criarTarefa(userId: string, titulo: string, descricao: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('portal_tarefas')
    .insert({ titulo, descricao, prioridade: 2, criado_por: userId, atribuido_a: userId })
    .select('id')
    .single();
  if (error) { console.warn('[robo-recebidos] criarTarefa:', error.message); return null; }
  return (data as any)?.id ?? null;
}

/** Processa UMA conta. `dry` = só pré-visualiza (não muta nada). Retorna um resumo. */
export async function classificarRecebidos(conta: Conta, opts: { dry?: boolean } = {}): Promise<any> {
  const t0 = Date.now();
  const resp = await responsavelPecas(conta);
  const corteTs = addDias(hoje(), -diasRecentes()).getTime();

  const produtos = await listarSemFamilia(conta, { force: true });
  const alvos = produtos.filter((p) => {
    const v = p.valorUnitario ?? 0;
    if (!(v > 0 && v < LIMIAR_MAQUINA)) return false;
    // só recém-incluídos (evita reclassificar/gerar tarefa do histórico inteiro)
    const d = parseAnyDate(p.dataInclusao);
    return d ? d.getTime() >= corteTs : false;
  });

  // DRY-RUN: só lista o que faria (com a sugestão de Tipo), sem escrever nada.
  if (opts.dry) {
    const amostra: any[] = [];
    for (const p of alvos.slice(0, 50)) {
      let tipoSug: string | null = null;
      try { tipoSug = (await sugerirTipoDaDescricao(conta, p.descricao)).tipo; } catch { /* ignore */ }
      amostra.push({ codigo: p.codigo, descricao: p.descricao, valor: p.valorUnitario, dataInclusao: p.dataInclusao, tipoSugerido: tipoSug });
    }
    return { conta, dry: true, semResponsavel: !resp, diasRecentes: diasRecentes(), totalSemFamilia: produtos.length, alvosRecentes: alvos.length, amostra, duracaoMs: Date.now() - t0 };
  }

  let reclassificados = 0, tarefas = 0, falhas = 0;
  for (const p of alvos) {
    try {
      await alterarFamiliaProduto(conta, p.codigo_produto, FAMILIA_PECAS);
      reclassificados++;
    } catch (e: any) {
      falhas++;
      console.warn('[robo-recebidos] alterarFamilia', p.codigo, e?.message);
      await sleep(THROTTLE_MS);
      continue; // não classificou → não cria tarefa (tenta de novo no próximo dia)
    }

    let tipoSug: string | null = null;
    try { tipoSug = (await sugerirTipoDaDescricao(conta, p.descricao)).tipo; } catch { /* segue sem sugestão */ }

    let tarefaLoc: number | null = null, tarefaTipo: number | null = null;
    if (resp) {
      tarefaLoc = await criarTarefa(resp,
        `📍 Confirmar localização: ${p.codigo} — ${p.descricao}`,
        `Produto recebido (${String(conta).toUpperCase()}) classificado automaticamente como Peças. Defina a posição em /ajustes/localizacao (#PRATELEIRA/#ANDAR/#CAIXA) e conclua esta tarefa.`);
      tarefaTipo = await criarTarefa(resp,
        `🏷️ Confirmar Tipo: ${p.codigo} — ${p.descricao}`,
        `Sugestão de Tipo: ${tipoSug || '(sem sugestão — definir manualmente)'}. Confirme em /ajustes/caracteristicas e conclua esta tarefa.`);
      if (tarefaLoc) tarefas++;
      if (tarefaTipo) tarefas++;
    }

    supabase.from('recebimento_auto_familia_log').insert({
      conta_omie: contaLow(conta),
      codigo_produto: p.codigo_produto,
      codigo: p.codigo,
      descricao: p.descricao,
      familia_de: 'Sem família',
      familia_para: 'Peças',
      valor_unit: p.valorUnitario ?? null,
      tipo_sugerido: tipoSug,
      tarefa_loc_id: tarefaLoc,
      tarefa_tipo_id: tarefaTipo,
    }).then(({ error }: any) => { if (error) console.warn('[robo-recebidos] log:', error.message); });

    await sleep(THROTTLE_MS);
  }

  return {
    conta, semResponsavel: !resp,
    totalSemFamilia: produtos.length, alvosRecentes: alvos.length,
    reclassificados, tarefas, falhas, duracaoMs: Date.now() - t0,
  };
}

/** Roda para TODAS as contas (usado pela rota cron). */
export async function classificarRecebidosTodasContas(opts: { dry?: boolean } = {}): Promise<Record<string, any>> {
  const out: Record<string, any> = {};
  for (const c of getContasOmie()) {
    try { out[c.id] = await classificarRecebidos(c.id, opts); }
    catch (e: any) { out[c.id] = { erro: e?.message || String(e) }; }
  }
  return out;
}
