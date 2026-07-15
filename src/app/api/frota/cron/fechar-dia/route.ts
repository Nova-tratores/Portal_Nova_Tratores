// Cron: FECHA O DIA da frota — para cada veículo rastreado, consolida o dia em
// `frota_dias` (km, partidas, tempo ligado, marcha lenta, paradas) e classifica
// cada parada em `frota_paradas` (loja/cliente/visita/abastecimento/ATÍPICA).
//
//   GET ?data=YYYY-MM-DD        um dia (default: ontem, Brasília)
//   GET ?de=...&ate=...         intervalo (backfill; máx. 92 dias)
//
// Reusa computarESalvarRota: se a rota do dia já está em rotas_vendedor, NÃO
// gasta a API da Rota Exata (recalcula do JSONB local — backfill barato).
// O reprocesso só reescreve as colunas CALCULADAS de frota_paradas — as do
// portal (justificativa/endereco/ignorada) ficam fora do payload e intactas.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { computarESalvarRota } from '@/lib/pos/rastreamento';
import { agregarIgnicao } from '@/lib/frota/ignicao';
import { classificarParadas, type GeocercaCtx } from '@/lib/frota/paradas';
import { carregarPropriedades, propriedadesComoGeocercas } from '@/lib/frota/propriedades';
import { resolverPlaca } from '@/lib/frota/placa';

export const runtime = 'nodejs';
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET || '';

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('fechar-dia exige SUPABASE_SERVICE_ROLE_KEY.');
  return createClient(url, key, { auth: { persistSession: false } });
}

