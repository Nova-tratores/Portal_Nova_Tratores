/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// Recebimentos de NF-e pendentes (impacto no CMC) + dar entrada (concluir).
// Portado de server.js (obterRecebimentosPendentes, /api/dar-entrada-recebimento).
//
// NOTA: a sugestão automática de categoria/departamento (sugerirCatDeptoRecebimento)
// depende da infra de categorias/contas — fica para a Fase 3. Aqui o "dar entrada"
// aceita codCategoria/codDepartamento opcionais vindos do front, mas não sugere.
// ============================================================================

import type { Conta } from './conta';
import { supabase } from './supabase';
import * as cache from './cache';
import { getConfig } from './config';
import { analisarRecebimentosPendentes } from './analise';
import { alterarRecebimentoItens, alterarRecebimentoCabec, concluirRecebimento, obterPosicaoEstoqueProduto } from './omie';
import type { AlterarCabecArgs } from './omie';

// conta_omie nas tabelas recebimento_* e MINUSCULO ('nova'/'castro'); a Conta do
// modulo /ajustes e MAIUSCULA. Esta ponte e obrigatoria p/ casar com recebimento_meta.
function contaLow(c: Conta): string {
  return String(c).toLowerCase();
}

/** Grava log interno (Supabase) de uma acao desta tela. Best-effort, nao bloqueia. */
export function logEntradaReceb(row: {
  conta: Conta;
  idReceb?: number | string | null;
  numeroNFe?: string | null;
  tipo?: string | null;
  acao: 'dar_entrada' | 'correcao_cmc';
  userId?: string | null;
  userNome?: string | null;
  payload?: any;
  resultado?: any;
}): void {
  supabase
    .from('recebimento_entrada_log')
    .insert({
      conta_omie: contaLow(row.conta),
      id_receb: row.idReceb != null && row.idReceb !== '' ? Number(row.idReceb) || null : null,
      numero_nfe: row.numeroNFe ?? null,
      tipo: row.tipo ?? null,
      acao: row.acao,
      user_id: row.userId ?? null,
      user_nome: row.userNome ?? null,
      payload: row.payload ?? null,
      resultado: row.resultado ?? null,
    })
    .then(({ error }: any) => {
      if (error) console.warn('[receb] recebimento_entrada_log:', error.message);
    });
}

/**
 * Transferencia: grava o responsavel (usuario real do Portal) de um recebimento
 * em recebimento_meta (upsert por conta_omie,id_receb). userId null = desatribui.
 */
export async function setResponsavelReceb(
  conta: Conta,
  idReceb: number,
  userId: string | null,
  userNome: string | null,
): Promise<void> {
  if (!idReceb || !Number.isFinite(idReceb)) throw new Error('idReceb invalido');
  const { error } = await supabase
    .from('recebimento_meta')
    .upsert(
      {
        conta_omie: contaLow(conta),
        id_receb: idReceb,
        responsavel_user_id: userId,
        responsavel: userNome,
      },
      { onConflict: 'conta_omie,id_receb' },
    );
  if (error) throw new Error(error.message);
}

/**
 * Enriquece (uncached) cada recebimento com o responsavel resolvido:
 *  - atribuicao manual (recebimento_meta.responsavel_user_id), se houver;
 *  - senao o padrao do mapa tipo->usuario (recebimento_tipo_responsavel).
 * Marca responsavelAutomatico = true quando veio do mapa por tipo.
 */
