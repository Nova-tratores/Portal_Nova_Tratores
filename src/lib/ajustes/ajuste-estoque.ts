/* eslint-disable @typescript-eslint/no-explicit-any */
// Ajuste de estoque (quantidade e/ou custo) — servidor da tela /ajustes/ajuste-estoque.
// Regras de decisão em ajuste-estoque-regras.ts (puras, testadas).
//
// "Tudo ou nada" em duas etapas:
//  1) PRÉVIA: relê cada produto AO VIVO no Omie (físico + CMC do local) e planeja
//     todos. Se QUALQUER item não puder ser ajustado, nada é gravado.
//  2) GRAVA em sequência. Se um falhar no meio, os já gravados são DESFEITOS
//     (ExcluirAjusteEstoque) — o lote nunca fica pela metade sem avisar.
// O comentário de cada ajuste no Omie leva data, hora, usuário e motivo; o lote
// inteiro vai para o audit_log (sistema 'ajustes', ação 'ajuste-estoque').

import type { Conta } from './conta';
import { getContasOmie } from './conta';
import { supabase } from './supabase';
import * as cache from './cache';
import { httpErr } from './cmc';
import {
  listarLocaisEstoque,
  obterPosicaoEstoqueProduto,
  incluirAjusteEstoque,
  excluirAjusteEstoque,
  sleep,
} from './omie';
import { registrarAuditLog } from '../server/audit-notify';
import { planejarAjuste, montarObsAjuste, dataHoraBR, numeroBR, type PlanoAjuste } from './ajuste-estoque-regras';

export interface LocalPosicao { id: number; nome: string; padrao: boolean; fisico: number; cmc: number }

function contaValida(c: unknown): c is Conta {
  return getContasOmie().some((x) => x.id === c);
}

async function locaisDaConta(conta: Conta): Promise<any[]> {
  const chave = `locais_estoque:${conta}`;
  const hit = cache.get<any[]>(chave);
  if (hit) return hit.valor;
  const locais = await listarLocaisEstoque(conta);
  cache.set(chave, locais, 3600);
  return locais;
}

