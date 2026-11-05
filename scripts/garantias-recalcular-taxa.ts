// Refaz a mão de obra e o deslocamento PAGOS das garantias finalizadas com a
// taxa da montadora (garantia_montadoras.valor_hora/valor_km). Antes de a taxa
// ser cadastrada (Mahindra em 30/10/2026; Kuhn em 09/2026) a finalização gravou
// o padrão da empresa (R$ 193/h, R$ 2,80/km).
//
// Mantém as horas/km que estavam gravados: só troca o preço. Só mexe na linha
// gravada no padrão (valor ÷ quantidade = 193 ou 2,80) — o que já está na taxa
// da montadora, zerado (M.O. não aprovada) ou fora do padrão fica como está.
// Cada garantia alterada ganha um evento no histórico com o antes → depois.
//
//   npx tsx --env-file=.env.local scripts/garantias-recalcular-taxa.ts            (simula)
//   npx tsx --env-file=.env.local scripts/garantias-recalcular-taxa.ts --gravar
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS, VALOR_HORA, VALOR_KM, valoresFabrica } from '@/lib/garantias/constants';
import { registrarEvento } from '@/lib/garantias/server';
import { fmtMoeda } from '@/lib/garantias/format';

const gravar = process.argv.includes('--gravar');
const r2 = (n: number) => Math.round(n * 100) / 100;

// quantidade que gerou o valor no padrão (null = não está no padrão)
function qtdNoPadrao(valor: number, qtd: number, padrao: number): number | null {
  // só quando horas/km gravados × padrão = valor (senão já está na taxa da montadora ou foi ajustado à mão)
  if (valor <= 0.004 || qtd <= 0) return null;
  return Math.abs(qtd * padrao - valor) < 0.02 ? qtd : null;
}

async function main() {
  const { data, error } = await supabase
    .from(TBL_GARANTIAS)
    .select('id, numero, status, finalizada_em, tecnico_horas, tecnico_km, garantista_horas, garantista_km, valor_pago_horas, valor_pago_km, valor_pago_pecas, valor_pago_total, montadora:garantia_montadoras(nome, valor_hora, valor_km)')
    .in('status', ['aprovada', 'rejeitada'])
    .order('numero');
  if (error) throw new Error(error.message);

  let somaAntes = 0, somaDepois = 0, n = 0;
  for (const g of data || []) {
    const m = g.montadora as unknown as { nome: string; valor_hora: number | null; valor_km: number | null } | null;
    const fab = valoresFabrica(m);
    if (fab.hora === VALOR_HORA && fab.km === VALOR_KM) continue; // montadora sem taxa própria
    const vh = Number(g.valor_pago_horas) || 0;
    const vk = Number(g.valor_pago_km) || 0;
    const h = Number(g.garantista_horas ?? g.tecnico_horas) || 0;
    const k = Number(g.garantista_km ?? g.tecnico_km) || 0;
    const qh = fab.hora !== VALOR_HORA ? qtdNoPadrao(vh, h, VALOR_HORA) : null;
    const qk = fab.km !== VALOR_KM ? qtdNoPadrao(vk, k, VALOR_KM) : null;
    if (qh == null && qk == null) continue;

    const novoH = qh != null ? r2(qh * fab.hora) : vh;
    const novoK = qk != null ? r2(qk * fab.km) : vk;
    const total = Number(g.valor_pago_total) || 0;
    const novoTotal = r2(total - vh - vk + novoH + novoK);
    n++;
    somaAntes += vh + vk;
    somaDepois += novoH + novoK;
    const detalhe = `Valores pagos refeitos com a taxa da ${m?.nome}: `
      + (qh != null ? `mão de obra ${fmtMoeda(vh)} → ${fmtMoeda(novoH)} (${r2(qh)} h × ${fmtMoeda(fab.hora)})` : '')
      + (qh != null && qk != null ? '; ' : '')
      + (qk != null ? `deslocamento ${fmtMoeda(vk)} → ${fmtMoeda(novoK)} (${r2(qk)} km × ${fmtMoeda(fab.km)})` : '')
      + `; total ${fmtMoeda(total)} → ${fmtMoeda(novoTotal)}`;
    console.log(`${g.numero} ${m?.nome} ${String(g.finalizada_em || '').slice(0, 10)} | ${detalhe}`);

    if (gravar) {
      const { error: e } = await supabase.from(TBL_GARANTIAS)
        .update({ valor_pago_horas: novoH, valor_pago_km: novoK, valor_pago_total: novoTotal })
        .eq('id', g.id)
        .eq('valor_pago_horas', vh)
        .eq('valor_pago_km', vk);
      if (e) { console.error('  ERRO', e.message); continue; }
      await registrarEvento(g.id, { tipo: 'valores_recalculados', ator: 'Portal (taxa da montadora)', detalhe });
    }
  }
  console.log(`\n${n} garantia(s) · M.O.+km ${fmtMoeda(somaAntes)} → ${fmtMoeda(somaDepois)} · ${gravar ? 'GRAVADO' : 'simulação (use --gravar)'}`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
