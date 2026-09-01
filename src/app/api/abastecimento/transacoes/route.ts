// GET /api/abastecimento/transacoes — lista abastecimentos individuais com
// filtros. Alimenta: a tabela de "últimos abastecimentos", o popup de
// drill-down dos gráficos e o relatório PDF.
//
// Duas fontes unidas na leitura: tabela `abastecimentos` (CSV do cartão) +
// requisições de abastecimento (Veicular/Trator/Quadri) — ver
// src/lib/abastecimento/requisicoes.ts. A requisição não tem hora nem
// combustível: fica fora do drill-down dia/hora e some quando o filtro de
// combustível está ativo.
//
// Params: de, ate (YYYY-MM-DD) | mes (YYYY-MM, atalho que vira de/ate) |
//         filial, placa, motorista, posto, combustivel, os |
//         limit (padrão 100, máx 1000; 0 = tudo p/ PDF), offset

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { podeFrota } from '@/lib/frota/server';
import { localBR, normalizarDepartamento } from '@/lib/abastecimento/agregacoes';
import { buscarReqsAbastecimento, type ReqAbastecimento } from '@/lib/abastecimento/requisicoes';
import type { TransacaoRow, TransacoesResp } from '@/lib/abastecimento/tipos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const COLS =
  'id, data_transacao, placa, modelo_veiculo, departamento, filial_nome, motorista_nome, posto_nome, combustivel, litros, valor_unitario, valor_total, valor_original, valor_economizado, hodometro, ordem_servico';

const PAGINA = 1000;

function proximoMes(mes: string): string {
  const [ano, m] = mes.split('-').map(Number);
  return m === 12 ? `${ano + 1}-01` : `${ano}-${String(m + 1).padStart(2, '0')}`;
}