/** Busca no espelho `produtos` (conta MINÚSCULA lá). Sem conta = as duas. */
export async function buscarProdutos(q: string, conta?: Conta | null): Promise<any[]> {
  const termo = q.trim();
  if (termo.length < 2) return [];
  const t = termo.replace(/[%,()"]/g, ' ').trim();
  let query = supabase
    .from('produtos')
    .select('conta_omie, codigo_produto, codigo, descricao, estoque, cmc, inativo, arquivado')
    .or(`codigo.ilike."%${t}%",descricao.ilike."%${t}%"`)
    .order('codigo', { ascending: true })
    .limit(40);
  if (conta) query = query.eq('conta_omie', conta.toLowerCase());
  const { data, error } = await query;
  if (error) throw error;
  return (data || [])
    .filter((p: any) => p.arquivado !== true)
    .map((p: any) => ({
      conta: String(p.conta_omie || '').toUpperCase(),
      codigoProduto: Number(p.codigo_produto),
      codigo: p.codigo || null,
      descricao: p.descricao || null,
      estoque: Number(p.estoque || 0),
      cmc: Number(p.cmc || 0),
      inativo: p.inativo === true,
    }));
}

/** Físico e CMC do produto em cada local ativo, lidos AO VIVO no Omie. */
export async function posicaoPorLocal(conta: Conta, idProd: number): Promise<LocalPosicao[]> {
  if (!contaValida(conta)) throw httpErr(400, `conta "${conta}" sem credenciais Omie`);
  const locais = await locaisDaConta(conta);
  if (!locais.length) throw httpErr(502, 'nenhum local de estoque ativo na conta');
  const out: LocalPosicao[] = [];
  for (const l of locais) {
    const pos = await obterPosicaoEstoqueProduto(conta, idProd, { codigoLocalEstoque: l.id });
    out.push({
      id: Number(l.id),
      nome: String(l.nome),
      padrao: !!l.padrao,
      fisico: Number((pos.fisico ?? pos.saldo) || 0),
      cmc: Number(pos.cmc || 0),
    });
    if (locais.length > 1) await sleep(250);
  }
  return out;
}

/** Local sugerido: o de maior saldo; com tudo zerado, o padrão da conta. */
export function localSugerido(locais: LocalPosicao[]): number | null {
  let best: LocalPosicao | null = null;
  for (const l of locais) if (!best || Math.abs(l.fisico) > Math.abs(best.fisico)) best = l;
  if (best && Math.abs(best.fisico) > 0) return best.id;
  return (locais.find((l) => l.padrao) || locais[0])?.id ?? null;
}

export interface ItemAjusteBody {
  conta: string;
  codigoProduto: number | string;
  codLocal?: number | string | null;
  codigo?: string | null;
  descricao?: string | null;
  novaQtd?: number | string | null;
  novoCusto?: number | string | null;
}

interface ItemPlanejado {
  conta: Conta;
  idProd: number;
  codLocal: number;
  localNome: string;
  rotulo: string; // "NOVA · RP-123 FILTRO"
  qtdAtual: number;
  cmcAtual: number;
  plano: PlanoAjuste;
}

function vazioParaNull(v: unknown): number | null {
  if (v == null || (typeof v === 'string' && v.trim() === '')) return null;
  const n = numeroBR(v);
  return n == null ? NaN : n;
}

/**
 * Prévia (gravar=false) ou aplicação (gravar=true) de um lote de ajustes.
 * `usuario` vem do login (a rota garante), nunca do corpo.
 */
export async function ajustarEstoque(
  args: { itens: ItemAjusteBody[]; motivo: string; gravar: boolean },
  usuario: { id: string; nome: string },
): Promise<any> {
  const motivo = String(args.motivo || '').trim();
  const itens = Array.isArray(args.itens) ? args.itens : [];
  if (!itens.length) throw httpErr(400, 'nenhum produto no ajuste');
  if (itens.length > 10) throw httpErr(400, 'no máximo 10 produtos por vez');
  if (args.gravar && motivo.length < 5) throw httpErr(400, 'escreva o motivo do ajuste (pelo menos 5 letras)');

  const chaves = new Set<string>();
  const planejados: ItemPlanejado[] = [];
  const problemas: { indice: number; erro: string }[] = [];

  // 1) PRÉVIA: tudo relido do Omie, nada gravado.
  for (let i = 0; i < itens.length; i++) {
    const it = itens[i];
    try {
      const conta = String(it.conta || '').toUpperCase();
      if (!contaValida(conta)) throw new Error(`conta "${it.conta}" inválida`);
      const idProd = Number(it.codigoProduto);
      if (!idProd) throw new Error('produto não informado');
      const novaQtd = vazioParaNull(it.novaQtd);
      const novoCusto = vazioParaNull(it.novoCusto);
      if (Number.isNaN(novaQtd as number)) throw new Error('quantidade nova não é um número');
      if (Number.isNaN(novoCusto as number)) throw new Error('custo novo não é um número');

      const locais = await posicaoPorLocal(conta, idProd);
      const codLocalIn = it.codLocal != null && it.codLocal !== '' ? Number(it.codLocal) : null;
      const codLocal = codLocalIn ?? localSugerido(locais);
      const local = locais.find((l) => l.id === codLocal);
      if (!local) throw new Error('local de estoque não encontrado');

      const chave = `${conta}:${idProd}:${codLocal}`;
      if (chaves.has(chave)) throw new Error('o mesmo produto/local aparece duas vezes no lote');
      chaves.add(chave);

      const plano = planejarAjuste({ qtdAtual: local.fisico, cmcAtual: local.cmc, novaQtd, novoCusto });
      if ('erro' in plano) throw new Error(plano.erro);
      planejados.push({
        conta, idProd, codLocal: local.id, localNome: local.nome,
        rotulo: `${conta} · ${it.codigo || '#' + idProd}${it.descricao ? ' ' + it.descricao : ''}`,
        qtdAtual: local.fisico, cmcAtual: local.cmc, plano,
      });
    } catch (e: any) {
      problemas.push({ indice: i, erro: e.faultstring || e.message });
    }
  }

  const previa = planejados.map((p) => ({
    conta: p.conta, codigoProduto: p.idProd, codLocal: p.codLocal, localNome: p.localNome,
    qtdAtual: p.qtdAtual, cmcAtual: p.cmcAtual, qtdFinal: p.plano.qtdFinal, cmcFinal: p.plano.cmcFinal,
    tipo: p.plano.tipo, resumo: p.plano.resumo,
  }));
  if (problemas.length || !args.gravar) {
    return { ok: problemas.length === 0, gravado: false, previa, problemas };
  }

  // 2) GRAVA em sequência; falhou um → desfaz os anteriores.
  const quando = dataHoraBR();
  const grupo = planejados.length > 1 ? `lote de ${planejados.length}` : null;
  const feitos: { item: ItemPlanejado; codigoAjuste: any; obs: string }[] = [];
  let falha: { indice: number; erro: string } | null = null;
  for (let i = 0; i < planejados.length; i++) {
    const p = planejados[i];
    const obs = montarObsAjuste({ quando, usuario: usuario.nome, motivo, resumo: p.plano.resumo, grupo });
    try {
      const r = await incluirAjusteEstoque(p.conta, {
        idProd: p.idProd, codLocal: p.codLocal, tipo: p.plano.tipo, quan: p.plano.quan,
        valor: p.plano.valor, motivo: p.plano.motivo, origem: 'AJU', obs,
      });
      feitos.push({ item: p, codigoAjuste: r.codigoAjuste, obs });
    } catch (e: any) {
      falha = { indice: i, erro: e.faultstring || e.message };
      break;
    }
    if (i < planejados.length - 1) await sleep(400);
  }

  const desfeitos: { indice: number; ok: boolean; erro?: string }[] = [];
  if (falha) {
    for (let k = feitos.length - 1; k >= 0; k--) {
      const f = feitos[k];
      try {
        if (f.codigoAjuste == null) throw new Error('Omie não devolveu o código do ajuste');
        await excluirAjusteEstoque(f.item.conta, f.codigoAjuste);
        desfeitos.push({ indice: k, ok: true });
      } catch (e: any) {
        desfeitos.push({ indice: k, ok: false, erro: e.faultstring || e.message });
      }
    }
  }

  for (const c of new Set(planejados.map((p) => p.conta))) {
    cache.invalidatePrefix(`ajuste_custos_produtos:${c}`);
    cache.invalidatePrefix(`analise:${c}:`);
  }

  await registrarAuditLog({
    userId: usuario.id,
    userName: usuario.nome,
    sistema: 'ajustes',
    acao: 'ajuste-estoque',
    entidade: 'produtos',
    entidadeLabel: planejados.map((p) => p.rotulo).join(' + ').slice(0, 300),
    detalhes: {
      motivo, quando,
      status: !falha ? 'aplicado' : desfeitos.every((d) => d.ok) ? 'desfeito' : 'parcial',
      itens: planejados.map((p, i) => ({
        conta: p.conta, codigoProduto: p.idProd, codLocal: p.codLocal,
        qtdAntes: p.qtdAtual, qtdDepois: p.plano.qtdFinal, cmcAntes: p.cmcAtual, cmcDepois: p.plano.cmcFinal,
        tipo: p.plano.tipo, codigoAjusteOmie: feitos[i]?.codigoAjuste ?? null,
      })),
      falha, desfeitos,
    },
  });

  if (falha) {
    const naoDesfeitos = desfeitos.filter((d) => !d.ok);
    const msg = naoDesfeitos.length
      ? `falhou no item ${falha.indice + 1} (${falha.erro}) e ${naoDesfeitos.length} ajuste(s) já gravado(s) NÃO puderam ser desfeitos — confira no Omie`
      : `falhou no item ${falha.indice + 1} (${falha.erro}); ${feitos.length ? 'os anteriores foram desfeitos, ' : ''}nada ficou gravado`;
    return { ok: false, gravado: false, previa, falha, desfeitos, erro: msg };
  }
  return {
    ok: true, gravado: true, previa, quando,
    ajustes: feitos.map((f) => ({ conta: f.item.conta, codigoProduto: f.item.idProd, codigoAjuste: f.codigoAjuste, obs: f.obs })),
  };
}
