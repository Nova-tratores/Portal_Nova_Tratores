/* eslint-disable @typescript-eslint/no-explicit-any */
// Varredura noturna "frete fora do custo" (tarefa fretes-custo-varredura, 01:30, só leitura
// na Omie). Regras puras em ./fretes-custo.ts. Lê o kardex das peças das NF-e recebidas
// nos últimos 90 dias de fornecedores que mandam CT-e e grava em frete_custo_alertas
// (uma linha por produto × CT-e; o que já está lá não duplica). Avisa no sino quem
// recebe Peças quando aparece coisa nova.

import { supabaseAdmin as sb } from '@/lib/server/supabase-admin';
import { obterMovimentosProduto } from '@/lib/ajustes/omie';
import { notificarUsuario } from '@/lib/pecas/unidades-server';
import { fretesForaDoCusto, ROTULO_MOTIVO, type MovKardex } from './fretes-custo';

const CONTAS = ['NOVA', 'CASTRO'] as const;
const DIAS = 90;
const ehCte = (c: unknown) => { const d = String(c || '').replace(/\D/g, ''); return d.length === 44 && d.slice(20, 22) === '57'; };
const br = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Prod { id: number; codigo: string | null; descricao: string | null }

async function produtosDaConta(conta: string, desde: string): Promise<Prod[]> {
  const low = conta.toLowerCase();
  const linhas: any[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.from('recebimentos_nfe').select('chave_nfe,fornecedor_cnpj,produtos,status,recebido_em')
      .eq('conta_omie', low).gte('recebido_em', desde).order('id_receb').range(de, de + 999);
    if (error) throw new Error(error.message);
    linhas.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const comFrete = new Set(linhas.filter((l) => ehCte(l.chave_nfe)).map((l) => String(l.fornecedor_cnpj || '')));
  const prods = new Map<number, Prod>();
  for (const l of linhas) {
    if (ehCte(l.chave_nfe) || l.status !== 'Recebida' || !comFrete.has(String(l.fornecedor_cnpj || ''))) continue;
    for (const p of (l.produtos || []) as any[]) {
      const id = Number(p?.nCodProduto);
      if (id > 0 && !prods.has(id)) prods.set(id, { id, codigo: p.cCodigo || p.cCodProduto || p.codigo || null, descricao: p.cDescricao || p.descricao || null });
    }
  }
  return [...prods.values()];
}

export async function varrerFretesForaDoCusto(opts: { gravar?: boolean; limite?: number } = {}) {
  const gravar = opts.gravar !== false;
  const hoje = new Date();
  const inicio = new Date(hoje.getTime() - DIAS * 86400000);
  const desde = inicio.toISOString().slice(0, 10);
  const resumo: string[] = [];
  let totalNovos = 0;

  for (const conta of CONTAS) {
    let prods: Prod[];
    try { prods = await produtosDaConta(conta, desde); } catch (e: any) { resumo.push(`${conta}: espelho falhou (${e.message})`); continue; }
    if (opts.limite) prods = prods.slice(0, opts.limite);
    const achados: any[] = [];
    let lidos = 0, erros = 0, parou = '';
    for (const p of prods) {
      try {
        const movs = (await obterMovimentosProduto(conta, p.id, br(inicio), br(hoje))) as MovKardex[];
        lidos++;
        for (const f of fretesForaDoCusto(movs)) {
          achados.push({
            conta_omie: conta, id_produto: p.id, codigo: p.codigo, descricao: p.descricao,
            data_mov: f.dataMov, cte_numero: f.cteNumero || '', id_doc: f.idDoc, motivo: f.motivo,
            qtd_antes: f.qtdAntes, frete_valor: f.freteValor, cmc_antes: f.cmcAntes, cmc_depois: f.cmcDepois,
          });
        }
      } catch (e: any) {
        erros++;
        if (/bloque|425|REDUNDANT|consumo|indispon/i.test(String(e?.message || ''))) { parou = String(e.message).slice(0, 120); break; }
      }
      await pausa(400);
    }
    let novos = 0;
    if (gravar && achados.length) {
      const { data, error } = await sb.from('frete_custo_alertas')
        .upsert(achados, { onConflict: 'conta_omie,id_produto,data_mov,cte_numero', ignoreDuplicates: true })
        .select('id');
      if (error) { resumo.push(`${conta}: não gravou (${error.message})`); continue; }
      novos = (data || []).length;
    }
    totalNovos += novos;
    resumo.push(`${conta}: ${lidos}/${prods.length} peças lidas, ${achados.length} frete(s) fora do custo (${novos} novo(s))${erros ? `, ${erros} erro(s)` : ''}${parou ? ` — parou: ${parou}` : ''}`);

    if (gravar && novos > 0) {
      const { data: resp } = await sb.from('recebimento_tipo_responsavel').select('responsavel_user_id')
        .eq('conta_omie', conta.toLowerCase()).eq('tipo', 'pecas').maybeSingle();
      const exemplos = achados.slice(0, 4).map((a) => `CT-e ${a.cte_numero} · ${a.codigo || a.id_produto} · ${ROTULO_MOTIVO[a.motivo as keyof typeof ROTULO_MOTIVO]}`);
      await notificarUsuario((resp as any)?.responsavel_user_id, {
        titulo: `${novos} frete(s) fora do custo das peças (${conta})`,
        descricao: exemplos.join('\n') + (achados.length > 4 ? `\ne mais ${achados.length - 4}` : ''),
        link: `/estoque/recebimentos?conta=${conta}&fretes=1`,
      });
    }
  }
  return { ok: true, novos: totalNovos, resumo: resumo.join(' · ') };
}

export async function listarAlertasFrete(conta: string, status: 'novo' | 'todos' = 'novo') {
  let q = sb.from('frete_custo_alertas').select('*').eq('conta_omie', conta).order('achado_em', { ascending: false }).limit(300);
  if (status === 'novo') q = q.eq('status', 'novo');
  const { data, error } = await q;
  if (error) return { alertas: [], faltaTabela: /frete_custo_alertas/.test(error.message) || error.code === 'PGRST205' };
  return { alertas: data || [], faltaTabela: false };
}

export async function marcarAlertaFrete(ids: number[], status: 'visto' | 'corrigido' | 'novo', autor: string) {
  const { error } = await sb.from('frete_custo_alertas')
    .update({ status, visto_por: status === 'novo' ? null : autor, visto_em: status === 'novo' ? null : new Date().toISOString() })
    .in('id', ids);
  if (error) throw new Error(error.message);
}
