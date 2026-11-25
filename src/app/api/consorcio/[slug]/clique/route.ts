/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// ROTA PÚBLICA: registra um clique num botão de WhatsApp da página de divulgação (revisão de design, 24/11/2026).
// A página não tem formulário; sem isto não daria para saber quantos clicaram, em qual trator e por qual link.
// Chamada por navigator.sendBeacon (o navegador manda mesmo abrindo o WhatsApp). Sempre responde 204:
// se a tabela ainda não existe (SQL não rodado) ou algo falha, o cliente não percebe nada.
// =============================================================================
import { supabaseAdmin as db } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LUGARES = new Set(['topo', 'carta', 'outras', 'mapa', 'barra', 'flutuante']);
const txt = (v: any, max: number) => String(v ?? '').trim().slice(0, max);
const vazio = () => new Response(null, { status: 204 });

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const b = JSON.parse((await req.text()) || '{}');
    const { data: ev } = await db.from('consorcio_eventos').select('id').eq('slug', slug).maybeSingle();
    if (!ev) return vazio();
    const utm: Record<string, string> = {};
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
      const v = txt(b.utm?.[k], 80);
      if (v) utm[k] = v;
    }
    await db.from('consorcio_cliques').insert({
      evento_id: ev.id,
      modelo: txt(b.modelo, 120) || null,
      lugar: LUGARES.has(b.lugar) ? b.lugar : null,
      origem: txt(b.origem, 30).toLowerCase().replace(/[^a-z0-9_-]/g, '') || null,
      vendedor: txt(b.vendedor, 60) || null,
      utm: Object.keys(utm).length ? utm : null,
    });
  } catch { /* nunca atrapalha o clique */ }
  return vazio();
}
