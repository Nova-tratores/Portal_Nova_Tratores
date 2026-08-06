// =============================================================================
// calc.js - Logica de negocio do modulo DRE Financeiro (port FIEL do server.js)
//
// Este arquivo concentra TODAS as funcoes de calculo / agregacao que moravam no
// server.js do dashboard externo (financeiro-omie-dashboard). O bootstrap do
// Express, as rotas (app.get/post/...), os crons e os helpers que dependiam de
// req/res (pegaConta/pegaTipo) NAO foram trazidos: as rotas Next reimplementam
// pegaConta/pegaTipo inline e chamam estas funcoes puras.
//
// A logica foi copiada VERBATIM do server.js - nada de regra de negocio foi
// inventado ou alterado. Os require do topo espelham os do server.js, apontando
// para a lib ja portada nesta mesma pasta.
//
// SEGURANCA: SOMENTE server-side (usa service key do Supabase + segredos Omie via
// omie-api). NUNCA importar em componente client/tela.
// =============================================================================

const { supabaseAdmin: supabase } = require('./supabase');
const {
  getContasOmie, labelConta, fmtBR,
  EMPRESAS_GRUPO_CNPJ, cnpjOutraEmpresa, consultarDREPorPeriodo, computeResumoDRE,
  omieRequest
} = require('./omie-api');
const {
  parseBR, fmtISO, hoje, addDias, inicioMes, fimMes, statusDerivado
} = require('./dates');

// Configuracao de defaults de conta/tipo (server.js:25-26). As rotas Next
// reimplementam pegaConta/pegaTipo inline, mas precisam dos mesmos defaults.
const CONTA_PADRAO = (process.env.CONTA_PADRAO || 'nova').toLowerCase();
const TIPO_PADRAO = (process.env.TIPO_PADRAO || 'pagar').toLowerCase();

