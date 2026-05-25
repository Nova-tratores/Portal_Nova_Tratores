import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS, VALOR_HORA, VALOR_KM, STATUS_FINALIZADOS } from '@/lib/garantias/constants';
import type { RelatorioMontadora } from '@/lib/garantias/types';

// GET /api/garantias/relatorio?de=&ate=
export async function GET(req: NextRequest) {
  const de = req.nextUrl.searchParams.get('de');
  const ate = req.nextUrl.searchParams.get('ate');

  let query = supabase
    .from(TBL_GARANTIAS)
    .select('*, montadora:garantia_montadoras(id,nome,cor)');
  if (de) query = query.gte('created_at', de);
  if (ate) query = query.lte('created_at', `${ate}T23:59:59`);

  const { data, error } = await query;
  if (error) {
    console.error('Erro no relatório de garantias:', error.message);
    return NextResponse.json({ error: 'Falha ao gerar relatório.' }, { status: 500 });
  }

  type Acc = RelatorioMontadora & { _somaResolucao: number; _qtdResolucao: number; _somaAberto: number; _qtdAberto: number };
  const grupos: Record<string, Acc> = {};

  const novo = (id: string | null, nome: string, cor: string | null): Acc => ({
    montadora_id: id,
    nome,
    cor,
    qtd_total: 0,
    qtd_aprovadas: 0,
    qtd_rejeitadas: 0,
    qtd_abertas: 0,
    lucro: 0,
    prejuizo: 0,
    saldo: 0,
    total_tecnico_horas: 0,
    total_tecnico_km: 0,
    total_garantista_horas: 0,
    total_garantista_km: 0,
    tempo_medio_resolucao_dias: null,
    tempo_medio_aberto_dias: null,
    _somaResolucao: 0,
    _qtdResolucao: 0,
    _somaAberto: 0,
    _qtdAberto: 0,
  });

  const agora = Date.now();
  const totais = { lucro: 0, prejuizo: 0, saldo: 0, qtd_finalizadas: 0 };

  for (const g of data || []) {
    const mont = g.montadora as { id: string; nome: string; cor: string | null } | null;
    const chave = mont?.id || 'sem_montadora';
    if (!grupos[chave]) grupos[chave] = novo(mont?.id || null, mont?.nome || 'Sem montadora', mont?.cor || null);
    const acc = grupos[chave];

    acc.qtd_total++;
    acc.total_tecnico_horas += Number(g.tecnico_horas) || 0;
    acc.total_tecnico_km += Number(g.tecnico_km) || 0;
    acc.total_garantista_horas += Number(g.garantista_horas) || 0;
    acc.total_garantista_km += Number(g.garantista_km) || 0;

    if (g.status === 'aprovada') {
      acc.qtd_aprovadas++;
      acc.lucro += Number(g.valor_pago_total) || 0;
      totais.qtd_finalizadas++;
    } else if (g.status === 'rejeitada') {
      acc.qtd_rejeitadas++;
      const h = g.garantista_horas != null ? Number(g.garantista_horas) : Number(g.tecnico_horas) || 0;
      const k = g.garantista_km != null ? Number(g.garantista_km) : Number(g.tecnico_km) || 0;
      acc.prejuizo += h * VALOR_HORA + k * VALOR_KM;
      totais.qtd_finalizadas++;
    } else {
      acc.qtd_abertas++;
    }

    // Tempo de resolução das finalizadas (enviada -> finalizada)
    if (STATUS_FINALIZADOS.includes(g.status) && g.enviada_fabrica_em && g.finalizada_em) {
      const dias = (new Date(g.finalizada_em).getTime() - new Date(g.enviada_fabrica_em).getTime()) / 86400000;
      if (dias >= 0) {
        acc._somaResolucao += dias;
        acc._qtdResolucao++;
      }
    }
    // Aging das que estão na fábrica
    if ((g.status === 'enviada' || g.status === 'info_pendente') && g.enviada_fabrica_em) {
      const dias = (agora - new Date(g.enviada_fabrica_em).getTime()) / 86400000;
      if (dias >= 0) {
        acc._somaAberto += dias;
        acc._qtdAberto++;
      }
    }
  }

  const porMontadora = Object.values(grupos).map((acc) => {
    acc.saldo = acc.lucro - acc.prejuizo;
    acc.tempo_medio_resolucao_dias = acc._qtdResolucao > 0 ? Math.round((acc._somaResolucao / acc._qtdResolucao) * 10) / 10 : null;
    acc.tempo_medio_aberto_dias = acc._qtdAberto > 0 ? Math.round((acc._somaAberto / acc._qtdAberto) * 10) / 10 : null;
    totais.lucro += acc.lucro;
    totais.prejuizo += acc.prejuizo;
    const { _somaResolucao, _qtdResolucao, _somaAberto, _qtdAberto, ...limpo } = acc;
    void _somaResolucao; void _qtdResolucao; void _somaAberto; void _qtdAberto;
    return limpo as RelatorioMontadora;
  });
  totais.saldo = totais.lucro - totais.prejuizo;

  porMontadora.sort((a, b) => b.saldo - a.saldo);

  return NextResponse.json({ por_montadora: porMontadora, totais });
}
