// Audita a tabela `os_mensal` (base do card Serviços do /estoque/dashboard):
// recalcula mês a mês a partir da Omie e COMPARA com o que está gravado.
//
// Por que existe: até o commit 85f6ed4, um ListarOS truncado (falha/rate limit
// no meio da paginação) fazia os refreshes em background regravarem o mês com
// um total a menos — ou zero. O auto-conserto do portal só reage a
// `total === 0 || nota == null`, então um mês gravado a menos, mas com split
// preenchido, nunca mais se corrigia sozinho. Caso real: abr/2026 estava com
// 62.633 contra 77.122 reais (-19%).
//
// Uso:
//   npx tsx scripts/os-mensal-auditar.ts
//   npx tsx scripts/os-mensal-auditar.ts --conta NOVA --desde 2025-01
//
// Flags:
//   --conta NOVA|CASTRO   só uma conta (default: todas as configuradas)
//   --desde AAAA-MM       ignora meses anteriores a este (default: nov/2022)
//   --saida arquivo.csv   default scripts/os-mensal-auditoria.csv
//   --aplicar             REGRAVA os meses fechados divergentes em os_mensal
//                         (+ os_servicos_itens). Sem a flag é só relatório.
//
// Sem --aplicar NÃO grava nada em `os_mensal` — é só relatório. (Ressalva
// honesta: mesmo assim o recálculo passa por classificarNfseOS, que preenche o
// cache `os_nfse` das OS ainda não verificadas — a mesma gravação que o portal
// já faz ao abrir o mês na tela.)
//
// Com --aplicar: para cada mês FECHADO com |diff| >= 0,01 e listagem COMPLETA,
// faz upsert de valor_total/valor_nota/valor_interno (sem delete) e regrava
// os_servicos_itens do mês. O mês corrente NUNCA é tocado — o portal o
// reescreve sozinho. Idempotente: rodar de novo não muda mais nada.
//
// Roda LOCAL de propósito: no Railway um job destes seria cortado aos 5 min.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
// Só o TIPO: import de tipo é apagado na compilação, então não executa o módulo
// antes das envs entrarem em process.env (os módulos abaixo são importados
// dinamicamente por causa disso).
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
const csvNum = (v: number): string => v.toFixed(2).replace('.', ','); // pt-BR p/ o Excel

interface LinhaAuditoria {
  conta: string;
  mes: number;
  ano: number;
  gravado: number;
  recalculado: number;
  diff: number;
  diffPct: number;
  notaGravada: number | null;
  notaRecalc: number;
  /** Mês corrente: o gravado é um snapshot do último refresh, então divergir é NORMAL. */
  corrente: boolean;
}