const MESES = ['Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
                'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// =============================================================================
// Helpers
// =============================================================================
const TIPOS_VALIDOS = new Set(['pagar', 'receber', 'ambos']);

// Titulos manualmente ocultados da tela /vencidos (por codigo_lancamento, ID
// estavel do Omie). Usado para esconder lancamentos pontuais que distorcem a
// inadimplencia (ex.: NF de R$ 360k que o financeiro pediu para ignorar).
// 2485828573 = PEDRO LUIS STUANI E OUTRO, NF 000000367/1, NOVA, venc 2026-03-27.
const VENCIDOS_IGNORADOS = new Set([2485828573]);

function tabelaPorTipo(tipo) {
  return tipo === 'receber' ? 'contas_receber' : 'contas_pagar';
}

function colunaNomePorTipo(tipo) {
  return tipo === 'receber' ? 'nome_cliente' : 'nome_fornecedor';
}

function aplicarConta(query, conta) {
  if (conta === 'todas') return query;
  return query.eq('conta_omie', labelConta(conta));
}

function aplicarFiltrosExtras(query, q) {
  if (q.fornecedor) query = query.eq('codigo_cliente_fornecedor', parseInt(q.fornecedor, 10));
  if (q.categoria) query = query.eq('codigo_categoria', String(q.categoria));
  if (q.departamento) query = query.eq('codigo_departamento', String(q.departamento));
  if (q.grupo) query = query.eq('grupo_categoria', String(q.grupo));
  return query;
}

function filtraPorStatus(rows, status) {
  if (!status) return rows;
  const ref = hoje();
  return rows.filter(r => statusDerivado(r, ref) === status);
}

// Esconde "vencidos antigos": titulos vencidos (VENCIDO) cujo vencimento e
// anterior ao ano corrente. Usado nas visoes do /calendario para limpar o lixo
// de anos passados (2023-25) - inclui PAGO/RECEBIDO com valor_pago=0 que o
// statusDerivado classifica como VENCIDO. No-op para periodos do ano corrente.
function escondeVencidoAntigo(rows, ref) {
  const cutoff = `${new Date().getFullYear()}-01-01`;
  return rows.filter(r =>
    !(r.data_vencimento && r.data_vencimento < cutoff && statusDerivado(r, ref) === 'VENCIDO'));
}

// Busca uma tabela (pagar OU receber) com filtros aplicados
async function buscaTitulosBase(tipo, conta, ini, fim, q) {
  const tabela = tabelaPorTipo(tipo);
  const colNome = colunaNomePorTipo(tipo);
  // O PostgREST limita a resposta a 1000 linhas (max-rows do servidor), entao
  // o .limit(10000) sozinho NAO basta: consultas anuais (3000+ titulos) eram
  // truncadas, fazendo a visao Ano divergir da visao Mes. Paginamos com range()
  // e order() estavel ate esgotar as linhas.
  const PAGINA = 1000;
  let de = 0;
  const todos = [];
  for (;;) {
    let query = supabase.from(tabela)
      .select(`codigo_lancamento,data_vencimento,data_pagamento,valor_documento,valor_pago,status_titulo,${colNome}`)
      .gte('data_vencimento', ini)
      .lte('data_vencimento', fim)
      .order('codigo_lancamento', { ascending: true })
      .range(de, de + PAGINA - 1);
    query = aplicarConta(query, conta);
    query = aplicarFiltrosExtras(query, q);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const lote = data || [];
    todos.push(...lote);
    if (lote.length < PAGINA) break;
    de += PAGINA;
  }
  // Normaliza para "nome" para uso a jusante
  return todos.map(r => ({ ...r, _tipo: tipo, _nome: r[colNome] || null }));
}

// =============================================================================
// Dashboard Home: agrega 6 KPIs principais (cache em memoria 5min).
// Reusa calcularPatrimonio, calcularCicloCaixa, calcularDREConsolidada,
// calcularCapitalParado. Aderencia e vencimentos: query direta otimizada.
// =============================================================================
const _homeKpisCache = { data: null, ts: 0, periodo: null };
const HOME_TTL_MS = 5 * 60 * 1000;

async function calcularKpisHome(conta) {
  const now = new Date();
  const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const mesAnterior = (() => {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();
  const hojeStr = fmtISO(now);
  const sete = fmtISO(addDias(now, 7));

  const [patrimonio, ciclo, dreAtual, dreAnt, capitalNova, capitalCastro,
         aReceberJa, aPagarJa] = await Promise.all([
    calcularPatrimonio(conta).catch(e => { console.error('home patrimonio:', e.message); return null; }),
    calcularCicloCaixa(12).catch(e => { console.error('home ciclo:', e.message); return null; }),
    calcularDREConsolidada(mesAtual, mesAtual, '1', false).catch(e => { console.error('home dre atual:', e.message); return null; }),
    calcularDREConsolidada(mesAnterior, mesAnterior, '1', false).catch(e => { console.error('home dre ant:', e.message); return null; }),
    calcularCapitalParado('nova',   180, 1, '').catch(e => { console.error('home capital nova:', e.message); return null; }),
    calcularCapitalParado('castro', 180, 1, '').catch(e => { console.error('home capital castro:', e.message); return null; }),
    supabase.from('contas_receber')
      .select('valor_documento,valor_pago')
      .neq('status_titulo', 'PAGO').neq('status_titulo', 'RECEBIDO')
      .neq('status_titulo', 'LIQUIDADO').neq('status_titulo', 'CANCELADO')
      .gte('data_vencimento', hojeStr).lte('data_vencimento', sete).limit(50000)
      .then(r => (r.data || []).reduce((s, x) => s + (Number(x.valor_documento || 0) - Number(x.valor_pago || 0)), 0))
      .catch(e => { console.error('home areceber:', e.message); return 0; }),
    supabase.from('contas_pagar')
      .select('valor_documento,valor_pago')
      .neq('status_titulo', 'PAGO').neq('status_titulo', 'LIQUIDADO').neq('status_titulo', 'CANCELADO')
      .gte('data_vencimento', hojeStr).lte('data_vencimento', sete).limit(50000)
      .then(r => (r.data || []).reduce((s, x) => s + (Number(x.valor_documento || 0) - Number(x.valor_pago || 0)), 0))
      .catch(e => { console.error('home apagar:', e.message); return 0; })
  ]);

  // Aderencia rodada DEPOIS - evita estourar statement_timeout do Postgres
  // quando muitas queries pesadas correm em paralelo (Supabase free tier).
  let aderencia30 = null;
  try {
    const refA = hoje();
    const ateA = fmtISO(refA);
    const deA  = fmtISO(addDias(refA, -30));
    const { data, error } = await supabase.from('contas_pagar')
      .select('data_vencimento,data_pagamento,status_titulo')
      .gte('data_pagamento', deA).lte('data_pagamento', ateA)
      .neq('status_titulo', 'CANCELADO').limit(50000);
    if (error) console.error('home aderencia query:', error.message);
    else {
      const pagos = (data || []).filter(r => r.data_pagamento);
      if (pagos.length > 0) {
        const noPrazo = pagos.filter(r => r.data_pagamento <= r.data_vencimento).length;
        aderencia30 = +(100 * noPrazo / pagos.length).toFixed(1);
      }
    }
  } catch (e) { console.error('home aderencia:', e.message); }

  // Aggrega DRE: extrai receita/cmv/lucroBruto/despesas/resultado do consolidado
  function resumirDRE(dre) {
    if (!dre || !dre.consolidado) return null;
    function totalContaEsp(arv, grupoSub, contaSub) {
      let s = 0;
      Object.keys(arv).forEach(t => {
        if (t.indexOf('1.') !== 0) return;
        Object.keys(arv[t].grupos || {}).forEach(g => {
          if (grupoSub && g.indexOf(grupoSub) < 0) return;
          Object.keys(arv[t].grupos[g].contas || {}).forEach(c => {
            if (contaSub && c.indexOf(contaSub) < 0) return;
            s += arv[t].grupos[g].contas[c].total || 0;
          });
        });
      });
      return s;
    }
    function totalTipo(arv, tipoPref) {
      let s = 0;
      Object.keys(arv).forEach(t => { if (t.indexOf(tipoPref) === 0) s += arv[t].total || 0; });
      return s;
    }
    function totalGrupo(arv, tipoPref, grupoSub) {
      let s = 0;
      Object.keys(arv).forEach(t => {
        if (t.indexOf(tipoPref) !== 0) return;
        Object.keys(arv[t].grupos || {}).forEach(g => {
          if (g.indexOf(grupoSub) >= 0) s += arv[t].grupos[g].total || 0;
        });
      });
      return s;
    }
    const c = dre.consolidado;
    const receitaBruta = totalContaEsp(c, '01. Receita', '01. Receita Bruta');
    const cmv          = totalGrupo(c, '1.', '21. Custos'); // ja negativo
    const lucroBruto   = totalTipo(c, '1.');
    const despesas     = totalTipo(c, '2.'); // ja negativo
    const resultado    = lucroBruto + despesas;
    return { receitaBruta, cmv, lucroBruto, despesas, resultado };
  }

  const resAtual = resumirDRE(dreAtual);
  const resAnt   = resumirDRE(dreAnt);
  const valorParado    = (capitalNova ? capitalNova.parado.valor : 0) + (capitalCastro ? capitalCastro.parado.valor : 0);
  const corrosaoMes    = (capitalNova ? capitalNova.parado.custo_oportunidade_mes : 0) + (capitalCastro ? capitalCastro.parado.custo_oportunidade_mes : 0);
  const valorEstoque   = (capitalNova ? capitalNova.total_estoque : 0) + (capitalCastro ? capitalCastro.total_estoque : 0);
  const pctParado      = valorEstoque > 0 ? +(100 * valorParado / valorEstoque).toFixed(1) : 0;

  return {
    gerado_em: new Date().toISOString(),
    conta,
    mes_atual: mesAtual,
    mes_anterior: mesAnterior,
    patrimonio: patrimonio ? {
      operacional: patrimonio.patrimonio_operacional,
      ativos: patrimonio.total_ativos,
      passivos: patrimonio.total_passivos,
      estoque: (patrimonio.ativos.estoque_pecas || 0) + (patrimonio.ativos.estoque_maquinas || 0),
      a_receber: patrimonio.ativos.a_receber_aberto,
      a_pagar: patrimonio.passivos.a_pagar_aberto
    } : null,
    ciclo: ciclo ? {
      dso: ciclo.consolidado.dso, dpo: ciclo.consolidado.dpo,
      dio: ciclo.consolidado.dio, ccc: ciclo.consolidado.ccc
    } : null,
    resultado_mes: resAtual,
    resultado_mes_anterior: resAnt,
    capital_parado: { valor: valorParado, corrosao_mes: corrosaoMes, total_estoque: valorEstoque, pct_do_total: pctParado },
    vencimentos_7d: { a_receber: aReceberJa, a_pagar: aPagarJa, liquido: aReceberJa - aPagarJa },
    aderencia_30d_pagar_pct: aderencia30
  };
}

// =============================================================================
// Semaforo de Saude Financeira (deterioracao de caixa + resultado).
// Consolida numa leitura unica sinais que ja moram em telas separadas do modulo,
// cada um com STATUS (bom/atencao/ruim -> verde/amarelo/vermelho) e, onde ha
// serie mensal barata, uma TENDENCIA (melhora/estavel/piora). Caixa vem primeiro
// (grupo:'caixa'). Reusa calcularCobertura, calcularCicloCaixa e
// calcularDRECompetencia + queries diretas leves (juros de antecipacao, aging
// 90+, snapshot de patrimonio). TUDO server-side (service key) - NUNCA no client.
//
// TENDENCIA: onde ha serie (DRE por_mes, juros de antecipacao, snapshot diario)
// comparamos a MEDIA dos 3 meses recentes -EXCLUINDO o mes corrente, que e'
// parcial- vs a media dos 3 meses anteriores. Onde nao ha serie barata (CCC,
// aging), mostramos so a luz de status (tendencia = null).
//
// Os cortes de status abaixo sao defaults sensatos e reaproveitam as faixas ja
// existentes (CCC <30/<60; cobertura confortavel/saudavel/apertado/descoberto).
// Ficam como constantes locais -> facil calibrar depois.
// =============================================================================
const SAUDE_TTL_MS = 5 * 60 * 1000;

function _fmtBRLk(n) {
  const v = Number(n) || 0, s = v < 0 ? '-' : '', a = Math.abs(v);
  if (a >= 1e6) return s + 'R$ ' + (a / 1e6).toFixed(1).replace('.', ',') + 'M';
  if (a >= 1e3) return s + 'R$ ' + Math.round(a / 1e3) + 'k';
  return s + 'R$ ' + Math.round(a);
}
// Media (ignorando nulos) das chaves[ini..fim] numa serie {mes: valor}.
function _mediaJanela(serie, chaves, ini, fim) {
  let soma = 0, n = 0;
  for (let i = ini; i <= fim && i < chaves.length; i++) {
    if (i < 0) continue;
    const v = serie[chaves[i]];
    if (v === undefined || v === null || !isFinite(v)) continue;
    soma += Number(v); n++;
  }
  return n ? soma / n : null;
}
// Direcao comparando media recente vs anterior. maiorEhPior=true p/ custos
// (juros, despesa financeira): subir = piora. Zona morta de +/-5% = 'estavel'.
function _direcao(recente, anterior, maiorEhPior) {
  if (recente === null || anterior === null) return null;
  const base = Math.abs(anterior);
  if (base <= 1) return recente - anterior === 0 ? 'estavel' : null;
  const deltaPct = ((recente - anterior) / base) * 100;
  const subiu = deltaPct > 5, caiu = deltaPct < -5;
  const piora = maiorEhPior ? subiu : caiu;
  const melhora = maiorEhPior ? caiu : subiu;
  return piora ? 'piora' : melhora ? 'melhora' : 'estavel';
}
function porMesTipo(arv, tipo) { return (arv && arv[tipo] && arv[tipo].por_mes) || {}; }
function porMesConta(arv, tipo, grupo, conta) {
  try { return arv[tipo].grupos[grupo].contas[conta].por_mes || {}; } catch (e) { return {}; }
}
// Pior status entre uma lista (ignora 'sem_dado'). ruim > atencao > bom.
function _piorStatus(status) {
  const rank = { ruim: 3, atencao: 2, bom: 1 };
  let pior = 0, houve = false;
  status.forEach(s => { if (rank[s]) { houve = true; if (rank[s] > pior) pior = rank[s]; } });
  if (!houve) return 'sem_dado';
  return pior === 3 ? 'ruim' : pior === 2 ? 'atencao' : 'bom';
}

async function calcularSaudeFinanceira(conta) {
  const contaSlug = conta === 'todas' ? 'todas' : String(conta).toLowerCase();
  const now = new Date();
  // 7 meses (corrente + 6 anteriores), asc. chaves[6]=corrente.
  const chaves = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    chaves.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
  }
  const mesAtual = chaves[6];
  const desde = chaves[0];
  // Janelas de tendencia: recentes = -3,-2,-1 (indices 3..5); anteriores = -6,-5,-4 (0..2).
  // O mes corrente (indice 6) fica de fora por ser parcial.
  const REC_INI = 3, REC_FIM = 5, ANT_INI = 0, ANT_FIM = 2;

  // Sequenciamos as 3 queries mais pesadas (DRE, cobertura, ciclo) em vez de um
  // Promise.all unico: rodar todas de uma vez estoura o statement_timeout do
  // Supabase na conta grande (NOVA) - a mesma armadilha que a Home ja evita
  // rodando a aderencia DEPOIS. Depois as 3 fontes leves (tabelas distintas)
  // correm juntas. Cada fonte tem .catch proprio -> uma falha vira 'sem_dado'.
  const dre = await calcularDRECompetencia(desde, mesAtual).catch(e => { console.error('saude dre:', e.message); return null; });
  const cobertura = await calcularCobertura(contaSlug).catch(e => { console.error('saude cobertura:', e.message); return null; });
  const ciclo = await calcularCicloCaixa(12).catch(e => { console.error('saude ciclo:', e.message); return null; });
  const [jurosPM, aging, snapCob] = await Promise.all([
    // Juros de antecipacao por mes: movimentos P na conta "Desconto de Duplicatas"
    // cuja categoria NAO e' transferencia (mesma definicao da rota /antecipacoes).
    (async () => {
      try {
        const rows = await selectPaginado(() => {
          let q = supabase.from('movimentos_cc')
            .select('conta_omie,data_pagamento,valor_pago,descricao_categoria')
            .ilike('nome_conta_corrente', '%Desconto de Duplicata%')
            .eq('natureza', 'P')
            .gte('data_pagamento', desde + '-01')
            .order('id', { ascending: true });
          if (contaSlug !== 'todas') q = q.eq('conta_omie', labelConta(contaSlug));
          return q;
        });
        const serie = {};
        (rows || []).forEach(r => {
          if (/transfer/i.test(r.descricao_categoria || '')) return; // transferencia = liquido, nao juros
          const mk = String(r.data_pagamento || '').slice(0, 7);
          if (!mk) return;
          serie[mk] = (serie[mk] || 0) + (Number(r.valor_pago) || 0);
        });
        return serie;
      } catch (e) { console.error('saude antecipacao:', e.message); return null; }
    })(),
    // Aging: titulos ATRASADO, soma do que esta em 90+ vs total (pagar+receber).
    (async () => {
      try {
        const cutoff = now.getFullYear() + '-01-01';
        const ref = hoje();
        const contaLabel = contaSlug === 'todas' ? null : labelConta(contaSlug);
        const ehInter = (nome) => {
          const n = String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
          return n.includes('castro pecas') || n.includes('nova tratores');
        };
        async function somaTabela(tabela, colNome) {
          const rows = await selectPaginado(() => {
            let q = supabase.from(tabela)
              .select(`codigo_lancamento,data_vencimento,valor_documento,valor_pago,conta_omie,${colNome}`)
              .eq('status_titulo', 'ATRASADO')
              .gte('data_vencimento', cutoff)
              .order('codigo_lancamento', { ascending: true });
            if (contaLabel) q = q.eq('conta_omie', contaLabel);
            return q;
          });
          let total = 0, total90 = 0;
          (rows || []).forEach(r => {
            if (!r.data_vencimento) return;
            if (VENCIDOS_IGNORADOS.has(Number(r.codigo_lancamento))) return;
            if (ehInter(r[colNome])) return;
            let ab = (Number(r.valor_documento) || 0) - (Number(r.valor_pago) || 0);
            if (ab <= 0.01) ab = Number(r.valor_documento) || 0;
            if (ab <= 0) return;
            const p = String(r.data_vencimento).slice(0, 10).split('-');
            const venc = new Date(+p[0], +p[1] - 1, +p[2]);
            const dias = Math.round((ref.getTime() - venc.getTime()) / 86400000);
            total += ab;
            if (dias > 90) total90 += ab;
          });
          return { total, total90 };
        }
        const [pg, rc] = await Promise.all([
          somaTabela('contas_pagar', 'nome_fornecedor'),
          somaTabela('contas_receber', 'nome_cliente')
        ]);
        return { total: pg.total + rc.total, total90: pg.total90 + rc.total90 };
      } catch (e) { console.error('saude aging:', e.message); return null; }
    })(),
    // Snapshot de patrimonio: proxy de tendencia da cobertura (a_receber/a_pagar
    // hoje vs ~90 dias atras). Casing de conta_omie incerto -> casa minusculo.
    (async () => {
      try {
        const rows = await selectPaginado(() =>
          supabase.from('cp_patrimonio_snapshot')
            .select('data,conta_omie,a_receber_aberto,a_pagar_aberto')
            .order('data', { ascending: true }));
        const porData = {};
        (rows || []).forEach(r => {
          if (contaSlug !== 'todas' && String(r.conta_omie || '').toLowerCase() !== contaSlug) return;
          const d = String(r.data).slice(0, 10);
          if (!porData[d]) porData[d] = { ar: 0, ap: 0 };
          porData[d].ar += Number(r.a_receber_aberto) || 0;
          porData[d].ap += Number(r.a_pagar_aberto) || 0;
        });
        const datas = Object.keys(porData).sort();
        if (datas.length < 2) return null;
        const ultima = datas[datas.length - 1];
        const alvo = fmtISO(addDias(new Date(ultima), -90));
        let ref = datas[0];
        for (const d of datas) { if (d <= alvo) ref = d; else break; }
        const razao = (o) => o.ap > 0 ? o.ar / o.ap : null;
        return { agora: razao(porData[ultima]), antes: razao(porData[ref]) };
      } catch (e) { console.error('saude snapshot:', e.message); return null; }
    })()
  ]);

  // ---- Series do DRE (conta selecionada; 'todas' -> consolidado) ----
  const arvDre = dre ? (contaSlug === 'nova' ? dre.nova : contaSlug === 'castro' ? dre.castro : dre.consolidado) : null;
  const receitaPM = arvDre ? porMesConta(arvDre, '1. Lucro Bruto', '01. Receita Líquida Operacional', '01. Receita Bruta de Vendas') : {};
  const lucroBrutoPM = arvDre ? porMesTipo(arvDre, '1. Lucro Bruto') : {};
  const despesasPM = arvDre ? porMesTipo(arvDre, '2. Despesas') : {};           // negativo
  const despFinPM = arvDre ? porMesConta(arvDre, '2. Despesas', '11. Fixas', '03. Despesas Financeiras') : {}; // negativo
  const resultadoPM = {}, margemPM = {}, despFinMagPM = {};
  chaves.forEach(m => {
    const res = (Number(lucroBrutoPM[m]) || 0) + (Number(despesasPM[m]) || 0);
    resultadoPM[m] = res;
    const rec = Number(receitaPM[m]) || 0;
    margemPM[m] = rec > 0 ? (res / rec) * 100 : null;
    despFinMagPM[m] = Math.abs(Number(despFinPM[m]) || 0);
  });

  const sinais = [];

  // ===== CAIXA =====
  // 1. Cobertura 30d
  if (cobertura && Array.isArray(cobertura.janelas)) {
    const j = cobertura.janelas.find(x => x.dias === 30) || null;
    const cls = j ? j.classificacao : null;
    let status = 'sem_dado';
    if (cls === 'descoberto') status = 'ruim';
    else if (cls === 'apertado') status = 'atencao';
    else if (cls === 'confortavel' || cls === 'saudavel' || cls === 'sem_passivos') status = 'bom';
    const tend = snapCob ? _direcao(snapCob.agora, snapCob.antes, false) : null;
    sinais.push({
      chave: 'cobertura', grupo: 'caixa', label: 'Cobertura 30 dias',
      valor: j ? j.cobertura : null, unidade: 'ratio',
      sub: j ? ('A receber ' + _fmtBRLk(j.a_receber_total) + ' / A pagar ' + _fmtBRLk(j.a_pagar_total)) : 'sem dados',
      status, tendencia: tend, href: '/dre-financeiro/patrimonio'
    });
  } else {
    sinais.push({ chave: 'cobertura', grupo: 'caixa', label: 'Cobertura 30 dias', valor: null, unidade: 'ratio', sub: 'sem dados', status: 'sem_dado', tendencia: null, href: '/dre-financeiro/patrimonio' });
  }

  // 2. Antecipacao de recebiveis (juros/mes)
  {
    const recente = jurosPM ? _mediaJanela(jurosPM, chaves, REC_INI, REC_FIM) : null;
    const anterior = jurosPM ? _mediaJanela(jurosPM, chaves, ANT_INI, ANT_FIM) : null;
    const tend = _direcao(recente, anterior, true);
    let status;
    if (jurosPM === null) status = 'sem_dado';
    else if ((recente || 0) < 100) status = 'bom';        // praticamente nao antecipa
    else if (tend === 'piora') status = 'ruim';           // juros subindo
    else status = 'atencao';                              // paga juros (custo), mas estavel/caindo
    sinais.push({
      chave: 'antecipacao', grupo: 'caixa', label: 'Juros de antecipacao',
      valor: recente, unidade: 'BRL',
      sub: 'media/mes dos ult. 3m' + (anterior ? ' · antes ' + _fmtBRLk(anterior) : ''),
      status, tendencia: tend, href: '/dre-financeiro/movimentos'
    });
  }

  // 3. Ciclo de Caixa (CCC) - reusa faixa da Home
  {
    const ind = ciclo ? (contaSlug === 'nova' ? ciclo.nova : contaSlug === 'castro' ? ciclo.castro : ciclo.consolidado) : null;
    const ccc = ind && isFinite(ind.ccc) ? ind.ccc : null;
    let status = 'sem_dado';
    if (ccc !== null) status = ccc < 30 ? 'bom' : ccc < 60 ? 'atencao' : 'ruim';
    sinais.push({
      chave: 'ciclo', grupo: 'caixa', label: 'Ciclo de Caixa (CCC)',
      valor: ccc, unidade: 'dias',
      sub: ind ? ('DSO ' + Math.round(ind.dso || 0) + ' + DIO ' + Math.round(ind.dio || 0) + ' − DPO ' + Math.round(ind.dpo || 0)) : 'sem dados',
      status, tendencia: null, href: '/dre-financeiro/ciclo-caixa'
    });
  }

  // 4. Aging 90+
  {
    let status = 'sem_dado', valor = null, sub = 'sem dados';
    if (aging) {
      valor = aging.total90;
      const pct = aging.total > 0 ? (aging.total90 / aging.total) * 100 : 0;
      if (aging.total < 1000) status = 'bom';
      else if (pct >= 50) status = 'ruim';
      else if (pct >= 25) status = 'atencao';
      else status = 'bom';
      sub = Math.round(pct) + '% da inadimplencia em 90+ · total ' + _fmtBRLk(aging.total);
    }
    sinais.push({ chave: 'aging', grupo: 'caixa', label: 'Inadimplencia 90+', valor, unidade: 'BRL', sub, status, tendencia: null, href: '/dre-financeiro/vencidos' });
  }

  // ===== RESULTADO =====
  // 5. Resultado liquido (ultimo mes completo + tendencia 3x3)
  {
    const recente = _mediaJanela(resultadoPM, chaves, REC_INI, REC_FIM);
    const anterior = _mediaJanela(resultadoPM, chaves, ANT_INI, ANT_FIM);
    const receitaRecente = _mediaJanela(receitaPM, chaves, REC_INI, REC_FIM);
    const ultimoCompleto = resultadoPM[chaves[REC_FIM]];
    const tend = _direcao(recente, anterior, false);
    let status;
    // Guard: sem receita na janela (vendas_itens nao sincronizado p/ os meses
    // recentes) o "resultado" fica so' despesas -> negativo -> FALSO Critico
    // (arrastava o indice-resumo inteiro). Sem receita nao da' pra julgar o
    // resultado: reporta sem_dado, igual a Margem ja faz.
    if (!arvDre || recente === null || !(receitaRecente > 0)) status = 'sem_dado';
    else if (recente < 0) status = 'ruim';
    else if (tend === 'piora') status = 'atencao';
    else status = 'bom';
    sinais.push({
      chave: 'resultado', grupo: 'resultado', label: 'Resultado liquido',
      valor: (ultimoCompleto === undefined ? recente : ultimoCompleto), unidade: 'BRL',
      sub: 'media/mes 3m ' + _fmtBRLk(recente || 0) + (anterior ? ' · antes ' + _fmtBRLk(anterior) : ''),
      status, tendencia: tend, href: '/dre-financeiro/dre'
    });
  }

  // 6. Margem liquida (nivel + queda em pp)
  {
    const recente = _mediaJanela(margemPM, chaves, REC_INI, REC_FIM);
    const anterior = _mediaJanela(margemPM, chaves, ANT_INI, ANT_FIM);
    const deltaPP = (recente !== null && anterior !== null) ? recente - anterior : null;
    let status, tend = null;
    if (!arvDre || recente === null) status = 'sem_dado';
    else {
      if (recente < 0 || (deltaPP !== null && deltaPP <= -3)) status = 'ruim';
      else if (deltaPP !== null && deltaPP <= -1) status = 'atencao';
      else status = 'bom';
      if (deltaPP !== null) tend = deltaPP > 0.5 ? 'melhora' : deltaPP < -0.5 ? 'piora' : 'estavel';
    }
    sinais.push({
      chave: 'margem', grupo: 'resultado', label: 'Margem liquida',
      valor: recente, unidade: 'pct',
      sub: deltaPP === null ? 'media 3m' : ((deltaPP >= 0 ? '+' : '') + deltaPP.toFixed(1) + 'pp vs 3m anteriores'),
      status, tendencia: tend, href: '/dre-financeiro/analise-dre'
    });
  }

  // 7. Despesas financeiras (juros/tarifas subindo = deterioracao)
  {
    const recente = _mediaJanela(despFinMagPM, chaves, REC_INI, REC_FIM);
    const anterior = _mediaJanela(despFinMagPM, chaves, ANT_INI, ANT_FIM);
    const tend = _direcao(recente, anterior, true);
    let status;
    if (!arvDre || recente === null) status = 'sem_dado';
    else if (recente < 100) status = 'bom';
    else if (tend === 'piora') status = 'ruim';
    else status = 'atencao';
    sinais.push({
      chave: 'desp_financeiras', grupo: 'resultado', label: 'Despesas financeiras',
      valor: recente, unidade: 'BRL',
      sub: 'media/mes 3m' + (anterior ? ' · antes ' + _fmtBRLk(anterior) : ''),
      status, tendencia: tend, href: '/dre-financeiro/analise-dre'
    });
  }

  // Indice-resumo = pior status (caixa pesa por vir primeiro; pior-caso global).
  const indiceStatus = _piorStatus(sinais.map(s => s.status));
  const LABEL = { bom: 'Saudavel', atencao: 'Atencao', ruim: 'Critico', sem_dado: 'Sem dados' };

  return {
    gerado_em: new Date().toISOString(),
    conta: contaSlug,
    indice: { status: indiceStatus, label: LABEL[indiceStatus] },
    sinais
  };
}

// =============================================================================
// API: patrimonio (consolidado fluxo de caixa + estoque + frota)
// Ativos: estoque (pecas, maquinas) + frota + a_receber_aberto
// Passivos: a_pagar_aberto
// Patrimonio operacional = ativos - passivos
// =============================================================================

// Pagina manualmente quando ha mais de 1000 rows (limite padrao do Supabase REST).
async function selectPaginado(tableBuilder) {
  const PAGE = 1000;
  let from = 0, all = [];
  while (true) {
    const { data, error } = await tableBuilder().range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// Soma valor de estoque por categoria a partir da tabela `produtos` do
// projeto Visual Estoque (mesmo Supabase).
// CORRETO: usar produtos.familia_nome (ja populado e mapeado), filtrar
// inativo=false E arquivado=false. NAO usar produto_tipo (incompleto).
// Tambem soma custo_capital (SELIC acumulada x valor x tempo) = corrosao
// silenciosa do patrimonio.
function isFamiliaPeca(f) {
  const n = String(f || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return n.indexOf('peca') !== -1;
}

async function calcularEstoque(contaSlug) {
  // contaSlug = 'nova' | 'castro' | null (todas)
  const prods = await selectPaginado(() => {
    let q = supabase.from('produtos')
      .select('valor_estoque,familia_nome,custo_capital')
      .eq('inativo', false).eq('arquivado', false).gt('valor_estoque', 0);
    if (contaSlug) q = q.eq('conta_omie', contaSlug);
    return q;
  });

  let pecas = 0, maquinas = 0, custoCapitalAcumulado = 0;
  (prods || []).forEach(p => {
    const v = Number(p.valor_estoque) || 0;
    const cc = Number(p.custo_capital) || 0;
    custoCapitalAcumulado += cc;
    if (!p.familia_nome) {
      // Sem familia - segue regra do Visual Estoque /margens: vai para outros.
      // Mas pelo dado real ja observado, sem-familia ~= maquinas. Manter neutro.
      return;
    }
    if (isFamiliaPeca(p.familia_nome)) pecas += v;
    else maquinas += v;
  });
  return { pecas, maquinas, custo_capital_acumulado: custoCapitalAcumulado };
}

// Soma valor_mercado da tabela Placas (frota nao tem conta_omie - compartilhada)
async function calcularFrota() {
  const data = await selectPaginado(() => supabase.from('Placas').select('valor_mercado,ativo'));
  return data
    .filter(p => p.ativo !== false)
    .reduce((s, p) => s + (Number(p.valor_mercado) || 0), 0);
}

// Soma (valor_documento - valor_pago) de titulos em aberto.
// contaLabel em UPPERCASE (NOVA/CASTRO).
async function calcularAberto(tabela, contaLabel) {
  const data = await selectPaginado(() => {
    let q = supabase.from(tabela).select('valor_documento,valor_pago,status_titulo,conta_omie');
    if (contaLabel) q = q.eq('conta_omie', contaLabel);
    return q;
  });
  return data
    .filter(r => {
      const s = String(r.status_titulo || '').toUpperCase();
      return !['PAGO', 'RECEBIDO', 'LIQUIDADO', 'CANCELADO'].includes(s);
    })
    .reduce((sum, r) => {
      const aberto = (Number(r.valor_documento) || 0) - (Number(r.valor_pago) || 0);
      return sum + Math.max(aberto, 0);
    }, 0);
}

// =============================================================================
// Ciclo de Caixa: DSO + DIO - DPO
// DSO = a_receber_aberto / vendas_diarias_medias_90d  (dias de vendas em aberto)
// DPO = a_pagar_aberto   / compras_diarias_medias_90d (dias de compras em aberto)
// DIO = estoque_total    / vendas_diarias_medias_90d  (dias de cobertura do estoque)
// Ciclo = DSO + DIO - DPO (dias entre comprar/produzir e receber dinheiro)
// =============================================================================
function ultimosMeses(n) {
  const ref = new Date();
  const meses = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    meses.push({ mes: d.getMonth() + 1, ano: d.getFullYear() });
  }
  return meses;
}

// Vendas medias diarias dos ultimos 90 dias (3 meses calendario aproximado).
// vendas_itens.conta_omie esta em UPPERCASE - use ilike.
async function vendasDiariasMedias(conta) {
  const contaSlug = conta === 'todas' ? null : String(conta).toLowerCase();
  const meses = ultimosMeses(3);
  const data = await selectPaginado(() => {
    let q = supabase.from('vendas_itens').select('valor_total,mes,ano,conta_omie');
    const orFilter = meses.map(m => `and(ano.eq.${m.ano},mes.eq.${m.mes})`).join(',');
    q = q.or(orFilter);
    if (contaSlug) q = q.ilike('conta_omie', contaSlug);
    return q;
  });
  const total = data.reduce((s, r) => s + (Number(r.valor_total) || 0), 0);
  return { total90d: total, diaria: total / 90 };
}

// Compras medias diarias dos ultimos 90 dias.
// Usa notas_entrada (campos: valor_nf, valor_produtos, mes, ano, conta_omie UPPERCASE, cancelada).
// Fallback contas_pagar.data_emissao se notas_entrada vazia para a conta.
async function comprasDiariasMedias(conta) {
  const contaSlug = conta === 'todas' ? null : String(conta).toLowerCase();
  const contaLabel = conta === 'todas' ? null : labelConta(conta);
  const meses = ultimosMeses(3);

  // Tentativa 1: notas_entrada
  const data = await selectPaginado(() => {
    let q = supabase.from('notas_entrada').select('valor_nf,valor_produtos,mes,ano,conta_omie,cancelada');
    const orFilter = meses.map(m => `and(ano.eq.${m.ano},mes.eq.${m.mes})`).join(',');
    q = q.or(orFilter);
    if (contaSlug) q = q.ilike('conta_omie', contaSlug);
    return q;
  }).catch(e => { console.log('comprasDiariasMedias notas_entrada erro:', e.message); return []; });
  const total = data
    .filter(r => r.cancelada !== 'S')
    .reduce((s, r) => s + (Number(r.valor_nf) || Number(r.valor_produtos) || 0), 0);
  if (total > 0) return { total90d: total, diaria: total / 90, fonte: 'notas_entrada' };

  // Fallback: contas_pagar emitidos nos ultimos 90 dias
  const ref = hoje();
  const de = fmtISO(addDias(ref, -90));
  const ate = fmtISO(ref);
  const data2 = await selectPaginado(() => {
    let q = supabase.from('contas_pagar')
      .select('valor_documento,data_emissao,conta_omie')
      .gte('data_emissao', de).lte('data_emissao', ate);
    if (contaLabel) q = q.eq('conta_omie', contaLabel);
    return q;
  });
  const total2 = data2.reduce((s, r) => s + (Number(r.valor_documento) || 0), 0);
  return { total90d: total2, diaria: total2 / 90, fonte: 'contas_pagar_emissao' };
}

async function calcularCicloDeCaixa(conta) {
  const isAll = conta === 'todas';
  const contaSlug = isAll ? null : String(conta).toLowerCase();
  const contaLabel = isAll ? null : labelConta(conta);

  const [estoque, aReceber, aPagar, vendas, compras] = await Promise.all([
    calcularEstoque(contaSlug),
    calcularAberto('contas_receber', contaLabel),
    calcularAberto('contas_pagar', contaLabel),
    vendasDiariasMedias(conta),
    comprasDiariasMedias(conta)
  ]);

  const estoqueTotal = estoque.pecas + estoque.maquinas;
  const dso = vendas.diaria > 0 ? +(aReceber / vendas.diaria).toFixed(1) : null;
  const dio = vendas.diaria > 0 ? +(estoqueTotal / vendas.diaria).toFixed(1) : null;
  // DPO: se compras estao populadas, usa elas. Senao, fallback vendas (proxy).
  const denomDpo = compras.diaria > 0 ? compras.diaria : vendas.diaria;
  const dpo = denomDpo > 0 ? +(aPagar / denomDpo).toFixed(1) : null;
  const ciclo = (dso !== null && dio !== null && dpo !== null)
    ? +(dso + dio - dpo).toFixed(1)
    : null;

  return {
    dso, dio, dpo, ciclo,
    vendas_diaria: vendas.diaria,
    compras_diaria: compras.diaria,
    vendas_90d: vendas.total90d,
    compras_90d: compras.total90d,
    compras_fonte: compras.fonte,
    a_receber_aberto: aReceber,
    a_pagar_aberto: aPagar,
    estoque_total: estoqueTotal,
    dpo_fallback: compras.diaria <= 0
  };
}

// =============================================================================
// Cobertura de obrigacoes por janela (30/60/90/180 dias)
// Para cada janela: compara o que VAI vencer (a pagar) vs o que VAI entrar
// (a receber). Inclui vencidos em aberto na ponta dos passivos.
// =============================================================================
async function calcularCobertura(conta) {
  const contaLabel = conta === 'todas' ? null : labelConta(conta);
  const ref = hoje();
  const hojeISO = fmtISO(ref);

  async function abertos(tabela) {
    return selectPaginado(() => {
      let q = supabase.from(tabela)
        .select('data_vencimento,valor_documento,valor_pago,status_titulo,conta_omie');
      if (contaLabel) q = q.eq('conta_omie', contaLabel);
      return q;
    });
  }
  const [rowsPagar, rowsReceber] = await Promise.all([
    abertos('contas_pagar'),
    abertos('contas_receber')
  ]);
  function aberto(r) {
    const s = String(r.status_titulo || '').toUpperCase();
    if (['PAGO', 'RECEBIDO', 'LIQUIDADO', 'CANCELADO'].includes(s)) return 0;
    return Math.max((Number(r.valor_documento) || 0) - (Number(r.valor_pago) || 0), 0);
  }
  // Vencidos ja em aberto (data_vencimento < hoje E status em aberto)
  const vencidoPagar = rowsPagar.filter(r => r.data_vencimento && r.data_vencimento < hojeISO).reduce((s,r) => s + aberto(r), 0);
  const vencidoReceber = rowsReceber.filter(r => r.data_vencimento && r.data_vencimento < hojeISO).reduce((s,r) => s + aberto(r), 0);

  const janelas = [30, 60, 90, 180].map(dias => {
    const ateISO = fmtISO(addDias(ref, dias));
    const aPagarPeriodo = rowsPagar
      .filter(r => r.data_vencimento && r.data_vencimento >= hojeISO && r.data_vencimento <= ateISO)
      .reduce((s,r) => s + aberto(r), 0);
    const aReceberPeriodo = rowsReceber
      .filter(r => r.data_vencimento && r.data_vencimento >= hojeISO && r.data_vencimento <= ateISO)
      .reduce((s,r) => s + aberto(r), 0);
    // Total a pagar = vencidos + a vencer no periodo (precisa quitar tudo isso)
    const passivoTotal = vencidoPagar + aPagarPeriodo;
    const ativoTotal = vencidoReceber + aReceberPeriodo;
    const cobertura = passivoTotal > 0 ? +(ativoTotal / passivoTotal).toFixed(2) : null;
    let classificacao;
    if (cobertura === null) classificacao = 'sem_passivos';
    else if (cobertura >= 2) classificacao = 'confortavel';
    else if (cobertura >= 1.2) classificacao = 'saudavel';
    else if (cobertura >= 1) classificacao = 'apertado';
    else classificacao = 'descoberto';
    return {
      dias,
      a_pagar_periodo: aPagarPeriodo,
      a_receber_periodo: aReceberPeriodo,
      a_pagar_total: passivoTotal,
      a_receber_total: ativoTotal,
      saldo_liquido: ativoTotal - passivoTotal,
      cobertura,
      classificacao
    };
  });
  return { vencido_pagar: vencidoPagar, vencido_receber: vencidoReceber, janelas };
}

async function calcularPatrimonio(conta) {
  const isAll = conta === 'todas';
  const contaSlug = isAll ? null : String(conta).toLowerCase();      // pra produtos
  const contaLabel = isAll ? null : labelConta(conta);               // pra contas_*

  const [estoque, frota, aReceber, aPagar] = await Promise.all([
    calcularEstoque(contaSlug),
    calcularFrota(),
    calcularAberto('contas_receber', contaLabel),
    calcularAberto('contas_pagar', contaLabel)
  ]);
  const ativos = estoque.pecas + estoque.maquinas + frota + aReceber;
  const patrimonio_operacional = ativos - aPagar;
  return {
    ativos: {
      estoque_pecas: estoque.pecas,
      estoque_maquinas: estoque.maquinas,
      frota,
      a_receber_aberto: aReceber
    },
    passivos: { a_pagar_aberto: aPagar },
    total_ativos: ativos,
    total_passivos: aPagar,
    patrimonio_operacional,
    custo_capital_acumulado: estoque.custo_capital_acumulado || 0
  };
}

// =============================================================================
// API: margens - margem real por produto = valor_unitario - (cmc + capital_unit)
// capital_unit = (valor_estoque * taxa_mensal/100 * dias_em_estoque/30) / estoque
// Reproduz a logica de /margens do Visual Estoque mas sem depender do SELIC
// service externo (motivo provavel do 500 la).
// =============================================================================
async function calcularMargens(conta, taxaMensalPct, meses, desde) {
  const contaSlug = conta === 'todas' ? null : String(conta).toLowerCase();
  const mesesList = mesesEntre(desde, meses);

  // 1. Pega vendas dos meses solicitados
  const vendas = await selectPaginado(() => {
    let q = supabase.from('vendas_itens')
      .select('codigo_produto,descricao,valor_total,quantidade,valor_unitario,cmc_unitario,mes,ano,data_pedido,familia,nome_cliente,codigo_cliente,vendedor,conta_omie,numero_pedido');
    const orFilter = mesesList.map(m => `and(ano.eq.${m.ano},mes.eq.${m.mes})`).join(',');
    q = q.or(orFilter);
    if (contaSlug) q = q.ilike('conta_omie', contaSlug);
    return q;
  });

  // 2. Mapa de data_inclusao por produto (pra estimar dias em estoque ate a venda)
  const codigos = Array.from(new Set(vendas.map(v => String(v.codigo_produto))));
  const dataInclMap = {};
  const skuMap = {}; // codigo_produto (ID interno Omie) -> codigo (SKU legivel, ex "20.02.0004")
  for (let i = 0; i < codigos.length; i += 500) {
    const lote = codigos.slice(i, i + 500);
    const { data } = await supabase.from('produtos').select('codigo_produto,data_inclusao,codigo').in('codigo_produto', lote);
    (data || []).forEach(p => {
      if (p.data_inclusao) dataInclMap[String(p.codigo_produto)] = p.data_inclusao;
      if (p.codigo) skuMap[String(p.codigo_produto)] = String(p.codigo);
    });
  }

  // 3. Mapeia cada venda como item com margem
  const itens = vendas.map(v => {
    const fam = familiaNormalizada(v.familia);
    if (fam === null) return null;
    const receita = Number(v.valor_total) || 0;
    const qty = Number(v.quantidade) || 1;
    const cmc = Number(v.cmc_unitario) || 0;
    const cmv = cmc * qty;
    // Dias em estoque ate a venda: data_pedido - data_inclusao do produto (best effort)
    let diasEstoque = 0;
    const dataPedido = parseBRdataToDate(v.data_pedido);
    const dataIncl = parseBRdataToDate(dataInclMap[String(v.codigo_produto)]);
    if (dataPedido && dataIncl && dataPedido > dataIncl) {
      diasEstoque = Math.floor((dataPedido - dataIncl) / 86400000);
    }
    const custoCapital = cmv * (taxaMensalPct / 100) * (diasEstoque / 30);
    const custoTotal = cmv + custoCapital;
    const margemReal = receita - custoTotal;
    const margemPct = receita > 0 ? +((margemReal / receita) * 100).toFixed(2) : 0;
    const semCmc = !cmc;
    return {
      codigo_produto: String(v.codigo_produto),
      sku: skuMap[String(v.codigo_produto)] || null, // codigo legivel do produto (SKU)
      descricao: v.descricao || '(sem descricao)',
      familia: fam,
      cliente: v.nome_cliente || null,
      codigo_cliente: v.codigo_cliente != null ? String(v.codigo_cliente) : null,
      vendedor: v.vendedor || null,
      pedido: v.numero_pedido || null,
      data_pedido: v.data_pedido || null,
      mes: v.mes, ano: v.ano,
      quantidade: qty,
      valor_unitario: Number(v.valor_unitario) || (receita / qty),
      cmc_unitario: cmc,
      receita: +receita.toFixed(2),
      cmv: +cmv.toFixed(2),
      custo_capital: +custoCapital.toFixed(2),
      custo_total: +custoTotal.toFixed(2),
      margem_real: +margemReal.toFixed(2),
      margem_pct: margemPct,
      dias_estoque: diasEstoque,
      sem_cmc: semCmc
    };
  }).filter(Boolean);

  // Resolve nome do cliente pelo codigo_cliente quando nome_cliente veio vazio.
  // vendas_itens.nome_cliente vem direto do Omie e HOJE chega quase sempre vazio;
  // a tabela `clientes` tem razao_social/nome_fantasia (mesmo padrao das rotas
  // vendas-modelo/detalhe e margens-familia/detalhe).
  const codigosCliente = Array.from(new Set(
    itens.filter(it => !it.cliente && it.codigo_cliente).map(it => it.codigo_cliente)
  ));
  if (codigosCliente.length) {
    const clienteMap = {};
    for (let i = 0; i < codigosCliente.length; i += 500) {
      const lote = codigosCliente.slice(i, i + 500);
      const { data: cs } = await supabase.from('clientes')
        .select('codigo_cliente_omie,razao_social,nome_fantasia')
        .in('codigo_cliente_omie', lote);
      (cs || []).forEach(c => {
        clienteMap[String(c.codigo_cliente_omie)] = c.razao_social || c.nome_fantasia || null;
      });
    }
    itens.forEach(it => {
      if (!it.cliente && it.codigo_cliente && clienteMap[it.codigo_cliente]) {
        it.cliente = clienteMap[it.codigo_cliente];
      }
    });
  }

  // Totais
  const tot = itens.reduce((s, it) => {
    s.receita += it.receita;
    s.cmv += it.cmv;
    s.capital_total += it.custo_capital;
    s.qtd += 1;
    if (it.sem_cmc) s.qtd_sem_cmc += 1;
    return s;
  }, { receita: 0, cmv: 0, capital_total: 0, qtd: 0, qtd_sem_cmc: 0 });
  tot.custo_total = tot.cmv + tot.capital_total;
  tot.lucro = tot.receita - tot.custo_total;
  tot.margem_pct = tot.receita > 0 ? +((tot.lucro / tot.receita) * 100).toFixed(2) : 0;
  tot.cobertura_cmc_pct = tot.qtd > 0 ? +(100 * (tot.qtd - tot.qtd_sem_cmc) / tot.qtd).toFixed(1) : 0;

  const familias = Array.from(new Set(itens.map(i => i.familia))).sort();

  return { itens, totais: tot, familias };
}

// =============================================================================
// API: vendas por modelo (pivotada mes a mes)
// =============================================================================
async function calcularVendasPorModelo(conta, meses, desde, familiaFiltro, modeloFiltro) {
  const contaSlug = conta === 'todas' ? null : String(conta).toLowerCase();
  const mesesList = mesesEntre(desde, meses);

  const dataRaw = await selectPaginado(() => {
    let q = supabase.from('vendas_itens')
      .select('codigo_produto,descricao,valor_total,quantidade,cmc_unitario,mes,ano,familia,conta_omie,numero_pedido');
    const orFilter = mesesList.map(m => `and(ano.eq.${m.ano},mes.eq.${m.mes})`).join(',');
    q = q.or(orFilter);
    if (contaSlug) q = q.ilike('conta_omie', contaSlug);
    return q;
  });
  // Filtra pedidos invalidos (cancelados/devolvidos)
  const invalidos = await carregarPedidosInvalidos();
  const data = dataRaw.filter(v => !pedidoEhInvalido(invalidos, v.conta_omie, v.numero_pedido));

  // Mapa codigo_produto -> { modelo, familia_nome } de produtos
  const codigos = Array.from(new Set(data.map(v => String(v.codigo_produto))));
  const produtoMap = {};
  for (let i = 0; i < codigos.length; i += 500) {
    const lote = codigos.slice(i, i + 500);
    const { data: ps } = await supabase.from('produtos').select('codigo_produto,modelo,familia_nome').in('codigo_produto', lote);
    (ps || []).forEach(p => {
      produtoMap[String(p.codigo_produto)] = {
        modelo: p.modelo ? String(p.modelo).trim() : null,
        familia_nome: p.familia_nome ? String(p.familia_nome).trim() : null
      };
    });
  }

  function isPeca(f) {
    return /^pe[çc]/.test(String(f||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,''));
  }

  // Agrega por modelo (vindo de produtos.modelo, fallback descricao).
  const modelos = {};
  data.forEach(v => {
    const cp = String(v.codigo_produto || '');
    const prod = produtoMap[cp] || {};
    // Familia efetiva: prioriza produtos.familia_nome (mais confiavel) e cai pra vendas_itens.familia
    const fam = familiaNormalizada(prod.familia_nome || v.familia);
    if (fam === null) return;
    // Em qualquer modo de "maquinas" (default, __TODAS_MAQUINAS__, familia especifica),
    // exigimos que o produto tenha modelo cadastrado E nao seja peca - pra evitar que
    // pecas com familia mal-classificada apareçam como linhas na grade.
    if (familiaFiltro === '__SO_PECAS__') {
      if (!isPeca(fam)) return;
    } else {
      if (!prod.modelo || isPeca(fam)) return;
      if (familiaFiltro && familiaFiltro !== '__TODAS_MAQUINAS__' && fam !== familiaFiltro) return;
    }

    const modelo = prod.modelo || String(v.descricao || '(sem modelo)').trim();
    if (modeloFiltro && modelo !== modeloFiltro) return;
    // Mantemos descricao para detalhe; agregamos por modelo unico (codigo nao entra na chave)
    const chave = modelo;
    if (!modelos[chave]) {
      modelos[chave] = {
        modelo, descricao_exemplo: v.descricao || '', codigo_produto: cp, familia: fam,
        totais: { receita: 0, cmv: 0, qtd: 0, eventos: 0 },
        por_mes: {}
      };
    }
    const m = modelos[chave];
    const receita = Number(v.valor_total) || 0;
    const qty = Number(v.quantidade) || 0;
    const cmv = (Number(v.cmc_unitario) || 0) * qty;
    m.totais.receita += receita;
    m.totais.cmv += cmv;
    m.totais.qtd += qty;
    m.totais.eventos += 1;

    const k = v.ano + '-' + String(v.mes).padStart(2, '0');
    if (!m.por_mes[k]) m.por_mes[k] = { receita: 0, qtd: 0, eventos: 0 };
    m.por_mes[k].receita += receita;
    m.por_mes[k].qtd += qty;
    m.por_mes[k].eventos += 1;
  });

  // Lista de meses (do mais antigo para o mais recente)
  const setMeses = new Set();
  Object.values(modelos).forEach(m => Object.keys(m.por_mes).forEach(k => setMeses.add(k)));
  const mesesArr = Array.from(setMeses).sort();

  const modelosArr = Object.values(modelos).map(m => {
    m.totais.margem_pct = m.totais.receita > 0
      ? +(((m.totais.receita - m.totais.cmv) / m.totais.receita) * 100).toFixed(1)
      : 0;
    m.totais.lucro = m.totais.receita - m.totais.cmv;
    return m;
  }).sort((a, b) => b.totais.receita - a.totais.receita);

  // Totais por mes
  const totaisPorMes = {};
  mesesArr.forEach(k => { totaisPorMes[k] = { receita: 0, qtd: 0, eventos: 0 }; });
  modelosArr.forEach(m => {
    Object.entries(m.por_mes).forEach(([k, v]) => {
      totaisPorMes[k].receita += v.receita;
      totaisPorMes[k].qtd += v.qtd;
      totaisPorMes[k].eventos += v.eventos;
    });
  });

  const totGeral = modelosArr.reduce((s, m) => {
    s.receita += m.totais.receita;
    s.qtd += m.totais.qtd;
    s.modelos += 1;
    s.eventos += m.totais.eventos;
    return s;
  }, { receita: 0, qtd: 0, modelos: 0, eventos: 0 });

  return { meses: mesesArr, modelos: modelosArr, totaisPorMes, totaisGerais: totGeral };
}

// =============================================================================
// DRE Consolidada (NOVA + CASTRO - intercompany)
// =============================================================================
function agregaArvoreDRE(movimentos) {
  const tree = {};
  let totalMov = 0;
  movimentos.forEach(m => {
    const t = m.dreTipo  || '(sem tipo)';
    const g = m.dreGrupo || '(sem grupo)';
    const c = m.dreConta || '(sem conta)';
    const v = Number(m.valor) || 0;
    const mesKey = (m._ano && m._mes) ? `${m._ano}-${String(m._mes).padStart(2,'0')}` : null;
    if (!tree[t]) tree[t] = { total: 0, count: 0, por_mes: {}, grupos: {} };
    if (!tree[t].grupos[g]) tree[t].grupos[g] = { total: 0, count: 0, por_mes: {}, contas: {} };
    if (!tree[t].grupos[g].contas[c]) tree[t].grupos[g].contas[c] = { total: 0, count: 0, por_mes: {} };
    tree[t].total += v; tree[t].count++;
    tree[t].grupos[g].total += v; tree[t].grupos[g].count++;
    tree[t].grupos[g].contas[c].total += v; tree[t].grupos[g].contas[c].count++;
    if (mesKey) {
      tree[t].por_mes[mesKey] = (tree[t].por_mes[mesKey] || 0) + v;
      tree[t].grupos[g].por_mes[mesKey] = (tree[t].grupos[g].por_mes[mesKey] || 0) + v;
      tree[t].grupos[g].contas[c].por_mes[mesKey] = (tree[t].grupos[g].contas[c].por_mes[mesKey] || 0) + v;
    }
    totalMov++;
  });
  return tree;
}

// Merge: aplica os totais de UM resumo {operacional, intercompany} numa
// arvore agregadora, atribuindo por_mes baseado no mesKey passado.
function mergeResumoEm(treeOp, treeInter, resumo, mesKey, contagem, contaKey) {
  function merge(dest, src) {
    if (!src) return;
    Object.entries(src).forEach(([t, tNode]) => {
      if (t === '_meta') return;
      if (!dest[t]) dest[t] = { total: 0, count: 0, por_mes: {}, grupos: {} };
      dest[t].total += tNode.total || 0;
      dest[t].count += tNode.count || 0;
      if (mesKey) dest[t].por_mes[mesKey] = (dest[t].por_mes[mesKey] || 0) + (tNode.total || 0);
      Object.entries(tNode.grupos || {}).forEach(([g, gNode]) => {
        if (!dest[t].grupos[g]) dest[t].grupos[g] = { total: 0, count: 0, por_mes: {}, contas: {} };
        dest[t].grupos[g].total += gNode.total || 0;
        dest[t].grupos[g].count += gNode.count || 0;
        if (mesKey) dest[t].grupos[g].por_mes[mesKey] = (dest[t].grupos[g].por_mes[mesKey] || 0) + (gNode.total || 0);
        Object.entries(gNode.contas || {}).forEach(([c, cNode]) => {
          if (!dest[t].grupos[g].contas[c]) dest[t].grupos[g].contas[c] = { total: 0, count: 0, por_mes: {} };
          dest[t].grupos[g].contas[c].total += cNode.total || 0;
          dest[t].grupos[g].contas[c].count += cNode.count || 0;
          if (mesKey) dest[t].grupos[g].contas[c].por_mes[mesKey] = (dest[t].grupos[g].contas[c].por_mes[mesKey] || 0) + (cNode.total || 0);
        });
      });
    });
  }
  merge(treeOp,    resumo.operacional);
  merge(treeInter, resumo.intercompany);
  const meta = resumo._meta || {};
  if (contagem && contaKey) {
    contagem[contaKey + '_operacional']  += meta.operacional_count  || 0;
    contagem[contaKey + '_intercompany'] += meta.intercompany_count || 0;
    contagem[contaKey + '_total']        += (meta.operacional_count || 0) + (meta.intercompany_count || 0);
  }
}

async function calcularDREConsolidada(anoMesIni, anoMesFim, cTipoData, forceRefresh) {
  const [aIni, mIni] = anoMesIni.split('-').map(Number);
  const [aFim, mFim] = anoMesFim.split('-').map(Number);
  const meses = [];
  { let ai = aIni, mi = mIni;
    while (ai < aFim || (ai === aFim && mi <= mFim)) {
      meses.push(`${ai}-${String(mi).padStart(2,'0')}`);
      mi++; if (mi > 12) { mi = 1; ai++; }
    } }

  // Forca refresh: usa o caminho antigo (busca raw, ja recomputa resumo no upsert)
  if (forceRefresh) {
    const [lNova, lCastro] = await Promise.all([
      consultarDREPorPeriodo('nova',   anoMesIni, anoMesFim, cTipoData, true),
      consultarDREPorPeriodo('castro', anoMesIni, anoMesFim, cTipoData, true)
    ]);
    return montarFromRaw(meses, anoMesIni, anoMesFim, cTipoData, lNova, lCastro);
  }

  // Caminho rapido: le so a coluna resumo do cache pra cada (conta, ano, mes)
  const anosDistintos = Array.from(new Set(meses.map(k => parseInt(k.split('-')[0], 10))));
  const { data: cacheRows } = await supabase.from('dre_cache')
    .select('conta_omie,ano,mes,resumo')
    .eq('c_tipo_data', cTipoData)
    .in('ano', anosDistintos);

  // Identifica (conta, ano, mes) faltando no cache OU sem resumo (cache antigo)
  const cacheMap = new Map();
  (cacheRows || []).forEach(r => { if (r.resumo) cacheMap.set(`${r.conta_omie}|${r.ano}|${r.mes}`, r.resumo); });
  const faltando = [];
  ['nova', 'castro'].forEach(c => {
    meses.forEach(k => {
      const [a, m] = k.split('-').map(Number);
      if (!cacheMap.has(`${c}|${a}|${m}`)) faltando.push({ conta: c, ano: a, mes: m });
    });
  });

  // Se algum mes esta sem resumo, busca raw (o consultarDREPorPeriodo vai gravar
  // o resumo no caminho de cache miss; OU se ja tem movimentos mas falta resumo,
  // recomputamos a partir dos movimentos diretamente sem chamar Omie).
  if (faltando.length > 0) {
    const sem = Array.from(new Set(faltando.map(f => f.conta)));
    // Busca movimentos das celulas faltantes que JA tem no cache (sem resumo)
    const orMissing = faltando.map(f => `and(conta_omie.eq.${f.conta},ano.eq.${f.ano},mes.eq.${f.mes})`).join(',');
    const { data: faltMovs } = await supabase.from('dre_cache')
      .select('conta_omie,ano,mes,movimentos').or(orMissing).eq('c_tipo_data', cTipoData);
    const aindaSemNadaCached = new Set(faltando.map(f => `${f.conta}|${f.ano}|${f.mes}`));
    // Pra cada um que tem movimentos mas falta resumo: computa e UPDATE
    for (const r of (faltMovs || [])) {
      const resumo = computeResumoDRE(r.movimentos || [], r.conta_omie);
      cacheMap.set(`${r.conta_omie}|${r.ano}|${r.mes}`, resumo);
      aindaSemNadaCached.delete(`${r.conta_omie}|${r.ano}|${r.mes}`);
      await supabase.from('dre_cache').update({ resumo }).eq('conta_omie', r.conta_omie).eq('ano', r.ano).eq('mes', r.mes).eq('c_tipo_data', cTipoData);
    }
    // Pra contas/meses ausentes do cache inteiro: chama Omie (vai gravar resumo tambem)
    const aindaFaltam = faltando.filter(f => aindaSemNadaCached.has(`${f.conta}|${f.ano}|${f.mes}`));
    if (aindaFaltam.length > 0) {
      console.log(`[DRE] ${aindaFaltam.length} (conta,mes) ausentes do cache - vai buscar no Omie`);
      // Agrupa por conta + chama o range que cobre os meses ausentes
      for (const c of sem) {
        const mineForConta = aindaFaltam.filter(f => f.conta === c);
        if (mineForConta.length === 0) continue;
        // consultarDREPorPeriodo trata cache miss e grava resumo; passamos faixa completa
        await consultarDREPorPeriodo(c, anoMesIni, anoMesFim, cTipoData, false);
      }
      // Re-le os resumos recem gravados
      const { data: refresh } = await supabase.from('dre_cache')
        .select('conta_omie,ano,mes,resumo').or(orMissing).eq('c_tipo_data', cTipoData);
      (refresh || []).forEach(r => { if (r.resumo) cacheMap.set(`${r.conta_omie}|${r.ano}|${r.mes}`, r.resumo); });
    }
  }

  // Merge dos resumos em arvores
  const arvNova = {}, arvCastro = {}, arvCons = {};
  const arvInterNova = {}, arvInterCastro = {};
  const contagem = {
    nova_total: 0, nova_operacional: 0, nova_intercompany: 0,
    castro_total: 0, castro_operacional: 0, castro_intercompany: 0
  };
  meses.forEach(mesKey => {
    const [a, m] = mesKey.split('-').map(Number);
    const rNova   = cacheMap.get(`nova|${a}|${m}`);
    const rCastro = cacheMap.get(`castro|${a}|${m}`);
    if (rNova) {
      mergeResumoEm(arvNova,   arvInterNova,   rNova,   mesKey, contagem, 'nova');
      mergeResumoEm(arvCons,   {},             { operacional: rNova.operacional },   mesKey, null, null);
    }
    if (rCastro) {
      mergeResumoEm(arvCastro, arvInterCastro, rCastro, mesKey, contagem, 'castro');
      mergeResumoEm(arvCons,   {},             { operacional: rCastro.operacional }, mesKey, null, null);
    }
  });

  return {
    periodo: { de: anoMesIni, ate: anoMesFim, cTipoData },
    meses,
    contagem,
    nova:        arvNova,
    castro:      arvCastro,
    consolidado: arvCons,
    intercompany: { nova: arvInterNova, castro: arvInterCastro }
  };
}

// Caminho antigo: usado em forceRefresh ou fallback - constroi arvores
// a partir das listas de movimentos crus (pre-coluna resumo).
function montarFromRaw(meses, anoMesIni, anoMesFim, cTipoData, lNova, lCastro) {
  const cnpjCastro = EMPRESAS_GRUPO_CNPJ.castro;
  const cnpjNova   = EMPRESAS_GRUPO_CNPJ.nova;
  const cnpjMov = m => String(m.cnpj_cpf || '').replace(/\D/g, '');
  const novaInter   = lNova.filter(m => cnpjMov(m) === cnpjCastro);
  const novaOp      = lNova.filter(m => cnpjMov(m) !== cnpjCastro);
  const castroInter = lCastro.filter(m => cnpjMov(m) === cnpjNova);
  const castroOp    = lCastro.filter(m => cnpjMov(m) !== cnpjNova);
  return {
    periodo: { de: anoMesIni, ate: anoMesFim, cTipoData },
    meses,
    contagem: {
      nova_total: lNova.length, nova_operacional: novaOp.length, nova_intercompany: novaInter.length,
      castro_total: lCastro.length, castro_operacional: castroOp.length, castro_intercompany: castroInter.length
    },
    nova:         agregaArvoreDRE(novaOp),
    castro:       agregaArvoreDRE(castroOp),
    consolidado:  agregaArvoreDRE([...novaOp, ...castroOp]),
    intercompany: { nova: agregaArvoreDRE(novaInter), castro: agregaArvoreDRE(castroInter) }
  };
}

// =============================================================================
// Ciclo de Conversao de Caixa (DSO/DPO/DIO/CCC)
//
// DSO = (Contas a Receber em aberto / Receita 12m) * 365  -> dias pra receber
// DPO = (Contas a Pagar em aberto    / CMV 12m)     * 365  -> dias pra pagar
// DIO = (Valor de estoque atual      / CMV 12m)     * 365  -> dias parado
// CCC = DSO + DIO - DPO                                    -> ciclo financeiro
// =============================================================================
async function calcularCicloCaixa(meses) {
  meses = Math.max(3, Math.min(24, parseInt(meses, 10) || 12));
  const now = new Date();
  // Lista (ano, mes) dos N meses incluindo o mes atual
  const periodo = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    periodo.push({ ano: d.getFullYear(), mes: d.getMonth() + 1 });
  }
  const orPeriodo = periodo.map(m => `and(ano.eq.${m.ano},mes.eq.${m.mes})`).join(',');

  // 1. Receita + CMV dos ultimos N meses (via dre_cache)
  const receita = { nova: 0, castro: 0 };
  const cmv     = { nova: 0, castro: 0 };
  const { data: dc } = await supabase.from('dre_cache')
    .select('conta_omie,movimentos').or(orPeriodo).eq('c_tipo_data', '1');
  (dc || []).forEach(r => {
    const k = String(r.conta_omie).toLowerCase();
    if (!(k in receita)) return;
    (r.movimentos || []).forEach(m => {
      if (m.dreConta === '01. Receita Bruta de Vendas') receita[k] += Number(m.valor || 0);
      if (m.dreGrupo === '21. Custos') cmv[k] += Math.abs(Number(m.valor || 0));
    });
  });

  // 2. Contas a receber em aberto (exclui PAGO/RECEBIDO/LIQUIDADO/CANCELADO)
  const aReceber = { nova: 0, castro: 0 };
  const { data: cr } = await supabase.from('contas_receber')
    .select('conta_omie,valor_documento,valor_pago,status_titulo')
    .neq('status_titulo', 'PAGO').neq('status_titulo', 'RECEBIDO')
    .neq('status_titulo', 'LIQUIDADO').neq('status_titulo', 'CANCELADO')
    .limit(100000);
  (cr || []).forEach(r => {
    const k = String(r.conta_omie).toLowerCase();
    if (!(k in aReceber)) return;
    aReceber[k] += Math.max(Number(r.valor_documento || 0) - Number(r.valor_pago || 0), 0);
  });

  // 3. Contas a pagar em aberto
  const aPagar = { nova: 0, castro: 0 };
  const { data: cp } = await supabase.from('contas_pagar')
    .select('conta_omie,valor_documento,valor_pago,status_titulo')
    .neq('status_titulo', 'PAGO').neq('status_titulo', 'LIQUIDADO').neq('status_titulo', 'CANCELADO')
    .limit(100000);
  (cp || []).forEach(r => {
    const k = String(r.conta_omie).toLowerCase();
    if (!(k in aPagar)) return;
    aPagar[k] += Math.max(Number(r.valor_documento || 0) - Number(r.valor_pago || 0), 0);
  });

  // 4. Estoque (valor) - hoje so NOVA tem produtos no supabase
  const estoque = { nova: 0, castro: 0 };
  const { data: pr } = await supabase.from('produtos')
    .select('conta_omie,valor_estoque').eq('inativo', false).eq('arquivado', false).gt('valor_estoque', 0).limit(20000);
  (pr || []).forEach(r => {
    const k = String(r.conta_omie).toLowerCase();
    if (!(k in estoque)) return;
    estoque[k] += Number(r.valor_estoque || 0);
  });

  // 5. Calcula indicadores
  const diasPeriodo = meses * 30; // aproximacao usual
  function indicadores(c) {
    const rec = receita[c], cm = cmv[c], ar = aReceber[c], ap = aPagar[c], est = estoque[c];
    return {
      conta: c,
      receita_periodo: rec, cmv_periodo: cm,
      a_receber_aberto: ar, a_pagar_aberto: ap, estoque_atual: est,
      dso: rec > 0 ? (ar / rec) * diasPeriodo : null,
      dpo: cm  > 0 ? (ap / cm)  * diasPeriodo : null,
      dio: cm  > 0 ? (est / cm) * diasPeriodo : null,
    };
  }
  function ccc(ind) {
    const a = ind.dso || 0, b = ind.dio || 0, c = ind.dpo || 0;
    return a + b - c;
  }
  const novaInd   = indicadores('nova');   novaInd.ccc   = ccc(novaInd);
  const castroInd = indicadores('castro'); castroInd.ccc = ccc(castroInd);

  // Consolidado
  const consInd = {
    conta: 'consolidado',
    receita_periodo: receita.nova + receita.castro,
    cmv_periodo:     cmv.nova + cmv.castro,
    a_receber_aberto: aReceber.nova + aReceber.castro,
    a_pagar_aberto:   aPagar.nova + aPagar.castro,
    estoque_atual:    estoque.nova + estoque.castro
  };
  consInd.dso = consInd.receita_periodo > 0 ? (consInd.a_receber_aberto / consInd.receita_periodo) * diasPeriodo : null;
  consInd.dpo = consInd.cmv_periodo > 0     ? (consInd.a_pagar_aberto   / consInd.cmv_periodo)     * diasPeriodo : null;
  consInd.dio = consInd.cmv_periodo > 0     ? (consInd.estoque_atual    / consInd.cmv_periodo)     * diasPeriodo : null;
  consInd.ccc = ccc(consInd);

  return { meses, dias_periodo: diasPeriodo, nova: novaInd, castro: castroInd, consolidado: consInd };
}

// =============================================================================
// DRE Competencia paralela (regime de competencia real - NAO usa Omie)
//
// Reconstroi DRE diretamente dos dados crus do Supabase, alocando:
//   Receita Bruta = vendas_itens.valor_total por data_pedido (= emissao NF)
//   CMV           = vendas_itens.cmc_unitario * quantidade   (mesma data)
//   Devolucoes    = contas_pagar grupo "Devolucoes de Vendas" por data_emissao
//   Despesas      = contas_pagar grupos "Despesas X" por data_emissao
//
// Motivo: Omie usa regime misto (Receita por vencimento do titulo, CMV pela
// emissao da NF), causando margens distorcidas entre meses quando ha parcelas.
//
// Estrutura de retorno: mesma da DRE Omie (nova/castro/consolidado/intercompany,
// arvore tipoDRE > grupoDRE > contaDRE com por_mes), pra reaproveitar o frontend.
//
// Limitacao: intercompany so e' filtrado em VENDAS (via clientes.cnpj_norm). Em
// contas_pagar nao temos mapeamento direto fornecedor->CNPJ na tabela, entao as
// despesas/devolucoes nao tem filtro intercompany (mesmo criterio do Visual
// Estoque). Na pratica o impacto e' baixo - despesas intercompany sao raras.
// =============================================================================

// Mapeia grupo_categoria do contas_pagar pra ramo da arvore DRE.
// Retorna null pra grupos que nao entram no DRE (Despesas Diretas=compras ja
// estao no CMV, Investimento=CAPEX).
function classificaGrupoCP(grupo) {
  const g = String(grupo || '').trim();
  if (g === 'Devoluções de Vendas') {
    return { tipo: '1. Lucro Bruto', grupo: '01. Receita Líquida Operacional', conta: '03. Deduções de Receita', sinal: -1 };
  }
  if (g === 'Despesas com Pessoal')           return { tipo: '2. Despesas', grupo: '11. Fixas', conta: '01. Despesas com Pessoal',           sinal: -1 };
  if (g === 'Despesas Administrativas')       return { tipo: '2. Despesas', grupo: '11. Fixas', conta: '02. Despesas Administrativas',       sinal: -1 };
  if (g === 'Despesas Financeiras / Bancos')  return { tipo: '2. Despesas', grupo: '11. Fixas', conta: '03. Despesas Financeiras',           sinal: -1 };
  if (g === 'Despesas de Vendas e Marketing') return { tipo: '2. Despesas', grupo: '11. Fixas', conta: '04. Despesas de Vendas e Marketing', sinal: -1 };
  if (g === 'Outras Despesas')                return { tipo: '2. Despesas', grupo: '11. Fixas', conta: '05. Outras Despesas',                sinal: -1 };
  if (g === 'Impostos e Taxas')               return { tipo: '2. Despesas', grupo: '11. Fixas', conta: '06. Impostos e Taxas',               sinal: -1 };
  // Ignorados: 'Despesas Diretas' (compras, ja no CMV via cmc_unitario),
  //            'Investimento' (CAPEX, nao operacional)
  return null;
}

function arvoreEmptyTree() { return {}; }
// categoria (opcional, 7o arg): quando presente, agrega tambem em contas[conta].categorias[categoria]
// formando um 4o nivel na arvore. Usado pelas despesas pra expor descricao_categoria do Omie
// (ex: "Combustivel" sob "05. Outras Despesas").
function addNoTree(tree, tipo, grupo, conta, valor, mesKey, categoria) {
  if (!tree[tipo]) tree[tipo] = { total: 0, count: 0, por_mes: {}, grupos: {} };
  if (!tree[tipo].grupos[grupo]) tree[tipo].grupos[grupo] = { total: 0, count: 0, por_mes: {}, contas: {} };
  if (!tree[tipo].grupos[grupo].contas[conta]) tree[tipo].grupos[grupo].contas[conta] = { total: 0, count: 0, por_mes: {}, categorias: {} };
  tree[tipo].total += valor; tree[tipo].count++;
  tree[tipo].grupos[grupo].total += valor; tree[tipo].grupos[grupo].count++;
  tree[tipo].grupos[grupo].contas[conta].total += valor; tree[tipo].grupos[grupo].contas[conta].count++;
  if (mesKey) {
    tree[tipo].por_mes[mesKey] = (tree[tipo].por_mes[mesKey] || 0) + valor;
    tree[tipo].grupos[grupo].por_mes[mesKey] = (tree[tipo].grupos[grupo].por_mes[mesKey] || 0) + valor;
    tree[tipo].grupos[grupo].contas[conta].por_mes[mesKey] = (tree[tipo].grupos[grupo].contas[conta].por_mes[mesKey] || 0) + valor;
  }
  if (categoria) {
    var cats = tree[tipo].grupos[grupo].contas[conta].categorias;
    if (!cats[categoria]) cats[categoria] = { total: 0, count: 0, por_mes: {} };
    cats[categoria].total += valor; cats[categoria].count++;
    if (mesKey) cats[categoria].por_mes[mesKey] = (cats[categoria].por_mes[mesKey] || 0) + valor;
  }
}

async function calcularDRECompetencia(anoMesIni, anoMesFim) {
  const [aIni, mIni] = anoMesIni.split('-').map(Number);
  const [aFim, mFim] = anoMesFim.split('-').map(Number);
  const meses = [];
  { let ai = aIni, mi = mIni;
    while (ai < aFim || (ai === aFim && mi <= mFim)) {
      meses.push(`${ai}-${String(mi).padStart(2,'0')}`);
      mi++; if (mi > 12) { mi = 1; ai++; }
    } }
  const mesesSet = new Set(meses);
  const dataDe  = `${anoMesIni}-01`;
  const ultDia  = new Date(aFim, mFim, 0).getDate();
  const dataAte = `${anoMesFim}-${String(ultDia).padStart(2,'0')}`;

  // 1. Clientes intercompany por conta_omie (codigo_cliente_omie cujo cnpj_norm = CNPJ outra empresa)
  const interSet = { nova: new Set(), castro: new Set() };
  try {
    const { data: clientesInter } = await supabase.from('clientes')
      .select('codigo_cliente_omie,conta_omie,cnpj_norm')
      .in('cnpj_norm', [EMPRESAS_GRUPO_CNPJ.nova, EMPRESAS_GRUPO_CNPJ.castro]);
    (clientesInter || []).forEach(c => {
      const slug = String(c.conta_omie || '').toLowerCase();
      const cnpjOutra = cnpjOutraEmpresa(slug);
      if (cnpjOutra && c.cnpj_norm === cnpjOutra && interSet[slug]) {
        interSet[slug].add(Number(c.codigo_cliente_omie));
      }
    });
  } catch (e) { console.warn('[dre-comp] clientes intercompany:', e.message); }

  // 2. Vendas do periodo
  const vendasRaw = await selectPaginado(() => {
    let q = supabase.from('vendas_itens')
      .select('valor_total,quantidade,cmc_unitario,mes,ano,conta_omie,codigo_cliente,numero_pedido');
    const orFilter = meses.map(k => {
      const [a, m] = k.split('-').map(Number);
      return `and(ano.eq.${a},mes.eq.${m})`;
    }).join(',');
    q = q.or(orFilter);
    return q.order('id', { ascending: true }); // ordem estavel: evita repetir linhas entre paginas
  });
  // Filtra pedidos invalidos (cancelados/devolvidos)
  const pedInvalidos = await carregarPedidosInvalidos();
  const vendas = vendasRaw.filter(v => !pedidoEhInvalido(pedInvalidos, v.conta_omie, v.numero_pedido));

  // 3. Contas a pagar do periodo (por data_emissao) - paginar pra escapar do limit 1000.
  // ORDER estavel obrigatorio: sem ele o PostgREST nao garante a mesma ordem entre
  // paginas (range), e linhas na fronteira de 1000 podem REPETIR -> despesas
  // duplicadas (ex.: "Despesas com Pessoal"). Chave: codigo_lancamento+conta_omie.
  const contasPagar = await selectPaginado(() =>
    supabase.from('contas_pagar')
      .select('valor_documento,data_emissao,conta_omie,grupo_categoria,descricao_categoria,status_titulo')
      .gte('data_emissao', dataDe).lte('data_emissao', dataAte)
      .not('grupo_categoria', 'is', null)
      .order('codigo_lancamento', { ascending: true })
      .order('conta_omie', { ascending: true })
  );

  // 4. Monta arvores por conta + intercompany separado
  const arv = { nova: {}, castro: {}, consolidado: {}, interNova: {}, interCastro: {} };
  const contagem = {
    nova_total: 0, nova_operacional: 0, nova_intercompany: 0,
    castro_total: 0, castro_operacional: 0, castro_intercompany: 0
  };

  // Receita e CMV das vendas OPERACIONAIS por conta/mes - base para estimar a
  // margem e reverter o CMV das devolucoes (ver 4b, reversao margem-neutra).
  const recVendasOp = { nova: {}, castro: {} };
  const cmvVendasOp = { nova: {}, castro: {} };

  // 4a. Vendas: Receita Bruta + CMV
  vendas.forEach(v => {
    const slug = String(v.conta_omie || '').toLowerCase();
    if (slug !== 'nova' && slug !== 'castro') return;
    const ano = v.ano, mes = v.mes;
    if (!ano || !mes) return;
    const mesKey = `${ano}-${String(mes).padStart(2,'0')}`;
    if (!mesesSet.has(mesKey)) return;
    const receita = Number(v.valor_total) || 0;
    const cmv = -((Number(v.cmc_unitario) || 0) * (Number(v.quantidade) || 0));
    const codCli = Number(v.codigo_cliente);
    const isInter = codCli && interSet[slug].has(codCli);
    const treeOp = arv[slug];
    const treeInter = slug === 'nova' ? arv.interNova : arv.interCastro;
    if (isInter) {
      if (receita) addNoTree(treeInter, '1. Lucro Bruto', '01. Receita Líquida Operacional', '01. Receita Bruta de Vendas', receita, mesKey);
      if (cmv)     addNoTree(treeInter, '1. Lucro Bruto', '21. Custos', '01. Custo Médio (CMC) das Vendas', cmv, mesKey);
      contagem[slug + '_intercompany']++;
    } else {
      if (receita) {
        addNoTree(treeOp,         '1. Lucro Bruto', '01. Receita Líquida Operacional', '01. Receita Bruta de Vendas', receita, mesKey);
        addNoTree(arv.consolidado, '1. Lucro Bruto', '01. Receita Líquida Operacional', '01. Receita Bruta de Vendas', receita, mesKey);
      }
      if (cmv) {
        addNoTree(treeOp,         '1. Lucro Bruto', '21. Custos', '01. Custo Médio (CMC) das Vendas', cmv, mesKey);
        addNoTree(arv.consolidado, '1. Lucro Bruto', '21. Custos', '01. Custo Médio (CMC) das Vendas', cmv, mesKey);
      }
      // Acumula p/ a margem da conta/mes (usada na reversao de CMV das devolucoes).
      recVendasOp[slug][mesKey] = (recVendasOp[slug][mesKey] || 0) + receita;
      cmvVendasOp[slug][mesKey] = (cmvVendasOp[slug][mesKey] || 0) + Math.abs(cmv);
      contagem[slug + '_operacional']++;
    }
    contagem[slug + '_total']++;
  });

  // Margem CMV/receita das vendas por conta/mes; fallback = media do periodo da
  // conta. Clamp [0,1]: a reversao nunca excede o valor da devolucao (margem >=0).
  function ratioCmvDevolucao(slug, mesKey) {
    const rec = (recVendasOp[slug] && recVendasOp[slug][mesKey]) || 0;
    const cmv = (cmvVendasOp[slug] && cmvVendasOp[slug][mesKey]) || 0;
    let r;
    if (rec > 0) {
      r = cmv / rec;
    } else {
      const totR = Object.values(recVendasOp[slug] || {}).reduce((s, x) => s + x, 0);
      const totC = Object.values(cmvVendasOp[slug] || {}).reduce((s, x) => s + x, 0);
      r = totR > 0 ? totC / totR : 0;
    }
    return Math.max(0, Math.min(1, r));
  }

  // 4b. Contas a pagar: despesas + devolucoes (sem filtro intercompany - ver nota)
  (contasPagar || []).forEach(r => {
    // Titulos CANCELADOS no Omie continuam na tabela (sync faz upsert, nao apaga)
    // e nao podem entrar na DRE - senao a despesa e contada (ex.: salario duplicado).
    if (String(r.status_titulo || '').toUpperCase().includes('CANCEL')) return;
    const slug = String(r.conta_omie || '').toLowerCase();
    // contas_pagar tem conta_omie em UPPERCASE ('NOVA'/'CASTRO') - mas pelo dump
    // a config esta com case-insensitive. Tentamos ambos.
    const slugNorm = slug === 'nova' || slug === 'castro' ? slug
      : (String(r.conta_omie).toUpperCase() === 'NOVA' ? 'nova'
         : String(r.conta_omie).toUpperCase() === 'CASTRO' ? 'castro' : null);
    if (!slugNorm) return;
    const cls = classificaGrupoCP(r.grupo_categoria);
    if (!cls) return;
    if (!r.data_emissao) return;
    const mesKey = String(r.data_emissao).slice(0, 7);
    if (!mesesSet.has(mesKey)) return;
    const v = cls.sinal * (Number(r.valor_documento) || 0);
    if (!v) return;
    const cat = r.descricao_categoria || '(sem categoria)';
    addNoTree(arv[slugNorm],   cls.tipo, cls.grupo, cls.conta, v, mesKey, cat);
    addNoTree(arv.consolidado, cls.tipo, cls.grupo, cls.conta, v, mesKey, cat);

    // Devolucao de venda: alem de deduzir a RECEITA (acima), reverte o CMV
    // estimado das mercadorias devolvidas (voltam ao estoque), tornando a
    // devolucao MARGEM-NEUTRA. Sem isso, o CMV da venda original (que continua
    // em vendas_itens) fica sem contrapartida -> Lucro Bruto fantasma negativo
    // nos meses com devolucao. Reversao ~ D x margem(CMV/receita) da conta/mes.
    // Nuance aceita: devolucao pode ser de venda de mes anterior (margem do mes
    // corrente e' estimativa), mas o resultado e' muito mais fiel que ignorar.
    if (r.grupo_categoria === 'Devoluções de Vendas') {
      const D = Number(r.valor_documento) || 0; // magnitude da devolucao
      const reversao = D * ratioCmvDevolucao(slugNorm, mesKey);
      if (reversao) {
        addNoTree(arv[slugNorm],   '1. Lucro Bruto', '21. Custos', '02. Reversão de CMV (devoluções)', reversao, mesKey, 'Reversão margem-neutra de devoluções');
        addNoTree(arv.consolidado, '1. Lucro Bruto', '21. Custos', '02. Reversão de CMV (devoluções)', reversao, mesKey, 'Reversão margem-neutra de devoluções');
      }
    }
  });

  // 4c. Lancamentos de conta corrente SEM titulo (movimentos_cc, codigo_titulo=0):
  // despesas pagas direto da conta que nunca viram contas_pagar - em especial os
  // JUROS DA ANTECIPACAO de duplicatas ("Juros sobre Emprestimos", lancados pelo
  // Omie na CC "Omie Desconto de Duplicatas" quando libera o valor liquido).
  // Sem eles, "03. Despesas Financeiras" so mostra tarifas/multas.
  // Transferencias entre contas tem grupo "Transferencia" -> classificaGrupoCP
  // retorna null e ficam fora. Competencia = mes do PAGAMENTO (unica data que um
  // lancamento de CC tem). Sem risco de duplicidade: codigo_titulo=0 garante que
  // o lancamento nao existe em contas_pagar. Graceful: tabela vazia/indisponivel
  // (sync de movimentos nao rodou) -> DRE fica exatamente como antes.
  try {
    const lancCC = await selectPaginado(() =>
      supabase.from('movimentos_cc')
        .select('conta_omie,data_pagamento,valor_pago,grupo_categoria,descricao_categoria,status')
        .eq('natureza', 'P')
        .eq('codigo_titulo', 0)
        .gte('data_pagamento', dataDe).lte('data_pagamento', dataAte)
        .not('grupo_categoria', 'is', null)
        .order('id', { ascending: true })
    );
    (lancCC || []).forEach(r => {
      if (String(r.status || '').toUpperCase().includes('CANCEL')) return;
      const up = String(r.conta_omie || '').toUpperCase();
      const slugNorm = up === 'NOVA' ? 'nova' : up === 'CASTRO' ? 'castro' : null;
      if (!slugNorm) return;
      const cls = classificaGrupoCP(r.grupo_categoria);
      if (!cls) return;
      if (!r.data_pagamento) return;
      const mesKey = String(r.data_pagamento).slice(0, 7);
      if (!mesesSet.has(mesKey)) return;
      const v = cls.sinal * (Number(r.valor_pago) || 0);
      if (!v) return;
      const cat = r.descricao_categoria || '(sem categoria)';
      addNoTree(arv[slugNorm],   cls.tipo, cls.grupo, cls.conta, v, mesKey, cat);
      addNoTree(arv.consolidado, cls.tipo, cls.grupo, cls.conta, v, mesKey, cat);
    });
  } catch (e) { console.warn('[dre-comp] lancamentos CC sem titulo (movimentos_cc):', e.message); }

  return {
    periodo: { de: anoMesIni, ate: anoMesFim, cTipoData: 'competencia' },
    regime: 'competencia',
    meses,
    contagem,
    nova:         arv.nova,
    castro:       arv.castro,
    consolidado:  arv.consolidado,
    intercompany: { nova: arv.interNova, castro: arv.interCastro }
  };
}

// =============================================================================
// API: capital parado em estoque (produtos sem giro)
// Para cada produto com valor_estoque > 0, calcula dias desde a ultima venda.
// Multiplica pelo custo de capital (SELIC mensal) para custo de oportunidade.
// =============================================================================
function parseBRdataToDate(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
}

// Familias ignoradas (atalhos internos sem giro/margem real comerciais)
const FAMILIAS_IGNORAR = new Set([
  '####requisição####',
  '####requisicao####',
  'kit revisao',
  'kit revisão',
  'ativo imobilizado'  // veiculos/maquinas do proprio ativo, nao venda comercial
]);
function familiaNormalizada(f) {
  const s = String(f || '').trim();
  if (!s) return 'Peças';
  if (FAMILIAS_IGNORAR.has(s.toLowerCase())) return null; // ignorar
  if (/^sem fam/i.test(s)) return 'Peças';
  return s;
}

async function calcularCapitalParado(conta, diasMinimos, taxaMensalPct, familiaFiltro) {
  const contaSlug = conta === 'todas' ? null : String(conta).toLowerCase();
  // 1. Produtos (usa familia_nome ja populada + filtros corretos do Visual Estoque)
  const prods = await selectPaginado(() => {
    let q = supabase.from('produtos')
      .select('codigo_produto,descricao,valor_estoque,estoque,cmc,familia_nome,modelo,conta_omie,custo_capital,custo_dia,custo_real_atual,dias_em_estoque,selic_acumulada,data_inclusao')
      .eq('inativo', false).eq('arquivado', false).gt('valor_estoque', 0);
    if (contaSlug) q = q.eq('conta_omie', contaSlug);
    return q;
  });
  // 2. Ultima venda por produto (vendas_itens.data_pedido)
  const vendas = await selectPaginado(() => {
    let q = supabase.from('vendas_itens').select('codigo_produto,data_pedido,conta_omie');
    if (contaSlug) q = q.ilike('conta_omie', contaSlug);
    return q;
  });
  const ultimaVenda = {};
  vendas.forEach(v => {
    const cp = String(v.codigo_produto);
    const d = parseBRdataToDate(v.data_pedido);
    if (!d) return;
    if (!ultimaVenda[cp] || d > ultimaVenda[cp]) ultimaVenda[cp] = d;
  });
  // 3. Mapeia para itens. custo_capital persistido vem zerado (Visual Estoque
  // calcula em runtime). Recalculamos aqui usando data_inclusao + taxaMensalPct.
  const hoje = new Date();
  const itens = prods.map(p => {
    const fam = familiaNormalizada(p.familia_nome);
    if (fam === null) return null;
    const cp = String(p.codigo_produto);
    const ult = ultimaVenda[cp];
    // dias_em_estoque: prefere o persistido; senao, calcula via data_inclusao (DD/MM/YYYY)
    let diasEmEstoque = Number(p.dias_em_estoque) || 0;
    if (!diasEmEstoque && p.data_inclusao) {
      const dInc = parseBRdataToDate(p.data_inclusao);
      if (dInc) diasEmEstoque = Math.floor((hoje - dInc) / 86400000);
    }
    // custo_capital = valor * taxa_mensal * (dias/30). Persistido vem 0 - recalculamos.
    const valorEst = Number(p.valor_estoque) || 0;
    let custoCapital = Number(p.custo_capital) || 0;
    if (!custoCapital && diasEmEstoque > 0) {
      custoCapital = valorEst * (taxaMensalPct / 100) * (diasEmEstoque / 30);
    }
    // dias_sem_giro: usa ultima venda real; fallback dias_em_estoque
    let dias;
    if (ult) dias = Math.floor((hoje - ult) / 86400000);
    else if (diasEmEstoque > 0) dias = diasEmEstoque;
    else dias = 99999;
    return {
      codigo_produto: cp,
      descricao: p.descricao || p.modelo || '(sem descricao)',
      familia: fam,
      estoque_qty: Number(p.estoque) || 0,
      cmc: Number(p.cmc) || 0,
      valor_estoque: valorEst,
      custo_capital: +custoCapital.toFixed(2),
      custo_real_atual: +(valorEst + custoCapital).toFixed(2),
      dias_em_estoque: diasEmEstoque,
      ultima_venda: ult ? ult.toISOString().slice(0, 10) : null,
      dias_sem_giro: dias
    };
  }).filter(Boolean);

  // Lista de familias disponiveis ANTES do filtro (pra dropdown)
  const familiasDisp = Array.from(new Set(itens.map(i => i.familia))).sort();

  // Aplica filtro de familia (apos calculo, antes da agregacao)
  function ehPeca(f){ return /^pe[çc]/i.test(String(f||'').normalize('NFD').replace(/[̀-ͯ]/g,'')); }
  let itensFiltrados = itens;
  if (familiaFiltro === '__TODAS_MAQUINAS__') itensFiltrados = itens.filter(it => !ehPeca(it.familia));
  else if (familiaFiltro === '__SO_PECAS__') itensFiltrados = itens.filter(it => ehPeca(it.familia));
  else if (familiaFiltro) itensFiltrados = itens.filter(it => it.familia === familiaFiltro);

  // 6. Buckets agregados
  const bucketsDef = [
    { de: 0,    ate: 90,    rotulo: '0-90 dias' },
    { de: 91,   ate: 180,   rotulo: '91-180 dias' },
    { de: 181,  ate: 365,   rotulo: '181-365 dias' },
    { de: 366,  ate: 730,   rotulo: '1-2 anos' },
    { de: 731,  ate: 1095,  rotulo: '2-3 anos' },
    { de: 1096, ate: 1460,  rotulo: '3-4 anos' },
    { de: 1461, ate: 99998, rotulo: '+4 anos' },
    { de: 99999, ate: 99999, rotulo: 'sem venda registrada' }
  ];
  const buckets = bucketsDef.map(b => ({ ...b, valor: 0, qtd: 0 }));
  itensFiltrados.forEach(it => {
    const b = buckets.find(x => it.dias_sem_giro >= x.de && it.dias_sem_giro <= x.ate);
    if (b) { b.valor += it.valor_estoque; b.qtd += 1; }
  });
  // 7. Top parados (dias >= diasMinimos), ordenados por valor desc
  const parados = itensFiltrados.filter(it => it.dias_sem_giro >= diasMinimos);
  const valorParado = parados.reduce((s, it) => s + it.valor_estoque, 0);
  const custoCapitalParado = parados.reduce((s, it) => s + it.custo_capital, 0);
  const top = parados.slice().sort((a, b) => b.valor_estoque - a.valor_estoque).slice(0, 30);
  const valorEstoqueTotal = itensFiltrados.reduce((s, it) => s + it.valor_estoque, 0);
  const custoCapitalTotal = itensFiltrados.reduce((s, it) => s + it.custo_capital, 0);
  return {
    parametros: { dias_minimos: diasMinimos, taxa_mensal_pct: taxaMensalPct, familia: familiaFiltro || '' },
    familias_disponiveis: familiasDisp,
    total_estoque: valorEstoqueTotal,
    qtd_produtos: itens.length,
    // Corrosao patrimonial silenciosa (SELIC acumulada x valor x tempo)
    custo_capital_total: +custoCapitalTotal.toFixed(2),
    custo_capital_parado: +custoCapitalParado.toFixed(2),
    parado: {
      valor: valorParado,
      qtd: parados.length,
      pct_do_total: valorEstoqueTotal > 0 ? +(100 * valorParado / valorEstoqueTotal).toFixed(1) : 0,
      custo_oportunidade_mes: +(valorParado * taxaMensalPct / 100).toFixed(2),
      custo_oportunidade_ano: +(valorParado * (Math.pow(1 + taxaMensalPct/100, 12) - 1)).toFixed(2),
      custo_capital_acumulado: +custoCapitalParado.toFixed(2)
    },
    buckets,
    top_parados: top
  };
}

// =============================================================================
// API: margem bruta operacional aproximada
// Receita = valor_total, CMV = cmc_unitario x quantidade. Por mes e por familia.
// =============================================================================
// Calcula a lista de (mes, ano) a buscar.
// Se 'desdeStr' (YYYY-MM) informado: de desdeStr ate hoje.
// Senao: ultimos 'meses' meses contados a partir de hoje.
function mesesEntre(desdeStr, meses) {
  const ref = new Date();
  const lista = [];
  if (desdeStr && /^\d{4}-\d{2}$/.test(desdeStr)) {
    const [ya, ma] = desdeStr.split('-').map(Number);
    let y = ya, m = ma;
    while (y < ref.getFullYear() || (y === ref.getFullYear() && m <= ref.getMonth() + 1)) {
      lista.push({ ano: y, mes: m });
      m++;
      if (m > 12) { m = 1; y++; }
    }
  } else {
    for (let i = 0; i < meses; i++) {
      const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
      lista.push({ mes: d.getMonth() + 1, ano: d.getFullYear() });
    }
  }
  return lista;
}

// Gera rotulo do bucket conforme granularidade.
// 'mes'      -> 'YYYY-MM'
// 'semestre' -> 'YYYY-H1' / 'YYYY-H2'
// 'ano'      -> 'YYYY'
function rotuloBucket(ano, mes, gran) {
  if (gran === 'ano') return String(ano);
  if (gran === 'semestre') return ano + '-H' + (mes <= 6 ? 1 : 2);
  return ano + '-' + String(mes).padStart(2, '0');
}

async function calcularMargem(conta, meses, gran, desde) {
  const contaSlug = conta === 'todas' ? null : String(conta).toLowerCase();
  const mesesList = mesesEntre(desde, meses);
  const dataRaw = await selectPaginado(() => {
    let q = supabase.from('vendas_itens')
      .select('valor_total,quantidade,cmc_unitario,mes,ano,familia,conta_omie,numero_pedido');
    const orFilter = mesesList.map(m => `and(ano.eq.${m.ano},mes.eq.${m.mes})`).join(',');
    q = q.or(orFilter);
    if (contaSlug) q = q.ilike('conta_omie', contaSlug);
    return q;
  });
  const pedInvalidosMrg = await carregarPedidosInvalidos();
  const data = dataRaw.filter(v => !pedidoEhInvalido(pedInvalidosMrg, v.conta_omie, v.numero_pedido));

  const porMes = {};
  const porFamilia = {};
  data.forEach(r => {
    const fam = familiaNormalizada(r.familia);
    if (fam === null) return; // ignora ####Requisição####, KIT REVISAO etc

    const receita = Number(r.valor_total) || 0;
    const cmc = Number(r.cmc_unitario) || 0;
    const qty = Number(r.quantidade) || 0;
    const cmv = cmc * qty;
    const lucro = receita - cmv;
    const semCmc = !cmc;

    const k = rotuloBucket(r.ano, r.mes, gran);
    if (!porMes[k]) porMes[k] = { rotulo: k, ano: r.ano, mes: r.mes, receita: 0, cmv: 0, lucro: 0, qtd: 0, qtd_sem_cmc: 0 };
    porMes[k].receita += receita;
    porMes[k].cmv += cmv;
    porMes[k].lucro += lucro;
    porMes[k].qtd += 1;
    if (semCmc) porMes[k].qtd_sem_cmc += 1;

    if (!porFamilia[fam]) porFamilia[fam] = { familia: fam, receita: 0, cmv: 0, lucro: 0, qtd: 0 };
    porFamilia[fam].receita += receita;
    porFamilia[fam].cmv += cmv;
    porFamilia[fam].lucro += lucro;
    porFamilia[fam].qtd += 1;
  });
  Object.values(porMes).forEach(m => {
    m.margem_pct = m.receita > 0 ? +(100 * m.lucro / m.receita).toFixed(1) : 0;
    m.cobertura_cmc_pct = m.qtd > 0 ? +(100 * (m.qtd - m.qtd_sem_cmc) / m.qtd).toFixed(1) : 0;
  });
  Object.values(porFamilia).forEach(f => {
    f.margem_pct = f.receita > 0 ? +(100 * f.lucro / f.receita).toFixed(1) : 0;
  });

  const arrMeses = Object.values(porMes).sort((a, b) => a.rotulo.localeCompare(b.rotulo));
  const arrFamilias = Object.values(porFamilia).sort((a, b) => b.receita - a.receita);
  const tot = arrMeses.reduce((s, m) => {
    s.receita += m.receita; s.cmv += m.cmv; s.lucro += m.lucro; s.qtd += m.qtd; s.qtd_sem_cmc += m.qtd_sem_cmc;
    return s;
  }, { receita: 0, cmv: 0, lucro: 0, qtd: 0, qtd_sem_cmc: 0 });
  tot.margem_pct = tot.receita > 0 ? +(100 * tot.lucro / tot.receita).toFixed(1) : 0;
  tot.cobertura_cmc_pct = tot.qtd > 0 ? +(100 * (tot.qtd - tot.qtd_sem_cmc) / tot.qtd).toFixed(1) : 0;

  return { meses: arrMeses, familias: arrFamilias, totais: tot };
}

// =============================================================================
// API: margens por familia CRUZADAS por mes (familia x YYYY-MM)
// Diferente de calcularMargem (que mantem familia e mes como dimensoes
// separadas), aqui cada familia carrega um por_mes { 'YYYY-MM': {receita, cmv} }
// para que o front possa reagregar por mes/trimestre/ano e ratear despesas.
// Receita = valor_total, CMV = cmc_unitario x quantidade. Base de competencia.
// =============================================================================
async function calcularMargensPorFamilia(conta, desde, ate) {
  const contaSlug = conta === 'todas' ? null : String(conta).toLowerCase();

  // Lista de (ano, mes) no intervalo desde..ate (ambos 'YYYY-MM').
  const mesesList = [];
  if (/^\d{4}-\d{2}$/.test(String(desde)) && /^\d{4}-\d{2}$/.test(String(ate))) {
    const [ya, ma] = desde.split('-').map(Number);
    const [yb, mb] = ate.split('-').map(Number);
    let y = ya, m = ma;
    while (y < yb || (y === yb && m <= mb)) {
      mesesList.push({ ano: y, mes: m });
      m++; if (m > 12) { m = 1; y++; }
    }
  }
  if (!mesesList.length) return { meses: [], familias: [] };

  const dataRaw = await selectPaginado(() => {
    let q = supabase.from('vendas_itens')
      .select('valor_total,quantidade,cmc_unitario,mes,ano,familia,conta_omie,numero_pedido');
    const orFilter = mesesList.map(m => `and(ano.eq.${m.ano},mes.eq.${m.mes})`).join(',');
    q = q.or(orFilter);
    if (contaSlug) q = q.ilike('conta_omie', contaSlug);
    return q.order('id', { ascending: true }); // ordem estavel p/ paginacao (evita duplicar)
  });
  const invalidos = await carregarPedidosInvalidos();
  const data = dataRaw.filter(v => !pedidoEhInvalido(invalidos, v.conta_omie, v.numero_pedido));

  const porFamilia = {};
  const setMeses = new Set();
  data.forEach(r => {
    const fam = familiaNormalizada(r.familia);
    if (fam === null) return;
    const receita = Number(r.valor_total) || 0;
    const cmv = (Number(r.cmc_unitario) || 0) * (Number(r.quantidade) || 0);
    const k = r.ano + '-' + String(r.mes).padStart(2, '0');
    setMeses.add(k);
    if (!porFamilia[fam]) porFamilia[fam] = { familia: fam, por_mes: {}, totais: { receita: 0, cmv: 0 } };
    const f = porFamilia[fam];
    if (!f.por_mes[k]) f.por_mes[k] = { receita: 0, cmv: 0 };
    f.por_mes[k].receita += receita;
    f.por_mes[k].cmv += cmv;
    f.totais.receita += receita;
    f.totais.cmv += cmv;
  });

  const arrFamilias = Object.values(porFamilia).sort((a, b) => b.totais.receita - a.totais.receita);
  const arrMeses = Array.from(setMeses).sort();
  return { meses: arrMeses, familias: arrFamilias };
}

// =============================================================================
// Enriquecimento de cmc_unitario historico em vendas_itens
// =============================================================================
// vendas_itens.cmc_unitario vem do projeto omie-consulta-estoque (popula via
// pre-fetch de cmc_historico). Quando o produto nao tem CMC naquele mes (ex:
// venda nova, sync rodou antes do Omie calcular o CMC), o cmc_unitario fica null.
// Esta rotina busca o CMC NA DATA EXATA da venda (PosicaoEstoque/data) e
// preenche os nulls. O CMC e' historico (capturado no dia da venda), nao o atual.
// =============================================================================

const CMC_HISTORICO_STATE = {}; // { 'nova': { rodando, processados, enriquecidos, semCMC, erros, bloqueadoSegundos, inicio, fim } }

async function _cmcOmie(codigoProduto, dataBR, conta) {
  const r = await omieRequest('/estoque/consulta/', 'PosicaoEstoque', {
    id_prod: parseInt(codigoProduto, 10),
    codigo_local_estoque: 0,
    data: dataBR
  }, conta);
  const cmc = parseFloat(r && r.cmc || 0);
  return { cmc: cmc > 0 ? cmc : null, raw: r };
}

// Detecta erro de bloqueio de quota da Omie (~5-20min de bloqueio total).
// Throw esse erro pra cima pra o loop ABORTAR (continuar gera centenas de erros sem proveito).
class OmieBloqueadoError extends Error {
  constructor(msg, segundos) { super(msg); this.name = 'OmieBloqueadoError'; this.segundos = segundos; }
}

// Tenta data exata; se 0, tenta +7d, +15d, +30d (cenario "faturou antes de dar
// entrada" - CMC so existe dias depois). Retorna { cmc, fonteData } ou null.
// Throws OmieBloqueadoError se a Omie aplicar bloqueio de consumo.
async function buscarCMCNaData(codigoProduto, dataBR, conta) {
  function addDiasBR(s, dias) {
    const [d, m, a] = s.split('/').map(Number);
    const dt = new Date(a, m - 1, d);
    dt.setDate(dt.getDate() + dias);
    return String(dt.getDate()).padStart(2, '0') + '/' + String(dt.getMonth() + 1).padStart(2, '0') + '/' + dt.getFullYear();
  }
  const tentativas = [0, 7, 15, 30];
  for (const dias of tentativas) {
    const dataTry = dias === 0 ? dataBR : addDiasBR(dataBR, dias);
    try {
      const r = await _cmcOmie(codigoProduto, dataTry, conta);
      if (r.cmc) return { cmc: r.cmc, fonteData: dataTry, dias };
    } catch (e) {
      const msg = e.message || '';
      // Bloqueio de quota - propaga pra cima pra abortar o loop inteiro
      const matchBloq = msg.match(/API bloqueada por consumo indevido.*?(\d+)\s*segundos/i);
      if (matchBloq) throw new OmieBloqueadoError(msg, parseInt(matchBloq[1], 10));
      console.log(`[cmc-hist] erro busca codigo=${codigoProduto} data=${dataTry} conta=${conta}: ${msg}`);
      if (dias === 0 && (e.faultstring || /Omie/.test(msg))) return null;
    }
  }
  return null;
}

function getCMCHistoricoState(conta) {
  if (!CMC_HISTORICO_STATE[conta]) CMC_HISTORICO_STATE[conta] = {
    rodando: false, processados: 0, enriquecidos: 0, semCMC: 0, erros: 0, bloqueadoSegundos: 0, inicio: null, fim: null
  };
  return CMC_HISTORICO_STATE[conta];
}

async function enriquecerCMCHistorico(conta, opts) {
  if (!supabase) throw new Error('Supabase nao configurado');
  const slug = String(conta).toLowerCase();
  if (!['nova', 'castro'].includes(slug)) throw new Error('Conta invalida: ' + conta);
  const limiteChamadas = (opts && opts.limite) || 100; // teto de chamadas Omie/execucao
  const incluirPecas = !!(opts && opts.incluirPecas); // default: SO maquinas
  const state = getCMCHistoricoState(slug);
  if (state.rodando) { console.log(`[cmc-hist ${slug}] ja rodando - pulando`); return state; }
  // reset
  Object.assign(state, { rodando: true, processados: 0, enriquecidos: 0, semCMC: 0, erros: 0,
    bloqueadoSegundos: 0, inicio: new Date().toISOString(), fim: null });

  // Pre-fetch codigos de produtos que sao MAQUINAS (familia_nome != peca) pra
  // filtrar antes de queimar quota Omie. Peca tem CMC null muito mais
  // frequentemente e tem rotatividade alta - nao vale o investimento.
  let codigosMaquinas = null;
  if (!incluirPecas) {
    const codigosPermitidos = new Set();
    let offset = 0;
    while (true) {
      const { data: prods } = await supabase.from('produtos')
        .select('codigo_produto,familia_nome,conta_omie')
        .ilike('conta_omie', slug)
        .not('familia_nome', 'is', null)
        .range(offset, offset + 999);
      if (!prods || prods.length === 0) break;
      prods.forEach(p => {
        const fam = String(p.familia_nome || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
        if (!/^pe[çc]/.test(fam)) codigosPermitidos.add(String(p.codigo_produto));
      });
      if (prods.length < 1000) break;
      offset += 1000;
    }
    codigosMaquinas = codigosPermitidos;
    console.log(`[cmc-hist ${slug}] modo maquinas: ${codigosPermitidos.size} codigos no scope`);
  }

  // vendas_itens.conta_omie esta em UPPERCASE
  const contaUC = slug.toUpperCase();
  const tentados = new Set();
  try {
    while (state.processados < limiteChamadas) {
      const { data: itens } = await supabase.from('vendas_itens')
        .select('codigo_produto,data_pedido')
        .ilike('conta_omie', contaUC)
        .is('cmc_unitario', null)
        .not('codigo_produto', 'is', null)
        .not('data_pedido', 'is', null)
        .order('data_pedido', { ascending: false }) // mais recentes primeiro
        .order('codigo_produto', { ascending: true })
        .limit(1000);
      if (!itens || itens.length === 0) break;
      // Dedup por (codigo_produto, data_pedido) + filtro maquinas
      const novos = [];
      const vistos = new Set();
      for (const it of itens) {
        const k = it.codigo_produto + ':' + it.data_pedido;
        if (vistos.has(k) || tentados.has(k)) continue;
        if (codigosMaquinas && !codigosMaquinas.has(String(it.codigo_produto))) continue;
        vistos.add(k); novos.push(it);
      }
      if (novos.length === 0) break;
      let bloqueado = false;
      for (const it of novos) {
        if (state.processados >= limiteChamadas) break;
        const k = it.codigo_produto + ':' + it.data_pedido;
        tentados.add(k);
        try {
          const r = await buscarCMCNaData(it.codigo_produto, it.data_pedido, slug);
          if (r && r.cmc > 0) {
            await supabase.from('vendas_itens')
              .update({ cmc_unitario: r.cmc })
              .eq('codigo_produto', it.codigo_produto)
              .eq('data_pedido', it.data_pedido)
              .ilike('conta_omie', contaUC);
            state.enriquecidos++;
          } else {
            state.semCMC++;
          }
        } catch (e) {
          if (e instanceof OmieBloqueadoError) {
            state.bloqueadoSegundos = e.segundos;
            console.log(`[cmc-hist ${slug}] BLOQUEIO Omie por ${e.segundos}s - abortando loop. Proximo retry: cron 03:00 BRT ou manual apos esse tempo.`);
            bloqueado = true;
            break;
          }
          state.erros++;
        }
        state.processados++;
        // Rate limit Omie conservador: 2s entre chamadas (memoria omie-quirks: max ~3 paralelos com sleep 2s)
        await new Promise(r => setTimeout(r, 2000));
        if (state.processados % 25 === 0) {
          console.log(`[cmc-hist ${slug}] proc=${state.processados} enr=${state.enriquecidos} semCMC=${state.semCMC} err=${state.erros}`);
        }
      }
      if (bloqueado) break;
    }
  } catch (e) {
    console.error(`[cmc-hist ${slug}] erro fatal: ${e.message}`);
    state.erros++;
  }
  state.rodando = false;
  state.fim = new Date().toISOString();
  console.log(`[cmc-hist ${slug}] FINALIZADO proc=${state.processados} enr=${state.enriquecidos} semCMC=${state.semCMC} err=${state.erros}`);
  return state;
}

// =============================================================================
// Detecta pedidos de venda invalidos (cancelados/devolvidos) - maquinas
// =============================================================================
// Cada maquina no Omie tem codigo unico (1 produto = 1 chassis). Se um codigo
// aparece com 2+ vendas em vendas_itens, em 98% dos casos as vendas anteriores
// foram canceladas ou devolvidas via NF de entrada posterior - so a ultima e' a
// real. O sync ja filtra cancelado='S' do pedido, mas devolucoes NAO sao
// detectadas (o pedido permanece "Faturado").
// Estrategia: ConsultarPedido por numero_pedido na API Omie; marca em
// vendas_pedidos_invalidos. Filtro aplicado em runtime nas queries de
// vendas_itens (DRE, /vendas-modelo, etc).

const PEDIDOS_INVALIDOS_STATE = {}; // por conta

function getPedidosInvalidosState(conta) {
  if (!PEDIDOS_INVALIDOS_STATE[conta]) PEDIDOS_INVALIDOS_STATE[conta] = {
    rodando: false, candidatos: 0, processados: 0, marcadosOmie: 0, marcadosHeur: 0,
    naoDecididos: 0, erros: 0, bloqueadoSegundos: 0, inicio: null, fim: null
  };
  return PEDIDOS_INVALIDOS_STATE[conta];
}

// Helper compartilhado: carrega set de pedidos invalidos (cache 5min).
// Chave: 'conta|numero_pedido' (lowercase conta).
let cachePedidosInvalidos = { ts: 0, set: new Set() };
async function carregarPedidosInvalidos() {
  if (Date.now() - cachePedidosInvalidos.ts < 5 * 60 * 1000) return cachePedidosInvalidos.set;
  if (!supabase) { cachePedidosInvalidos = { ts: Date.now(), set: new Set() }; return cachePedidosInvalidos.set; }
  try {
    const { data } = await supabase.from('vendas_pedidos_invalidos')
      .select('numero_pedido,conta_omie');
    const set = new Set((data||[]).map(r => String(r.conta_omie||'').toLowerCase() + '|' + String(r.numero_pedido)));
    cachePedidosInvalidos = { ts: Date.now(), set };
  } catch (e) {
    // Se a tabela ainda nao foi criada, cache vazio (filtro nao bloqueia nada)
    console.warn('[pedidos-invalidos] cache load erro (tabela existe?):', e.message);
    cachePedidosInvalidos = { ts: Date.now(), set: new Set() };
  }
  return cachePedidosInvalidos.set;
}
function pedidoEhInvalido(set, contaOmie, numeroPedido) {
  if (!numeroPedido) return false;
  return set.has(String(contaOmie||'').toLowerCase() + '|' + String(numeroPedido));
}

// Lista pedidos suspeitos pra uma conta: codigos de MAQUINAS (familia != peca)
// com 2+ vendas. Retorna [{ codigo_produto, numero_pedido, data_pedido, descricao }, ...]
// dos pedidos NAO mais recentes de cada grupo, JA excluindo os ja marcados.
async function listarPedidosSuspeitos(conta) {
  const slug = String(conta).toLowerCase();
  const contaUC = slug.toUpperCase();
  // pre-fetch codigos de maquinas (familia_nome != peca)
  const codigosMaq = new Set();
  let offset = 0;
  while (true) {
    const { data: ps } = await supabase.from('produtos')
      .select('codigo_produto,familia_nome')
      .ilike('conta_omie', slug)
      .not('familia_nome', 'is', null)
      .range(offset, offset + 999);
    if (!ps || ps.length === 0) break;
    ps.forEach(p => {
      const fam = String(p.familia_nome||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
      if (!/^pe[çc]/.test(fam)) codigosMaq.add(String(p.codigo_produto));
    });
    if (ps.length < 1000) break;
    offset += 1000;
  }
  // busca vendas de maquinas (paginado)
  const vendas = [];
  let off2 = 0;
  while (true) {
    const { data: rows } = await supabase.from('vendas_itens')
      .select('codigo_produto,data_pedido,numero_pedido,descricao')
      .ilike('conta_omie', contaUC)
      .not('numero_pedido', 'is', null)
      .range(off2, off2 + 999);
    if (!rows || rows.length === 0) break;
    rows.forEach(r => { if (codigosMaq.has(String(r.codigo_produto))) vendas.push(r); });
    if (rows.length < 1000) break;
    off2 += 1000;
  }
  // agrupa por codigo_produto
  const porCp = {};
  vendas.forEach(v => {
    const cp = String(v.codigo_produto);
    if (!porCp[cp]) porCp[cp] = [];
    porCp[cp].push(v);
  });
  // pra cada grupo com 2+, retorna todos exceto o de data_pedido mais recente
  function parseDataBR(s) {
    const m = String(s||'').match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (!m) return 0;
    return parseInt(m[3]+m[2]+m[1], 10);
  }
  const suspeitos = [];
  Object.values(porCp).forEach(arr => {
    if (arr.length < 2) return;
    arr.sort((a, b) => parseDataBR(b.data_pedido) - parseDataBR(a.data_pedido)); // desc
    // arr[0] = mais recente (preserva); resto entra como suspeito
    for (let i = 1; i < arr.length; i++) suspeitos.push(arr[i]);
  });
  // dedup por numero_pedido
  const vistos = new Set();
  const unicos = suspeitos.filter(s => {
    const k = String(s.numero_pedido);
    if (vistos.has(k)) return false;
    vistos.add(k); return true;
  });
  // exclui ja marcados
  const jaMarcados = await carregarPedidosInvalidos();
  const restantes = unicos.filter(s => !pedidoEhInvalido(jaMarcados, contaUC, s.numero_pedido));
  return restantes;
}

// Consulta Omie pra validar 1 pedido. Retorna { invalido, motivo, detalhe } ou
// null se Omie nao confirmou. Throws OmieBloqueadoError em caso de bloqueio.
async function validarPedidoOmie(numeroPedido, conta) {
  const r = await omieRequest('/produtos/pedido/', 'ConsultarPedido',
    { numero_pedido: String(numeroPedido) }, conta);
  // ConsultarPedido pode envelopar em pedido_venda_produto
  const pv = (r && (r.pedido_venda_produto || r)) || {};
  const cab = pv.cabecalho || {};
  const info = pv.infoCadastro || {};
  // info.cancelado e' o flag principal (S=cancelado)
  if (info.cancelado === 'S' || cab.cancelada === 'S' || cab.cancelado === 'S') {
    return { invalido: true, motivo: 'cancelado_omie',
      detalhe: { etapa: cab.etapa, cancelado: 'S', cFaturado: info.cFaturado } };
  }
  // Pedido nao cancelado mas talvez tenha sido devolvido posteriormente
  // (NF de entrada vinculada) - validacao via NF e' fora de escopo desta versao.
  return null;
}

async function detectarPedidosInvalidos(conta, opts) {
  if (!supabase) throw new Error('Supabase nao configurado');
  const slug = String(conta).toLowerCase();
  if (!['nova', 'castro'].includes(slug)) throw new Error('Conta invalida: ' + conta);
  const limite = (opts && opts.limite) || 30;
  const heuristicaFallback = !!(opts && opts.heuristica);
  const gapDias = (opts && opts.gapDias) || 30;
  const state = getPedidosInvalidosState(slug);
  if (state.rodando) { console.log(`[ped-invalid ${slug}] ja rodando - pulando`); return state; }
  Object.assign(state, { rodando: true, candidatos: 0, processados: 0, marcadosOmie: 0,
    marcadosHeur: 0, naoDecididos: 0, erros: 0, bloqueadoSegundos: 0,
    inicio: new Date().toISOString(), fim: null });

  try {
    const suspeitos = await listarPedidosSuspeitos(slug);
    state.candidatos = suspeitos.length;
    console.log(`[ped-invalid ${slug}] ${suspeitos.length} pedidos suspeitos (limite=${limite}, heur=${heuristicaFallback})`);
    // Mapeia pra heuristica: precisa do data_pedido da venda MAIS RECENTE de cada codigo
    let datasRecentes = {};
    if (heuristicaFallback) {
      const { data: rows } = await supabase.from('vendas_itens')
        .select('codigo_produto,data_pedido')
        .ilike('conta_omie', slug.toUpperCase())
        .order('data_pedido', { ascending: false })
        .limit(50000);
      (rows||[]).forEach(r => {
        const cp = String(r.codigo_produto);
        if (!datasRecentes[cp]) datasRecentes[cp] = r.data_pedido;
      });
    }
    function parseDataBR(s) {
      const m = String(s||'').match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      if (!m) return null;
      return new Date(parseInt(m[3]), parseInt(m[2])-1, parseInt(m[1]));
    }

    for (const s of suspeitos) {
      if (state.processados >= limite) break;
      let resultado = null;
      try {
        resultado = await validarPedidoOmie(s.numero_pedido, slug);
      } catch (e) {
        if (e instanceof OmieBloqueadoError) {
          state.bloqueadoSegundos = e.segundos;
          console.log(`[ped-invalid ${slug}] BLOQUEIO Omie por ${e.segundos}s - abortando`);
          break;
        }
        state.erros++;
        console.log(`[ped-invalid ${slug}] erro validar pedido=${s.numero_pedido}: ${e.message}`);
      }
      // Fallback heuristico se Omie nao confirmou e flag ligado
      if (!resultado && heuristicaFallback) {
        const cp = String(s.codigo_produto);
        const dRecente = parseDataBR(datasRecentes[cp]);
        const dEste = parseDataBR(s.data_pedido);
        if (dRecente && dEste) {
          const diffDias = Math.abs((dRecente - dEste) / 86400000);
          if (diffDias > 0 && diffDias < gapDias) {
            resultado = { invalido: true, motivo: 'heuristica_30d',
              detalhe: { gap_dias: Math.round(diffDias), data_pedido: s.data_pedido,
                         data_mais_recente: datasRecentes[cp], codigo_produto: cp } };
          }
        }
      }
      if (resultado && resultado.invalido) {
        await supabase.from('vendas_pedidos_invalidos').upsert({
          numero_pedido: String(s.numero_pedido),
          conta_omie: slug.toUpperCase(),
          motivo: resultado.motivo,
          detalhe: resultado.detalhe
        }, { onConflict: 'numero_pedido,conta_omie' });
        if (resultado.motivo === 'heuristica_30d') state.marcadosHeur++;
        else state.marcadosOmie++;
      } else if (!resultado) {
        state.naoDecididos++;
      }
      state.processados++;
      // Invalida cache global (re-carrega no proximo uso)
      cachePedidosInvalidos = { ts: 0, set: new Set() };
      // Rate limit Omie conservador (mesma quota quirk do CMC historico)
      await new Promise(r => setTimeout(r, 2000));
      if (state.processados % 10 === 0) {
        console.log(`[ped-invalid ${slug}] proc=${state.processados} omie=${state.marcadosOmie} heur=${state.marcadosHeur} indef=${state.naoDecididos} err=${state.erros}`);
      }
    }
  } catch (e) {
    console.error(`[ped-invalid ${slug}] erro fatal: ${e.message}`);
    state.erros++;
  }
  state.rodando = false;
  state.fim = new Date().toISOString();
  console.log(`[ped-invalid ${slug}] FINALIZADO proc=${state.processados} omie=${state.marcadosOmie} heur=${state.marcadosHeur} indef=${state.naoDecididos} err=${state.erros}`);
  return state;
}

// =============================================================================
// Exports - tudo que as rotas Next vao precisar.
// =============================================================================
module.exports = {
  // Constantes / defaults
  CONTA_PADRAO,
  TIPO_PADRAO,
  TIPOS_VALIDOS,
  MESES,
  VENCIDOS_IGNORADOS,
  FAMILIAS_IGNORAR,
  HOME_TTL_MS,
  _homeKpisCache,

  // Erro custom
  OmieBloqueadoError,

  // Helpers de query/titulos
  tabelaPorTipo,
  colunaNomePorTipo,
  aplicarConta,
  aplicarFiltrosExtras,
  filtraPorStatus,
  escondeVencidoAntigo,
  buscaTitulosBase,
  selectPaginado,

  // KPIs / Home
  calcularKpisHome,
  SAUDE_TTL_MS,
  calcularSaudeFinanceira,

  // Estoque / Patrimonio / Frota / Ciclo / Cobertura
  isFamiliaPeca,
  calcularEstoque,
  calcularFrota,
  calcularAberto,
  ultimosMeses,
  vendasDiariasMedias,
  comprasDiariasMedias,
  calcularCicloDeCaixa,
  calcularCobertura,
  calcularPatrimonio,

  // Margens / Vendas por modelo
  calcularMargens,
  calcularVendasPorModelo,

  // DRE (Omie consolidada + competencia)
  agregaArvoreDRE,
  mergeResumoEm,
  calcularDREConsolidada,
  montarFromRaw,
  calcularCicloCaixa,
  classificaGrupoCP,
  arvoreEmptyTree,
  addNoTree,
  calcularDRECompetencia,

  // Capital parado / familias
  parseBRdataToDate,
  familiaNormalizada,
  calcularCapitalParado,

  // Margem bruta
  mesesEntre,
  rotuloBucket,
  calcularMargem,
  calcularMargensPorFamilia,

  // CMC historico
  CMC_HISTORICO_STATE,
  _cmcOmie,
  buscarCMCNaData,
  getCMCHistoricoState,
  enriquecerCMCHistorico,

  // Pedidos invalidos
  PEDIDOS_INVALIDOS_STATE,
  getPedidosInvalidosState,
  carregarPedidosInvalidos,
  pedidoEhInvalido,
  listarPedidosSuspeitos,
  validarPedidoOmie,
  detectarPedidosInvalidos
};