export async function enriquecerResponsaveis(conta: Conta, recebimentos: any[]): Promise<void> {
  if (!Array.isArray(recebimentos) || recebimentos.length === 0) return;
  const low = contaLow(conta);

  // mapa padrao tipo -> { userId, nome }
  const mapaTipo: Record<string, { userId: string | null; nome: string | null }> = {};
  {
    const { data } = await supabase
      .from('recebimento_tipo_responsavel')
      .select('tipo,responsavel_user_id,responsavel_nome')
      .eq('conta_omie', low);
    (data || []).forEach((m: any) => {
      mapaTipo[m.tipo] = { userId: m.responsavel_user_id || null, nome: m.responsavel_nome || null };
    });
  }

  // atribuicoes manuais por id_receb
  const ids = recebimentos.map((r) => Number(r.idReceb)).filter((n) => Number.isFinite(n) && n > 0);
  const manual: Record<number, { userId: string | null; nome: string | null }> = {};
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await supabase
      .from('recebimento_meta')
      .select('id_receb,responsavel_user_id,responsavel')
      .eq('conta_omie', low)
      .in('id_receb', ids.slice(i, i + 300));
    (data || []).forEach((m: any) => {
      if (m.responsavel_user_id) manual[m.id_receb] = { userId: m.responsavel_user_id, nome: m.responsavel || null };
    });
  }

  for (const r of recebimentos) {
    const id = Number(r.idReceb);
    const m = Number.isFinite(id) ? manual[id] : undefined;
    if (m && m.userId) {
      r.responsavelUserId = m.userId;
      r.responsavelNome = m.nome;
      r.responsavelAutomatico = false;
    } else {
      const padrao = (r.tipo && mapaTipo[r.tipo]) || null;
      r.responsavelUserId = padrao ? padrao.userId : null;
      r.responsavelNome = padrao ? padrao.nome : null;
      r.responsavelAutomatico = !!(padrao && padrao.userId);
    }
  }
}

/** Flags de "custo de estoque" do recebimento (env RECEBIMENTO_CUSTO_ESTOQUE). */
export function montarCustoEstoque(): Record<string, 'S' | 'N'> {
  const lista = String(process.env.RECEBIMENTO_CUSTO_ESTOQUE || 'ICMS,ICMS_ST,IPI,PIS,COFINS')
    .toUpperCase()
    .split(/[,\s]+/)
    .filter(Boolean);
  const has = (k: string): 'S' | 'N' => (lista.includes(k) ? 'S' : 'N');
  // OBS: 'OUTRAS' nao tem tag valida no itensCustoEstoque do Omie
  // (cOutrasDespCusto e' rejeitada). Opcoes validas: ICMS, ICMS_ST, IPI, PIS, COFINS, FRETE, SEGURO.
  return {
    cIcmsCusto: has('ICMS'),
    cIcmsStCusto: has('ICMS_ST'),
    cIpiCusto: has('IPI'),
    cPisCusto: has('PIS'),
    cCofinsCusto: has('COFINS'),
    cFreteCusto: has('FRETE'),
    cSeguroCusto: has('SEGURO'),
  };
}

// ---------------------------------------------------------------------------
// Snapshot PERSISTENTE dos pendentes (Supabase). Substitui o cache em memoria
// como fonte que sobrevive a redeploy. A tela abre a partir daqui (instantaneo);
// o cron de prewarm regrava com force=1. Migration: sql/recebimento-pendentes-cache.sql.
// ---------------------------------------------------------------------------
async function lerSnapshotPendentes(
  conta: Conta,
  dataDeBR: string,
  dataAteBR: string,
): Promise<{ payload: any; geradoEm: string } | null> {
  const { data, error } = await supabase
    .from('recebimento_pendentes_cache')
    .select('payload,gerado_em')
    .eq('conta_omie', contaLow(conta))
    .eq('janela_de', dataDeBR)
    .eq('janela_ate', dataAteBR)
    .maybeSingle();
  if (error) { console.warn('[receb] lerSnapshotPendentes:', error.message); return null; }
  if (!data || !data.payload) return null;
  return { payload: data.payload, geradoEm: data.gerado_em };
}

function salvarSnapshotPendentes(conta: Conta, dataDeBR: string, dataAteBR: string, payload: any): void {
  supabase
    .from('recebimento_pendentes_cache')
    .upsert(
      {
        conta_omie: contaLow(conta),
        janela_de: dataDeBR,
        janela_ate: dataAteBR,
        payload,
        duracao_ms: payload?.duracaoMs ?? null,
        gerado_em: new Date().toISOString(),
      },
      { onConflict: 'conta_omie,janela_de,janela_ate' },
    )
    .then(({ error }: any) => {
      if (error) console.warn('[receb] salvarSnapshotPendentes:', error.message);
    });
}

