// GET /api/frota/mapa/vias — trechos andados FORA das vias do OpenStreetMap
// (camada "Vias fora do mapa" de /frota/mapa e /mapa-geral).
//
//   ?dias=90            janela até ontem (padrão 90, máx 400)
//   ?de=YYYY-MM-DD&ate= intervalo explícito (máx 400 dias)
//   ?placa=ABC1D23      só um carro
//
// Cada trecho vem com o carro (placa, modelo), quem dirigia (check-in do dia) e
// de onde vinha / para onde ia (paradas classificadas do fechar-dia). A
// frequência das passagens é calculada na tela (lib/frota/vias-fora-mapa).
// Cálculo: agendador `frota-vias-fora-mapa` (lib/frota/vias-fora-mapa-server).
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { temAcessoMapa } from '@/lib/frota/server';
import { paginar } from '@/lib/db/paginar';
import { formatarPlaca, resolverPlaca } from '@/lib/frota/placa';
import { pontasDoTrecho, type ParadaLida } from '@/lib/frota/vias-fora-mapa';
import { migracaoViasFaltando, ontemBRT } from '@/lib/frota/vias-fora-mapa-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DIAS = 400;

function menosDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86400_000);

interface LinhaTrecho {
  id: number; placa: string; data: string; inicio: string; fim: string;
  pontos: [number, number, number][]; km: number; vel_mediana: number | null;
  dist_max_m: number | null; dist_mediana_m: number | null;
}
interface LinhaParada extends ParadaLida { placa: string; data: string }

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!temAcessoMapa(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  let ate = sp.get('ate') || ontemBRT();
  let de = sp.get('de') || menosDias(ate, Math.min(MAX_DIAS, Math.max(1, Number(sp.get('dias')) || 90)) - 1);
  if (!DIA.test(de) || !DIA.test(ate)) return NextResponse.json({ error: 'Datas no formato AAAA-MM-DD' }, { status: 400 });
  if (de > ate) [de, ate] = [ate, de];
  if (diasEntre(de, ate) >= MAX_DIAS) de = menosDias(ate, MAX_DIAS - 1);
  const placaFiltro = (sp.get('placa') || '').trim();

  try {
    const trechosQ = await paginar<LinhaTrecho>((a, b) => {
      let q = supabase.from('frota_vias_trechos')
        .select('id, placa, data, inicio, fim, pontos, km, vel_mediana, dist_max_m, dist_mediana_m')
        .gte('data', de).lte('data', ate);
      if (placaFiltro) q = q.in('placa', [...new Set([placaFiltro, resolverPlaca(placaFiltro), formatarPlaca(placaFiltro)])]);
      return q.order('id').range(a, b);
    }, { max: 50_000 });
    if (trechosQ.error) {
      if (migracaoViasFaltando(trechosQ.error.message)) {
        return NextResponse.json({ migracaoFaltando: true, trechos: [], de, ate, error: 'Falta aplicar sql/frota-vias-fora-mapa.sql no Supabase.' }, { status: 503 });
      }
      throw new Error(trechosQ.error.message);
    }
    const trechos = trechosQ.data;
    const placas = [...new Set(trechos.map((t) => t.placa))];

    const [diasQ, paradasQ, usoQ, veicQ] = await Promise.all([
      paginar<{ placa: string; data: string; situacao: string; processado_em: string }>((a, b) => supabase
        .from('frota_vias_dias').select('placa, data, situacao, processado_em')
        .gte('data', de).lte('data', ate).order('placa').order('data').range(a, b)),
      placas.length
        ? paginar<LinhaParada>((a, b) => supabase
          .from('frota_paradas').select('placa, data, inicio, fim, duracao_min, classe, destino_nome, justificativa, endereco')
          .gte('data', de).lte('data', ate).in('placa', placas).eq('ignorada', false)
          .order('id').range(a, b), { max: 60_000 })
        : Promise.resolve({ data: [] as LinhaParada[], error: null }),
      placas.length
        ? paginar<{ placa: string; data: string; pessoa_nome: string | null; created_at: string }>((a, b) => supabase
          .from('vw_frota_uso_diario').select('placa, data, pessoa_nome, created_at')
          .gte('data', de).lte('data', ate)
          .order('data').order('created_at').range(a, b), { max: 60_000 })
        : Promise.resolve({ data: [], error: null }),
      supabase.from('frota_veiculos').select('placa, marca, modelo, descricao').eq('tipo_registro', 'veiculo'),
    ]);

    // paradas por placa+dia (as do fechar-dia: classe/cliente/justificativa)
    const paradas = new Map<string, LinhaParada[]>();
    for (const p of paradasQ.data || []) {
      const k = `${resolverPlaca(p.placa)}|${p.data}`;
      const l = paradas.get(k);
      if (l) l.push(p); else paradas.set(k, [p]);
    }
    // quem dirigia: o último check-in do dia
    const motorista = new Map<string, string>();
    for (const u of usoQ.data || []) if (u.pessoa_nome) motorista.set(`${resolverPlaca(u.placa)}|${u.data}`, u.pessoa_nome);
    const veiculo = new Map<string, string>();
    for (const v of (veicQ.data || []) as { placa: string; marca: string | null; modelo: string | null; descricao: string | null }[]) {
      veiculo.set(resolverPlaca(v.placa), [v.marca, v.modelo].filter(Boolean).join(' ') || v.descricao || '');
    }

    const saida = trechos.map((t) => {
      const p = resolverPlaca(t.placa);
      const k = `${p}|${t.data}`;
      return {
        ...t,
        km: Number(t.km),
        vel_mediana: t.vel_mediana == null ? null : Number(t.vel_mediana),
        placa_exibicao: formatarPlaca(t.placa),
        modelo: veiculo.get(p) || null,
        motorista: motorista.get(k) || null,
        ...pontasDoTrecho(t, paradas.get(k) || []),
      };
    });

    const dias = diasQ.data || [];
    const processados = dias.map((d) => d.processado_em).sort();
    return NextResponse.json({
      de, ate,
      trechos: saida,
      cobertura: {
        dias_ok: dias.filter((d) => d.situacao === 'ok').length,
        dias_pendentes: dias.filter((d) => d.situacao === 'pendente').length,
        primeiro_dia: dias.map((d) => d.data).sort()[0] || null,
        ultimo_processamento: processados[processados.length - 1] || null,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