function ontemBrasilia(): string {
  const d = new Date(Date.now() - 3 * 3600_000); // agora em BRT
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function listaDias(de: string, ate: string): string[] {
  const dias: string[] = [];
  const d = new Date(`${de}T00:00:00Z`);
  const fim = new Date(`${ate}T00:00:00Z`);
  while (d <= fim && dias.length < 92) {
    dias.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dias;
}

export async function GET(req: NextRequest) {
  const header = req.headers.get('authorization') || '';
  const ehCron = !!CRON_SECRET && header === `Bearer ${CRON_SECRET}`;
  if (!ehCron) {
    const auth = await autenticar(req);
    if (!auth?.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const um = sp.get('data');
  const de = sp.get('de');
  const ate = sp.get('ate');
  const dias = um ? [um] : de && ate ? listaDias(de, ate) : [ontemBrasilia()];
  if (dias.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d))) {
    return NextResponse.json({ error: 'Datas no formato YYYY-MM-DD.' }, { status: 400 });
  }

  try {
    const supabase = db();

    // Contexto carregado UMA vez para o intervalo inteiro
    const [veic, geo, resp, usos, abast, odo, props] = await Promise.all([
      supabase
        .from('frota_veiculos')
        .select('id, placa, adesao_id')
        .not('adesao_id', 'is', null)
        .eq('tipo_registro', 'veiculo'),
      supabase
        .from('frota_geocercas')
        .select('id, latitude, longitude, raio_m, classe, nome, cliente_id')
        .eq('ativo', true),
      supabase.from('frota_responsaveis').select('veiculo_id, motorista_id, motorista_nome, inicio, fim'),
      supabase.from('vw_frota_uso_diario').select('veiculo_id, data, pessoa_nome'),
      supabase
        .from('abastecimentos')
        .select('placa, data_transacao, litros, valor_total')
        .gte('data_transacao', `${dias[0]}T00:00:00-03:00`)
        .lte('data_transacao', `${dias[dias.length - 1]}T23:59:59-03:00`),
      supabase
        .from('frota_odometro')
        .select('adesao_id, data, km_adesao, km_rastreador')
        .order('data'),
      // propriedades de clientes geocodificadas — absolvem como 'cliente_portal'
      carregarPropriedades(supabase).catch(() => []),
    ]);
    const veiculos = veic.data || [];
    // geocercas da Rota Exata PRIMEIRO: se uma parada cabe nas duas, a geocerca
    // oficial vence só por proximidade (geocercaDa pega a mais perto) — e a
    // propriedade nunca "rouba" a loja porque o raio dela parte da sede.
    const geocercas = [
      ...((geo.data || []) as GeocercaCtx[]),
      ...propriedadesComoGeocercas(props),
    ];
    console.log(`[frota] fechar-dia ctx: ${geo.data?.length || 0} geocercas + ${props.length} propriedades de clientes`);

    const usoPorDia = new Map<string, string>();
    for (const u of usos.data || []) if (u.pessoa_nome) usoPorDia.set(`${u.veiculo_id}|${u.data}`, u.pessoa_nome);

    const fixoEm = (veiculoId: string, d: string) =>
      (resp.data || []).find(
        (r) => r.veiculo_id === veiculoId && r.inicio <= d && (r.fim === null || r.fim >= d),
      ) || null;

    // abastecimentos por placa+dia (dia em Brasília)
    const abastPorChave = new Map<string, { litros: number; gasto: number; horarios: string[] }>();
    for (const a of abast.data || []) {
      const placa = resolverPlaca(a.placa);
      const diaBRT = new Date(new Date(a.data_transacao).getTime() - 3 * 3600_000)
        .toISOString()
        .slice(0, 10);
      const k = `${placa}|${diaBRT}`;
      const e = abastPorChave.get(k) || { litros: 0, gasto: 0, horarios: [] };
      e.litros += Number(a.litros) || 0;
      e.gasto += Number(a.valor_total) || 0;
      e.horarios.push(a.data_transacao);
      abastPorChave.set(k, e);
    }

    // odômetro: leituras ordenadas por adesão (para o delta do dia)
    const odoPorAdesao = new Map<number, { data: string; km: number }[]>();
    for (const o of odo.data || []) {
      const km = Number(o.km_adesao ?? o.km_rastreador);
      if (!Number.isFinite(km) || km <= 0) continue;
      const l = odoPorAdesao.get(Number(o.adesao_id)) || [];
      l.push({ data: o.data, km });
      odoPorAdesao.set(Number(o.adesao_id), l);
    }
    const kmOdometroDoDia = (adesaoId: number, dia: string): number | null => {
      const leituras = odoPorAdesao.get(adesaoId) || [];
      const doDia = leituras.filter((l) => l.data === dia).pop();
      if (!doDia) return null;
      const anterior = [...leituras].reverse().find((l) => l.data < dia);
      if (!anterior) return null;
      const delta = doDia.km - anterior.km;
      return delta >= 0 && delta < 2000 ? Math.round(delta * 10) / 10 : null;
    };

    const resumo = { dias: dias.length, veiculos: veiculos.length, dias_gravados: 0, paradas: 0, atipicas: 0, erros: [] as string[] };

    for (const dia of dias) {
      for (const v of veiculos) {
        try {
          const rota = await computarESalvarRota(supabase, v.placa, dia);
          const ign =
            rota.tempo_ligado_min != null
              ? rota
              : agregarIgnicao(rota.pontos || []);

          const chave = `${v.placa}|${dia}`;
          const consumo = abastPorChave.get(chave) || { litros: 0, gasto: 0, horarios: [] };

          const classificadas = classificarParadas(rota.paradas || [], {
            geocercas,
            visitas: (rota.visitas || []).map((x: any) => ({ lat: x.lat, lng: x.lng })),
            abastecimentos: consumo.horarios.map((h) => ({ data_transacao: h })),
          });

          const motoristaUso = usoPorDia.get(`${v.id}|${dia}`);
          const fixo = fixoEm(v.id, dia);

          // frota_paradas: SÓ colunas calculadas no payload — as do portal
          // (justificativa/endereco/ignorada) não entram e ficam preservadas.
          if (classificadas.length > 0) {
            const { error } = await supabase.from('frota_paradas').upsert(
              classificadas.map((p) => ({
                veiculo_id: v.id,
                placa: v.placa,
                data: dia,
                inicio: p.inicio,
                fim: p.fim,
                duracao_min: p.duracao_min,
                latitude: p.lat,
                longitude: p.lng,
                classe: p.classe,
                geocerca_id: p.geocerca_id,
                destino_nome: p.destino_nome,
                cliente_id: p.cliente_id,
                atipica: p.atipica,
                nivel: p.nivel,
                fora_horario: p.fora_horario,
                fim_de_semana: p.fim_de_semana,
                motorista_id: fixo?.motorista_id ?? null,
              })),
              { onConflict: 'veiculo_id,inicio' },
            );
            if (error) throw new Error(`frota_paradas: ${error.message}`);
          }

          const atip = classificadas.filter((p) => p.atipica).length;
          const { error: errDia } = await supabase.from('frota_dias').upsert(
            {
              veiculo_id: v.id,
              placa: v.placa,
              data: dia,
              adesao_id: v.adesao_id,
              motorista_id: fixo?.motorista_id ?? null,
              motorista_nome: motoristaUso || fixo?.motorista_nome || null,
              km_total: rota.km_total || 0,
              km_odometro: kmOdometroDoDia(Number(v.adesao_id), dia),
              hora_inicio: rota.hora_inicio,
              hora_fim: rota.hora_fim,
              posicoes_total: (rota.pontos || []).length,
              partidas: ign.partidas ?? 0,
              ja_ligado_no_inicio: ign.ja_ligado_no_inicio ?? false,
              primeira_partida: ign.primeira_partida ?? null,
              ultimo_desligamento: ign.ultimo_desligamento ?? null,
              tempo_ligado_min: ign.tempo_ligado_min ?? 0,
              tempo_movimento_min: ign.tempo_movimento_min ?? 0,
              tempo_marcha_lenta_min: ign.tempo_marcha_lenta_min ?? 0,
              tempo_desligado_min: ign.tempo_desligado_min ?? 0,
              vel_max: ign.vel_max ?? 0,
              paradas_total: classificadas.length,
              paradas_cliente: classificadas.filter((p) => ['cliente', 'cliente_portal', 'visita'].includes(p.classe)).length,
              paradas_loja: classificadas.filter((p) => p.classe === 'loja').length,
              paradas_atipicas: atip,
              litros: consumo.litros,
              gasto_combustivel: Math.round(consumo.gasto * 100) / 100,
              calculado_em: new Date().toISOString(),
            },
            { onConflict: 'veiculo_id,data' },
          );
          if (errDia) throw new Error(`frota_dias: ${errDia.message}`);

          resumo.dias_gravados++;
          resumo.paradas += classificadas.length;
          resumo.atipicas += atip;
        } catch (e) {
          resumo.erros.push(`${v.placa} ${dia}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    // Retenção: os `pontos` crus (JSONB, ~2.880 fixes/dia) de rotas com mais
    // de 90 dias viram [] — sem isso rotas_vendedor cresce ~580MB/ano. Os
    // AGREGADOS (km, paradas, ignição, visitas) ficam; o histórico do mapa
    // continua listando (computarESalvarRota devolve a linha podada).
    try {
      const corte = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
      const { data: velhas } = await supabase
        .from('rotas_vendedor')
        .select('id')
        .lt('data', corte)
        .neq('pontos', '[]')
        .limit(500); // lote por execução — o cron é diário, o backlog esvazia
      if (velhas && velhas.length > 0) {
        const { error: errPoda } = await supabase
          .from('rotas_vendedor')
          .update({ pontos: [] })
          .in('id', velhas.map((v) => v.id));
        if (errPoda) throw new Error(errPoda.message);
      }
      (resumo as Record<string, unknown>).pontos_podados = velhas?.length || 0;
    } catch (e) {
      (resumo as Record<string, unknown>).pontos_podados = `falhou: ${e instanceof Error ? e.message : e}`;
    }

    console.log('[frota] fechar-dia OK:', JSON.stringify(resumo));
    return NextResponse.json({ ok: resumo.erros.length === 0, resumo });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[frota] fechar-dia FALHOU:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