/**
 * Descarta os snapshots persistidos de uma conta (após dar entrada — a lista mudou).
 * AWAITED de propósito: garante que o DELETE commitou antes de a chamada retornar,
 * senão um reload (não-force) logo após o dar-entrada leria o snapshot L2 velho e a
 * NF recém-processada reapareceria na lista. Best-effort quanto a erro (só loga).
 */
export async function invalidarSnapshotPendentes(conta: Conta): Promise<void> {
  const { error } = await supabase
    .from('recebimento_pendentes_cache')
    .delete()
    .eq('conta_omie', contaLow(conta));
  if (error) console.warn('[receb] invalidarSnapshotPendentes:', error.message);
}

/** Recebimentos pendentes (com cache) + projeção de impacto no CMC. */
export async function obterRecebimentosPendentes(
  conta: Conta,
  dataDeBR: string,
  dataAteBR: string,
  force = false,
  ttlSeg?: number,
): Promise<any> {
  const chave = `pendentes:${conta}:${dataDeBR}:${dataAteBR}`;
  if (!force) {
    // L1: cache em memoria (mesmo processo, mais rapido)
    const hit = cache.get<any>(chave);
    if (hit) return { ...hit.valor, fonte: 'cache', cachedEm: hit.gravadoEm };
    // L2: snapshot persistente no Supabase (sobrevive a redeploy). Sem TTL rigido:
    // a tela mostra o horario ("cache de HH:MM") e o usuario pode "Atualizar".
    const snap = await lerSnapshotPendentes(conta, dataDeBR, dataAteBR);
    if (snap) {
      cache.set(chave, snap.payload, ttlSeg || getConfig().cacheTtlSeg);
      return { ...snap.payload, fonte: 'cache', cachedEm: snap.geradoEm };
    }
  }
  const payload = await analisarRecebimentosPendentes(conta, {
    dataDeBR,
    dataAteBR,
    onProgress: (m: string) => console.log(`[pendentes ${conta}] ${m}`),
  });
  cache.set(chave, payload, ttlSeg || getConfig().cacheTtlSeg);
  salvarSnapshotPendentes(conta, dataDeBR, dataAteBR, payload); // best-effort, nao bloqueia
  return { ...payload, fonte: 'omie' };
}

/** Item associado a um produto existente: impacto no CMC projetado (pre-entrada). */
export interface AssociadoInfo {
  nSequencia: number | string;
  idProduto: number;
  descricaoProduto?: string | null;
  cmcAtual: number | null;
  saldoAtual: number | null;
  cmcProjetado: number | null;
  impactoCMC: number | null;
  impactoPct: number | null;
  alerta: boolean;
  precoUnit?: number | null;
}

export interface DarEntradaArgs {
  conta: Conta;
  idReceb?: number | string | null;
  chaveNFe?: string | null;
  itens?: Array<{
    nSequencia: number | string;
    cAcao?: string;
    cfopEntrada?: string;
    /** id Omie do produto a associar (item que viria como "produto novo"). */
    associarIdProduto?: number | null;
    /** so p/ projetar o impacto no CMC do produto associado */
    qtde?: number | null;
    precoUnit?: number | null;
    descricaoProduto?: string | null;
  }>;
  naoGerarFinanceiro?: boolean;
  naoGerarMovEstoque?: boolean;
  codCategoria?: string | null;
  codDepartamento?: string | null;
  /** Campos financeiros de CABECALHO gravados via AlterarRecebimento (Fase 3). */
  infoAdicionais?: AlterarCabecArgs['infoAdicionais'];
  observacoes?: string | null;
  parcelas?: AlterarCabecArgs['parcelasEditar'];
  criadoPor?: string;
  userId?: string | null;   // financeiro_usu.id de quem deu entrada (log interno)
  userNome?: string | null;
  tipo?: string | null;     // tipo do recebimento (log interno)
  numeroNFe?: string | null;
}

/**
 * Passe 1 do "dar entrada": liga itens que viriam como PRODUTO NOVO a produtos ja
 * cadastrados (cAcao=ASSOCIAR-PRODUTO). Vai numa chamada SEPARADA porque o Omie
 * recusa itensAjustes (onde vai o cCFOPEntrada) quando cAcao != 'EDITAR' - o CFOP
 * desses mesmos itens vai no passe 2, junto com o resto.
 *
 * Antes de associar, projeta o impacto no CMC do produto escolhido (PosicaoEstoque
 * ainda e' a de ANTES da entrada), para a tela oferecer a correcao de custo depois:
 * associar uma peca barata a um SKU caro derruba o CMC igual a NF de garantia.
 */
