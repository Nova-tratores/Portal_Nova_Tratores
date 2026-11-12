/* eslint-disable @typescript-eslint/no-require-imports */
// =============================================================================
// Reconciliação dos títulos EM ABERTO do espelho (contas_pagar/receber) com a
// Omie — helpers PUROS (sem rede, sem Supabase) usados por reconciliarAbertos
// em omie-api.js. Ficam separados para serem testados no vitest.
//
// Problema que resolvem (30/09/2026): o sync só faz upsert numa janela de
// emissão, então (a) título EXCLUÍDO na Omie ficava para sempre como aberto no
// espelho e (b) título emitido antes da janela nunca era carregado/atualizado.
//
// ⚠️ Por que NÃO usamos ConsultarContaPagar/Receber título a título: a Omie
// bloqueia o método por 30 min depois de 10 respostas com ERRO por
// IP+AppKey+Método, e "Lançamento não cadastrado" É um erro — 10 excluídos
// bastaram para derrubar o ConsultarContaPagar da NOVA (e o modal da tela de
// baixa usa esse método). A detecção é por LISTAGEM da janela de emissão do
// título (mês ±1, todos os status): presente ⇒ atualiza; ausente ⇒ excluído.
// =============================================================================
const { parseBR, parseBRTimestamp, fmtBR, inicioMes, fimMes } = require('./dates');

const STATUS_ABERTO = ['A VENCER', 'ATRASADO', 'VENCE HOJE'];

/**
 * Linhas que o espelho diz abertas mas a Omie NÃO devolveu na lista "em aberto".
 * Ordena pelo synced_at mais antigo (o mais provável de estar podre) e corta no
 * teto — o restante fica para a próxima rodada.
 * @param {Array<{codigo_lancamento:number|string, synced_at?:string|null, data_emissao?:string|null}>} linhasEspelho
 * @param {Iterable<number|string>} idsOmie
 * @param {number} teto
 * @returns {{ pendentes: Array<{id:number, emissao:string|null}>, restantes: number }}
 */
function diffPendentes(linhasEspelho, idsOmie, teto = 200) {
  const abertosOmie = new Set();
  for (const id of idsOmie) abertosOmie.add(Number(id));
  const fora = [];
  const vistos = new Set();
  for (const l of linhasEspelho || []) {
    const id = Number(l.codigo_lancamento);
    if (!id || vistos.has(id) || abertosOmie.has(id)) continue;
    vistos.add(id);
    fora.push({ id, emissao: l.data_emissao ? String(l.data_emissao).slice(0, 10) : null, synced: l.synced_at ? String(l.synced_at) : '' });
  }
  fora.sort((a, b) => a.synced.localeCompare(b.synced) || a.id - b.id);
  const lim = Math.max(0, Number(teto) || 0);
  return {
    pendentes: fora.slice(0, lim).map((f) => ({ id: f.id, emissao: f.emissao })),
    restantes: Math.max(0, fora.length - lim),
  };
}

/**
 * Agrupa os pendentes por MÊS de emissão e devolve uma janela de listagem por
 * mês (mês-1 .. mês+1, em DD/MM/YYYY para a Omie) com os ids que ela precisa
 * cobrir. Pendente sem data de emissão vai em `semEmissao` (não dá para provar
 * exclusão sem janela — fica como falha, nunca é apagado).
 * @param {Array<{id:number, emissao:string|null}>} pendentes
 * @returns {{ janelas: Array<{mes:string, de:string, ate:string, ids:number[]}>, semEmissao: number[] }}
 */
function janelasPorEmissao(pendentes) {
  const porMes = new Map();
  const semEmissao = [];
  for (const p of pendentes || []) {
    const m = p.emissao && /^\d{4}-\d{2}/.test(p.emissao) ? p.emissao.slice(0, 7) : null;
    if (!m) { semEmissao.push(p.id); continue; }
    if (!porMes.has(m)) porMes.set(m, []);
    porMes.get(m).push(p.id);
  }
  const janelas = Array.from(porMes.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([mes, ids]) => {
    const [ano, mm] = mes.split('-').map((n) => parseInt(n, 10));
    return { mes, de: fmtBR(inicioMes(ano, mm - 1)), ate: fmtBR(fimMes(ano, mm + 1)), ids };
  });
  return { janelas, semEmissao };
}

/** Bloqueio longo da Omie (30 min por método). Ao ver isto, PARAR de chamar. */
function ehBloqueioOmie(msg) {
  return /api bloqueada|consumo indevido/i.test(String(msg || ''));
}

/** "Não existem registros" para a janela — vazio legítimo, não é bloqueio. */
function ehListaVazia(msg) {
  return /n[aã]o\s+existem\s+registros|n[aã]o.*registros/i.test(String(msg || ''));
}

