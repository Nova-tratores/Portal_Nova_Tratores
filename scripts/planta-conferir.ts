// Planta Viva — conferência (Gates 0, 1 e 3 de docs/planta-viva-plano.md). Só LÊ.
// Calcula os números com o MESMO código do worker (src/lib/planta) e compara:
//   (1) com a tela oficial de vencidos em produção (/api/dre-financeiro/vencidos);
//   (2) com o que está gravado em planta_kpi (se a migration já foi aplicada).
//
//   npx tsx --env-file=.env.local scripts/planta-conferir.ts
// Sai com 1 se alguma divergência passar de 0,5%; com 2 se não deu para conferir com a tela oficial.
// A rota oficial exige login: passe o token da sua sessão em PLANTA_TOKEN.
import { carregarFontes } from '../src/lib/planta/server';
import { calcularKpis, type LinhaKpi } from '../src/lib/planta/regras';
import { createClient } from '@supabase/supabase-js';

const LIMITE_PCT = 0.5;
const R$ = (v: number | null) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const pct = (a: number, b: number) => (b ? Math.abs(a - b) / Math.abs(b) * 100 : a ? 100 : 0);

(async () => {
  const t0 = Date.now();
  const { fontes, dadoAte } = await carregarFontes();
  const ls = calcularKpis(fontes);
  console.log(`\nPLANTA VIVA — conferência · ${fontes.hoje} · ${((Date.now() - t0) / 1000).toFixed(1)} s · ${ls.length} linhas`);
  if (Object.keys(fontes.falhas).length) console.log('FALHAS DE LEITURA:', fontes.falhas);
  console.log('idade dos espelhos:', dadoAte, '\n');
  for (const l of ls.filter((x) => x.conta !== 'TODAS' || !ls.some((y) => y.kpi_id === x.kpi_id && y.conta !== 'TODAS'))) {
    const d = JSON.stringify(l.detalhe);
    console.log(`${l.comodo.padEnd(13)} ${l.kpi_id.padEnd(25)} ${l.conta.padEnd(6)} n=${String(l.contagem).padStart(5)}  ${R$(l.valor).padStart(16)}${l.erro ? '  ERRO: ' + l.erro : ''}  ${d.length > 160 ? d.slice(0, 160) + '…' : d}`);
  }

  let pior = 0;
  let conferidos = 0;
  // A rota oficial exige login com o módulo financeiro (desde 19/10/2026). Para conferir,
  // passe o token da SUA sessão do portal: PLANTA_TOKEN=<access_token> npx tsx ...
  console.log('\n(1) vencidos × /api/dre-financeiro/vencidos (produção)');
  const token = process.env.PLANTA_TOKEN;
  if (!token) console.log('  sem PLANTA_TOKEN: a tela oficial pede login — conferência (1) NÃO feita');
  for (const conta of token ? ['NOVA', 'CASTRO'] : []) for (const tipo of ['pagar', 'receber']) {
    const nosso = ls.find((l) => l.kpi_id === `${tipo}_vencido` && l.conta === conta)!;
    const r = await fetch(`https://portal.novatratores.com/api/dre-financeiro/vencidos?conta=${conta.toLowerCase()}&tipo=${tipo}`,
      { headers: { authorization: `Bearer ${token}` } }).catch(() => null);
    if (!r || !r.ok) { console.log(`  ${tipo} ${conta}: tela oficial respondeu ${r ? r.status : 'erro de rede'} — sem conferência`); continue; }
    conferidos++;
    const j = await r.json();
    const ofi = tipo === 'pagar' ? j.kpis.totalPagar : j.kpis.totalReceber;
    const d = pct(nosso.valor || 0, ofi);
    pior = Math.max(pior, d);
    console.log(`  ${tipo.padEnd(8)} ${conta.padEnd(6)} planta ${R$(nosso.valor)} (${nosso.contagem}) · oficial ${R$(ofi)} (${j.kpis.count}) · divergência ${d.toFixed(3)}%`);
  }

  console.log('\n(2) cálculo agora × planta_kpi gravada');
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data, error } = await sb.from('planta_kpi').select('kpi_id,conta,contagem,valor,calculado_em,erro');
  if (error) console.log('  planta_kpi indisponível:', error.message);
  else if (!data?.length) console.log('  planta_kpi vazia (o worker ainda não rodou)');
  else {
    const mapa = new Map(data.map((r) => [`${r.kpi_id}|${r.conta}`, r]));
    const gravado = data.map((r) => r.calculado_em).sort().pop();
    console.log(`  última gravação: ${gravado}`);
    for (const l of ls as LinhaKpi[]) {
      const g = mapa.get(`${l.kpi_id}|${l.conta}`);
      if (!g) { console.log(`  FALTA na tabela: ${l.kpi_id} ${l.conta}`); continue; }
      const d = Math.max(pct(g.contagem, l.contagem), pct(Number(g.valor) || 0, l.valor || 0));
      if (d > LIMITE_PCT) console.log(`  ${l.kpi_id} ${l.conta}: gravado n=${g.contagem} ${R$(g.valor == null ? null : Number(g.valor))} · agora n=${l.contagem} ${R$(l.valor)} (${d.toFixed(2)}% — pode ser só a diferença de horário)`);
    }
  }
  console.log(conferidos
    ? `\nmaior divergência contra a tela oficial: ${pior.toFixed(3)}% em ${conferidos} números (limite ${LIMITE_PCT}%)`
    : '\nconferência contra a tela oficial NÃO feita (sem token ou rota indisponível)');
  process.exit(pior > LIMITE_PCT ? 1 : conferidos ? 0 : 2);
})();
