// =============================================================================
// Robos de monitoramento de qualidade de dados (Omie -> Supabase)
// =============================================================================
// Cada robo valida UM modulo lendo o que JA esta sincronizado no Supabase
// (sem gastar quota da API Omie). Grava anomalias em qa_anomalias (idempotente
// via upsert) e auto-resolve as que sairam da varredura (corrigidas no Omie).
//
// IMPORTANTE - calibragem das regras (medido em 2026-05-29, ano 2026):
//   vendas_itens : nome_cliente e departamento sao 100% NULL (artefato do sync
//                  do Visual Estoque, NAO erro de lancamento) -> nao viram regra.
//                  Sinais reais: cmc_unitario null (~14%) e valor<=0.
//   notas_entrada: categoria ~97% null e nome_emitente 100% null (esparsos no
//                  sync) -> nao viram regra. Sinal confiavel: valor_nf<=0.
//   contas_pagar : nome_fornecedor null e raro (sinal forte). departamento null
//                  em ~59% (opcional p/ muitos titulos) -> severidade baixa.
// Muitas regras disparam 0 hoje de proposito: funcionam como "seguro" e pegam
// o erro no dia em que alguem esquecer de preencher.
// =============================================================================

const { supabaseAdmin: supabase } = require('./supabase');
const { labelConta, getContasOmie, EMPRESAS_GRUPO_CNPJ, cnpjOutraEmpresa } = require('./omie-api');

const JANELA_DIAS = parseInt(process.env.MONITOR_JANELA_DIAS || '90', 10);
// CMC nao fica disponivel imediatamente (enriquecimento roda 03:00 e e rate-limited);
// so flagamos custo ausente em vendas mais antigas que esse "periodo de graca".
const CMC_GRACE_DIAS = parseInt(process.env.MONITOR_CMC_GRACE_DIAS || '7', 10);

// Outliers: "valores/categorias que fogem do padrao historico". O baseline
// (referencia historica) usa uma janela maior que a de varredura.
const BASELINE_MESES = parseInt(process.env.MONITOR_BASELINE_MESES || '18', 10);
// Minimo de amostras historicas no grupo p/ confiar na estatistica.
const MIN_AMOSTRA = parseInt(process.env.MONITOR_MIN_AMOSTRA || '8', 10);
// Limiar do z-score robusto (Iglewicz-Hoaglin); 3.5 = bem fora do comum.
const Z_LIMIAR = parseFloat(process.env.MONITOR_Z_LIMIAR || '3.5');

const MODULOS = ['contas_pagar', 'contas_receber', 'faturamento', 'compras'];

const MODULO_LABEL = {
  contas_pagar: 'Contas a Pagar',
  contas_receber: 'Contas a Receber',
  faturamento: 'Faturamento / Vendas',
  compras: 'Compras / Notas de Entrada'
};

