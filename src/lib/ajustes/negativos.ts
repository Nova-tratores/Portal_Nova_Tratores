/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// Estoque negativo (bug do CMC progressivo do Omie): varredura pesada em
// background + correção via ajuste retroativo (SLD datado, quan=0, valor=novoCMC).
// Portado de server.js (/api/estoque-negativo*, /api/corrigir-estoque-negativo).
//
// WORKER-READY: o estado da varredura vive na tabela ajustes_jobs (não em
// memória). A rota /iniciar cria o job e dispara o scan async; a rota /status
// lê o job do Supabase. O resultado também é cacheado para a home.
// ============================================================================

import { createHmac } from 'crypto';
import type { Conta } from './conta';
import * as cache from './cache';
import { fmtBR, parseAnyDate, hoje } from './dates';
import { supabase } from './supabase';
import { analisarEstoqueNegativo } from './analise';
import { anotarCorrecoesAplicadas, httpErr } from './cmc';
import { incluirAjusteEstoque, obterPosicaoEstoqueProduto, consultarProdutoPorIntegracao } from './omie';
import { criarJob, atualizarJob, concluirJob, falharJob, lerJobAtivo, jobRodando, jobEstaVivo } from './jobs';
import { registrarAuditLog } from '../server/audit-notify';

const NEGATIVOS_CACHE_SEG = (parseInt(process.env.NEGATIVOS_CACHE_HORAS || '', 10) || 6) * 3600;

/**
 * Inicia a varredura de estoque negativo em background (worker-ready). Se já há
 * uma rodando para a conta, retorna {jaRodando:true}. Retorna {jobId} senão.
 */
export async function iniciarScanNegativos(conta: Conta, criadoPor?: string): Promise<any> {
  if (await jobRodando('estoque-negativo', conta)) {
    const ativo = await lerJobAtivo('estoque-negativo', conta);
    return { ok: true, rodando: true, jaRodando: true, jobId: ativo?.id, etapa: ativo?.etapa };
  }
  const jobId = await criarJob('estoque-negativo', conta, criadoPor);

  // dispara em background (Railway: processo long-lived via next start)
  (async () => {
    try {
      const resultado = await analisarEstoqueNegativo(conta, {
        onProgress: (m: string) => {
          atualizarJob(jobId, { etapa: m });
          console.log(`[negativos ${conta}] ${m}`);
        },
      });
      await anotarCorrecoesAplicadas(resultado);
      cache.set(`negativos:${conta}`, resultado, NEGATIVOS_CACHE_SEG);
      await concluirJob(jobId, resultado);
    } catch (e: any) {
      await falharJob(jobId, e.faultstring || e.message);
      console.error(`[negativos ${conta}]`, e);
    }
  })();

  return { ok: true, rodando: true, jobId };
}

/** Estado/resultado da varredura (lê do job no Supabase + cache). */
export async function lerStatusNegativos(conta: Conta, force = false): Promise<any> {
  const ativo = await lerJobAtivo('estoque-negativo', conta);
  if (ativo?.status === 'rodando') {
    if (jobEstaVivo(ativo)) {
      return { rodando: true, etapa: ativo.etapa, inicio: ativo.iniciado_em, jobId: ativo.id };
    }
    // Job 'rodando' sem heartbeat ha mais de JOB_STALE_MS = processo morreu no
    // meio (deploy/restart do Railway). Sem isto a tela mostrava "varrendo..."
    // para sempre; o stale-check so existia no /iniciar (jobRodando).
    ativo.status = 'erro';
    ativo.erro = 'Processo interrompido (o servidor reiniciou durante a execução). Tente novamente.';
    await falharJob(ativo.id, ativo.erro);
  }
  if (!force) {
    const hit = cache.get<any>(`negativos:${conta}`);
    if (hit) return { ...hit.valor, fonte: 'cache', cachedEm: hit.gravadoEm, rodando: false };
  }
  if (ativo?.status === 'concluido' && ativo.resultado) {
    return { ...(ativo.resultado as any), fonte: 'job', rodando: false };
  }
  if (ativo?.status === 'erro') {
    // A ultima tentativa falhou (Omie instavel / deploy no meio da varredura).
    // Cai de volta no ultimo scan CONCLUIDO em vez de esconder dados bons
    // atras do erro — o resultado da madrugada continua valido.
    const { data } = await supabase
      .from('ajustes_jobs')
      .select('resultado, iniciado_em')
      .eq('tipo', 'estoque-negativo')
      .eq('conta_omie', conta)
      .eq('status', 'concluido')
      .order('iniciado_em', { ascending: false })
      .limit(1);
    const ultimoOk = ((data as any[]) || [])[0];
    if (ultimoOk?.resultado) {
      return { ...(ultimoOk.resultado as any), fonte: 'job', rodando: false };
    }
    return { rodando: false, erro: ativo.erro };
  }
  return { rodando: false, semDados: true };
}

