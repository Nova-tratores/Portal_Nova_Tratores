// GET /api/abastecimento/dashboard?de=YYYY-MM-DD&ate=YYYY-MM-DD&filial=&placa=
// Busca uma janela ESTENDIDA (13 meses antes do início, para comparativos
// mês anterior / ano passado, anomalias e projeção), paginada (PostgREST
// limita 1000/request), e agrega em JS (src/lib/abastecimento/agregacoes.ts).
//
// Duas fontes unidas na leitura: `abastecimentos` (CSV do cartão) +
// requisições de abastecimento (Veicular/Trator/Quadri). Trator/Quadri entram
// com as pseudo-placas TRATOR/QUADRI; requisição fica fora do heatmap, dos
// intervalos e do km/l (regras em agregacoes.ts/requisicoes.ts).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { podeFrota } from '@/lib/frota/server';
import { montarDashboard, type LinhaDash } from '@/lib/abastecimento/agregacoes';
import { buscarReqsAbastecimento, PLACA_QUADRI, PLACA_TRATOR } from '@/lib/abastecimento/requisicoes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const COLS =
  'placa, id_placa, modelo_veiculo, filial_nome, motorista_nome, posto_nome, posto_cidade, combustivel, litros, valor_total, hodometro, data_transacao, capacidade_tanque, ordem_servico, departamento';

const PAGINA = 1000;

export async function GET(req: NextRequest) {
  // Esta rota usava service role e NENHUMA autenticação — qualquer pessoa na
  // internet lia gasto, motorista, posto e placa da empresa.
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeFrota(auth, 'abastecimento')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  try {
    const sp = req.nextUrl.searchParams;
    // default: últimos 12 meses
    const hoje = new Date();
    const ate = sp.get('ate') || hoje.toISOString().slice(0, 10);
    const dePadrao = new Date(hoje);
    dePadrao.setFullYear(dePadrao.getFullYear() - 1);
    const de = sp.get('de') || dePadrao.toISOString().slice(0, 10);
    const filial = sp.get('filial') || '';
    const placa = sp.get('placa') || '';
    const departamento = sp.get('departamento') || '';

    // janela estendida: 13 meses antes do início (comparativo YoY)
    const deExtData = new Date(`${de}T00:00:00-03:00`);
    deExtData.setMonth(deExtData.getMonth() - 13);
    const deExt = deExtData.toISOString();
    const corteJanela = new Date(`${de}T00:00:00-03:00`).getTime();

    const ext: LinhaDash[] = [];
    for (let off = 0; ; off += PAGINA) {
      let q = supabase
        .from('abastecimentos')
        .select(COLS)
        .gte('data_transacao', deExt)
        .lte('data_transacao', `${ate}T23:59:59-03:00`)
        .order('data_transacao', { ascending: true })
        .range(off, off + PAGINA - 1);
      if (filial) q = q.eq('filial_nome', filial);
      if (placa) q = q.eq('placa', placa);
      if (departamento) q = q.eq('departamento', departamento);

      const { data, error } = await q;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const lote = (data || []) as unknown as LinhaDash[];
      for (const l of lote) {
        ext.push({
          ...l,
          litros: Number(l.litros) || 0,
          valor_total: l.valor_total == null ? null : Number(l.valor_total),
          hodometro: l.hodometro == null ? null : Number(l.hodometro),
          capacidade_tanque: l.capacidade_tanque == null ? null : Number(l.capacidade_tanque),
        });
      }
      if (lote.length < PAGINA) break;
    }

    // fonte 2: requisições de abastecimento (mesma janela estendida)
    const reqs = (await buscarReqsAbastecimento(supabase, deExt.slice(0, 10), ate)).filter((r) => {
      if (filial && r.filial_nome !== filial) return false;
      if (placa && r.placa !== placa) return false;
      if (departamento && r.departamento !== departamento) return false;
      return true;
    });
    for (const r of reqs) {
      ext.push({
        placa: r.placa,
        id_placa: r.id_placa,
        // nos rankings/selects, o agregado TRATOR/QUADRI ganha um rótulo fixo
        // (o chassis por linha continua visível na aba Transações)
        modelo_veiculo:
          r.placa === PLACA_TRATOR ? 'Tratores (requisições)'
          : r.placa === PLACA_QUADRI ? 'Quadriciclos (requisições)'
          : r.modelo_veiculo,
        filial_nome: r.filial_nome,
        motorista_nome: r.motorista_nome,
        posto_nome: r.posto_nome,
        posto_cidade: r.posto_cidade,
        combustivel: r.combustivel,
        litros: r.litros,
        valor_total: r.valor_total,
        hodometro: r.hodometro,
        data_transacao: r.data_transacao,
        capacidade_tanque: r.capacidade_tanque,
        ordem_servico: r.ordem_servico,
        departamento: r.departamento,
        origem: 'requisicao',
      });
    }
    // ordena por tempo real (cartão vem em UTC, requisição em -03:00 — string não serve)
    ext.sort((a, b) => new Date(a.data_transacao).getTime() - new Date(b.data_transacao).getTime());

    const janela = ext.filter((l) => new Date(l.data_transacao).getTime() >= corteJanela);
    return NextResponse.json(montarDashboard(janela, ext, { de, ate }, new Date()));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
