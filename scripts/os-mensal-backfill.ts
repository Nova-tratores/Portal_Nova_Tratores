// Backfill do os_mensal (base do card Serviços do /estoque/dashboard): recalcula
// mês a mês a partir da Omie e GRAVA o upsert completo — valor_total, split
// (valor_nota / valor_interno / retorno / puro) e as NOVAS contagens
// (qtde_os / qtde_os_nota / qtde_os_interno).
//
// Por que existe: meses antigos ficaram com valor_interno / qtde_os = NULL
// (colunas adicionadas por ALTER depois, nunca recalculadas pro passado). Isso
// faz a linha "Interno" do histórico só nascer a partir do 1º mês preenchido, e
// não haver dado para o toggle "Qtd de OS". Este script preenche tudo de uma vez.
//
// Pré-requisito: rodar sql/os-mensal-qtde.sql no Supabase (colunas qtde_os*).
//
// Uso:
//   npx tsx scripts/os-mensal-backfill.ts --dry              (só mostra, não grava)
//   npx tsx scripts/os-mensal-backfill.ts                    (GRAVA todas as contas)
//   npx tsx scripts/os-mensal-backfill.ts --conta NOVA --desde 2023-01
//
// Flags:
//   --conta NOVA|CASTRO   só uma conta (default: todas as configuradas)
//   --desde AAAA-MM       ignora meses anteriores (default: nov/2022)
//   --dry                 não grava — só imprime o que faria
//
// Espelha o upsert de agendarRefreshOSPassado (os.ts). ListarOS truncado no meio
// pula o mês sem gravar (igual ao portal) — nesse caso, rode de novo mais tarde.
// Roda LOCAL de propósito: no Railway um job destes seria cortado aos 5 min.

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
const temFlag = (nome: string): boolean => process.argv.includes('--' + nome);

const fmtBR = (v: number): string => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function main() {
  const env = lerEnvLocal();
  for (const [k, v] of Object.entries(env)) if (!process.env[k]) process.env[k] = v;

  const { buscarTodasOSDetalhado, buscarOSPeriodo } = await import('../src/lib/estoque/os');
  const { getContasOmie, gerarMesesEsperados } = await import('../src/lib/estoque/conta');
  const { supabase } = await import('../src/lib/estoque/supabase');
  const { fmtD } = await import('../src/lib/estoque/utils');

  const dry = temFlag('dry');
  const contaFlag = (flag('conta') || '').toUpperCase();
  const desde = flag('desde'); // AAAA-MM
  const contas = getContasOmie().map((c) => c.id).filter((c) => !contaFlag || c === contaFlag);
  if (contas.length === 0) throw new Error('Nenhuma conta Omie configurada (ou --conta inválida)');

  const now = new Date();
  let gravados = 0, pulados = 0, internosPreenchidos = 0, qtdePreenchida = 0;

  for (const conta of contas as Conta[]) {
    console.log(`\n=== ${conta} ===`);
    console.log('Baixando ListarOS completo…');
    const { lista, completo } = await buscarTodasOSDetalhado(conta);
    if (!completo) {
      console.log(`  ATENÇÃO: listagem TRUNCADA (${lista.length} OS) — pulando ${conta}. Rode de novo mais tarde.`);
      continue;
    }
    console.log(`  ${lista.length} OS baixadas.`);

    // Estado atual (pra marcar o que estava faltando).
    const { data: antes } = await supabase
      .from('os_mensal')
      .select('mes,ano,valor_interno,qtde_os')
      .eq('conta_omie', conta);
    const faltavaInterno = new Set<string>();
    const faltavaQtde = new Set<string>();
    (antes || []).forEach((r) => {
      if (r.valor_interno == null) faltavaInterno.add(r.mes + '/' + r.ano);
      if (r.qtde_os == null) faltavaQtde.add(r.mes + '/' + r.ano);
    });

    const meses = [...gerarMesesEsperados(conta), { mes: now.getMonth() + 1, ano: now.getFullYear() }]
      .filter((m) => !desde || m.ano * 100 + m.mes >= Number(desde.replace('-', '')));

    for (const m of meses) {
      const ehCorrente = m.mes === now.getMonth() + 1 && m.ano === now.getFullYear();
      const de = fmtD(new Date(m.ano, m.mes - 1, 1));
      const ate = ehCorrente ? fmtD(now) : fmtD(new Date(m.ano, m.mes, 0));
      const t = await buscarOSPeriodo(de, ate, conta);
      if (!t.completo) { console.log(`  ${m.mes}/${m.ano}: listagem truncada no meio — pulado`); pulados++; continue; }

      const chave = m.mes + '/' + m.ano;
      const marcaI = faltavaInterno.has(chave) ? ' +interno' : '';
      const marcaQ = faltavaQtde.has(chave) ? ' +qtde' : '';
      if (faltavaInterno.has(chave)) internosPreenchidos++;
      if (faltavaQtde.has(chave)) qtdePreenchida++;

      console.log(`  ${String(m.mes).padStart(2, '0')}/${m.ano}  total ${fmtBR(t.total).padStart(13)}  nota ${fmtBR(t.nota).padStart(12)}  interno ${fmtBR(t.interno).padStart(12)}  | OS ${String(t.qtde).padStart(3)} (nota ${t.qtdeNota} / int ${t.qtdeInterno})${marcaI}${marcaQ}${dry ? '  [dry]' : ''}`);

      if (!dry) {
        const { error } = await supabase.from('os_mensal').upsert({
          mes: m.mes, ano: m.ano, conta_omie: conta,
          valor_total: t.total, valor_nota: t.nota, valor_interno: t.interno,
          valor_interno_retorno: t.internoRetorno, valor_interno_puro: t.internoPuro,
          qtde_os: t.qtde, qtde_os_nota: t.qtdeNota, qtde_os_interno: t.qtdeInterno,
        }, { onConflict: 'mes,ano,conta_omie' });
        if (error) { console.log(`    ERRO ao gravar: ${error.message}`); pulados++; continue; }
        gravados++;
      }
    }
  }

  console.log('\n=== RESUMO ===');
  console.log(`Meses gravados:            ${gravados}${dry ? ' (dry — nada gravado)' : ''}`);
  console.log(`Meses pulados (truncado):  ${pulados}`);
  console.log(`Internos que estavam NULL: ${internosPreenchidos}`);
  console.log(`Qtde que estava NULL:      ${qtdePreenchida}`);
  if (pulados > 0) console.log('Rode de novo para tentar os meses que vieram truncados.');
}

if (require.main === module) {
  main().catch((e) => { console.error(e?.message || e); process.exit(1); });
}
