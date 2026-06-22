const { supabaseAdmin } = require('./supabase');
const { parseBR, parseBRTimestamp, fmtBR } = require('./dates');

const OMIE_BASE_URL = 'https://app.omie.com.br/api/v1';
const PAGE_SIZE = 500;
const SLEEP_BETWEEN_PAGES = 2000;

const CONTAS_OMIE = {
  nova: {
    nome: 'Nova',
    label: 'NOVA',
    appKey: process.env.OMIE_APP_KEY_NOVA,
    appSecret: process.env.OMIE_APP_SECRET_NOVA
  },
  castro: {
    nome: 'Castro',
    label: 'CASTRO',
    appKey: process.env.OMIE_APP_KEY_CASTRO,
    appSecret: process.env.OMIE_APP_SECRET_CASTRO
  }
};

// Configuracao por tipo de titulo. As duas tabelas tem o mesmo schema, exceto
// pela coluna do nome do contraparte (fornecedor vs cliente).
const CONFIG = {
  pagar: {
    endpoint: '/financas/contapagar/',
    call: 'ListarContasPagar',
    listaKey: 'conta_pagar_cadastro',
    tabela: 'contas_pagar',
    colunaNome: 'nome_fornecedor',
    tipoLog: 'contas_pagar'
  },
  receber: {
    endpoint: '/financas/contareceber/',
    call: 'ListarContasReceber',
    listaKey: 'conta_receber_cadastro',
    tabela: 'contas_receber',
    colunaNome: 'nome_cliente',
    tipoLog: 'contas_receber'
  }
};

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// A API Omie ListarContasPagar/ListarContasReceber NAO tem filtro por
// data de vencimento. Filtramos por emissao com janela ampla para garantir
// que titulos com vencimento na janela desejada sejam capturados (ex.: parcela
// 24x emitida 2 anos antes do vencimento).
function janelaEmissaoCobrindoVencimento(deVencBR, ateVencBR) {
  function parseBRtoDate(s) {
    const [d, m, y] = s.split('/').map(n => parseInt(n, 10));
    return new Date(y, m - 1, d);
  }
  const deVenc = parseBRtoDate(deVencBR);
  const ateVenc = parseBRtoDate(ateVencBR);
  const deEm = new Date(deVenc); deEm.setMonth(deEm.getMonth() - 24);
  const ateEm = new Date(ateVenc); ateEm.setMonth(ateEm.getMonth() + 3);
  return { deEm: fmtBR(deEm), ateEm: fmtBR(ateEm) };
}

function getCredentials(conta) {
  const cfg = CONTAS_OMIE[conta];
  if (!cfg) throw new Error(`Conta Omie desconhecida: ${conta}`);
  if (!cfg.appKey || !cfg.appSecret) {
    throw new Error(`Credenciais nao configuradas para conta: ${conta}`);
  }
  return { appKey: cfg.appKey, appSecret: cfg.appSecret };
}

function getContasOmie() {
  return Object.entries(CONTAS_OMIE)
    .filter(([, v]) => v.appKey && v.appSecret)
    .map(([id, v]) => ({ id, nome: v.nome, label: v.label }));
}

function labelConta(conta) {
  return CONTAS_OMIE[conta]?.label || (conta || '').toUpperCase();
}

