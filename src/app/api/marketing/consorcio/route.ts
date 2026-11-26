/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// CONSÓRCIO NO EVENTO — rotas do portal (com login). Tela: Marketing → Consórcio.
//
// GET   /api/marketing/consorcio?evento=<id>  -> eventos + inscritos + giros do sorteio do evento escolhido
// POST  /api/marketing/consorcio  { nome, slug }        -> cria evento (copia os números do consórcio do último)
// PATCH /api/marketing/consorcio  { id, ...campos }     -> edita textos, datas, prêmio, config, liga/desliga
// =============================================================================
import { NextResponse } from 'next/server';
import { guardar } from '@/lib/marketing/rota';
import { db } from '@/lib/marketing/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MSG = 'Falta rodar sql/consorcio-evento.sql no SQL Editor do Supabase.';
const falta = (e: any) => /consorcio_|does not exist|schema cache|42P01|42883/.test(`${e?.code} ${e?.message}`);
function erro(e: any, ctx: string) {
  if (falta(e)) return NextResponse.json({ error: MSG, migracaoFaltando: true }, { status: 503 });
  console.error(`[consorcio] ${ctx}`, e);
  return NextResponse.json({ error: e?.message || 'Erro inesperado' }, { status: 500 });
}

export async function GET(req: Request) {
  const g = await guardar(req, 'marketing');
  if (g.resposta) return g.resposta;
  try {
    const { data: eventos, error } = await db.from('consorcio_eventos').select('*').order('criado_em', { ascending: false });
    if (error) throw error;
    const pedido = new URL(req.url).searchParams.get('evento');
    const evento = (eventos || []).find((e: any) => e.id === pedido) || eventos?.[0] || null;
    if (!evento) return NextResponse.json({ eventos: [], evento: null, inscricoes: [], sorteios: [], acoes: [] });

    const [ins, sor, acs] = await Promise.all([
      db.from('consorcio_inscricoes').select('*').eq('evento_id', evento.id).order('numero', { ascending: false }),
      db.from('consorcio_sorteios').select('*').eq('evento_id', evento.id).order('sorteado_em', { ascending: true }),
      db.from('mkt_acoes').select('id, nome, data_inicio').order('data_inicio', { ascending: false, nullsFirst: false }).limit(60),
    ]);
    if (ins.error) throw ins.error;
    if (sor.error) throw sor.error;
    // cliques nos botões de WhatsApp da página (sem a tabela ainda, só não mostra)
    const cli = await db.from('consorcio_cliques').select('modelo, lugar, origem, vendedor').eq('evento_id', evento.id).limit(20000);
    const soma = (campo: string) => {
      const m: Record<string, number> = {};
      for (const c of (cli.data || []) as any[]) { const k = c[campo] || '(sem)'; m[k] = (m[k] || 0) + 1; }
      return Object.entries(m).sort((a, b) => b[1] - a[1]);
    };
    const cliques = cli.error ? null : { total: cli.data?.length || 0, porModelo: soma('modelo'), porLugar: soma('lugar'), porOrigem: soma('origem') };
    return NextResponse.json({ eventos, evento, inscricoes: ins.data || [], sorteios: sor.data || [], acoes: acs.data || [], cliques });
  } catch (e) {
    return erro(e, 'GET');
  }
}

const slugify = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

export async function POST(req: Request) {
  const g = await guardar(req, 'marketing', 'acoes:editar');
  if (g.resposta) return g.resposta;
  try {
    const b = await req.json().catch(() => ({}));
    const nome = String(b.nome || '').trim();
    if (!nome) return NextResponse.json({ error: 'Dê um nome ao evento.' }, { status: 400 });
    const slug = slugify(b.slug || nome);
    if (!slug) return NextResponse.json({ error: 'Link inválido.' }, { status: 400 });
    // aproveita os números do consórcio do evento mais recente (taxas, modelos) — só muda o que precisar
    const { data: ultimo } = await db.from('consorcio_eventos').select('config').order('criado_em', { ascending: false }).limit(1).maybeSingle();
    const { data, error } = await db.from('consorcio_eventos').insert({ nome, slug, config: ultimo?.config || {} }).select().single();
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: `Já existe um evento com o link "${slug}".` }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ evento: data });
  } catch (e) {
    return erro(e, 'POST');
  }
}

const CAMPOS = ['nome', 'local', 'cidade', 'inicio', 'fim', 'sorteio_em', 'premio', 'regulamento', 'ativo', 'acao_id', 'config'] as const;

export async function PATCH(req: Request) {
  const g = await guardar(req, 'marketing', 'acoes:editar');
  if (g.resposta) return g.resposta;
  try {
    const b = await req.json().catch(() => ({}));
    if (!b.id) return NextResponse.json({ error: 'Informe o evento.' }, { status: 400 });
    const mud: Record<string, any> = { atualizado_em: new Date().toISOString() };
    for (const c of CAMPOS) {
      if (!(c in b)) continue;
      const v = b[c];
      mud[c] = typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v;
    }
    if ('nome' in mud && !mud.nome) return NextResponse.json({ error: 'O nome não pode ficar vazio.' }, { status: 400 });
    if ('config' in mud && (typeof mud.config !== 'object' || mud.config === null)) {
      return NextResponse.json({ error: 'Configuração inválida.' }, { status: 400 });
    }
    const { data, error } = await db.from('consorcio_eventos').update(mud).eq('id', b.id).select().single();
    if (error) throw error;
    return NextResponse.json({ evento: data });
  } catch (e) {
    return erro(e, 'PATCH');
  }
}