async function associarProdutosExistentes(
  conta: Conta,
  idReceb: number | string | null,
  chaveNFe: string | null,
  itens: NonNullable<DarEntradaArgs['itens']>,
): Promise<{ resposta: any; associados: AssociadoInfo[] }> {
  const associados: AssociadoInfo[] = [];
  for (const it of itens) {
    const idProduto = Number(it.associarIdProduto);
    const qtde = Number(it.qtde) || 0;
    const precoUnit = Number(it.precoUnit) || 0;
    const info: AssociadoInfo = {
      nSequencia: it.nSequencia,
      idProduto,
      descricaoProduto: it.descricaoProduto ?? null,
      cmcAtual: null, saldoAtual: null, cmcProjetado: null,
      impactoCMC: null, impactoPct: null, alerta: false,
      precoUnit: precoUnit || null,
    };
    try {
      const pos = await obterPosicaoEstoqueProduto(conta, idProduto, { codigoLocalEstoque: 0 });
      const saldo = Number(pos.saldo) || 0;
      const cmc = Number(pos.cmc) || 0;
      info.saldoAtual = saldo;
      info.cmcAtual = cmc;
      if (saldo + qtde > 0 && precoUnit >= 0) {
        const proj = (saldo * cmc + qtde * precoUnit) / (saldo + qtde);
        info.cmcProjetado = proj;
        info.impactoCMC = cmc > 0 ? proj - cmc : null;
        info.impactoPct = cmc > 0 ? (proj - cmc) / cmc : null;
        info.alerta = cmc > 0 && proj < cmc * 0.97; // mesmo criterio da analise (queda > 3%)
      }
    } catch (e: any) {
      console.warn(`[receb] PosicaoEstoque prod ${idProduto}:`, e?.message);
    }
    associados.push(info);
  }

  const resposta = await alterarRecebimentoItens(conta, {
    idReceb, chaveNFe,
    itens: itens.map((it) => ({
      nSequencia: it.nSequencia,
      cAcao: 'ASSOCIAR-PRODUTO',
      nIdProdutoExistente: Number(it.associarIdProduto),
    })),
  });
  return { resposta, associados };
}

/**
 * Dá entrada (conclui) um recebimento de NF-e. SEMPRE chama AlterarRecebimento
 * quando há itens (para forçar nosso set de "custo de estoque"), depois ConcluirRecebimento.
 * Itens com `associarIdProduto` levam antes um AlterarRecebimento só de associação.
 * Portado de /api/dar-entrada-recebimento (server.js:1491).
 */