async function omieRequest(endpoint, call, params, conta, tentativa = 1) {
  const { appKey, appSecret } = getCredentials(conta);
  let res;
  try {
    res = await fetch(`${OMIE_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ call, app_key: appKey, app_secret: appSecret, param: [params] })
    });
  } catch (e) {
    // Falha de rede (DNS, timeout, conexao recusada, etc) - retry com backoff
    if (tentativa <= 3) {
      const espera = tentativa * 5000;
      console.log(`[omie ${conta}] rede falhou (${e.message}) - retry em ${espera/1000}s (tentativa ${tentativa}/3)`);
      await sleep(espera);
      return omieRequest(endpoint, call, params, conta, tentativa + 1);
    }
    throw e;
  }
  const data = await res.json();
  if (data.faultstring) {
    const fs = String(data.faultstring);
    const isRate = fs.includes('Too many requests') || fs.includes('REDUNDANT') || fs.includes('Ja existe uma requisi') || fs.includes('Já existe uma requisi');
    if (isRate && tentativa <= 5) {
      const espera = tentativa * 4000;
      console.log(`[omie ${conta}] rate limit - aguardando ${espera/1000}s (tentativa ${tentativa}/5)`);
      await sleep(espera);
      return omieRequest(endpoint, call, params, conta, tentativa + 1);
    }
    const e = new Error(`Omie API: ${fs}`);
    e.faultstring = fs;
    throw e;
  }
  return data;
}

// =============================================================================
// State de sync (em memoria, por tipo+conta). Chave: `${tipo}_${conta}`
// tudoEmAndamento: marca conta inteira como ocupada durante sincronizarTudo,
// cobrindo o gap entre o fim do sync de pagar e o inicio do receber.
// =============================================================================
const syncState = {};
const tudoEmAndamento = new Set();
function syncKey(tipo, conta) { return `${tipo}_${conta}`; }
function getSyncState(conta, tipo) {
  // Se tipo nao for informado, retorna agregado dos dois tipos da conta.
  if (!tipo) {
    const pagar = getSyncStateUnico(conta, 'pagar');
    const receber = getSyncStateUnico(conta, 'receber');
    const tudo = tudoEmAndamento.has(conta);
    const algumRodando = tudo || pagar.rodando || receber.rodando;
    return {
      rodando: algumRodando,
      etapa: pagar.rodando ? `pagar: ${pagar.etapa}` : (receber.rodando ? `receber: ${receber.etapa}` : (tudo ? 'aguardando proxima fase' : (pagar.etapa || receber.etapa || ''))),
      paginaAtual: (pagar.rodando ? pagar.paginaAtual : 0) + (receber.rodando ? receber.paginaAtual : 0),
      totalPaginas: pagar.totalPaginas + receber.totalPaginas,
      registrosSalvos: pagar.registrosSalvos + receber.registrosSalvos,
      inicio: pagar.inicio || receber.inicio,
      fim: !algumRodando ? (receber.fim || pagar.fim) : null,
      erro: pagar.erro || receber.erro,
      pagar, receber
    };
  }
  return getSyncStateUnico(conta, tipo);
}
function getSyncStateUnico(conta, tipo) {
  const k = syncKey(tipo, conta);
  if (!syncState[k]) {
    syncState[k] = { rodando: false, etapa: '', paginaAtual: 0, totalPaginas: 0, registrosSalvos: 0, inicio: null, fim: null, erro: null };
  }
  return syncState[k];
}

// =============================================================================
// Resolvers: categorias e departamentos
// Categorias: mapa codigo -> { descricao, grupo }
//   "grupo" e' a descricao da categoria-raiz na arvore (codigo sem ponto).
// =============================================================================
async function buscarCategorias(conta) {
  const mapa = {};
  let pag = 1;
  while (true) {
    let r;
    try {
      r = await omieRequest('/geral/categorias/', 'ListarCategorias', {
        pagina: pag,
        registros_por_pagina: PAGE_SIZE
      }, conta);
    } catch (e) {
      if (e.faultstring && /n[aã]o.*registros|ERROR/i.test(e.faultstring)) break;
      throw e;
    }
    const lista = r.categoria_cadastro || [];
    if (lista.length === 0) break;
    lista.forEach(c => {
      if (c.codigo) {
        mapa[c.codigo] = {
          descricao: c.descricao || c.descricao_padrao || '',
          codigoSuperior: c.categoria_superior || null,
          descricaoPadrao: c.descricao_padrao || null,
          totalizadora: c.totalizadora === true || c.totalizadora === 'S',
          definidaPeloUsuario: c.definida_pelo_usuario === true
        };
      }
    });
    const totalPag = r.total_de_paginas || 0;
    console.log(`[categorias ${conta}] pag ${pag}/${totalPag || '?'}, ${lista.length} itens (acumulado: ${Object.keys(mapa).length})`);
    // Confia em total_de_paginas quando disponivel; caso contrario,
    // so para quando a pagina vem vazia (loop ja trata acima).
    if (totalPag > 0) {
      if (pag >= totalPag) break;
    } else if (lista.length < PAGE_SIZE) {
      // Sem total_de_paginas, fallback heuristico
      break;
    }
    pag++;
    await sleep(1000);
  }

  // Resolve "grupo" da categoria. Estrategia preferencial:
  //   Navega via categoria_superior ate encontrar a primeira totalizadora.
  //   Essa e' a categoria-pai natural (ex: "2.01" Compras, "2.04" Manutencao).
  // Fallbacks: 2º nivel do codigo, raiz, ou codigo bruto.
  function descricaoUtil(entry) {
    return entry.descricao || entry.descricaoPadrao || null;
  }

  Object.keys(mapa).forEach(codigo => {
    const entry = mapa[codigo];
    let grupo = null;

    // Se a propria categoria e' totalizadora, ela ja e' o grupo
    if (entry.totalizadora) {
      grupo = descricaoUtil(entry);
    }

    // Sobe pela hierarquia ate achar uma totalizadora
    if (!grupo) {
      let atual = entry.codigoSuperior;
      let safety = 0;
      while (atual && mapa[atual] && safety++ < 10) {
        if (mapa[atual].totalizadora) {
          grupo = descricaoUtil(mapa[atual]);
          break;
        }
        atual = mapa[atual].codigoSuperior;
      }
    }

    // Fallback: tenta nivel 2 do codigo (ex: "2.01")
    if (!grupo) {
      const partes = String(codigo).split('.');
      if (partes.length >= 2) {
        const nivel2 = `${partes[0]}.${partes[1]}`;
        if (mapa[nivel2]) grupo = descricaoUtil(mapa[nivel2]);
        if (!grupo) grupo = nivel2;
      }
    }

    // Fallback final: raiz
    if (!grupo) {
      grupo = String(codigo).split('.')[0];
    }

    entry.grupo = grupo;
  });

  // Diagnostico: confirma que a Omie retornou flags totalizadora
  const totaliz = Object.values(mapa).filter(e => e.totalizadora).length;
  const usuario = Object.values(mapa).filter(e => e.definidaPeloUsuario).length;
  const amostraTotaliz = Object.entries(mapa)
    .filter(([, e]) => e.totalizadora)
    .slice(0, 5)
    .map(([cod, e]) => `${cod}=${e.descricao}`);
  console.log(`[categorias ${conta}] total=${Object.keys(mapa).length}, totalizadoras=${totaliz}, definidas_pelo_usuario=${usuario}`);
  console.log(`[categorias ${conta}] amostra totalizadoras: ${amostraTotaliz.join(' | ')}`);

  return mapa;
}

// Mapa codigo_cliente_omie -> nome (fantasia ou razao social).
// Usado para resolver o nome da contraparte ja que ListarContasPagar/Receber
// retornam apenas codigo_cliente_fornecedor, sem o nome.
//
// Retorna { mapa, completo }. `completo` e' FALSE quando a paginacao foi
// interrompida por erro (mapa parcial). O caller NUNCA deve gravar nomes a
// partir de um mapa incompleto: faria UPSERT com nome=null e apagaria nomes
// que ja estavam corretos (bug que zerou ~10k linhas no sync de 22/06).
async function buscarClientesFornecedores(conta) {
  const mapa = {};
  let pag = 1;
  let completo = true;
  while (true) {
    let r;
    try {
      // Retry de pagina alem do retry interno do omieRequest (rede/rate-limit):
      // cobre um erro pontual sem abortar a coleta inteira.
      let tentativaPag = 0;
      for (;;) {
        try {
          r = await omieRequest('/geral/clientes/', 'ListarClientesResumido', {
            pagina: pag,
            registros_por_pagina: PAGE_SIZE,
            apenas_importado_api: 'N'
          }, conta);
          break;
        } catch (e) {
          if (e.faultstring && /n[aã]o.*registros|ERROR/i.test(e.faultstring)) throw e;
          if (tentativaPag >= 2) throw e;
          tentativaPag++;
          console.log(`[clientes ${conta}] pag ${pag} falhou (${e.message}) - retry ${tentativaPag}/2`);
          await sleep(3000);
        }
      }
    } catch (e) {
      // "Nao existem registros" = fim normal (mapa completo). Qualquer outro
      // erro = paginacao interrompida -> mapa parcial -> marca incompleto.
      if (e.faultstring && /n[aã]o.*registros|ERROR/i.test(e.faultstring)) break;
      console.log(`[clientes ${conta}] ListarClientesResumido falhou (mapa PARCIAL): ${e.message}`);
      completo = false;
      break;
    }
    // Defensivo: se a Omie mudar a chave da lista, infere o primeiro array da
    // resposta em vez de devolver mapa vazio silenciosamente.
    let lista = r.clientes_cadastro_resumido || r.clientes_cadastro;
    if (!Array.isArray(lista)) {
      const arrKey = r && typeof r === 'object' ? Object.keys(r).find(k => Array.isArray(r[k])) : null;
      if (arrKey) {
        console.log(`[clientes ${conta}] chave de lista inferida: "${arrKey}"`);
        lista = r[arrKey];
      } else {
        lista = [];
      }
    }
    if (lista.length === 0) break;
    lista.forEach(c => {
      const cod = c.codigo_cliente || c.codigo_cliente_omie;
      const nome = c.nome_fantasia || c.razao_social || c.nome_cliente || null;
      if (cod) mapa[cod] = nome;
    });
    const totalPag = r.total_de_paginas || 0;
    console.log(`[clientes ${conta}] pag ${pag}/${totalPag || '?'}, ${lista.length} itens (acumulado: ${Object.keys(mapa).length})`);
    if (totalPag > 0) {
      if (pag >= totalPag) break;
    } else if (lista.length < PAGE_SIZE) {
      break;
    }
    pag++;
    await sleep(1000);
  }
  return { mapa, completo };
}

async function buscarDepartamentos(conta) {
  const mapa = {};
  let pag = 1;
  while (true) {
    let r;
    try {
      r = await omieRequest('/geral/departamentos/', 'ListarDepartamentos', {
        pagina: pag,
        registros_por_pagina: PAGE_SIZE
      }, conta);
    } catch (e) {
      if (e.faultstring && /n[aã]o.*registros|ERROR/i.test(e.faultstring)) break;
      console.log(`[omie ${conta}] ListarDepartamentos falhou: ${e.message}`);
      return mapa;
    }
    const lista = r.departamentos || r.cadastro || [];
    if (lista.length === 0) break;
    lista.forEach(d => {
      const cod = d.codigo || d.codigo_departamento;
      if (cod) mapa[cod] = d.descricao || d.descricao_departamento || '';
    });
    const totalPag = r.total_de_paginas || 0;
    console.log(`[departamentos ${conta}] pag ${pag}/${totalPag || '?'}, ${lista.length} itens (acumulado: ${Object.keys(mapa).length})`);
    if (totalPag > 0) {
      if (pag >= totalPag) break;
    } else if (lista.length < PAGE_SIZE) {
      break;
    }
    pag++;
    await sleep(1000);
  }
  return mapa;
}

// =============================================================================
// Lista movimentos financeiros (baixas) - endpoint /financas/mf/ ListarMovimentos
// Retorna lista de { nCodTitulo, natureza, dDtPagamento, nValPago, ... }
// Filtra por janela de DATA DE PAGAMENTO (DD/MM/YYYY).
// =============================================================================
async function buscarMovimentos(conta, dePagBR, atePagBR) {
  const todos = [];
  let pag = 1;
  while (true) {
    let r;
    try {
      r = await omieRequest('/financas/mf/', 'ListarMovimentos', {
        nPagina: pag,
        nRegPorPagina: PAGE_SIZE,
        dDtPagtoDe: dePagBR,
        dDtPagtoAte: atePagBR
      }, conta);
    } catch (e) {
      if (e.faultstring && /n[aã]o.*registros|ERROR/i.test(e.faultstring)) break;
      throw e;
    }
    const lista = r.movimentos || [];
    if (lista.length === 0) break;
    lista.forEach(m => {
      const d = m.detalhes || {};
      const res = m.resumo || {};
      if (!d.nCodTitulo) return;
      todos.push({
        nCodTitulo: d.nCodTitulo,
        natureza: d.cNatureza, // 'P' (pagar) | 'R' (receber)
        dDtPagamento: d.dDtPagamento,
        nValPago: Number(res.nValPago) || 0,
        cLiquidado: res.cLiquidado,
        cStatus: d.cStatus
      });
    });
    const totalPag = r.nTotPaginas || 0;
    console.log(`[movimentos ${conta}] pag ${pag}/${totalPag || '?'}, ${lista.length} itens (acumulado: ${todos.length})`);
    if (totalPag > 0) {
      if (pag >= totalPag) break;
    } else if (lista.length < PAGE_SIZE) {
      break;
    }
    pag++;
    await sleep(SLEEP_BETWEEN_PAGES);
  }
  return todos;
}

// Aplica baixas no Supabase: atualiza data_pagamento e valor_pago dos titulos
// cujos codigo_lancamento batem com nCodTitulo. Faz update em chunks para
// reduzir round-trips.
async function aplicarBaixas(conta, dePagBR, atePagBR) {
  if (!supabaseAdmin) return { ok: false, mensagem: 'Supabase nao configurado' };
  const contaLabel = labelConta(conta);
  console.log(`[baixas ${conta}] buscando movimentos de ${dePagBR} a ${atePagBR}`);
  const movs = await buscarMovimentos(conta, dePagBR, atePagBR);
  console.log(`[baixas ${conta}] ${movs.length} movimentos encontrados`);
  if (movs.length === 0) return { ok: true, atualizados: 0 };

  // Se houver multiplas baixas no mesmo titulo (parcial + final), pega a MAIOR data.
  const mapaPorTitulo = {};
  movs.forEach(m => {
    const codTit = m.nCodTitulo;
    const cur = mapaPorTitulo[codTit];
    if (!cur || (m.dDtPagamento && m.dDtPagamento.localeCompare(cur.dDtPagamento) > 0)) {
      mapaPorTitulo[codTit] = m;
    }
  });

  const pagar = [];
  const receber = [];
  Object.values(mapaPorTitulo).forEach(m => {
    const row = {
      codigo_lancamento: m.nCodTitulo,
      data_pagamento: parseBR(m.dDtPagamento),
      valor_pago: m.nValPago
    };
    if (m.natureza === 'R') receber.push(row);
    else pagar.push(row);
  });

  // Update individual (Supabase JS nao tem batch UPDATE por linha).
  // Em chunks paralelos pequenos para nao saturar.
  async function atualizaTabela(tabela, rows) {
    let ok = 0, err = 0;
    const CHUNK = 20;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const proms = slice.map(r => supabaseAdmin.from(tabela)
        .update({ data_pagamento: r.data_pagamento, valor_pago: r.valor_pago })
        .eq('codigo_lancamento', r.codigo_lancamento)
        .eq('conta_omie', contaLabel)
        .then(res => res.error ? err++ : ok++));
      await Promise.all(proms);
      if ((i / CHUNK) % 10 === 0) {
        console.log(`[baixas ${conta}] ${tabela}: ${i + slice.length}/${rows.length} processados`);
      }
    }
    return { ok, err };
  }

  const resP = await atualizaTabela('contas_pagar', pagar);
  const resR = await atualizaTabela('contas_receber', receber);
  console.log(`[baixas ${conta}] aplicado - pagar: ${resP.ok} ok / ${resP.err} erro, receber: ${resR.ok} ok / ${resR.err} erro`);
  return { ok: true, atualizados: resP.ok + resR.ok, erros: resP.err + resR.err };
}

// =============================================================================
// Mapeia titulo Omie -> linha da tabela (pagar OU receber, conforme cfg)
// =============================================================================
function mapearTitulo(t, mapaCategorias, mapaDepartamentos, mapaContrapartes, contaLabel, cfg) {
  const cat = (t.categorias && t.categorias[0]) || {};
  const codCat = t.codigo_categoria || cat.codigo_categoria || null;
  // Departamento vem em distribuicao[0].cCodDep/cDesDep no payload da Omie.
  const distArr = Array.isArray(t.distribuicao) ? t.distribuicao : [];
  const primDist = distArr[0] || {};
  const codDep = primDist.cCodDep || t.codigo_departamento || null;
  const descDepInline = primDist.cDesDep || null;
  const info = t.info || {};
  const docFiscal = t.numero_documento_fiscal || '';
  const codCC = t.codigo_cliente_fornecedor || null;
  // Nome nao vem na resposta de ListarContasPagar/Receber - resolvemos via
  // mapaContrapartes (cadastro de clientes/fornecedores).
  const nome = (codCC && mapaContrapartes[codCC]) || null;

  const row = {
    codigo_lancamento: t.codigo_lancamento_omie || t.codigo_lancamento || null,
    codigo_lancamento_integracao: t.codigo_lancamento_integracao || null,
    conta_omie: contaLabel,

    numero_documento: t.numero_documento || null,
    numero_documento_fiscal: docFiscal || null,
    numero_boleto: t.numero_boleto || t.numero_titulo || null,
    numero_parcela: t.numero_parcela || null,
    observacao: t.observacao || null,

    data_emissao: parseBR(t.data_emissao),
    data_vencimento: parseBR(t.data_vencimento),
    data_previsao: parseBR(t.data_previsao),
    data_pagamento: parseBR(t.data_pagamento),

    valor_documento: parseFloat(t.valor_documento || 0),
    valor_pago: parseFloat(t.valor_pago || 0),
    valor_imp_retido: parseFloat(t.valor_pis || 0) + parseFloat(t.valor_cofins || 0)
                       + parseFloat(t.valor_csll || 0) + parseFloat(t.valor_ir || 0)
                       + parseFloat(t.valor_iss || 0) + parseFloat(t.valor_inss || 0),

    status_titulo: t.status_titulo || null,

    codigo_categoria: codCat,
    descricao_categoria: codCat ? (mapaCategorias[codCat]?.descricao || null) : null,
    grupo_categoria: codCat ? (mapaCategorias[codCat]?.grupo || null) : null,
    codigo_departamento: codDep,
    descricao_departamento: descDepInline || (codDep ? (mapaDepartamentos[codDep] || null) : null),

    codigo_cliente_fornecedor: codCC,

    alterado_por: info.uAlt || null,
    incluido_por: info.uInc || null,
    data_inclusao: parseBRTimestamp(info.dInc ? `${info.dInc} ${info.hInc || '00:00:00'}` : null),
    data_alteracao: parseBRTimestamp(info.dAlt ? `${info.dAlt} ${info.hAlt || '00:00:00'}` : null),

    raw: t,
    synced_at: new Date().toISOString()
  };
  // Coluna do nome do contraparte muda conforme tipo (nome_fornecedor / nome_cliente)
  row[cfg.colunaNome] = nome;
  return row;
}

// =============================================================================
// Sync generico (parametrizado por config pagar/receber)
// =============================================================================
async function sincronizarTitulos(conta, deStr, ateStr, tipo) {
  const cfg = CONFIG[tipo];
  if (!cfg) throw new Error(`Tipo invalido: ${tipo}`);
  const s = getSyncStateUnico(conta, tipo);
  if (s.rodando) {
    return { ok: false, mensagem: `Sync ${tipo} ja em andamento para esta conta` };
  }
  if (!supabaseAdmin) {
    return { ok: false, mensagem: 'Supabase nao configurado' };
  }
  const contaLabel = labelConta(conta);

  s.rodando = true;
  s.etapa = 'iniciando';
  s.paginaAtual = 0;
  s.totalPaginas = 0;
  s.registrosSalvos = 0;
  s.inicio = new Date().toISOString();
  s.fim = null;
  s.erro = null;

  let logId = null;
  try {
    const { data: log } = await supabaseAdmin
      .from('cp_sync_log')
      .insert({
        conta_omie: contaLabel,
        tipo: cfg.tipoLog,
        status: 'em_andamento',
        parametros: { de: deStr, ate: ateStr }
      })
      .select('id').single();
    logId = log?.id;

    s.etapa = 'mapas (categorias / departamentos / contrapartes)';
    const [mapaCat, mapaDep, contrapartes] = await Promise.all([
      buscarCategorias(conta).catch(e => { console.log(`categorias: ${e.message}`); return {}; }),
      buscarDepartamentos(conta).catch(e => { console.log(`departamentos: ${e.message}`); return {}; }),
      buscarClientesFornecedores(conta).catch(e => { console.log(`contrapartes: ${e.message}`); return { mapa: {}, completo: false }; })
    ]);
    const mapaContra = contrapartes.mapa || {};
    console.log(`[sync ${tipo} ${conta}] categorias: ${Object.keys(mapaCat).length}, departamentos: ${Object.keys(mapaDep).length}, contrapartes: ${Object.keys(mapaContra).length} (completo=${contrapartes.completo})`);

    // GUARD: nunca gravar a partir de um mapa de contrapartes vazio/incompleto.
    // O upsert reescreve a linha inteira; com mapa ruim, nome_fornecedor/
    // nome_cliente iriam para null e APAGARIAM nomes ja corretos. Melhor abortar
    // (fail-safe) e tentar de novo no proximo ciclo do que corromper a coluna.
    if (!contrapartes.completo || Object.keys(mapaContra).length === 0) {
      throw new Error(`mapa de contrapartes incompleto (completo=${contrapartes.completo}, itens=${Object.keys(mapaContra).length}) - sync abortado para nao apagar nomes`);
    }

    // Alarga a janela: usuario pediu janela de vencimento, mas a API so filtra
    // por emissao. Pegamos emissoes 24 meses antes do inicio do vencimento ate
    // 3 meses depois do fim, garantindo cobertura para parcelas longas.
    const { deEm, ateEm } = janelaEmissaoCobrindoVencimento(deStr, ateStr);
    console.log(`[sync ${tipo} ${conta}] janela vencimento ${deStr}-${ateStr}, janela emissao ${deEm}-${ateEm}`);

    s.etapa = `paginando ${cfg.tabela}`;
    let pag = 1;
    while (true) {
      let r;
      try {
        r = await omieRequest(cfg.endpoint, cfg.call, {
          pagina: pag,
          registros_por_pagina: PAGE_SIZE,
          filtrar_por_emissao_de: deEm,
          filtrar_por_emissao_ate: ateEm,
          filtrar_apenas_titulos_em_aberto: 'N'
        }, conta);
      } catch (e) {
        if (e.faultstring && /n[aã]o.*registros|ERROR/i.test(e.faultstring)) {
          console.log(`[sync ${tipo} ${conta}] sem mais registros pag ${pag}`);
          break;
        }
        throw e;
      }

      const lista = r[cfg.listaKey] || [];
      s.paginaAtual = pag;
      s.totalPaginas = r.total_de_paginas || s.totalPaginas;
      console.log(`[sync ${tipo} ${conta}] pag ${pag}/${s.totalPaginas || '?'}: ${lista.length} titulos`);
      if (lista.length === 0) break;

      const rows = lista
        .map(t => mapearTitulo(t, mapaCat, mapaDep, mapaContra, contaLabel, cfg))
        .filter(r => r.codigo_lancamento);

      if (rows.length > 0) {
        const { error } = await supabaseAdmin
          .from(cfg.tabela)
          .upsert(rows, { onConflict: 'codigo_lancamento,conta_omie' });
        if (error) {
          throw new Error(`Supabase upsert: ${error.message}`);
        }
        s.registrosSalvos += rows.length;
      }

      const totalPag = r.total_de_paginas || 0;
      if (totalPag > 0) {
        if (pag >= totalPag) break;
      } else if (lista.length < PAGE_SIZE) {
        break;
      }
      pag++;
      await sleep(SLEEP_BETWEEN_PAGES);
    }

    s.etapa = 'concluido';
    s.fim = new Date().toISOString();
    if (logId) {
      await supabaseAdmin.from('cp_sync_log').update({
        status: 'ok',
        fim: s.fim,
        registros: s.registrosSalvos
      }).eq('id', logId);
    }
    console.log(`[sync ${tipo} ${conta}] ok - ${s.registrosSalvos} titulos salvos`);
    return { ok: true, registros: s.registrosSalvos };

  } catch (e) {
    console.error(`[sync ${tipo} ${conta}] erro: ${e.message}`);
    s.erro = e.message;
    s.fim = new Date().toISOString();
    if (logId) {
      await supabaseAdmin.from('cp_sync_log').update({
        status: 'erro',
        fim: s.fim,
        registros: s.registrosSalvos,
        erro: e.message
      }).eq('id', logId);
    }
    return { ok: false, mensagem: e.message };
  } finally {
    s.rodando = false;
  }
}

// =============================================================================
// Backfill da coluna `produtos.modelo` via ListarProdutos paginado.
// O parametro `filtrar_apenas_omiepdv: 'N'` e obrigatorio - sem ele a API
// retorna 0 produtos silenciosamente (HTTP 200, total_de_registros=0).
// ~12 paginas de 500 -> ~30s, vs ~1h30 da versao por ConsultarProduto.
// =============================================================================
// =============================================================================
// Backfill dos nomes de contraparte (nome_fornecedor / nome_cliente) nas linhas
// que ficaram null (ex.: as ~10k corrompidas pelo bug do mapa parcial no sync).
// Reusa buscarClientesFornecedores ENDURECIDO: se o mapa vier incompleto/vazio,
// PULA a conta (nao "repara" gravando null). Faz UPDATE somente onde o nome
// esta null, agrupado por codigo_cliente_fornecedor (1 query por fornecedor
// distinto). Nunca reescreve a linha inteira nem toca em nomes ja preenchidos.
// =============================================================================
async function backfillNomesContas(conta, tipo = 'ambos') {
  if (!supabaseAdmin) throw new Error('Supabase nao configurado');
  const tipos = tipo === 'ambos' ? ['pagar', 'receber'] : [tipo];
  const contasIds = conta === 'todas' ? getContasOmie().map(c => c.id) : [conta];
  const resumo = [];

  for (const c of contasIds) {
    const contaLabel = labelConta(c);
    const { mapa, completo } = await buscarClientesFornecedores(c);
    if (!completo || Object.keys(mapa).length === 0) {
      console.log(`[backfill-nomes ${c}] mapa de contrapartes incompleto/vazio (completo=${completo}, itens=${Object.keys(mapa).length}) - PULANDO conta`);
      resumo.push({ conta: c, pulado: true, motivo: 'mapa de contrapartes incompleto' });
      continue;
    }

    for (const t of tipos) {
      const cfg = CONFIG[t];
      const colNome = cfg.colunaNome;

      // 1) coleta codigos distintos de contraparte com nome ainda null
      const codigosNulos = new Set();
      let off = 0;
      while (true) {
        const { data, error } = await supabaseAdmin
          .from(cfg.tabela)
          .select('codigo_cliente_fornecedor')
          .eq('conta_omie', contaLabel)
          .is(colNome, null)
          .not('codigo_cliente_fornecedor', 'is', null)
          .range(off, off + 999);
        if (error) throw new Error(`select ${cfg.tabela}: ${error.message}`);
        if (!data || data.length === 0) break;
        data.forEach(r => { if (r.codigo_cliente_fornecedor != null) codigosNulos.add(r.codigo_cliente_fornecedor); });
        if (data.length < 1000) break;
        off += 1000;
      }

      // 2) so atualiza os que conseguimos resolver no mapa
      const alvos = [...codigosNulos].filter(cod => mapa[cod]);
      console.log(`[backfill-nomes ${c} ${t}] ${codigosNulos.size} codigos com nome null, ${alvos.length} resolviveis pelo mapa`);

      let atualizados = 0, erros = 0;
      const CHUNK = 20;
      for (let i = 0; i < alvos.length; i += CHUNK) {
        const slice = alvos.slice(i, i + CHUNK);
        await Promise.all(slice.map(cod =>
          supabaseAdmin.from(cfg.tabela)
            .update({ [colNome]: mapa[cod] })
            .eq('conta_omie', contaLabel)
            .eq('codigo_cliente_fornecedor', cod)
            .is(colNome, null)              // so preenche o que ainda esta null
            .then(res => res.error ? erros++ : atualizados++)
        ));
      }
      console.log(`[backfill-nomes ${c} ${t}] ok - ${atualizados} fornecedores atualizados, ${erros} erros`);
      resumo.push({ conta: c, tipo: t, codigosNulos: codigosNulos.size, resolviveis: alvos.length, fornecedoresAtualizados: atualizados, erros });
    }
  }
  console.log(`[backfill-nomes] concluido: ${JSON.stringify(resumo)}`);
  return { ok: true, resumo };
}

async function backfillModeloProdutos(conta, opts = {}) {
  if (!supabaseAdmin) throw new Error('Supabase nao configurado');
  const soVazios = opts.soVazios !== false;
  const state = { rodando: true, conta, lidos: 0, atualizados: 0, comModelo: 0, semModelo: 0, naoEncontrados: 0, erros: 0, inicio: new Date().toISOString() };

  try {
    const slugConta = String(conta).toLowerCase();

    // 1) Carrega codigos validos no supabase (e quais ja tem modelo, se soVazios)
    const codigosValidos = new Set();
    const codigosComModelo = new Set();
    let off = 0;
    while (true) {
      const { data } = await supabaseAdmin.from('produtos')
        .select('codigo_produto,modelo').eq('conta_omie', slugConta).range(off, off + 999);
      if (!data || data.length === 0) break;
      data.forEach(p => {
        const cp = String(p.codigo_produto);
        codigosValidos.add(cp);
        if (p.modelo) codigosComModelo.add(cp);
      });
      if (data.length < 1000) break;
      off += 1000;
    }
    console.log(`[backfill modelo ${conta}] supabase: ${codigosValidos.size} produtos, ${codigosComModelo.size} ja com modelo`);

    // 2) Pagina ListarProdutos no Omie e atualiza em lotes
    const RPP = 500;
    let pagina = 1;
    let totalPaginas = 1;
    while (pagina <= totalPaginas) {
      let resp;
      try {
        resp = await omieRequest('/geral/produtos/', 'ListarProdutos', {
          pagina,
          registros_por_pagina: RPP,
          filtrar_apenas_omiepdv: 'N'
        }, conta);
      } catch (e) {
        console.log(`[backfill modelo ${conta}] erro pagina ${pagina}: ${e.message}`);
        state.erros++;
        await sleep(5000);
        pagina++;
        continue;
      }
      totalPaginas = resp.total_de_paginas || 1;
      const itens = resp.produto_servico_cadastro || [];
      state.lidos += itens.length;

      const aAtualizar = [];
      for (const p of itens) {
        const cp = String(p.codigo_produto || '');
        if (!cp) continue;
        if (!codigosValidos.has(cp)) { state.naoEncontrados++; continue; }
        const modelo = (p.modelo || '').trim();
        if (!modelo) { state.semModelo++; continue; }
        state.comModelo++;
        if (soVazios && codigosComModelo.has(cp)) continue;
        aAtualizar.push({ cp, modelo });
      }

      // Updates em paralelo (lotes de 50 pra nao saturar o pool do supabase)
      const LOTE = 50;
      for (let i = 0; i < aAtualizar.length; i += LOTE) {
        const chunk = aAtualizar.slice(i, i + LOTE);
        await Promise.all(chunk.map(({ cp, modelo }) =>
          supabaseAdmin.from('produtos')
            .update({ modelo })
            .eq('codigo_produto', cp)
            .eq('conta_omie', slugConta)
            .then(({ error }) => { if (error) state.erros++; else state.atualizados++; })
        ));
      }

      console.log(`[backfill modelo ${conta}] pag ${pagina}/${totalPaginas} - itens=${itens.length}, atualizados=${state.atualizados}, semModelo=${state.semModelo}, naoEnc=${state.naoEncontrados}, err=${state.erros}`);
      pagina++;
      await sleep(SLEEP_BETWEEN_PAGES);
    }
  } finally {
    state.rodando = false;
    state.fim = new Date().toISOString();
  }
  console.log(`[backfill modelo ${conta}] CONCLUIDO - lidos=${state.lidos}, comModelo=${state.comModelo}, atualizados=${state.atualizados}, semModelo=${state.semModelo}, naoEnc=${state.naoEncontrados}, err=${state.erros}`);
  return state;
}

// =============================================================================
// DRE Omie - ListarDRE
//
// Particularidades:
// - API limita a 30 dias por chamada (Client-1005 acima disso).
// - Resposta vem MOVIMENTO-A-MOVIMENTO (listaDRE) - precisa agregar client-side.
// - Cada item ja vem classificado por dreTipo / dreGrupo / dreConta.
// - `cTipoData`: '1' = Data de Emissao, '2' = Data de Registro.
//
// CNPJs das proprias empresas do grupo. Usados pra detectar vendas
// intercompany (NOVA <-> CASTRO) e remove-las do faturamento consolidado.
// Identificados via sync de clientes em 2026-05-14 (commit fedb5fd).
// =============================================================================
const EMPRESAS_GRUPO_CNPJ = {
  nova:   '31463139000103',  // NOVA TRATORES MAQUINAS AGRICOLAS LTDA
  castro: '23268241000111'   // CASTRO PECAS E MAQUINAS AGRICOLAS LTDA
};

function cnpjOutraEmpresa(conta) {
  const slug = String(conta).toLowerCase();
  if (slug === 'nova')   return EMPRESAS_GRUPO_CNPJ.castro;
  if (slug === 'castro') return EMPRESAS_GRUPO_CNPJ.nova;
  return null;
}

// Cache em memoria: chave `${conta}|${dDeBR}|${dAteBR}|${cTipoData}` -> listaDRE
const _dreCache = new Map();

// Pre-agrega movimentos do DRE numa arvore dreTipo > dreGrupo > dreConta,
// separando operacional vs intercompany (cliente = a outra empresa do grupo).
// Resultado fica em dre_cache.resumo pra evitar transferir movimentos crus
// na rota /api/dre.
function computeResumoDRE(movimentos, conta) {
  const cnpjOutra = cnpjOutraEmpresa(conta);
  const norm = s => String(s || '').replace(/\D/g, '');
  const out = { operacional: {}, intercompany: {}, _meta: { operacional_count: 0, intercompany_count: 0 } };
  function addToTree(tree, m) {
    const t = m.dreTipo  || '(sem tipo)';
    const g = m.dreGrupo || '(sem grupo)';
    const c = m.dreConta || '(sem conta)';
    const v = Number(m.valor) || 0;
    if (!tree[t]) tree[t] = { total: 0, count: 0, grupos: {} };
    if (!tree[t].grupos[g]) tree[t].grupos[g] = { total: 0, count: 0, contas: {} };
    if (!tree[t].grupos[g].contas[c]) tree[t].grupos[g].contas[c] = { total: 0, count: 0 };
    tree[t].total += v; tree[t].count++;
    tree[t].grupos[g].total += v; tree[t].grupos[g].count++;
    tree[t].grupos[g].contas[c].total += v; tree[t].grupos[g].contas[c].count++;
  }
  (movimentos || []).forEach(m => {
    const isInter = cnpjOutra && norm(m.cnpj_cpf) === cnpjOutra;
    if (isInter) { addToTree(out.intercompany, m); out._meta.intercompany_count++; }
    else         { addToTree(out.operacional, m);  out._meta.operacional_count++;  }
  });
  return out;
}

async function consultarDREOmie(conta, dDeBR, dAteBR, cTipoData = '1') {
  const chave = `${conta}|${dDeBR}|${dAteBR}|${cTipoData}`;
  if (_dreCache.has(chave)) return _dreCache.get(chave);
  const r = await omieRequest('/financas/dre/', 'ListarDRE', {
    dPeriodoInicial: dDeBR,
    dPeriodoFinal: dAteBR,
    cTipoData
  }, conta);
  const lista = r.listaDRE || [];
  _dreCache.set(chave, lista);
  return lista;
}

// Pega DRE de um intervalo qualquer (>30 dias) quebrando mes-a-mes.
// Cache em supabase (`dre_cache`) por (conta, ano, mes, c_tipo_data).
// Use forceRefresh=true pra ignorar cache e re-fetchar do Omie.
// Retorna lista plana de movimentos com _ano/_mes injetados.
async function consultarDREPorPeriodo(conta, anoMesIni, anoMesFim, cTipoData = '1', forceRefresh = false) {
  function ultimoDia(ano, mes1to12) { return new Date(ano, mes1to12, 0).getDate(); }
  function fmtBR(ano, mes, dia) { return String(dia).padStart(2,'0') + '/' + String(mes).padStart(2,'0') + '/' + ano; }

  // 1. Monta lista de (ano, mes) a buscar
  const [aIni, mIni] = anoMesIni.split('-').map(Number);
  const [aFim, mFim] = anoMesFim.split('-').map(Number);
  const meses = [];
  let ano = aIni, mes = mIni;
  while (ano < aFim || (ano === aFim && mes <= mFim)) {
    meses.push({ ano, mes });
    mes++; if (mes > 12) { mes = 1; ano++; }
  }

  // 2. Bulk check cache (1 query so)
  const cacheMap = new Map();
  if (!forceRefresh && supabaseAdmin) {
    try {
      const anosDistintos = Array.from(new Set(meses.map(m => m.ano)));
      const { data, error } = await supabaseAdmin.from('dre_cache')
        .select('ano,mes,movimentos')
        .eq('conta_omie', conta).eq('c_tipo_data', cTipoData)
        .in('ano', anosDistintos);
      if (!error && data) {
        data.forEach(r => cacheMap.set(`${r.ano}-${r.mes}`, r.movimentos || []));
      }
    } catch (e) {
      console.log(`[DRE ${conta}] cache check falhou: ${e.message}`);
    }
  }

  // 3. Separa hit/miss
  const todasListas = [];
  const aBuscar = [];
  meses.forEach(m => {
    const key = `${m.ano}-${m.mes}`;
    if (cacheMap.has(key)) {
      const movs = cacheMap.get(key);
      todasListas.push(...movs.map(mov => ({ ...mov, _ano: m.ano, _mes: m.mes })));
    } else {
      aBuscar.push(m);
    }
  });
  console.log(`[DRE ${conta}] ${meses.length} meses · cache=${meses.length - aBuscar.length} · buscar=${aBuscar.length}`);
  if (aBuscar.length === 0) return todasListas;

  // 4. Fetch dos meses ausentes serializadamente (Omie nao permite chamadas
  //    concorrentes do mesmo metodo na mesma conta). Duas contas em paralelo
  //    ainda funcionam por estarem em consultarDREPorPeriodo chamado via Promise.all.
  const LOTE = 1;
  for (let i = 0; i < aBuscar.length; i += LOTE) {
    const chunk = aBuscar.slice(i, i + LOTE);
    const resultados = await Promise.all(chunk.map(async (m) => {
      const dIni = fmtBR(m.ano, m.mes, 1);
      const dFim = fmtBR(m.ano, m.mes, ultimoDia(m.ano, m.mes));
      try {
        const movimentos = await consultarDREOmie(conta, dIni, dFim, cTipoData);
        const resumo = computeResumoDRE(movimentos, conta);
        // Grava no cache (best-effort, nao falha o request)
        if (supabaseAdmin) {
          try {
            await supabaseAdmin.from('dre_cache').upsert({
              conta_omie: conta, ano: m.ano, mes: m.mes, c_tipo_data: cTipoData,
              movimentos, resumo, atualizado_em: new Date().toISOString()
            }, { onConflict: 'conta_omie,ano,mes,c_tipo_data' });
          } catch (e) { console.log(`[DRE ${conta}] upsert cache falhou: ${e.message}`); }
        }
        return movimentos.map(mov => ({ ...mov, _ano: m.ano, _mes: m.mes }));
      } catch (e) {
        console.error(`[DRE ${conta} ${m.ano}-${m.mes}]`, e.message);
        return [];
      }
    }));
    resultados.forEach(r => todasListas.push(...r));
    if (i + LOTE < aBuscar.length) await sleep(600);
  }

  return todasListas;
}

// =============================================================================
// Sync da tabela `clientes` via ListarClientes paginado.
// Usado para identificar vendas intercompany cruzando por cnpj_norm.
// ~57 paginas de 50 -> ~2-3min por conta. Upsert idempotente.
// =============================================================================
async function sincronizarClientes(conta) {
  if (!supabaseAdmin) throw new Error('Supabase nao configurado');
  const slugConta = String(conta).toLowerCase();
  const state = { rodando: true, conta, lidos: 0, gravados: 0, erros: 0, inicio: new Date().toISOString() };

  try {
    const RPP = 50; // Omie capa essa API em 50 por pagina
    let pagina = 1;
    let totalPaginas = 1;
    while (pagina <= totalPaginas) {
      let resp;
      try {
        resp = await omieRequest('/geral/clientes/', 'ListarClientes', {
          pagina, registros_por_pagina: RPP, apenas_importado_api: 'N'
        }, conta);
      } catch (e) {
        console.log(`[sync clientes ${conta}] erro pag ${pagina}: ${e.message}`);
        state.erros++;
        await sleep(5000);
        pagina++;
        continue;
      }
      totalPaginas = resp.total_de_paginas || 1;
      const lista = resp.clientes_cadastro || [];
      state.lidos += lista.length;

      const rows = lista.map(c => ({
        codigo_cliente_omie: c.codigo_cliente_omie,
        conta_omie: slugConta,
        codigo_cliente_integracao: c.codigo_cliente_integracao || null,
        cnpj_cpf: c.cnpj_cpf || null,
        cnpj_norm: (c.cnpj_cpf || '').replace(/\D/g, '') || null,
        razao_social: c.razao_social || null,
        nome_fantasia: c.nome_fantasia || null,
        email: c.email || null,
        cidade: c.cidade || null,
        estado: c.estado || null,
        pessoa_fisica: c.pessoa_fisica === 'S',
        inativo: c.inativo === 'S',
        bloqueado_faturamento: c.bloquear_faturamento === 'S',
        tags: c.tags || null,
        atualizado_em: new Date().toISOString()
      }));

      const LOTE = 200;
      for (let i = 0; i < rows.length; i += LOTE) {
        const chunk = rows.slice(i, i + LOTE);
        const { error } = await supabaseAdmin
          .from('clientes')
          .upsert(chunk, { onConflict: 'codigo_cliente_omie,conta_omie' });
        if (error) {
          console.log(`[sync clientes ${conta}] erro upsert pag ${pagina}: ${error.message}`);
          state.erros++;
        } else {
          state.gravados += chunk.length;
        }
      }

      console.log(`[sync clientes ${conta}] pag ${pagina}/${totalPaginas} - lidos=${state.lidos}, gravados=${state.gravados}, err=${state.erros}`);
      pagina++;
      await sleep(SLEEP_BETWEEN_PAGES);
    }
  } finally {
    state.rodando = false;
    state.fim = new Date().toISOString();
  }
  console.log(`[sync clientes ${conta}] CONCLUIDO - lidos=${state.lidos}, gravados=${state.gravados}, err=${state.erros}`);
  return state;
}

function sincronizarContasPagar(conta, deStr, ateStr) {
  return sincronizarTitulos(conta, deStr, ateStr, 'pagar');
}
function sincronizarContasReceber(conta, deStr, ateStr) {
  return sincronizarTitulos(conta, deStr, ateStr, 'receber');
}
// Sincroniza pagar e receber em sequencia (mesma conta, mesma janela).
// Mantem tudoEmAndamento setado durante toda a operacao para que o status
// agregado nao reporte "concluido" no gap entre as duas fases.
async function sincronizarTudo(conta, deStr, ateStr) {
  tudoEmAndamento.add(conta);
  try {
    const r1 = await sincronizarContasPagar(conta, deStr, ateStr);
    const r2 = await sincronizarContasReceber(conta, deStr, ateStr);
    // Fase 3: aplica baixas. Janela de pagamento alargada (24 meses atras
    // ate +1 mes a frente) para cobrir backlog historico no primeiro sync
    // e baixas recentes nos seguintes.
    let r3 = { ok: true, atualizados: 0 };
    try {
      const baixaMeses = parseInt(process.env.BAIXAS_JANELA_MESES, 10) || 24;
      const hojeRef = new Date();
      const dePag = new Date(hojeRef); dePag.setMonth(dePag.getMonth() - baixaMeses);
      const atePag = new Date(hojeRef); atePag.setMonth(atePag.getMonth() + 1);
      r3 = await aplicarBaixas(conta, fmtBR(dePag), fmtBR(atePag));
    } catch (e) {
      console.error(`[sync tudo ${conta}] aplicarBaixas erro: ${e.message}`);
      r3 = { ok: false, mensagem: e.message };
    }
    return {
      ok: r1.ok && r2.ok && r3.ok,
      pagar: r1,
      receber: r2,
      baixas: r3,
      registros: (r1.registros || 0) + (r2.registros || 0)
    };
  } finally {
    tudoEmAndamento.delete(conta);
  }
}

module.exports = {
  CONTAS_OMIE,
  CONFIG,
  getCredentials,
  getContasOmie,
  labelConta,
  omieRequest,
  sincronizarContasPagar,
  sincronizarContasReceber,
  sincronizarTudo,
  buscarMovimentos,
  aplicarBaixas,
  buscarClientesFornecedores,
  backfillNomesContas,
  backfillModeloProdutos,
  sincronizarClientes,
  EMPRESAS_GRUPO_CNPJ,
  cnpjOutraEmpresa,
  consultarDREOmie,
  consultarDREPorPeriodo,
  computeResumoDRE,
  getSyncState,
  fmtBR
};
