// GET /api/frota/hoje — tudo que a aba Hoje da Frota mostra, numa ida só:
// parados, problemas graves, documentos vencendo, cadastro a corrigir,
// checklists do mês que faltam, paradas atípicas sem explicação e o
// combustível de 30 dias (com os 30 anteriores para comparar).
// A montagem é pura (src/lib/frota/hoje.ts); aqui só se lê.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { temModuloFrota, podeFrota } from '@/lib/frota/server';
import { paginar } from '@/lib/db/paginar';
import { montarHoje, type PendenciaHoje } from '@/lib/frota/hoje';
import { listarChecklistsMes } from '@/lib/frota/checklists-mes';
import { buscarAbastecimentosUniao, resumoCombustivel } from '@/lib/abastecimento/uniao';
import { calcularPreventivas } from '@/lib/frota/preventiva-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

const DIA = 86400_000;

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!temModuloFrota(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  try {
    const agora = Date.now();
    const hoje = new Date(agora).toISOString().slice(0, 10);
    const de7 = new Date(agora - 7 * DIA).toISOString().slice(0, 10);
    const mes = hoje.slice(0, 7);

    const lerPend = (cols: string) => paginar((a, b) => supabase.from('frota_pendencias')
      .select(cols).eq('status', 'aberta').order('id').range(a, b));

    const [veiculos, responsaveis, pendRes, comps, documentos, paradas, checklists, abast, prev, suspeitas] = await Promise.all([
      // select('*'): tolera a migração do sem_uso pendente. Carro SEM USO sai da
      // aba Hoje inteira (sem alerta de parado, km, cadastro) — ainda é da loja.
      supabase.from('frota_veiculos').select('*')
        .then((r) => ({ ...r, data: (r.data || []).map((v) => (v.sem_uso ? { ...v, ativo: false } : v)) })),
      supabase.from('frota_responsaveis').select('veiculo_id, motorista_nome').is('fim', null),
      // tolerante: sem a coluna gravidade (migração antiga) lê sem ela
      lerPend('id, placa, titulo, origem, gravidade, componente_id, aberta_em, responsavel')
        .then((r) => (r.error && /gravidade|responsavel/i.test(r.error.message)
          ? lerPend('id, placa, titulo, origem, componente_id, aberta_em') : r)),
      supabase.from('frota_componentes').select('id, sistema, subsistema, componente'),
      // todos os documentos com vigência (o renovado tira o antigo da lista)
      supabase.from('frota_documentos').select('veiculo_id, tipo, vigencia_fim').not('vigencia_fim', 'is', null),
      // atípicas da semana ainda SEM explicação (nem justificada, nem ignorada)
      supabase.from('frota_paradas')
        .select('id, placa, data, inicio, duracao_min, classe, destino_nome, endereco', { count: 'exact' })
        .eq('atipica', true).eq('ignorada', false).is('justificativa', null).gte('data', de7)
        .order('duracao_min', { ascending: false }).limit(100),
      listarChecklistsMes(supabase, mes),
      buscarAbastecimentosUniao(supabase, { deIso: new Date(agora - 60 * DIA).toISOString(), ate: hoje }),
      // preventivas + km de cada carro (âncora + delta) numa leitura só
      calcularPreventivas(supabase).catch(() => null),
      // leituras de km que voltaram ou saltaram demais: alguém confere (tabela pode não existir ainda)
      supabase.from('frota_leituras').select('id, placa, km, lida_em, foto_url, lido_por, motivo')
        .eq('situacao', 'suspeita').order('lida_em', { ascending: false }).limit(50),
    ]);
    if (veiculos.error) throw new Error(veiculos.error.message);

    const h = montarHoje({
      agora,
      veiculos: veiculos.data || [],
      responsaveis: responsaveis.data || [],
      pendencias: (pendRes.data || []) as unknown as PendenciaHoje[],
      componentes: new Map((comps.data || []).map((c) => [c.id as string, c])),
      documentos: documentos.data || [],
    });

    const corte30 = agora - 30 * DIA;
    const ultimos = abast.filter((l) => new Date(l.data_transacao).getTime() >= corte30);
    const anteriores = abast.filter((l) => new Date(l.data_transacao).getTime() < corte30);

    return NextResponse.json({
      geradoEm: new Date(agora).toISOString(),
      ...h,
      checklists: {
        mes,
        resumo: checklists.resumo,
        faltando: checklists.itens.filter((i) => i.status === 'pendente' || i.status === 'suspeito'),
      },
      paradas: {
        total: paradas.count ?? (paradas.data || []).length,
        itens: paradas.data || [],
        podeJustificar: podeFrota(auth, 'paradas:justificar'),
      },
      combustivel: {
        ultimos30: resumoCombustivel(ultimos),
        anteriores30: resumoCombustivel(anteriores),
      },
      podeResponsavel: podeFrota(auth, 'veiculos:responsavel'),
      km: (() => {
        if (!prev) return null;
        const ativos = new Set((veiculos.data || []).filter((v) => v.ativo && v.status !== 'vendido' && v.tipo_registro === 'veiculo').map((v) => v.placa));
        const lista = [...prev.kmPorPlaca.values()].filter((k) => ativos.has(k.placa));
        return {
          confiaveis: lista.filter((k) => k.resultado.selo === 'verde').length,
          total: lista.length,
          // os mais desatualizados primeiro: são os que precisam de foto do painel
          pedirFoto: lista.filter((k) => k.resultado.selo === 'vermelho' || k.resultado.selo === 'cinza')
            .map((k) => ({ placa: k.placa, km: k.resultado.km, descricao: k.resultado.descricao, idadeDias: k.resultado.idadeDias }))
            .sort((a, b) => (b.idadeDias ?? 9999) - (a.idadeDias ?? 9999)),
        };
      })(),
      leiturasSuspeitas: suspeitas.error ? [] : suspeitas.data || [],
      // preventivas vencidas / vencendo (sem a migration: null e o bloco some)
      preventivas: prev?.tabela ? {
        resumo: prev.resumo,
        semPlano: prev.veiculos.filter((v) => !v.modelo).length,
        itens: prev.veiculos.flatMap((v) => v.itens
          .filter((i) => i.situacao.estado === 'vencida' || i.situacao.estado === 'em_breve')
          .map((i) => ({ placa: v.placa, modelo: v.descricao, nome: i.plano.nome, estado: i.situacao.estado, regua: i.situacao.regua, texto: i.situacao.texto })))
          .sort((a, b) => (a.estado === b.estado ? 0 : a.estado === 'vencida' ? -1 : 1)),
      } : null,
      podeConferirKm: podeFrota(auth, 'veiculos:editar'),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
