/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// Remessas em aberto (Omie /produtos/remessa/ ListarRemessas).
//
// A API de remessa NAO devolve bloco info (uInc/dInc) — nem no ListarRemessas
// nem no ConsultarRemessa (verificado em 07/2026). "Quem criou" vem por
// cruzamento: remessas geradas a partir de OS tem cCodIntRem = "rem_os_<N>"
// (e a obs "Remessa dos produtos ... - OS no <N>"); a OS correspondente
// (/servicos/os/ ListarOS, Cabecalho.cNumOS = N) traz InfoCadastro.uInc/dDtInc.
// Remessas sem OS ficam com origem "Manual" e criador desconhecido (mostramos
// o vendedor nCodVend como referencia).
// ============================================================================

import type { Conta } from './conta';
import { supabase } from './supabase';
import * as cache from './cache';
import { paginarOmie, omieRequest, sleep } from './omie';
import { obterMapaClientes, obterMapaUsuarios } from './pedidos';
import { criarJob, atualizarJob, concluirJob, falharJob, lerJobAtivo, jobRodando, jobEstaVivo } from './jobs';
import { registrarAuditLog, notificarAdmins } from '../server/audit-notify';

// ---- Helpers ----

function diasDesdeBR(dataBR: string | null | undefined): number | null {
  if (!dataBR) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(dataBR);
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

// Extrai o numero da OS de origem: 1) cCodIntRem "rem_os_123"; 2) obs
// "... OS no 123" / "OS nº 123" / "OS n 123".
function extrairNumeroOS(codIntRem: string, obs: string): string | null {
  const m1 = /^rem_os_(\d+)$/i.exec((codIntRem || '').trim());
  if (m1) return m1[1];
  const m2 = /\bOS\s*n[oº°.]?\s*(\d+)/i.exec(obs || '');
  if (m2) return m2[1];
  return null;
}

// ---- Mapas auxiliares (cache longo) ----

interface InfoOS {
  nCodOS: number | null;
  etapa: string | null;
  uInc: string | null;      // login Omie de quem criou a OS
  dInc: string | null;      // DD/MM/YYYY
  cancelada: boolean;
  faturada: boolean;
}

// Mapa cNumOS -> InfoCadastro da OS (cache 6h). Varre ListarOS uma vez; e' o
// que permite dizer quem criou a remessa gerada a partir da OS.
export async function obterMapaOS(conta: Conta, force = false): Promise<Record<string, InfoOS>> {
  const chave = `os_map:${conta}`;
  if (!force) {
    const hit = cache.get<Record<string, InfoOS>>(chave);
    if (hit) return hit.valor;
  }
  const map: Record<string, InfoOS> = {};
  try {
    const { itens } = await paginarOmie('/servicos/os/', 'ListarOS', {}, conta, {
      paginaKey: 'pagina', regKey: 'registros_por_pagina', regValue: 500,
      totalKeys: ['total_de_paginas'],
      listaKeys: ['osCadastro', 'os_cadastro', 'cadastros'],
      debugTag: 'ListarOS',
    });
    for (const os of itens) {
      const cab = os.Cabecalho || os.cabecalho || {};
      const info = os.InfoCadastro || os.infoCadastro || {};
      const num = cab.cNumOS != null ? String(cab.cNumOS) : null;
      if (!num) continue;
      map[num] = {
        nCodOS: cab.nCodOS ?? null,
        etapa: cab.cEtapa != null ? String(cab.cEtapa) : null,
        uInc: info.uInc || null,
        dInc: info.dDtInc || null,
        cancelada: info.cCancelada === 'S',
        faturada: info.cFaturada === 'S',
      };
    }
  } catch (e) {
    console.warn('[remessas] ListarOS:', (e as Error).message);
  }
  cache.set(chave, map, 21600); // 6h
  return map;
}

// Mapa nCodVend -> nome (cache 12h). Vendedores sao cadastro proprio
// (/geral/vendedores/), separado dos usuarios.
export async function obterMapaVendedores(conta: Conta): Promise<Record<string, string>> {
  const chave = `vendedores_map:${conta}`;
  const hit = cache.get<Record<string, string>>(chave);
  if (hit) return hit.valor;
  const map: Record<string, string> = {};
  try {
    const { itens } = await paginarOmie('/geral/vendedores/', 'ListarVendedores', {}, conta, {
      paginaKey: 'pagina', regKey: 'registros_por_pagina', regValue: 500,
      totalKeys: ['total_de_paginas'],
      listaKeys: ['cadastro', 'cadastros', 'vendedores'],
      debugTag: 'ListarVendedores',
    });
    for (const v of itens) {
      const cod = v.codigo ?? v.nCodigo ?? v.codigo_vendedor;
      const nome = v.nome || v.cNome || null;
      if (cod != null && nome) map[String(cod)] = nome;
    }
  } catch (e) {
    console.warn('[remessas] ListarVendedores:', (e as Error).message);
  }
  cache.set(chave, map, 43200); // 12h
  return map;
}

// Mapa codigo_produto -> descricao (tabela produtos do Supabase; cache 12h).
async function obterMapaProdutosDesc(): Promise<Record<string, string>> {
  const chave = 'produtos_desc_map';
  const hit = cache.get<Record<string, string>>(chave);
  if (hit) return hit.valor;
  const map: Record<string, string> = {};
  let from = 0;
  while (true) {
    const { data } = await supabase.from('produtos').select('codigo_produto,descricao').range(from, from + 999);
    if (!data || data.length === 0) break;
    for (const p of data) map[String(p.codigo_produto)] = p.descricao || '';
    if (data.length < 1000) break;
    from += 1000;
  }
  cache.set(chave, map, 43200); // 12h
  return map;
}

// ---- Remessas em aberto ----

export interface ItemRemessa {
  codProduto: string;
  descricao: string;
  qtde: number;
  valorUnit: number;
  valorTotal: number;
  cfop: string;
}

export interface RemessaAberta {
  idRemessa: number;
  numero: string;
  codIntRem: string;
  dataPrevisao: string | null;   // DD/MM/YYYY (unica data que a API da remessa traz)
  diasAberto: number | null;
  codigoCliente: number | null;
  nomeCliente: string | null;
  cnpjCliente: string | null;
  // Origem
  numeroOS: string | null;       // remessa gerada a partir de OS
  origem: 'OS' | 'Manual';
  criadoPorLogin: string | null; // uInc da OS de origem (a API de remessa nao expoe o criador)
  criadoPorNome: string | null;
  dataCriacaoOS: string | null;  // dDtInc da OS
  // Vendedor da remessa (referencia p/ remessas manuais)
  codVendedor: string | null;
  vendedorNome: string | null;
  valorTotal: number;
  qtdItens: number;
  itens: ItemRemessa[];
  obs: string;
}

export interface RemessasPayload {
  conta: Conta;
  total: number;
  totalOmie: number;             // total de remessas na Omie (todas, p/ contexto)
  remessas: RemessaAberta[];
  geradoEm: string;
  duracaoMs: number;
  fonte?: 'cache' | 'live';
  cachedEm?: string;
}

// Remessas em aberto (nao canceladas e nao faturadas), enriquecidas com
// cliente, OS de origem (quem criou) e vendedor. Cache 10min — a primeira
// busca e' LENTA (pagina todas as remessas + OSs na Omie, pode passar de 2min).
export async function obterRemessasAbertas(conta: Conta, force = false): Promise<RemessasPayload> {
  const chave = `remessas_abertas:${conta}`;
  if (!force) {
    const hit = cache.get<RemessasPayload>(chave);
    if (hit) return { ...hit.valor, fonte: 'cache', cachedEm: hit.gravadoEm };
  }
  const t0 = Date.now();

  const [{ itens: lista }, mapaClientes, mapaUsuarios, mapaOS, mapaVend, mapaProd] = await Promise.all([
    paginarOmie('/produtos/remessa/', 'ListarRemessas', {}, conta, {
      paginaKey: 'nPagina', regKey: 'nRegistrosPorPagina', regValue: 50,
      totalKeys: ['nTotalPaginas'],
      listaKeys: ['remessas', 'remessaCadastro', 'cadastros'],
      debugTag: 'ListarRemessas',
    }),
    obterMapaClientes(conta),
    obterMapaUsuarios(conta),
    obterMapaOS(conta, force),
    obterMapaVendedores(conta),
    obterMapaProdutosDesc(),
  ]);

  const remessas: RemessaAberta[] = [];
  for (const rem of lista) {
    const cab = rem.cabec || {};
    if (!cab.nCodRem) continue;
    if (cab.cCancelado === 'S' || cab.faturada === 'S') continue; // so em aberto

    const obs = String(rem.obs?.cObs || '');
    const codIntRem = String(cab.cCodIntRem || '');
    const numeroOS = extrairNumeroOS(codIntRem, obs);
    const os = numeroOS ? mapaOS[numeroOS] : undefined;
    const criadoPorLogin = os?.uInc || null;
    const criadoPorNome = criadoPorLogin
      ? (mapaUsuarios[String(criadoPorLogin).toUpperCase()] || criadoPorLogin)
      : null;

    const cli = cab.nCodCli != null ? mapaClientes[String(cab.nCodCli)] : undefined;
    const codVendedor = cab.nCodVend != null && cab.nCodVend !== '' ? String(cab.nCodVend) : null;
    const vendedorNome = codVendedor
      ? (mapaVend[codVendedor] || mapaUsuarios[codVendedor] || null)
      : null;

    const itens: ItemRemessa[] = (rem.produtos || []).map((it: any) => {
      const codProd = String(it.nCodProd ?? '');
      const qtde = Number(it.nQtde || 0);
      const valorUnit = Number(it.nValUnit || 0);
      return {
        codProduto: codProd,
        descricao: mapaProd[codProd] || (codProd ? 'Produto #' + codProd : ''),
        qtde, valorUnit, valorTotal: qtde * valorUnit,
        cfop: String(it.cCFOP || ''),
      };
    });

    remessas.push({
      idRemessa: cab.nCodRem,
      numero: String(cab.cNumeroRemessa || ''),
      codIntRem,
      dataPrevisao: cab.dPrevisao || null,
      diasAberto: diasDesdeBR(cab.dPrevisao),
      codigoCliente: cab.nCodCli ?? null,
      nomeCliente: cli?.nome || null,
      cnpjCliente: cli?.cnpj || null,
      numeroOS,
      origem: numeroOS ? 'OS' : 'Manual',
      criadoPorLogin, criadoPorNome,
      dataCriacaoOS: os?.dInc || null,
      codVendedor, vendedorNome,
      valorTotal: Number(cab.nValorTotal || 0),
      qtdItens: itens.length,
      itens,
      obs,
    });
  }

  // Mais antigas primeiro (as que estao em aberto ha mais tempo).
  remessas.sort((a, b) => (b.diasAberto ?? -1) - (a.diasAberto ?? -1));

  const payload: RemessasPayload = {
    conta,
    total: remessas.length,
    totalOmie: lista.length,
    remessas,
    geradoEm: new Date().toISOString(),
    duracaoMs: Date.now() - t0,
  };
  cache.set(chave, payload, 600); // 10min
  return { ...payload, fonte: 'live' };
}

// ============================================================================
// Devolução em massa (fechar remessas).
//
// A API da Omie NAO permite cancelar/excluir remessa (cCancelado e' somente
// leitura); o unico encerramento via API e' DevolverRemessa — sem a tag `itens`
// faz a devolucao INTEGRAL: as pecas voltam ao estoque e a remessa sai das
// pendentes. Como sao centenas de chamadas (~1.2s de throttle cada), roda como
// job de background ('remessas-devolver', padrao Mahindra) com polling.
// ============================================================================

// Devolucao integral de UMA remessa. Resposta Omie: {nIdDevolucao, cCodStatus, cDesStatus}.
export async function devolverRemessaOmie(conta: Conta, nCodRem: number): Promise<any> {
  return omieRequest('/produtos/remessa/', 'DevolverRemessa', { nCodRem }, conta);
}

export interface ResultadoDevolucao {
  idRemessa: number;
  numero: string;
  valorTotal: number;
  numeroOS: string | null;
  ok: boolean;
  nIdDevolucao?: number | null;
  erro?: string;
}

export interface IniciarDevolucaoArgs {
  ids: number[];
  criadoPor?: string | null;
  userId?: string | null;
}

/**
 * Inicia a devolucao em lote em background. Se ja ha um lote rodando para a
 * conta, retorna {jaRodando:true}. Os ids sao validados contra a lista de
 * remessas em aberto (cache/live) — id desconhecido ou ja fechado e' recusado
 * antes de comecar.
 */
export async function iniciarDevolucaoLote(conta: Conta, args: IniciarDevolucaoArgs): Promise<any> {
  const ids = [...new Set((args.ids || []).map(Number).filter((n) => Number.isFinite(n) && n > 0))];
  if (ids.length === 0) throw new Error('Informe as remessas a devolver (ids).');

  if (await jobRodando('remessas-devolver', conta)) {
    const ativo = await lerJobAtivo('remessas-devolver', conta);
    return { ok: true, rodando: true, jaRodando: true, jobId: ativo?.id, etapa: ativo?.etapa };
  }

  // Snapshot rapido do cache, se existir. Sem cache, a carga (lenta: varre a
  // Omie inteira) acontece DENTRO do job — o POST nao pode segurar 2-4min.
  const hitCache = cache.get<RemessasPayload>(`remessas_abertas:${conta}`);

  const criadoPor = args.criadoPor || 'portal';
  const jobId = await criarJob('remessas-devolver', conta, criadoPor);

  // dispara em background (Railway: processo long-lived via next start)
  (async () => {
    const resultados: ResultadoDevolucao[] = [];
    let okCount = 0;
    let erroCount = 0;
    let abortadoPorBloqueio = false;
    try {
      let payload = hitCache?.valor;
      if (!payload) {
        atualizarJob(jobId, { etapa: 'carregando remessas em aberto na Omie (pode levar alguns minutos)...' });
        payload = await obterRemessasAbertas(conta);
      }
      const porId = new Map(payload.remessas.map((r) => [r.idRemessa, r]));

      for (let i = 0; i < ids.length; i++) {
        const rem = porId.get(ids[i]);
        if (!rem) {
          // id que nao esta (mais) em aberto — reporta e segue, sem chamar a Omie
          resultados.push({ idRemessa: ids[i], numero: '', valorTotal: 0, numeroOS: null, ok: false, erro: 'nao esta entre as remessas em aberto (atualize a lista)' });
          erroCount++;
          continue;
        }
        const base = { idRemessa: rem.idRemessa, numero: rem.numero, valorTotal: rem.valorTotal, numeroOS: rem.numeroOS };
        try {
          const r = await devolverRemessaOmie(conta, rem.idRemessa);
          resultados.push({ ...base, ok: true, nIdDevolucao: r?.nIdDevolucao ?? null });
          okCount++;
        } catch (e: any) {
          resultados.push({ ...base, ok: false, erro: e.faultstring || e.message });
          erroCount++;
          if (e.bloqueio) { abortadoPorBloqueio = true; break; } // Omie bloqueou: nao adianta insistir
        }
        atualizarJob(jobId, {
          etapa: `devolvendo ${i + 1}/${ids.length} (${okCount} ok, ${erroCount} erro)`,
          progresso: { feito: i + 1, total: ids.length, ok: okCount, erro: erroCount },
        });
        if (i < ids.length - 1) await sleep(1200);
      }

      cache.invalidate(`remessas_abertas:${conta}`);

      const naoProcessadas = ids.length - resultados.length;
      const resumoTxt = `${okCount} devolvida(s), ${erroCount} com erro`
        + (naoProcessadas > 0 ? `, ${naoProcessadas} nao processada(s) (Omie bloqueou a API)` : '');
      const valorDevolvido = resultados.filter((r) => r.ok).reduce((s, r) => s + (r.valorTotal || 0), 0);

      await registrarAuditLog({
        userId: args.userId || undefined,
        userName: criadoPor,
        sistema: 'ajustes',
        acao: 'remessas-devolver-lote',
        entidade: 'remessas',
        entidadeLabel: `${ids.length} remessa(s) — ${conta}`,
        detalhes: { conta, total: ids.length, ok: okCount, erro: erroCount, abortadoPorBloqueio, valorDevolvido, resultados },
      });
      await notificarAdmins({
        tipo: 'ajustes',
        titulo: 'Remessas devolvidas em lote',
        descricao: `${conta}: ${resumoTxt} (${criadoPor})`,
        link: '/ajustes/remessas',
        excludeUserName: criadoPor,
      });

      await concluirJob(jobId, {
        total: ids.length, ok: okCount, erro: erroCount,
        abortadoPorBloqueio, valorDevolvido, resultados: resultados as any,
        etapaFinal: `concluido - ${resumoTxt}`,
      });
    } catch (e: any) {
      await falharJob(jobId, e.faultstring || e.message);
      console.error(`[remessas-devolver ${conta}]`, e);
    }
  })();

  return { ok: true, rodando: true, jobId, total: ids.length };
}

/** Estado/resultado da devolucao em lote (polling do front, padrao Mahindra). */
export async function lerStatusDevolucao(conta: Conta): Promise<any> {
  const ativo = await lerJobAtivo('remessas-devolver', conta);
  if (!ativo) return { rodando: false, semDados: true };
  if (ativo.status === 'rodando') {
    if (!jobEstaVivo(ativo)) {
      await falharJob(ativo.id, 'Processo interrompido (o servidor reiniciou durante a devolução). Confira o que foi devolvido e tente de novo.');
      return { rodando: false, erro: 'A devolução foi interrompida (o servidor reiniciou). Atualize a lista para ver o que foi devolvido e rode de novo com o restante.', etapa: ativo.etapa, jobId: ativo.id };
    }
    return { rodando: true, etapa: ativo.etapa, progresso: ativo.progresso, inicio: ativo.iniciado_em, jobId: ativo.id };
  }
  if (ativo.status === 'erro') {
    return { rodando: false, erro: ativo.erro, etapa: ativo.etapa, jobId: ativo.id };
  }
  const r = (ativo.resultado || {}) as any;
  return {
    rodando: false, pronto: true,
    total: r.total ?? null, devolvidas: r.ok ?? null, falhas: r.erro ?? null,
    abortadoPorBloqueio: !!r.abortadoPorBloqueio,
    valorDevolvido: r.valorDevolvido ?? null,
    resultados: r.resultados ?? [],
    etapa: r.etapaFinal || ativo.etapa,
    jobId: ativo.id, fim: ativo.atualizado_em,
  };
}
