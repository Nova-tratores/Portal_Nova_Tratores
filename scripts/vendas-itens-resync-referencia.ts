// Saneamento do espelho vendas_itens (Dashboard de Vendas) depois da troca da
// regra "mês = janela do sync" por "mês = FATURAMENTO do pedido"
// (src/lib/estoque/vendas-referencia.ts). O sync antigo deixou pedidos em dois
// meses (auditoria 08/10/2026: 29 pares, R$ 14,9 mil; 156 linhas fora do mês).
//
// Uso:
//   npx tsx scripts/vendas-itens-resync-referencia.ts                    → SIMULAÇÃO (não grava)
//   npx tsx scripts/vendas-itens-resync-referencia.ts --desde 2026-04 --conta NOVA
//   npx tsx scripts/vendas-itens-resync-referencia.ts --gravar           → regrava os meses
//
// Simulação: UMA chamada ListarPedidos por conta (do 1º dia de --desde até
// hoje), aplica a regra nova e compara mês a mês com o que está gravado.
// --gravar: roda sincronizarMesesVendas — o MESMO caminho do cron/dashboard —
// e confere as duplicidades depois.
//
// ⚠ Só grave DEPOIS do deploy da regra nova: o cron do mês corrente (a cada
// 30 min) com o código antigo recria a duplicidade.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Conta } from '../src/lib/estoque/conta';

function lerEnvLocal(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const linha of readFileSync(resolve(__dirname, '../.env.local'), 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

function flag(nome: string): string | undefined {
  const i = process.argv.indexOf('--' + nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const fmtBR = (v: number): string => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Linha { id: number; mes: number; ano: number; numero_pedido: string | null; codigo_produto: string | null; valor_total: number }

async function main() {
  const env = lerEnvLocal();
  for (const [k, v] of Object.entries(env)) if (!process.env[k]) process.env[k] = v;

  const { supabase } = await import('../src/lib/estoque/supabase');
  const { getContasOmie } = await import('../src/lib/estoque/conta');
  const { fmtD } = await import('../src/lib/estoque/utils');
  const { buscarPedidosPeriodo, sincronizarMesesVendas } = await import('../src/lib/estoque/vendas-sync');
  const { planejarGravacao, chaveMes } = await import('../src/lib/estoque/vendas-referencia');

  const GRAVAR = process.argv.includes('--gravar');
  const [anoDe, mesDe] = (flag('desde') || '2026-04').split('-').map(Number);
  const contaFlag = (flag('conta') || '').toUpperCase();
  const contas = getContasOmie().map((c) => c.id as Conta).filter((c) => !contaFlag || c === contaFlag);
  if (!anoDe || !mesDe) throw new Error('--desde AAAA-MM inválido');

  const hoje = new Date();
  const meses: Array<{ mes: number; ano: number }> = [];
  for (let a = anoDe, m = mesDe; a < hoje.getFullYear() || (a === hoje.getFullYear() && m <= hoje.getMonth() + 1); m === 12 ? (a++, m = 1) : m++) {
    meses.push({ mes: m, ano: a });
  }

  async function lerEspelho(conta: Conta): Promise<Linha[]> {
    const out: Linha[] = [];
    for (let off = 0; ; off += 1000) {
      const { data, error } = await supabase
        .from('vendas_itens')
        .select('id,mes,ano,numero_pedido,codigo_produto,valor_total')
        .eq('conta_omie', conta)
        .or(meses.map((m) => `and(mes.eq.${m.mes},ano.eq.${m.ano})`).join(','))
        .order('id')
        .range(off, off + 999);
      if (error) throw new Error(error.message);
      out.push(...((data || []) as Linha[]));
      if (!data || data.length < 1000) break;
    }
    return out;
  }

  function duplicidades(linhas: Linha[]) {
    const mesesPorPar = new Map<string, Set<string>>();
    const valorPorParMes = new Map<string, number>();
    for (const l of linhas) {
      const par = l.numero_pedido + '|' + l.codigo_produto;
      const k = chaveMes(l);
      if (!mesesPorPar.has(par)) mesesPorPar.set(par, new Set());
      mesesPorPar.get(par)!.add(k);
      valorPorParMes.set(par + '@' + k, (valorPorParMes.get(par + '@' + k) || 0) + Number(l.valor_total || 0));
    }
    let pares = 0, excesso = 0;
    for (const [par, ms] of mesesPorPar) {
      if (ms.size < 2) continue;
      pares++;
      const valores = [...ms].map((k) => valorPorParMes.get(par + '@' + k) || 0).sort((a, b) => b - a);
      excesso += valores.slice(1).reduce((s, v) => s + v, 0);
    }
    return { pares, excesso };
  }

  console.log(`${GRAVAR ? 'GRAVANDO' : 'SIMULAÇÃO'} · meses ${chaveMes(meses[0])} → ${chaveMes(meses[meses.length - 1])} · contas ${contas.join(', ')}\n`);

  for (const conta of contas) {
    const antes = await lerEspelho(conta);
    const dupAntes = duplicidades(antes);
    console.log(`== ${conta}: espelho atual ${antes.length} linhas · ${dupAntes.pares} pares em 2+ meses (R$ ${fmtBR(dupAntes.excesso)} a mais)`);

    if (GRAVAR) {
      const t0 = Date.now();
      await sincronizarMesesVendas(meses, conta);
      const depois = await lerEspelho(conta);
      const dupDepois = duplicidades(depois);
      console.log(`   regravado em ${((Date.now() - t0) / 1000).toFixed(0)} s · ${depois.length} linhas · ${dupDepois.pares} pares em 2+ meses (R$ ${fmtBR(dupDepois.excesso)})\n`);
      continue;
    }

    const descartados = new Set<string>();
    const pedidos = await buscarPedidosPeriodo(fmtD(new Date(meses[0].ano, meses[0].mes - 1, 1)), fmtD(hoje), conta, descartados);
    const plano = planejarGravacao(pedidos, descartados, meses);
    const atualPorMes = new Map<string, { n: number; v: number }>();
    for (const l of antes) {
      const k = chaveMes(l);
      const a = atualPorMes.get(k) || { n: 0, v: 0 };
      a.n++; a.v += Number(l.valor_total || 0);
      atualPorMes.set(k, a);
    }
    console.log('   mês       linhas hoje → nova     valor hoje            → valor nova           diferença');
    let totHoje = 0, totNova = 0;
    for (const m of meses) {
      const k = chaveMes(m);
      const a = atualPorMes.get(k) || { n: 0, v: 0 };
      const itens = plano.porMes.get(k)?.itens || [];
      const v = itens.reduce((s, p) => s + p.valor_total, 0);
      totHoje += a.v; totNova += v;
      console.log(`   ${k}   ${String(a.n).padStart(6)} → ${String(itens.length).padEnd(6)}  R$ ${fmtBR(a.v).padStart(16)} → R$ ${fmtBR(v).padStart(16)}  ${v - a.v >= 0 ? '+' : ''}${fmtBR(v - a.v)}`);
    }
    const cancelados = [...descartados].filter((n) => antes.some((l) => l.numero_pedido === n));
    console.log(`   total                             R$ ${fmtBR(totHoje).padStart(16)} → R$ ${fmtBR(totNova).padStart(16)}  ${fmtBR(totNova - totHoje)}`);
    console.log(`   pedidos fora dos meses (outro mês/sem data): ${plano.foraDoEscopo} itens · cancelados/estornados que hoje estão no espelho: ${cancelados.length}${cancelados.length ? ' (' + cancelados.slice(0, 15).join(', ') + ')' : ''}
`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
