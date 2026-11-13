/* eslint-disable @typescript-eslint/no-explicit-any */
// Reverter recebimento com PAGAMENTO e relançar depois (13/11/2026).
// Fluxo: plano (lê títulos + pagamentos ao vivo) → reverter (guarda a ficha,
// cancela cada pagamento, ReverterRecebimento; se algo falhar, relança o que
// cancelou e para) → depois da nova entrada, prévia + relançar (LancarPagamento
// nas contas a pagar novas, mesma data/conta corrente/juros/multa/desconto,
// conciliado quando o original era).
//
// Tabela recebimento_reversoes (sql/recebimento-reversoes.sql). conta_omie lá é MAIÚSCULA.

import type { Conta } from '@/lib/ajustes/conta';
import { supabase } from '@/lib/ajustes/supabase';
import { omieRequest, cancelarBaixaConta } from '@/lib/ajustes/omie';
import { baixarTitulo } from '@/lib/ajustes/contas';
import { reabrirRecebimento } from '@/lib/estoque/recebimentos';
import {
  pagamentosDosMovimentos, planejarRelancamento, statusDepoisDeRelancar, observacaoRelancamento,
  type PagamentoGuardado, type TituloOmie,
} from './reversao-regras';

const TABELA = 'recebimento_reversoes';
const semZeros = (s: unknown) => String(s ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
const agoraBR = () => new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

export function tabelaFaltando(e: any): boolean {
  const m = String(e?.message || e || '');
  return /recebimento_reversoes/.test(m) && /(does not exist|schema cache|not find)/i.test(m);
}

/** Nota (cabeçalho) + contas a pagar dela na Omie, ao vivo. */
export async function titulosDaNota(conta: Conta, idReceb: number) {
  const d: any = await omieRequest('/produtos/recebimentonfe/', 'ConsultarRecebimento', { nIdReceb: idReceb }, conta);
  const r = d.recebimento || d.recebimentos || d;
  const cab = r.cabec || {};
  const ic = r.infoCadastro || {};
  const nota = {
    numero: cab.cNumeroNFe ? String(cab.cNumeroNFe) : null,
    fornecedor: cab.cRazaoSocial || cab.cNome || null,
    fornecedorId: Number(cab.nIdFornecedor) || null,
    valor: Number(cab.nValorNFe) || 0,
    recebido: ic.cRecebido === 'S',
    cancelada: ic.cCancelada === 'S',
  };
  const titulos: TituloOmie[] = [];
  if (nota.fornecedorId && nota.numero) {
    const alvo = semZeros(nota.numero);
    for (let pagina = 1; pagina <= 20; pagina++) {
      const l: any = await omieRequest('/financas/contapagar/', 'ListarContasPagar',
        { pagina, registros_por_pagina: 500, apenas_importado_api: 'N', filtrar_cliente: nota.fornecedorId }, conta);
      for (const c of l.conta_pagar_cadastro || []) {
        if (semZeros(c.numero_documento_fiscal) !== alvo) continue;
        titulos.push({
          codigo: Number(c.codigo_lancamento_omie),
          numeroParcela: c.numero_parcela || null,
          valorDocumento: Number(c.valor_documento) || 0,
          valorPago: Number(c.valor_pago) || 0,
          status: c.status_titulo || null,
          vencimento: c.data_vencimento || null,
          documento: c.numero_documento_fiscal || null,
        });
      }
      if (pagina >= Number(l.total_de_paginas || 1)) break;
    }
  }
  return { nota, titulos: titulos.filter((t) => !/CANCEL/i.test(String(t.status || ''))) };
}

/** Pagamentos de um título (a Omie devolve 1 movimento por página quando filtra por título). */
export async function pagamentosDoTitulo(conta: Conta, titulo: TituloOmie): Promise<PagamentoGuardado[]> {
  const movs: any[] = [];
  for (let pagina = 1; pagina <= 40; pagina++) {
    let r: any;
    try {
      r = await omieRequest('/financas/mf/', 'ListarMovimentos', { nPagina: pagina, nRegPorPagina: 50, nCodTitulo: titulo.codigo }, conta);
    } catch (e: any) {
      if (/n[aã]o.*(registro|encontrad)/i.test(String(e?.faultstring || e?.message || ''))) break;
      throw e;
    }
    const lista = r.movimentos || [];
    movs.push(...lista);
    const total = Number(r.nTotRegistros || 0);
    if (!lista.length || movs.length >= total) break;
  }
  return pagamentosDosMovimentos(movs, titulo);
}

/** O que a reversão vai fazer: contas a pagar e pagamentos (só leitura). */
export async function planoReversao(conta: Conta, idReceb: number) {
  const { nota, titulos } = await titulosDaNota(conta, idReceb);
  const pagamentos: PagamentoGuardado[] = [];
  // todos os títulos: pagamento PARCIAL deixa o status "A VENCER"/"ATRASADO"
  for (const t of titulos) pagamentos.push(...(await pagamentosDoTitulo(conta, t)));
  const pendente = await fichaPendente(conta, idReceb).catch(() => null);
  return { nota, titulos, pagamentos, fichaPendente: pendente ? { id: pendente.id, status: pendente.status } : null };
}

async function gravar(id: string, campos: Record<string, any>) {
  const { error } = await supabase.from(TABELA).update({ ...campos, atualizado_em: new Date().toISOString() }).eq('id', id);
  if (error) console.warn('[reversao] gravar ficha:', error.message);
}

/** Relança um pagamento guardado num título (o antigo, no rollback, ou o novo). */
async function lancar(conta: Conta, codigoTitulo: number, p: PagamentoGuardado, observacao: string) {
  return baixarTitulo({
    conta, tipo: 'pagar', codigoLancamento: codigoTitulo, codigoContaCorrente: p.contaCorrente as number,
    valor: p.valor, data: p.data, juros: p.juros, multa: p.multa, desconto: p.desconto,
    observacao, conciliar: !!p.conciliadoEm,
  });
}

/**
 * Reverte a nota cancelando antes os pagamentos. Tudo ou nada: se um cancelamento
 * ou a reversão falhar, relança nos títulos ORIGINAIS o que já tinha cancelado.
 */
export async function reverterComPagamentos(a: { conta: Conta; idReceb: number; motivo: string; userId: string | null; userNome: string }) {
  const plano = await planoReversao(a.conta, a.idReceb);
  if (plano.fichaPendente) return { ok: false, erro: 'Esta nota já tem uma reversão com pagamentos a relançar. Relance antes de reverter de novo.' };
  const pagamentos = plano.pagamentos.map((p) => ({ ...p }));

  const { data: ficha, error } = await supabase.from(TABELA).insert({
    conta_omie: a.conta, id_receb: a.idReceb, numero_nfe: plano.nota.numero, fornecedor: plano.nota.fornecedor,
    valor_nfe: plano.nota.valor, motivo: a.motivo, status: 'revertendo',
    titulos_antes: plano.titulos, pagamentos, user_id: a.userId, user_nome: a.userNome,
  }).select('id').single();
  if (error) {
    if (tabelaFaltando(error)) return { ok: false, migracaoFaltando: true, erro: 'Falta aplicar sql/recebimento-reversoes.sql para reverter nota com pagamento.' };
    return { ok: false, erro: error.message };
  }
  const id = (ficha as any).id as string;

  const desfazer = async (motivoFalha: string) => {
    const naoVoltaram: string[] = [];
    for (const p of pagamentos.filter((x) => x.canceladoEm)) {
      const r = await lancar(a.conta, p.codigoTitulo, p, `Pagamento restaurado pelo portal (reversão do recebimento da NF ${semZeros(plano.nota.numero)} não concluída).`);
      if (r.ok) { p.canceladoEm = null; p.erro = null; } else { p.erro = r.erro; naoVoltaram.push(`${p.data} R$ ${p.valor.toFixed(2)}`); }
    }
    const erro = naoVoltaram.length
      ? `${motivoFalha} ATENÇÃO: não consegui restaurar ${naoVoltaram.length} pagamento(s) (${naoVoltaram.join('; ')}); lance na Omie.`
      : `${motivoFalha} Os pagamentos cancelados foram lançados de novo; a nota continua recebida.`;
    await gravar(id, { status: 'falhou', pagamentos, erro });
    return { ok: false, erro, fichaId: id };
  };

  for (const p of pagamentos) {
    try {
      await cancelarBaixaConta(a.conta, 'pagar', p.codigoBaixa);
      p.canceladoEm = agoraBR();
    } catch (e: any) {
      p.erro = e?.faultstring || e?.message || String(e);
      return desfazer(`A Omie não cancelou o pagamento de ${p.data} (R$ ${p.valor.toFixed(2)}): ${p.erro}.`);
    }
  }
  await gravar(id, { pagamentos });

  const rev = await reabrirRecebimento(a.conta, a.idReceb);
  if (!rev.ok) return desfazer(`A Omie não reverteu a nota: ${rev.erro || 'erro'}.`);

  const status = pagamentos.length ? 'aguardando_relancamento' : 'concluida';
  await gravar(id, { status, pagamentos, erro: null });
  return { ok: true, fichaId: id, pagamentos: pagamentos.length, status };
}

export async function fichaPendente(conta: Conta, idReceb: number) {
  const { data, error } = await supabase.from(TABELA).select('*')
    .eq('conta_omie', conta).eq('id_receb', idReceb).in('status', ['aguardando_relancamento', 'parcial'])
    .order('criado_em', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data as any;
}

/** Fichas com pagamento a relançar (para o selo na lista e a faixa da tela). */
export async function fichasPendentes(conta: Conta) {
  const { data, error } = await supabase.from(TABELA)
    .select('id,id_receb,numero_nfe,fornecedor,status,pagamentos,criado_em,user_nome')
    .eq('conta_omie', conta).in('status', ['aguardando_relancamento', 'parcial']).order('criado_em', { ascending: false }).limit(200);
  if (error) { if (tabelaFaltando(error)) return []; throw error; }
  return ((data || []) as any[]).map((f) => {
    const pend = (f.pagamentos || []).filter((p: PagamentoGuardado) => !p.codigoBaixaNova);
    return { id: f.id, idReceb: Number(f.id_receb), numeroNfe: f.numero_nfe, fornecedor: f.fornecedor, status: f.status,
      criadoEm: f.criado_em, quem: f.user_nome, aRelancar: pend.length, valorARelancar: pend.reduce((s: number, p: PagamentoGuardado) => s + p.valor, 0) };
  });
}

/** Prévia: casa os pagamentos guardados com as contas a pagar novas da nota. */
export async function previaRelancamento(conta: Conta, idReceb: number) {
  const ficha = await fichaPendente(conta, idReceb);
  if (!ficha) return { ficha: null };
  const { nota, titulos } = await titulosDaNota(conta, idReceb);
  const plano = planejarRelancamento(ficha.pagamentos || [], titulos);
  if (!nota.recebido) plano.avisos.unshift('A nota ainda não foi recebida de novo na Omie. Dê entrada primeiro; depois relance.');
  return { ficha: { id: ficha.id, numeroNfe: ficha.numero_nfe, motivo: ficha.motivo, criadoEm: ficha.criado_em, quem: ficha.user_nome, pagamentos: ficha.pagamentos }, nota, titulos, ...plano };
}

/** Relança os pagamentos confirmados na prévia ({indice, tituloNovo}). */
export async function relancarPagamentos(a: { conta: Conta; idReceb: number; itens: Array<{ indice: number; tituloNovo: number }>; userNome: string }) {
  const ficha = await fichaPendente(a.conta, a.idReceb);
  if (!ficha) return { ok: false, erro: 'Não há pagamentos a relançar para esta nota.' };
  const { nota, titulos } = await titulosDaNota(a.conta, a.idReceb);
  if (!nota.recebido) return { ok: false, erro: 'A nota ainda não foi recebida de novo na Omie.' };
  const pagamentos: PagamentoGuardado[] = ficha.pagamentos || [];
  const codigos = new Set(titulos.map((t) => t.codigo));
  // confere de novo contra o saldo atual (alguém pode ter lançado algo na Omie no meio)
  const plano = planejarRelancamento(pagamentos, titulos);
  const resultados: Array<{ indice: number; ok: boolean; erro?: string }> = [];
  for (const it of a.itens) {
    const p = pagamentos[it.indice];
    const previsto = plano.itens.find((x) => x.indice === it.indice);
    if (!p || p.codigoBaixaNova) continue;
    if (!codigos.has(Number(it.tituloNovo))) { resultados.push({ indice: it.indice, ok: false, erro: 'conta a pagar não é desta nota' }); continue; }
    if (previsto?.bloqueio && previsto.tituloNovo === Number(it.tituloNovo)) { resultados.push({ indice: it.indice, ok: false, erro: previsto.bloqueio }); continue; }
    const r = await lancar(a.conta, Number(it.tituloNovo), p, observacaoRelancamento(ficha.numero_nfe, ficha.motivo, p));
    if (r.ok) {
      p.codigoBaixaNova = Number(r.codigoBaixa) || -1; p.tituloNovo = Number(it.tituloNovo); p.relancadoEm = agoraBR(); p.erro = null;
      resultados.push({ indice: it.indice, ok: true });
    } else {
      p.erro = r.erro || 'erro';
      resultados.push({ indice: it.indice, ok: false, erro: p.erro || undefined });
      if ((r as any).incerto) break; // sem resposta clara da Omie: para e deixa conferir
    }
  }
  const status = statusDepoisDeRelancar(pagamentos);
  await gravar(ficha.id, { pagamentos, status, ...(status === 'relancada' ? { relancado_em: new Date().toISOString(), relancado_por: a.userNome } : {}) });
  return { ok: resultados.every((r) => r.ok), resultados, status };
}
