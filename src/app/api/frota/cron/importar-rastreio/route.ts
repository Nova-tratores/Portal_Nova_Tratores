// Importa o HISTÓRICO de GPS do projeto OMIE (tabela rastreio_pontos_relatorio,
// no mesmo Supabase — 650k+ pontos desde abril/2026) pro cache de rotas do
// portal (rotas_vendedor), SEM gastar a API da Rota Exata. Depois é só rodar o
// fechar-dia no mesmo período: ele lê o cache e consolida frota_dias/paradas.
//
//   GET ?de=YYYY-MM-DD&ate=YYYY-MM-DD [&dry=1]   (Bearer CRON_SECRET ou admin)
//   dry=1: calcula e devolve a amostra SEM gravar (pra conferir as contas).
//
// Dias/placas que JÁ têm rota no cache são pulados (o backfill da RE vence).
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { construirRotaDia, type PontoGps } from '@/lib/frota/gps';
import { resolverPlaca } from '@/lib/frota/placa';

export const runtime = 'nodejs';
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET || '';

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('importar-rastreio exige SUPABASE_SERVICE_ROLE_KEY.');
  return createClient(url, key, { auth: { persistSession: false } });
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
  const de = sp.get('de') || '';
  const ate = sp.get('ate') || '';
  const dry = sp.get('dry') === '1';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) {
    return NextResponse.json({ error: 'Informe ?de=YYYY-MM-DD&ate=YYYY-MM-DD.' }, { status: 400 });
  }

  try {
    const supabase = db();
    const dias = listaDias(de, ate);

    // só placas que são veículos do Frota (reboque/desconhecido fica fora)
    const { data: veic } = await supabase.from('frota_veiculos').select('placa').eq('tipo_registro', 'veiculo');
    const placasFrota = new Set((veic || []).map((v) => v.placa));

    // rotas já em cache no período (o backfill da Rota Exata vence)
    const { data: cacheExistente } = await supabase
      .from('rotas_vendedor')
      .select('placa, data')
      .gte('data', de)
      .lte('data', ate);
    const jaTem = new Set((cacheExistente || []).map((r) => `${r.placa}|${r.data}`));

    const resumo = { dias: dias.length, rotas_criadas: 0, ja_existiam: 0, sem_veiculo: 0, sem_pontos: 0, pontos_lidos: 0, erros: [] as string[] };
    const amostra: Record<string, unknown>[] = [];

    // ⚠️ A tabela NÃO tem índice em `data` — filtrar por dia estoura o
    // statement timeout (full scan de 650k+ linhas por query). Estratégia
    // 100% via PK: acha o id inicial do período por BUSCA BINÁRIA (os ids
    // seguem a ordem de inserção ≈ ordem cronológica) e pagina por id,
    // parando quando a data passa do fim.
    const { data: ultimoRow } = await supabase
      .from('rastreio_pontos_relatorio').select('id').order('id', { ascending: false }).limit(1);
    const { data: primeiroRow } = await supabase
      .from('rastreio_pontos_relatorio').select('id').order('id', { ascending: true }).limit(1);
    if (!ultimoRow?.length || !primeiroRow?.length) {
      return NextResponse.json({ ok: true, dry, resumo, aviso: 'rastreio_pontos_relatorio vazia' });
    }

    const dataDoId = async (id: number): Promise<string | null> => {
      const { data } = await supabase
        .from('rastreio_pontos_relatorio')
        .select('data')
        .gte('id', id)
        .order('id', { ascending: true })
        .limit(1);
      return data?.[0]?.data ? String(data[0].data) : null;
    };

    let lo = Number(primeiroRow[0].id);
    let hi = Number(ultimoRow[0].id);
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      const d = await dataDoId(mid);
      if (d === null || d >= de) hi = mid;
      else lo = mid + 1;
    }
    const idInicial = lo;

    // varre por id acumulando por placa|dia (só o período pedido)
    const porChave = new Map<string, PontoGps[]>();
    let cursor = idInicial;
    let passouDoFim = 0;
    for (let pagina = 0; pagina < 800; pagina++) {
      const { data: lote, error } = await supabase
        .from('rastreio_pontos_relatorio')
        .select('id, placa, data, dt_posicao, latitude, longitude, velocidade, ignicao')
        .gte('id', cursor)
        .order('id', { ascending: true })
        .limit(1000);
      if (error) { resumo.erros.push(`página ${pagina}: ${error.message}`); break; }
      if (!lote || lote.length === 0) break;
      cursor = Number(lote[lote.length - 1].id) + 1;

      let todosDepois = true;
      for (const b of lote) {
        const d = String(b.data);
        if (d < de) { todosDepois = false; continue; }
        if (d > ate) continue;
        todosDepois = false;
        const placa = resolverPlaca(String(b.placa || ''));
        const lat = Number(b.latitude), lng = Number(b.longitude);
        if (!placa || !lat || !lng) continue;
        resumo.pontos_lidos++;
        const chave = `${placa}|${d}`;
        const l = porChave.get(chave) || [];
        l.push({ lat, lng, dt: String(b.dt_posicao), vel: Number(b.velocidade) || 0, ignicao: Number(b.ignicao) });
        porChave.set(chave, l);
      }
      // os ids seguem ± a cronologia; 3 páginas inteiras já além do fim = acabou
      if (todosDepois && String(lote[0].data) > ate) {
        passouDoFim++;
        if (passouDoFim >= 3) break;
      } else {
        passouDoFim = 0;
      }
      if (lote.length < 1000) break;
    }

    for (const [chave, pontos] of porChave) {
      const [placa, dia] = chave.split('|');
      if (!placasFrota.has(placa)) { resumo.sem_veiculo++; continue; }
      if (jaTem.has(chave)) { resumo.ja_existiam++; continue; }
      if (pontos.length < 2) { resumo.sem_pontos++; continue; }
      pontos.sort((a, b) => a.dt.localeCompare(b.dt));

      const rota = construirRotaDia(placa, dia, pontos);
      if (dry) {
        if (amostra.length < 30) {
          amostra.push({ placa, dia, pontos: pontos.length, km: rota.km_total, paradas: rota.paradas.length, partidas: rota.partidas, tempo_ligado_min: rota.tempo_ligado_min });
        }
        resumo.rotas_criadas++;
        continue;
      }

      const { error } = await supabase
        .from('rotas_vendedor')
        .upsert({ ...rota, visitas: [], vendedor_id: null, vendedor_nome: null }, { onConflict: 'placa,data' });
      if (error) { resumo.erros.push(`${placa} ${dia}: ${error.message}`); continue; }
      jaTem.add(chave);
      resumo.rotas_criadas++;
    }

    console.log('[frota] importar-rastreio OK:', JSON.stringify(resumo));
    return NextResponse.json({ ok: resumo.erros.length === 0, dry, resumo, ...(dry ? { amostra } : {}) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[frota] importar-rastreio FALHOU:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