export interface CorrigirNegativoArgs {
  conta: Conta;
  codigoProduto?: number | string | null;
  codigoIntegracao?: string | null;
  codLocal?: number | string | null;
  novoCMC?: number | string;
  dataAjusteBR?: string;
  cmcSugerido?: number | string | null;
  estrategiaSugestao?: string | null;
  descricao?: string | null;
  criadoPor?: string;
  userId?: string | null;    // UUID do usuario autenticado (via exigirPermissao)
  userEmail?: string | null;
}

/**
 * Corrige o CMC de um produto negativo via ajuste retroativo: SLD datado que
 * ZERA o saldo (quan=0) e seta o CMC. Portado de /api/corrigir-estoque-negativo.
 */
export async function corrigirEstoqueNegativo(b: CorrigirNegativoArgs): Promise<any> {
  const conta = b.conta;
  const codigoProduto = b.codigoProduto != null ? Number(b.codigoProduto) : null;
  const codigoIntegracao = b.codigoIntegracao != null ? String(b.codigoIntegracao) : null;
  const codLocal = b.codLocal != null ? Number(b.codLocal) : null;
  const novoCMC = Number(b.novoCMC);
  const dataAjuste = parseAnyDate(b.dataAjusteBR);
  if (!codigoProduto && !codigoIntegracao) throw httpErr(400, 'informe codigoProduto ou codigoIntegracao');
  if (codLocal == null || !Number.isFinite(codLocal)) throw httpErr(400, 'informe codLocal');
  if (!(novoCMC > 0)) throw httpErr(400, 'novoCMC deve ser > 0');
  if (!dataAjuste) throw httpErr(400, 'informe a data do ajuste retroativo (dataAjusteBR, DD/MM/YYYY)');
  const dataAjusteBR = fmtBR(dataAjuste);
  if (dataAjuste.getTime() > hoje().getTime()) throw httpErr(400, 'a data do ajuste nao pode ser no futuro');

  {
    const { error: pe } = await supabase.from('cmc_correcoes').select('id, origem, fornecedor_id').limit(1);
    if (pe) throw httpErr(503, `tabela cmc_correcoes indisponivel/desatualizada (${pe.message}). Correcao NAO aplicada.`);
  }

  let idProd: number = codigoProduto as number;
  let descricao = b.descricao || null;
  if (!idProd && codigoIntegracao) {
    const p = await consultarProdutoPorIntegracao(conta, codigoIntegracao);
    if (!p || p.codigoProduto == null) throw httpErr(400, `nao consegui resolver o produto pelo codigo de integracao "${codigoIntegracao}"`);
    idProd = p.codigoProduto;
    if (!descricao) descricao = p.descricao;
  }

  // guard de duplo-clique (por produto+local+DATA do ajuste: episodios de datas
  // diferentes nao sao duplicados, mesmo com CMC parecido).
  const dataAjusteISO = dataAjusteBR.split('/').reverse().join('-');
  try {
    const lim = new Date(Date.now() - 90 * 1000).toISOString();
    const { data: recentes } = await supabase
      .from('cmc_correcoes')
      .select('id, codigo_ajuste_omie, cmc_anterior, cmc_aplicado, status, criado_em')
      .eq('conta_omie', conta)
      .eq('codigo_produto', idProd)
      .eq('codigo_local_estoque', codLocal)
      .eq('origem', 'estoque_negativo')
      .eq('status', 'aplicado')
      .eq('nf_origem_data', dataAjusteISO)
      .gte('criado_em', lim)
      .order('criado_em', { ascending: false })
      .limit(1);
    if (recentes && recentes[0] && Math.abs(Number(recentes[0].cmc_aplicado) - novoCMC) < 0.0001) {
      return {
        ok: true,
        duplicado: true,
        codigoAjuste: recentes[0].codigo_ajuste_omie,
        cmcAnterior: Number(recentes[0].cmc_anterior),
        cmcAplicado: Number(recentes[0].cmc_aplicado),
        dataAjusteBR,
        correcaoId: recentes[0].id,
      };
    }
  } catch {
    /* não bloqueia */
  }

  let cmcAnterior: number | null = null;
  try {
    const pos = await obterPosicaoEstoqueProduto(conta, idProd, { codigoLocalEstoque: codLocal });
    cmcAnterior = pos.cmc;
  } catch {
    /* segue */
  }

  const dataPortalBR = fmtBR(hoje()); // data em que o usuario fez a alteracao no portal
  const usuarioNome = b.criadoPor || 'app-estoque-negativo'; // identidade verificada (a rota sobrescreve)
  const obs = `Correcao de CMC - estoque negativo - ajuste retroativo (${dataAjusteBR}) zerando o saldo e setando o CMC. Feito no portal por ${usuarioNome} em ${dataPortalBR}`.slice(0, 240);
  let resultado: any = null;
  let erro: string | null = null;
  try {
    resultado = await incluirAjusteEstoque(conta, {
      idProd,
      codProduto: idProd,
      codInt: codigoIntegracao,
      codLocal,
      dataBR: dataAjusteBR,
      tipo: 'SLD',
      quan: 0,
      valor: novoCMC,
      motivo: 'INV',
      origem: 'AJU',
      obs,
    });
  } catch (e: any) {
    erro = e.faultstring || e.message;
  }

  // Assinatura HMAC (tamper-evidence) do registro aplicado. Sem o segredo, grava sem
  // assinatura (nao bloqueia). Verificacao futura: recomputar sobre assinatura_payload.
  const SECRET = process.env.CMC_HMAC_SECRET;
  let assinatura: string | null = null;
  let assinaturaPayload: Record<string, unknown> | null = null;
  if (!erro && SECRET) {
    assinaturaPayload = {
      conta,
      codigo_produto: idProd,
      codigo_local_estoque: codLocal,
      cmc_anterior: cmcAnterior,
      cmc_aplicado: novoCMC,
      data_ajuste: dataAjusteISO,
      codigo_ajuste_omie: resultado?.codigoAjuste ?? null,
      user_id: b.userId || null,
      criado_por: usuarioNome,
      assinado_em: new Date().toISOString(),
    };
    assinatura = createHmac('sha256', SECRET).update(JSON.stringify(assinaturaPayload)).digest('hex');
  } else if (!erro && !SECRET) {
    console.warn('[cmc] CMC_HMAC_SECRET ausente: correcao gravada SEM assinatura');
  }
  const obsDb = (assinatura ? `${obs} [sig:${assinatura.slice(0, 8)}]` : obs).slice(0, 240);

  const linha = {
    conta_omie: conta,
    codigo_produto: idProd,
    codigo_integracao: codigoIntegracao,
    descricao_produto: descricao,
    codigo_local_estoque: codLocal,
    cmc_anterior: cmcAnterior,
    cmc_aplicado: erro ? null : novoCMC,
    cmc_sugerido: b.cmcSugerido != null ? Number(b.cmcSugerido) : null,
    qtd_saldo_no_ajuste: 0,
    estrategia_sugestao: b.estrategiaSugestao || null,
    nf_origem_numero: null,
    nf_origem_data: dataAjusteISO,
    cfop_origem: null,
    custo_garantia_unit: null,
    origem: 'estoque_negativo',
    codigo_ajuste_omie: resultado && resultado.codigoAjuste != null ? Number(resultado.codigoAjuste) || resultado.codigoAjuste : null,
    status: erro ? 'erro' : 'aplicado',
    erro: erro || null,
    obs: obsDb,
    assinatura,
    assinatura_payload: assinaturaPayload,
    raw_request: resultado ? resultado.rawRequest : null,
    raw_response: resultado ? resultado.rawResponse : erro ? { erro } : null,
    criado_por: usuarioNome,
  };
  let correcaoId: number | null = null;
  try {
    const { data, error } = await supabase.from('cmc_correcoes').insert(linha).select('id').single();
    if (error) console.warn('[cmc] insert:', error.message);
    correcaoId = (data as any)?.id ?? null;
  } catch (e: any) {
    console.warn('[cmc] insert:', e.message);
  }

  // Log externo (identidade real do usuario autenticado). Best-effort (nunca lanca).
  await registrarAuditLog({
    userId: b.userId || undefined,
    userName: usuarioNome,
    sistema: 'ajustes',
    acao: 'corrigir-estoque-negativo',
    entidade: 'cmc_correcoes',
    entidadeId: correcaoId != null ? String(correcaoId) : undefined,
    entidadeLabel: `CMC #${idProd} ${descricao || ''}`.trim(),
    detalhes: {
      conta, codLocal, cmcAnterior, cmcAplicado: erro ? null : novoCMC,
      dataAjusteBR, codigoAjusteOmie: resultado?.codigoAjuste ?? null,
      status: erro ? 'erro' : 'aplicado', assinatura: assinatura || null,
    },
  });

  cache.invalidatePrefix(`analise:${conta}:`);
  cache.invalidatePrefix(`pendentes:${conta}:`);
  cache.invalidate(`negativos:${conta}`);

  if (erro) {
    const err = httpErr(502, `falha ao aplicar o ajuste retroativo no Omie: ${erro}`);
    err.correcaoId = correcaoId;
    throw err;
  }
  return { ok: true, codigoAjuste: resultado.codigoAjuste, cmcAnterior, cmcAplicado: novoCMC, dataAjusteBR, correcaoId };
}