async function main() {
  // O cliente Supabase e o da Omie são criados no escopo do módulo, então as
  // envs TÊM de estar em process.env antes do import dinâmico lá embaixo.
  const env = lerEnvLocal();
  for (const [k, v] of Object.entries(env)) if (!process.env[k]) process.env[k] = v;

  const { buscarTodasOSDetalhado, buscarOSPeriodo, sincronizarServicosItens } = await import('../src/lib/estoque/os');
  const { getContasOmie, gerarMesesEsperados } = await import('../src/lib/estoque/conta');
  const { supabase } = await import('../src/lib/estoque/supabase');
  const { fmtD } = await import('../src/lib/estoque/utils');

  const contaFlag = (flag('conta') || '').toUpperCase();
  const desde = flag('desde'); // AAAA-MM
  const aplicar = process.argv.includes('--aplicar'); // regrava; sem isso, só relatório
  const saida = resolve(flag('saida') || resolve(__dirname, 'os-mensal-auditoria.csv'));
  const contas = getContasOmie().map((c) => c.id).filter((c) => !contaFlag || c === contaFlag);
  if (contas.length === 0) throw new Error('Nenhuma conta Omie configurada (ou --conta inválida)');

  const now = new Date();
  const resultados: LinhaAuditoria[] = [];
  let regravados = 0;
  if (aplicar) console.log('MODO --aplicar: meses fechados divergentes serão REGRAVADOS em os_mensal.\n');

  for (const conta of contas as Conta[]) {
    console.log(`\n=== ${conta} ===`);

    // Uma única listagem por conta (cache de 10 min cobre todos os meses).
    // Truncada = é exatamente o cenário que envenena os dados: aborta a conta.
    console.log('Baixando ListarOS completo…');
    const { lista, completo } = await buscarTodasOSDetalhado(conta);
    if (!completo) {
      console.log(`  ATENÇÃO: listagem TRUNCADA (${lista.length} OS) — pulando ${conta}. Rode de novo mais tarde.`);
      continue;
    }
    console.log(`  ${lista.length} OS baixadas.`);

    const { count: nfseAntes } = await supabase
      .from('os_nfse').select('*', { count: 'exact', head: true }).eq('conta_omie', conta);

    const { data: gravados } = await supabase
      .from('os_mensal')
      .select('mes,ano,valor_total,valor_nota')
      .eq('conta_omie', conta);
    const porMes = new Map<string, { total: number; nota: number | null }>();
    (gravados || []).forEach((r) => porMes.set(r.mes + '/' + r.ano, {
      total: Number(r.valor_total) || 0,
      nota: r.valor_nota == null ? null : Number(r.valor_nota) || 0,
    }));

    // gerarMesesEsperados vai até o mês ANTERIOR ao atual — o corrente entra à mão.
    const meses = [...gerarMesesEsperados(conta), { mes: now.getMonth() + 1, ano: now.getFullYear() }]
      .filter((m) => !desde || m.ano * 100 + m.mes >= Number(desde.replace('-', '')));

    for (const m of meses) {
      const ehCorrente = m.mes === now.getMonth() + 1 && m.ano === now.getFullYear();
      const de = fmtD(new Date(m.ano, m.mes - 1, 1));
      const ate = ehCorrente ? fmtD(now) : fmtD(new Date(m.ano, m.mes, 0));
      const t = await buscarOSPeriodo(de, ate, conta);
      if (!t.completo) { console.log(`  ${m.mes}/${m.ano}: listagem truncada no meio — pulado`); continue; }

      const g = porMes.get(m.mes + '/' + m.ano);
      const gravado = g ? g.total : 0;
      const diff = t.total - gravado;
      const diffPct = gravado > 0 ? (diff / gravado) * 100 : t.total > 0 ? 100 : 0;
      resultados.push({
        conta, mes: m.mes, ano: m.ano, gravado, recalculado: t.total, diff, diffPct,
        notaGravada: g ? g.nota : null, notaRecalc: t.nota, corrente: ehCorrente,
      });
      const marca = Math.abs(diff) < 0.01 ? 'ok  ' : ehCorrente ? 'hoje' : Math.abs(diffPct) >= 5 ? '>>>>' : '  ~ ';
      const nota = ehCorrente ? '  (mes corrente: gravado e snapshot, diff esperado)' : '';
      console.log(`  ${marca} ${String(m.mes).padStart(2, '0')}/${m.ano}  gravado ${fmtBR(gravado).padStart(14)}  real ${fmtBR(t.total).padStart(14)}  diff ${fmtBR(diff).padStart(13)} (${diffPct.toFixed(1)}%)${nota}`);

      // Regravação: só meses FECHADOS divergentes, com listagem completa (t.completo
      // já garantido acima). Upsert sem delete + regrava os_servicos_itens do mês,
      // para o popup/composição HR-KM não ficarem vazios com o card cheio.
      if (aplicar && !ehCorrente && Math.abs(diff) >= 0.01) {
        const { error } = await supabase.from('os_mensal').upsert(
          { mes: m.mes, ano: m.ano, valor_total: t.total, valor_nota: t.nota, valor_interno: t.interno, conta_omie: conta },
          { onConflict: 'mes,ano,conta_omie' },
        );
        if (error) { console.log(`       ✗ upsert falhou: ${error.message}`); continue; }
        try { await sincronizarServicosItens(m.mes, m.ano, conta); } catch (e) {
          console.log(`       (os_servicos_itens ${m.mes}/${m.ano} falhou: ${(e as Error).message})`);
        }
        regravados++;
        console.log(`       ✓ regravado: ${fmtBR(gravado)} → ${fmtBR(t.total)}`);
      }
    }

    const { count: nfseDepois } = await supabase
      .from('os_nfse').select('*', { count: 'exact', head: true }).eq('conta_omie', conta);
    const novas = (nfseDepois || 0) - (nfseAntes || 0);
    if (novas > 0) console.log(`  (${novas} OS foram verificadas na Omie via StatusOS e entraram no cache os_nfse)`);
  }

  // O mês corrente fica FORA das contas: ali o gravado é um snapshot do último
  // refresh e diverge por natureza — o próprio portal o reescreve sozinho.
  const fechados = resultados.filter((r) => !r.corrente);
  const comDiff = fechados.filter((r) => Math.abs(r.diff) >= 0.01);
  const graves = comDiff.filter((r) => Math.abs(r.diffPct) >= 5);
  const somaDiff = comDiff.reduce((s, r) => s + r.diff, 0);

  console.log('\n=== RESUMO (meses fechados; o corrente fica de fora) ===');
  console.log(`Meses auditados:        ${fechados.length}`);
  console.log(`Com diferença:          ${comDiff.length}`);
  console.log(`Diferença >= 5%:        ${graves.length}`);
  console.log(`Soma das diferenças:    ${fmtBR(somaDiff)}  (positivo = o gravado está A MENOS)`);
  if (aplicar) console.log(`Meses REGRAVADOS:       ${regravados}`);
  else if (comDiff.length > 0) console.log('(rode de novo com --aplicar para regravar os divergentes)');
  if (graves.length > 0) {
    console.log('\nPiores casos:');
    [...graves].sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 15).forEach((r) => {
      console.log(`  ${r.conta} ${String(r.mes).padStart(2, '0')}/${r.ano}  gravado ${fmtBR(r.gravado)}  real ${fmtBR(r.recalculado)}  (${r.diffPct > 0 ? '+' : ''}${r.diffPct.toFixed(1)}%)`);
    });
  }

  const head = ['conta', 'mes', 'ano', 'gravado', 'recalculado', 'diff', 'diff_pct', 'nota_gravada', 'nota_recalc', 'mes_corrente'];
  const linhas = [...resultados]
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    .map((r) => [
      r.conta, r.mes, r.ano, csvNum(r.gravado), csvNum(r.recalculado), csvNum(r.diff),
      csvNum(r.diffPct), r.notaGravada == null ? '' : csvNum(r.notaGravada), csvNum(r.notaRecalc),
      r.corrente ? 'S' : 'N',
    ].join(';'));
  writeFileSync(saida, '﻿' + [head.join(';'), ...linhas].join('\r\n'), 'utf8');
  console.log(`\nCSV: ${saida}`);
  console.log(aplicar
    ? `os_mensal atualizado: ${regravados} mes(es) regravado(s).`
    : 'Nada foi gravado em os_mensal (modo relatório).');
}

if (require.main === module) {
  main().catch((e) => { console.error(e?.message || e); process.exit(1); });
}