export async function darEntradaRecebimento(b: DarEntradaArgs): Promise<any> {
  const conta = b.conta;
  const idReceb = b.idReceb ?? null;
  const chaveNFe = b.chaveNFe ?? null;
  if (idReceb == null && !chaveNFe) throw new Error('informe idReceb ou chaveNFe');

  let alterado: any = null;
  const itensIn = Array.isArray(b.itens) ? b.itens : [];
  const custoEstoque = montarCustoEstoque();
  const codCategoria = b.codCategoria != null ? String(b.codCategoria) : null;
  const codDepartamento = b.codDepartamento != null ? String(b.codDepartamento) : null;

  // passe 1: associacoes (item "produto novo" -> produto ja cadastrado)
  const aAssociar = itensIn.filter((it) => Number(it.associarIdProduto) > 0);
  let associados: AssociadoInfo[] = [];
  let respAssociar: any = null;
  if (aAssociar.length > 0) {
    const r1 = await associarProdutosExistentes(conta, idReceb, chaveNFe, aAssociar);
    respAssociar = r1.resposta;
    associados = r1.associados;
  }

  // passe 2: CFOP de entrada + flags de custo de estoque (inclusive nos associados)
  if (itensIn.length > 0) {
    const itensEditar = itensIn.map((it) => ({
      nSequencia: it.nSequencia,
      // aqui so' EDITAR ou IGNORAR: a associacao ja foi feita no passe 1 e este passe
      // precisa de EDITAR para poder levar itensAjustes (CFOP).
      cAcao: String(it.cAcao || '').toUpperCase() === 'IGNORAR' ? 'IGNORAR' : 'EDITAR',
      cCFOPEntrada: it.cfopEntrada || undefined,
      cNaoGerarFinanceiro: b.naoGerarFinanceiro != null ? (b.naoGerarFinanceiro ? 'S' : 'N') : undefined,
      cNaoGerarMovEstoque: b.naoGerarMovEstoque != null ? (b.naoGerarMovEstoque ? 'S' : 'N') : undefined,
      cCodCategoria: codCategoria || undefined,
      cCodDepartamento: codDepartamento || undefined,
      custoEstoque,
    }));
    alterado = await alterarRecebimentoItens(conta, { idReceb, chaveNFe, itens: itensEditar });
  }

  // passe 3: campos de CABECALHO (categoria/conta/data, observacoes, parcelas) numa
  // chamada SEPARADA (validado: AlterarRecebimento aceita infoAdicionais/observacoes/
  // parcelasEditar sem itensRecebimentoEditar). infoAdicionais e' all-or-nothing.
  let cabecAlterado: any = null;
  if (b.infoAdicionais || b.observacoes != null || b.parcelas) {
    try {
      cabecAlterado = await alterarRecebimentoCabec(conta, {
        idReceb, chaveNFe,
        infoAdicionais: b.infoAdicionais ?? null,
        observacoes: b.observacoes ?? null,
        parcelasEditar: b.parcelas ?? null,
      });
    } catch (e: any) {
      // nao aborta a entrada por causa dos campos financeiros; propaga aviso no retorno
      cabecAlterado = { ok: false, erro: e?.message || String(e) };
    }
  }

  const r = await concluirRecebimento(conta, { idReceb, chaveNFe });
  cache.invalidatePrefix(`analise:${conta}:`);
  cache.invalidatePrefix(`pendentes:${conta}:`);
  await invalidarSnapshotPendentes(conta); // o snapshot persistido ficou desatualizado (essa NF saiu)

  supabase
    .from('cmc_sync_log')
    .insert({
      conta_omie: conta,
      fim: new Date().toISOString(),
      status: 'recebimento_concluido',
      parametros: {
        idReceb,
        chaveNFe,
        naoGerarFinanceiro: b.naoGerarFinanceiro,
        naoGerarMovEstoque: b.naoGerarMovEstoque,
        cfops: itensIn.map((i) => ({ s: i.nSequencia, c: i.cfopEntrada })),
        associacoes: aAssociar.map((i) => ({ s: i.nSequencia, idProduto: i.associarIdProduto })),
        respAssociar,
        respAlterar: alterado,
        respConcluir: r.rawResponse,
      },
    })
    .then(({ error }: any) => {
      if (error) console.warn('[cmc] cmc_sync_log:', error.message);
    });

  // log interno nosso (Supabase) da entrada
  logEntradaReceb({
    conta,
    idReceb,
    numeroNFe: b.numeroNFe ?? null,
    tipo: b.tipo ?? null,
    acao: 'dar_entrada',
    userId: b.userId ?? null,
    userNome: b.userNome ?? b.criadoPor ?? null,
    payload: {
      chaveNFe,
      naoGerarFinanceiro: b.naoGerarFinanceiro,
      naoGerarMovEstoque: b.naoGerarMovEstoque,
      cfops: itensIn.map((i) => ({ s: i.nSequencia, c: i.cfopEntrada })),
      associacoes: associados.map((a) => ({
        s: a.nSequencia, idProduto: a.idProduto, desc: a.descricaoProduto,
        cmcAtual: a.cmcAtual, cmcProjetado: a.cmcProjetado, alerta: a.alerta,
      })),
    },
    resultado: { idReceb: r.idReceb, descStatus: r.descStatus, ajustado: !!alterado, associados: associados.length, cabec: cabecAlterado },
  });

  return { ok: true, idReceb: r.idReceb, descStatus: r.descStatus, ajustado: !!alterado, associados, cabec: cabecAlterado };
}
