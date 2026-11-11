// /api/crm-vendas/pedidos-contato — tela do suporte (Mariano) para os pedidos de contato
// que os vendedores fazem pelo app ("Pedir ao suporte" na quest/no negócio).
//   GET  ?status=aberto|respondido|todos     → lista
//   GET  ?id=<pedido>                         → pedido + o contato que o vendedor vê hoje
//   POST { id, acao: 'responder', telefone?, celular?, endereco?, mapa?, obs? }
//        mapa = link do Google Maps (curto ou longo) ou "lat, lng"
//   POST { id, acao: 'dispensar', motivo? }
// Responder/dispensar avisa o vendedor (mensagens_vendedor, abre a quest).
// Quem pode: admin, quem tem o CRM de vendas, ou a pessoa avisada do pedido (suporte_id).
import { NextRequest, NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { coordenadaDoLink } from '@/lib/clientes/link-maps-server';
import { respostaVazia } from '@/lib/vendas-app/quest-contato';
import {
  carregarPedido, contatoDoPedido, dispensarPedido, listarPedidos, responderPedido,
} from '@/lib/vendas-app/quest-contato-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIGRACAO = 'Falta aplicar sql/vendas-pedidos-contato.sql no Supabase.';
const txt = (v: unknown, max = 300) => { const s = String(v ?? '').trim(); return s ? s.slice(0, max) : null; };

async function quem(req: NextRequest) {
  const a = await autenticar(req);
  if (!a) return null;
  const geral = a.isAdmin || a.modulos.some((m) => m === 'crm-vendas' || m.startsWith('crm-vendas:') || m.startsWith('supervisor-vendas'));
  const { data } = await supabaseAdmin.from('financeiro_usu').select('nome').eq('id', a.userId).maybeSingle();
  return { id: a.userId, geral, nome: String(data?.nome || a.email || 'Suporte').trim() };
}

export async function GET(req: NextRequest) {
  const u = await quem(req);
  if (!u) return NextResponse.json({ error: 'Entre no portal.' }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  try {
    const id = Number(sp.get('id'));
    if (id > 0) {
      const p = await carregarPedido(id);
      if (!p) return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });
      if (!u.geral && p.suporte_id !== u.id) return NextResponse.json({ error: 'Sem permissão para este pedido.' }, { status: 403 });
      const contato = await contatoDoPedido(p).catch(() => null);
      return NextResponse.json({ ok: true, pedido: p, contato });
    }
    const st = sp.get('status');
    const lista = await listarPedidos(st === 'respondido' || st === 'todos' ? st : 'aberto');
    if (!lista) return NextResponse.json({ ok: true, pedidos: [], migracaoFaltando: true, aviso: MIGRACAO });
    const minhas = u.geral ? lista : lista.filter((p) => p.suporte_id === u.id);
    return NextResponse.json({ ok: true, pedidos: minhas });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const u = await quem(req);
  if (!u) return NextResponse.json({ error: 'Entre no portal.' }, { status: 401 });
  const b = await req.json().catch(() => ({})) as Record<string, unknown>;
  try {
    const p = await carregarPedido(Number(b.id));
    if (!p) return NextResponse.json({ error: 'Pedido não encontrado (ou falta a migration).' }, { status: 404 });
    if (!u.geral && p.suporte_id !== u.id) return NextResponse.json({ error: 'Sem permissão para este pedido.' }, { status: 403 });

    if (b.acao === 'dispensar') {
      const r = await dispensarPedido(p, txt(b.motivo), u.nome);
      return NextResponse.json({ ok: true, ...r });
    }
    if (b.acao !== 'responder') return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });

    let lat: number | null = null, lng: number | null = null;
    const mapa = txt(b.mapa, 2000);
    if (mapa) {
      const c = await coordenadaDoLink(mapa).catch(() => null);
      if (!c) return NextResponse.json({ error: 'Não entendi a localização. Cole o link do Google Maps ou "latitude, longitude".' }, { status: 400 });
      lat = c.lat; lng = c.lng;
    }
    const resposta = { telefone: txt(b.telefone, 120), celular: txt(b.celular, 120), endereco: txt(b.endereco, 300), lat, lng, obs: txt(b.obs) };
    if (respostaVazia(resposta)) {
      return NextResponse.json({ error: 'Preencha um telefone com DDD, o endereço ou a localização.' }, { status: 400 });
    }
    const r = await responderPedido(p, resposta, u.nome);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