/**
 * Patch para o espelho a partir de um título devolvido pela LISTAGEM da Omie
 * (mesmo formato do ListarContas*): só os campos presentes — nunca zera
 * numero_documento/nome; a linha inteira fica.
 * @param {any} t
 * @param {string} [agoraISO]
 */
function patchDeTitulo(t, agoraISO) {
  const info = (t && t.info) || {};
  const patch = { synced_at: agoraISO || new Date().toISOString(), raw: t };
  if (t.status_titulo) patch.status_titulo = t.status_titulo;
  if (t.valor_pago != null) patch.valor_pago = parseFloat(t.valor_pago) || 0;
  if (t.valor_documento != null) patch.valor_documento = parseFloat(t.valor_documento) || 0;
  if (t.data_pagamento) patch.data_pagamento = parseBR(t.data_pagamento);
  if (t.data_previsao) patch.data_previsao = parseBR(t.data_previsao);
  if (t.data_vencimento) patch.data_vencimento = parseBR(t.data_vencimento);
  if (t.data_emissao) patch.data_emissao = parseBR(t.data_emissao);
  if (info.dAlt) patch.data_alteracao = parseBRTimestamp(`${info.dAlt} ${info.hAlt || '00:00:00'}`);
  if (info.uAlt) patch.alterado_por = info.uAlt;
  return patch;
}

/**
 * Decide o que fazer com cada pendente de uma janela já listada.
 * @param {number[]} ids ids que a janela devia cobrir
 * @param {Map<number, any>} encontrados codigo_lancamento -> título (de QUALQUER janela listada)
 * @param {boolean} janelaCompleta false se a listagem falhou no meio (não dá para provar ausência)
 * @returns {{ atualizar: Array<{id:number, titulo:any}>, excluir: number[], indefinidos: number[] }}
 */
function decidirPendentes(ids, encontrados, janelaCompleta) {
  const atualizar = [];
  const excluir = [];
  const indefinidos = [];
  for (const id of ids) {
    const t = encontrados.get(Number(id));
    if (t) atualizar.push({ id: Number(id), titulo: t });
    else if (janelaCompleta) excluir.push(Number(id));
    else indefinidos.push(Number(id));
  }
  return { atualizar, excluir, indefinidos };
}

/**
 * Excluídos de QUALQUER status (12/11/2026): o sync completo lista a janela de
 * emissão inteira com todos os status. Linha do espelho com emissão DENTRO da
 * janela que a Omie não devolveu é candidata a excluída — inclusive título já
 * PAGO, que a reconciliação dos abertos nunca alcança (caso real: 9 títulos
 * pagos da NOVA excluídos na Omie em 2026 seguiam somando nas despesas do DRE).
 * Margem nas bordas da janela: título cuja emissão foi alterada para fora dela
 * some da lista sem ter sido excluído. A confirmação (listagem do mês) é de quem
 * chama; esta função só aponta os candidatos.
 * @param {Array<{codigo_lancamento:number|string, data_emissao?:string|null, synced_at?:string|null}>} linhasEspelho
 * @param {Set<number>} vistosOmie ids devolvidos pela listagem completa
 * @param {string} deISO início da janela de emissão (YYYY-MM-DD)
 * @param {string} ateISO fim da janela de emissão (YYYY-MM-DD)
 * @param {number} [margemDias]
 * @returns {Array<{id:number, emissao:string}>}
 */
function candidatosExcluidos(linhasEspelho, vistosOmie, deISO, ateISO, margemDias = 35) {
  const soma = (iso, dias) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10); };
  const de = soma(deISO, margemDias);
  const ate = soma(ateISO, -margemDias);
  const out = [];
  const vistos = new Set();
  for (const l of linhasEspelho || []) {
    const id = Number(l.codigo_lancamento);
    const em = l.data_emissao ? String(l.data_emissao).slice(0, 10) : null;
    if (!id || !em || vistos.has(id) || vistosOmie.has(id)) continue;
    if (em < de || em > ate) continue;
    vistos.add(id);
    out.push({ id, emissao: em });
  }
  return out;
}

/**
 * Freio: muitos candidatos de uma vez cheira a listagem incompleta (página que a
 * Omie pulou, filtro errado), não a exclusões reais — não apaga nada.
 */
function excluidosSuspeitos(nCandidatos, nListados) {
  return nCandidatos > Math.max(30, Math.round(0.02 * (nListados || 0)));
}

module.exports = { STATUS_ABERTO, diffPendentes, janelasPorEmissao, ehBloqueioOmie, ehListaVazia, patchDeTitulo, decidirPendentes, candidatosExcluidos, excluidosSuspeitos };