function ultimoDiaDoMes(mes: string): string {
  const [ano, m] = mes.split('-').map(Number);
  return `${mes}-${String(new Date(Date.UTC(ano, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

// requisição -> TransacaoRow (id negativo: nunca colide com o id do cartão)
function reqParaTransacao(r: ReqAbastecimento): TransacaoRow {
  return {
    id: -r.req_id,
    data_transacao: r.data_transacao,
    placa: r.placa,
    modelo_veiculo: r.modelo_veiculo,
    departamento: r.departamento,
    filial_nome: r.filial_nome,
    motorista_nome: r.motorista_nome,
    posto_nome: r.posto_nome,
    combustivel: r.combustivel,
    litros: r.litros,
    valor_unitario: r.valor_unitario,
    valor_total: r.valor_total,
    valor_original: null, // requisição não tem desconto de operadora
    valor_economizado: null,
    hodometro: r.hodometro,
    ordem_servico: r.ordem_servico,
    origem: 'requisicao',
    req_id: r.req_id,
    req_tipo: r.req_tipo,
  };
}

const tempoDe = (iso: string) => new Date(iso).getTime();

export async function GET(req: NextRequest) {
  // Rodava com service role e sem autenticação nenhuma (ver dashboard/route.ts).
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeFrota(auth, 'abastecimento')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  try {
    const sp = req.nextUrl.searchParams;
    let de = sp.get('de') || '';
    let ate = sp.get('ate') || '';
    const mes = sp.get('mes') || '';
    if (/^\d{4}-\d{2}$/.test(mes)) {
      de = `${mes}-01`;
      ate = ''; // usa lt do próximo mês, abaixo
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filtros = (q: any) => {
      let x = q;
      if (de) x = x.gte('data_transacao', `${de}T00:00:00-03:00`);
      if (mes) x = x.lt('data_transacao', `${proximoMes(mes)}-01T00:00:00-03:00`);
      else if (ate) x = x.lte('data_transacao', `${ate}T23:59:59-03:00`);
      for (const [param, col] of [
        ['filial', 'filial_nome'],
        ['placa', 'placa'],
        ['motorista', 'motorista_nome'],
        ['posto', 'posto_nome'],
        ['combustivel', 'combustivel'],
        ['os', 'ordem_servico'],
        ['departamento', 'departamento'],
      ] as const) {
        const v = sp.get(param);
        if (v) {
          // __sem__ = drill dos rótulos nulos ("Não informado", "Sem depar-
          // tamento"...); departamento compara sem caixa (cartão grava
          // "COMERCIAL", o drill manda o canônico "Comercial").
          x = v === '__sem__' ? x.is(col, null)
            : param === 'departamento' ? x.ilike(col, v)
            : x.eq(col, v);
        }
      }
      return x;
    };

    const limit = Math.min(Math.max(parseInt(sp.get('limit') || '100', 10) || 0, 0), 10000);
    const offset = Math.max(parseInt(sp.get('offset') || '0', 10) || 0, 0);
    const tudo = limit === 0; // PDF: busca tudo (paginado internamente)

    // Filtro dia da semana (0=dom) / hora (0-23, Brasília) — drill-down do
    // heatmap. PostgREST não filtra por dow/hora, então busca o período e
    // filtra em JS (volumes pequenos).
    const diaParam = sp.get('dia');
    const horaParam = sp.get('hora');
    if (diaParam != null || horaParam != null) {
      const dia = diaParam != null ? parseInt(diaParam, 10) : null;
      const hora = horaParam != null ? parseInt(horaParam, 10) : null;
      const todas: TransacaoRow[] = [];
      for (let off = 0; ; off += PAGINA) {
        const { data, error } = await filtros(supabase.from('abastecimentos').select(COLS))
          .order('data_transacao', { ascending: false })
          .order('id', { ascending: false })
          .range(off, off + PAGINA - 1);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        for (const l of (data || []) as unknown as TransacaoRow[]) {
          const br = localBR(l.data_transacao);
          if ((dia == null || br.dia === dia) && (hora == null || br.hora === hora)) {
            todas.push({
              ...l,
              litros: Number(l.litros) || 0,
              valor_unitario: l.valor_unitario == null ? null : Number(l.valor_unitario),
              valor_total: l.valor_total == null ? null : Number(l.valor_total),
              valor_original: l.valor_original == null ? null : Number(l.valor_original),
              valor_economizado: l.valor_economizado == null ? null : Number(l.valor_economizado),
              hodometro: l.hodometro == null ? null : Number(l.hodometro),
              origem: 'cartao',
            });
          }
        }
        if (!data || data.length < PAGINA) break;
      }
      const resp: TransacoesResp = {
        linhas: tudo ? todas : todas.slice(offset, offset + limit),
        total: todas.length,
        somaValor: todas.reduce((s, l) => s + (l.valor_total || 0), 0),
        somaLitros: todas.reduce((s, l) => s + l.litros, 0),
        somaEconomia: todas.reduce((s, l) => s + (l.valor_economizado || 0), 0),
      };
      return NextResponse.json(resp);
    }

    // ----- fonte 2: requisições de abastecimento (poucas — filtra em JS) -----
    const reqDe = mes ? `${mes}-01` : de;
    const reqAte = mes ? ultimoDiaDoMes(mes) : ate;
    const bateFiltroReq = (r: ReqAbastecimento): boolean => {
      for (const [param, col] of [
        ['filial', 'filial_nome'],
        ['placa', 'placa'],
        ['motorista', 'motorista_nome'],
        ['posto', 'posto_nome'],
        ['combustivel', 'combustivel'],
        ['os', 'ordem_servico'],
        ['departamento', 'departamento'],
      ] as const) {
        const v = sp.get(param);
        if (!v) continue;
        if (v === '__sem__') {
          if (r[col] != null) return false;
          continue;
        }
        if (param === 'departamento') {
          if (normalizarDepartamento(r.departamento) !== v) return false;
          continue;
        }
        if (r[col] !== v) return false;
      }
      return true;
    };
    const reqs = (await buscarReqsAbastecimento(supabase, reqDe, reqAte)).filter(bateFiltroReq);

    // totais do filtro (contagem + somas do cartão) — uma passada paginada leve
    let totalCartao = 0;
    let somaValor = 0;
    let somaLitros = 0;
    let somaEconomia = 0;

    for (let off = 0; ; off += PAGINA) {
      const { data, error, count } = await filtros(
        supabase.from('abastecimentos').select('litros, valor_total, valor_economizado', { count: off === 0 ? 'exact' : undefined }),
      )
        .order('data_transacao', { ascending: false })
        .order('id', { ascending: false })
        .range(off, off + PAGINA - 1);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (off === 0 && typeof count === 'number') totalCartao = count;
      for (const l of data || []) {
        somaValor += Number((l as { valor_total: unknown }).valor_total) || 0;
        somaLitros += Number((l as { litros: unknown }).litros) || 0;
        somaEconomia += Number((l as { valor_economizado: unknown }).valor_economizado) || 0;
      }
      if (!data || data.length < PAGINA) break;
    }
    for (const r of reqs) {
      somaValor += r.valor_total || 0;
      somaLitros += r.litros;
    }
    const total = totalCartao + reqs.length;

    // linhas pedidas (janela limit/offset, ou tudo para o PDF). Pro merge por
    // data ficar certo, busca as primeiras `fim` linhas do cartão (as
    // requisições já estão todas em memória), une, ordena e corta a janela.
    const fim = tudo ? total : Math.min(offset + limit, total);
    const cartao: TransacaoRow[] = [];
    const fimCartao = Math.min(fim, totalCartao);
    for (let off = 0; off < fimCartao; off += PAGINA) {
      const { data, error } = await filtros(supabase.from('abastecimentos').select(COLS))
        .order('data_transacao', { ascending: false })
        .order('id', { ascending: false })
        .range(off, Math.min(off + PAGINA, fimCartao) - 1);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      for (const l of (data || []) as unknown as TransacaoRow[]) {
        cartao.push({
          ...l,
          litros: Number(l.litros) || 0,
          valor_unitario: l.valor_unitario == null ? null : Number(l.valor_unitario),
          valor_total: l.valor_total == null ? null : Number(l.valor_total),
          valor_original: l.valor_original == null ? null : Number(l.valor_original),
          valor_economizado: l.valor_economizado == null ? null : Number(l.valor_economizado),
          hodometro: l.hodometro == null ? null : Number(l.hodometro),
          origem: 'cartao',
        });
      }
      if (!data || data.length < PAGINA) break;
    }
    // dedup por id (rede de segurança): cartão usa o id do banco e requisição
    // usa -req_id, então a chave `id` já é única entre as fontes. Se algo
    // escapar (ex.: repetição de fronteira de página), não vira linha dupla.
    const vistos = new Set<number>();
    const linhas = [...cartao, ...reqs.map(reqParaTransacao)]
      .filter((l) => (vistos.has(l.id) ? false : (vistos.add(l.id), true)))
      .sort((a, b) => tempoDe(b.data_transacao) - tempoDe(a.data_transacao))
      .slice(offset, fim);

    const resp: TransacoesResp = { linhas, total, somaValor, somaLitros, somaEconomia };
    return NextResponse.json(resp);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