// Estado em memoria por (modulo:conta), espelha syncState/CMC_HISTORICO_STATE.
const monitorState = {};
function getState(modulo, conta) {
  const key = `${modulo}:${conta}`;
  if (!monitorState[key]) {
    monitorState[key] = {
      modulo, conta, rodando: false, inicio: null, fim: null,
      verificados: 0, novas: 0, resolvidas: 0, abertas: 0, erro: null
    };
  }
  return monitorState[key];
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
function isVazio(v) {
  return v === null || v === undefined || String(v).trim() === '';
}

// Datas: contas_* usam ISO (yyyy-mm-dd); vendas_itens/notas_entrada usam BR (dd/mm/yyyy).
function parseBRtoDate(s) {
  if (!s) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s).trim());
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return isNaN(d.getTime()) ? null : d;
}
function toISODate(d) {
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Pagina manualmente alem do limite de 1000 do Supabase REST (= selectPaginado do server).
async function selectPaginado(builderFn) {
  const PAGE = 1000;
  let from = 0, all = [];
  while (true) {
    const { data, error } = await builderFn().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// --- Estatistica robusta para outliers (mediana + MAD) ---
function mediana(arr) {
  if (!arr.length) return null;
  const a = arr.slice().sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}
// Constroi o "modelo" historico de um grupo de valores positivos.
function modeloGrupo(valores) {
  const v = valores.filter(x => x != null && isFinite(x) && x > 0);
  if (v.length < MIN_AMOSTRA) return null;
  const med = mediana(v);
  const mad = mediana(v.map(x => Math.abs(x - med)));
  return { n: v.length, med, mad };
}
// Testa se x e outlier vs o modelo. Retorna {z, lado} ou null.
function testarOutlier(x, modelo) {
  if (!modelo || x == null || !isFinite(x) || x <= 0) return null;
  const { med, mad } = modelo;
  if (mad > 0) {
    const z = 0.6745 * (x - med) / mad; // z-score robusto
    if (Math.abs(z) >= Z_LIMIAR) return { z: Number(z.toFixed(1)), med, lado: x > med ? 'acima' : 'abaixo' };
    return null;
  }
  // mad == 0 (historico ~constante): usa teste de razao p/ pegar casos grosseiros.
  if (med > 0 && (x > med * 3 || x < med / 3)) {
    return { z: null, med, lado: x > med ? 'acima' : 'abaixo', razao: Number((x / med).toFixed(1)) };
  }
  return null;
}

function anom(regra, severidade, registro_id, registro_ref, data_ref, valor, detalhe) {
  return {
    regra, severidade,
    registro_id: String(registro_id),
    registro_ref: registro_ref != null ? String(registro_ref) : null,
    data_ref: data_ref || null,
    valor: (valor === null || valor === undefined) ? null : Number(valor),
    detalhe: detalhe || null
  };
}

// -----------------------------------------------------------------------------
// Detectores por modulo. Cada um retorna a lista de anomalias ATUAIS.
// -----------------------------------------------------------------------------

// contas_pagar / contas_receber (dados ricos, vindos direto da Omie)
async function detectarContas(modulo, contaLabel, cutoffISO, baselineISO) {
  const tabela = modulo; // 'contas_pagar' | 'contas_receber'
  const colNome = modulo === 'contas_pagar' ? 'nome_fornecedor' : 'nome_cliente';
  const regraNome = modulo === 'contas_pagar' ? 'sem_fornecedor' : 'sem_cliente';

  // Baseline historico (>= baselineISO) p/ modelar o padrao por categoria e as
  // combinacoes contraparte<->categoria ja vistas. Cobre tambem a janela.
  const baseline = await selectPaginado(() => supabase.from(tabela)
    .select(`codigo_lancamento,numero_documento,data_emissao,valor_documento,descricao_categoria,codigo_categoria,grupo_categoria,codigo_departamento,codigo_cliente_fornecedor,${colNome}`)
    .eq('conta_omie', contaLabel)
    .gte('data_emissao', baselineISO)
    .order('id', { ascending: true }));

  // Modela valor por categoria + registra pares (contraparte|categoria) historicos
  // usando SO o que e anterior a janela de varredura (senao o proprio registro
  // recem-lancado "valida" a si mesmo como ja-visto).
  const valoresPorCat = {};
  const paresHist = new Set();
  const contrapartesHist = new Set();
  for (const r of baseline) {
    const cat = r.codigo_categoria || r.descricao_categoria || null;
    if (r.data_emissao < cutoffISO) {
      if (cat && Number(r.valor_documento) > 0) (valoresPorCat[cat] = valoresPorCat[cat] || []).push(Number(r.valor_documento));
      if (r.codigo_cliente_fornecedor != null) {
        contrapartesHist.add(String(r.codigo_cliente_fornecedor));
        if (cat) paresHist.add(`${r.codigo_cliente_fornecedor}|${cat}`);
      }
    }
  }
  const modeloPorCat = {};
  for (const cat of Object.keys(valoresPorCat)) modeloPorCat[cat] = modeloGrupo(valoresPorCat[cat]);

  const out = [];
  for (const r of baseline) {
    if (r.data_emissao < cutoffISO) continue; // so a janela de varredura vira anomalia
    const id = r.codigo_lancamento;
    if (id == null) continue;
    const ref = r.numero_documento || r[colNome] || null;
    const dref = r.data_emissao || null;
    const val = r.valor_documento;
    const cat = r.codigo_categoria || r.descricao_categoria || null;
    const catNome = r.descricao_categoria || r.codigo_categoria || null;

    // Completude
    if (Number(r.valor_documento) <= 0) out.push(anom('valor_zerado', 'alta', id, ref, dref, val));
    if (isVazio(r[colNome]))            out.push(anom(regraNome, 'alta', id, ref, dref, val));
    if (isVazio(r.descricao_categoria) && isVazio(r.codigo_categoria))
      out.push(anom('sem_categoria', 'alta', id, ref, dref, val));
    if (isVazio(r.grupo_categoria))     out.push(anom('sem_grupo_categoria', 'media', id, ref, dref, val));
    if (isVazio(r.codigo_departamento)) out.push(anom('sem_departamento', 'baixa', id, ref, dref, val));

    // Outliers vs historico
    const o = cat ? testarOutlier(Number(val), modeloPorCat[cat]) : null;
    if (o) out.push(anom('valor_atipico', 'media', id, ref, dref, val,
      { categoria: catNome, mediana_categoria: o.med, z: o.z, razao: o.razao, lado: o.lado }));

    // Categoria atipica: fornecedor conhecido classificado numa categoria nunca
    // vista com ele (possivel erro de classificacao). So p/ contas_pagar - em
    // receber as categorias de receita variam legitimamente por cliente.
    const codCp = r.codigo_cliente_fornecedor;
    if (modulo === 'contas_pagar' && codCp != null && cat && contrapartesHist.has(String(codCp)) && !paresHist.has(`${codCp}|${cat}`))
      out.push(anom('categoria_atipica', 'baixa', id, ref, dref, val,
        { categoria: catNome, contraparte: r[colNome] || String(codCp) }));
  }
  return out;
}

// faturamento (vendas_itens, vindo do Visual Estoque)
async function detectarFaturamento(contaSlug, contaLabel, cutoff, cutoffISO, baselineDate) {
  const baselineYear = baselineDate.getFullYear();
  const rows = await selectPaginado(() => supabase.from('vendas_itens')
    .select('id,numero_pedido,data_pedido,valor_total,valor_unitario,codigo_produto,codigo_categoria,codigo_cliente,cmc_unitario,descricao')
    .eq('conta_omie', contaLabel)
    .gte('ano', baselineYear)
    .order('id', { ascending: true }));

  // Exclusoes: pedidos invalidos (cancelados/devolvidos) e intercompany REAL.
  const invalidos = new Set((await selectPaginado(() => supabase.from('vendas_pedidos_invalidos')
    .select('numero_pedido').eq('conta_omie', contaLabel))).map(r => String(r.numero_pedido)));
  // Intercompany = cliente cujo cnpj_norm e o CNPJ da OUTRA empresa do grupo
  // (mesmo criterio do /api/dre-competencia, server.js:2502). NAO usar a view
  // clientes_intercompany: ela lista clientes presentes nas 2 contas (externos
  // comuns), nao as transacoes NOVA<->CASTRO.
  const intercompany = new Set();
  try {
    const cnpjOutra = cnpjOutraEmpresa(contaSlug);
    if (cnpjOutra) {
      // conta_omie em `clientes` e minusculo ('nova'/'castro'); o codigo e
      // especifico do namespace da conta, entao filtramos por ambos.
      const clientesInter = await selectPaginado(() => supabase.from('clientes')
        .select('codigo_cliente_omie,cnpj_norm,conta_omie')
        .eq('cnpj_norm', cnpjOutra).eq('conta_omie', contaSlug));
      clientesInter.forEach(c => { if (c.codigo_cliente_omie != null) intercompany.add(String(c.codigo_cliente_omie)); });
    }
  } catch (_) { /* tabela clientes pode nao estar sincronizada ainda */ }

  // Modela preco unitario por produto, usando vendas anteriores a janela e
  // pulando pedidos invalidos / intercompany.
  const precoPorProduto = {};
  for (const r of rows) {
    const d = parseBRtoDate(r.data_pedido);
    if (!d || d >= cutoff) continue; // so historico anterior a janela
    if (r.numero_pedido != null && invalidos.has(String(r.numero_pedido))) continue;
    if (r.codigo_cliente != null && intercompany.has(String(r.codigo_cliente))) continue;
    if (r.codigo_produto != null && Number(r.valor_unitario) > 0)
      (precoPorProduto[r.codigo_produto] = precoPorProduto[r.codigo_produto] || []).push(Number(r.valor_unitario));
  }
  const modeloPreco = {};
  for (const k of Object.keys(precoPorProduto)) modeloPreco[k] = modeloGrupo(precoPorProduto[k]);

  const graceLimite = new Date(Date.now() - CMC_GRACE_DIAS * 86400000);
  const out = [];
  for (const r of rows) {
    const d = parseBRtoDate(r.data_pedido);
    if (!d || d < cutoff) continue;
    if (r.numero_pedido != null && invalidos.has(String(r.numero_pedido))) continue;
    if (r.codigo_cliente != null && intercompany.has(String(r.codigo_cliente))) continue;

    const id = r.id;
    const ref = r.numero_pedido ? `Pedido ${r.numero_pedido}` : (r.descricao || null);
    const dref = toISODate(d);
    const val = r.valor_total;

    if (Number(r.valor_total) <= 0)      out.push(anom('valor_zerado', 'alta', id, ref, dref, val, { descricao: r.descricao }));
    if (isVazio(r.codigo_cliente))       out.push(anom('sem_cliente', 'alta', id, ref, dref, val, { descricao: r.descricao }));
    if (isVazio(r.codigo_categoria))     out.push(anom('sem_categoria', 'media', id, ref, dref, val, { descricao: r.descricao }));
    if ((r.cmc_unitario == null || Number(r.cmc_unitario) <= 0) && d < graceLimite)
      out.push(anom('custo_ausente', 'media', id, ref, dref, val, { descricao: r.descricao }));

    // Outlier: preco unitario fora do padrao historico do produto
    const o = r.codigo_produto != null ? testarOutlier(Number(r.valor_unitario), modeloPreco[r.codigo_produto]) : null;
    if (o) out.push(anom('preco_atipico', 'media', id, ref, dref, val,
      { descricao: r.descricao, preco_unitario: Number(r.valor_unitario), preco_tipico: o.med, z: o.z, razao: o.razao, lado: o.lado }));
  }
  return out;
}

// compras (notas_entrada, vindo do Visual Estoque) - schema fino
async function detectarCompras(contaLabel, cutoff, cutoffISO, baselineDate) {
  const baselineYear = baselineDate.getFullYear();
  const rows = await selectPaginado(() => supabase.from('notas_entrada')
    .select('id,numero_nf,data_emissao,valor_nf,valor_produtos,cancelada,categoria')
    .eq('conta_omie', contaLabel)
    .gte('ano', baselineYear)
    .order('id', { ascending: true }));

  // Modela valor_nf por categoria (anterior a janela; ignora canceladas).
  const valoresPorCat = {};
  for (const r of rows) {
    if (String(r.cancelada || '').toUpperCase() === 'S') continue;
    const d = parseBRtoDate(r.data_emissao);
    if (!d || d >= cutoff) continue;
    if (r.categoria && Number(r.valor_nf) > 0) (valoresPorCat[r.categoria] = valoresPorCat[r.categoria] || []).push(Number(r.valor_nf));
  }
  const modeloPorCat = {};
  for (const c of Object.keys(valoresPorCat)) modeloPorCat[c] = modeloGrupo(valoresPorCat[c]);

  const out = [];
  for (const r of rows) {
    if (String(r.cancelada || '').toUpperCase() === 'S') continue;
    const d = parseBRtoDate(r.data_emissao);
    if (!d || d < cutoff) continue;

    const id = r.id;
    const ref = r.numero_nf ? `NF ${r.numero_nf}` : null;
    const dref = toISODate(d);
    const val = r.valor_nf;

    if (Number(r.valor_nf) <= 0) out.push(anom('valor_zerado', 'alta', id, ref, dref, val));
    else if (r.valor_produtos == null || Number(r.valor_produtos) <= 0)
      out.push(anom('sem_valor_produtos', 'media', id, ref, dref, val));

    const o = r.categoria ? testarOutlier(Number(r.valor_nf), modeloPorCat[r.categoria]) : null;
    if (o) out.push(anom('valor_atipico', 'media', id, ref, dref, val,
      { categoria: r.categoria, mediana_categoria: o.med, z: o.z, razao: o.razao, lado: o.lado }));
  }
  return out;
}

// -----------------------------------------------------------------------------
// Orquestracao
// -----------------------------------------------------------------------------
async function runMonitor(modulo, conta) {
  if (!MODULOS.includes(modulo)) return { ok: false, mensagem: `modulo invalido: ${modulo}` };
  if (!supabase) return { ok: false, mensagem: 'Supabase nao configurado' };
  const contaLabel = labelConta(conta);
  const s = getState(modulo, conta);
  if (s.rodando) return { ok: false, mensagem: 'monitor ja em andamento' };

  s.rodando = true; s.erro = null; s.fim = null;
  s.inicio = new Date().toISOString();
  s.verificados = 0; s.novas = 0; s.resolvidas = 0;

  const cutoff = new Date(Date.now() - JANELA_DIAS * 86400000);
  const cutoffISO = toISODate(cutoff);
  const baselineDate = new Date(Date.now() - BASELINE_MESES * 30 * 86400000);
  const baselineISO = toISODate(baselineDate);
  const nowISO = new Date().toISOString();

  let logId = null;
  try {
    const { data: log } = await supabase.from('qa_monitor_log').insert({
      modulo, conta_omie: contaLabel, status: 'em_andamento'
    }).select('id').single();
    logId = log?.id;

    // 1. Detecta anomalias atuais na janela
    let detected;
    if (modulo === 'faturamento') detected = await detectarFaturamento(String(conta).toLowerCase(), contaLabel, cutoff, cutoffISO, baselineDate);
    else if (modulo === 'compras') detected = await detectarCompras(contaLabel, cutoff, cutoffISO, baselineDate);
    else detected = await detectarContas(modulo, contaLabel, cutoffISO, baselineISO);

    const chave = a => `${a.regra}|${a.registro_id}`;
    const detectedKeys = new Set(detected.map(chave));

    // 2. Carrega estado atual no banco: abertas (p/ contar novas/resolver) e ignoradas (p/ respeitar).
    const existentes = await selectPaginado(() => supabase.from('qa_anomalias')
      .select('id,regra,registro_id,status,data_ref')
      .eq('modulo', modulo).eq('conta_omie', contaLabel)
      .in('status', ['aberta', 'ignorada']));
    const abertasKeys = new Set(existentes.filter(e => e.status === 'aberta').map(e => `${e.regra}|${e.registro_id}`));
    const ignoradasKeys = new Set(existentes.filter(e => e.status === 'ignorada').map(e => `${e.regra}|${e.registro_id}`));

    // 3. Upsert das detectadas (exceto as marcadas como ignorada pelo usuario).
    //    Omitimos detectado_em: no insert pega o DEFAULT now(); no update preserva o original.
    const toUpsert = detected
      .filter(a => !ignoradasKeys.has(chave(a)))
      .map(a => ({
        modulo, conta_omie: contaLabel,
        regra: a.regra, severidade: a.severidade,
        registro_id: a.registro_id, registro_ref: a.registro_ref,
        data_ref: a.data_ref, valor: a.valor, detalhe: a.detalhe,
        status: 'aberta', resolvido_em: null
      }));
    let novas = 0;
    for (let i = 0; i < toUpsert.length; i += 500) {
      const lote = toUpsert.slice(i, i + 500);
      const { error } = await supabase.from('qa_anomalias')
        .upsert(lote, { onConflict: 'modulo,conta_omie,regra,registro_id' });
      if (error) throw new Error(`upsert qa_anomalias: ${error.message}`);
    }
    novas = toUpsert.filter(a => !abertasKeys.has(`${a.regra}|${a.registro_id}`)).length;

    // 4. Auto-resolve: abertas dentro da janela que nao apareceram na varredura.
    const paraResolver = existentes
      .filter(e => e.status === 'aberta' && e.data_ref && e.data_ref >= cutoffISO && !detectedKeys.has(`${e.regra}|${e.registro_id}`))
      .map(e => e.id);
    let resolvidas = 0;
    for (let i = 0; i < paraResolver.length; i += 500) {
      const lote = paraResolver.slice(i, i + 500);
      const { error } = await supabase.from('qa_anomalias')
        .update({ status: 'resolvida', resolvido_em: nowISO }).in('id', lote);
      if (error) throw new Error(`auto-resolve: ${error.message}`);
      resolvidas += lote.length;
    }

    // 5. Total de abertas agora (p/ exibir)
    const { count: abertasTotal } = await supabase.from('qa_anomalias')
      .select('*', { count: 'exact', head: true })
      .eq('modulo', modulo).eq('conta_omie', contaLabel).eq('status', 'aberta');

    s.verificados = detected.length;
    s.novas = novas; s.resolvidas = resolvidas; s.abertas = abertasTotal || 0;
    s.fim = new Date().toISOString();
    if (logId) {
      await supabase.from('qa_monitor_log').update({
        status: 'ok', fim: s.fim,
        verificados: detected.length, anomalias_novas: novas,
        anomalias_resolvidas: resolvidas, abertas_total: abertasTotal || 0
      }).eq('id', logId);
    }
    console.log(`[monitor ${modulo} ${conta}] ok - detectadas=${detected.length} novas=${novas} resolvidas=${resolvidas} abertas=${abertasTotal || 0}`);
    return { ok: true, modulo, conta, detectadas: detected.length, novas, resolvidas, abertas: abertasTotal || 0 };
  } catch (e) {
    console.error(`[monitor ${modulo} ${conta}] erro: ${e.message}`);
    s.erro = e.message; s.fim = new Date().toISOString();
    if (logId) {
      await supabase.from('qa_monitor_log').update({ status: 'erro', fim: s.fim, erro: e.message }).eq('id', logId);
    }
    return { ok: false, modulo, conta, mensagem: e.message };
  } finally {
    s.rodando = false;
  }
}

// Roda todos os modulos x todas as contas em sequencia (sao reads no Supabase).
async function runTodos() {
  const contas = getContasOmie();
  const resultados = [];
  for (const c of contas) {
    for (const modulo of MODULOS) {
      resultados.push(await runMonitor(modulo, c.id));
    }
  }
  return resultados;
}

// Detectores expostos para testes/dry-run (sao read-only, nao gravam nada).
async function dryRun(modulo, conta) {
  const contaLabel = labelConta(conta);
  const cutoff = new Date(Date.now() - JANELA_DIAS * 86400000);
  const cutoffISO = toISODate(cutoff);
  const baselineDate = new Date(Date.now() - BASELINE_MESES * 30 * 86400000);
  const baselineISO = toISODate(baselineDate);
  if (modulo === 'faturamento') return detectarFaturamento(String(conta).toLowerCase(), contaLabel, cutoff, cutoffISO, baselineDate);
  if (modulo === 'compras') return detectarCompras(contaLabel, cutoff, cutoffISO, baselineDate);
  return detectarContas(modulo, contaLabel, cutoffISO, baselineISO);
}

module.exports = {
  runMonitor, runTodos, getState, monitorState, dryRun,
  MODULOS, MODULO_LABEL, JANELA_DIAS, CMC_GRACE_DIAS
};
