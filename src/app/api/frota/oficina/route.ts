// Oficina da frota — ordem de serviço em kanban (lib/frota/oficina*.ts).
//
// GET  /api/frota/oficina                 OS ativas + encerradas nos últimos 30 dias
// GET  /api/frota/oficina?candidatos=PLACA pendências abertas e preventivas vencendo do carro
// POST /api/frota/oficina { acao, ... }
//   abrir      { placa, descricao?, oficina, fornecedor?, os_pos?, imobiliza, pendencia_ids[], plano_ids[], avulsos[] }
//   incluir    { id, pendencia_ids[], plano_ids[], avulsos[] }
//   mover      { id, para, km?, foto_url?, peca?, previsao_peca?, retirado_por?, motivo? }
//   item       { id, item_id, feito, foto_url?, obs? }
//   remover    { id, item_id }
//   requisicao { id }
//
// Quem: vê e abre a OS quem tem a Frota (ou é do pós-vendas); MOVE (etapas e
// itens) só o pós-vendas — decisão do José — e os administradores.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar, type Autenticado } from '@/lib/auth/server';
import { logFrota, temModuloFrota } from '@/lib/frota/server';
import { ehPosVendas } from '@/lib/assistente/notificados';
import { resolverPlaca } from '@/lib/frota/placa';
import { sincronizarPendencias } from '@/lib/frota/pendencias-sync';
import { ehEtapa, ETAPA_INFO } from '@/lib/frota/oficina';
import {
  ErroOficina, MSG_MIGRACAO_OFICINA, abrirOS, adicionarItens, candidatosOS, carregarOficina, criarRequisicaoDaOS,
  marcarItem, moverOS, removerItem,
} from '@/lib/frota/oficina-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

const podeVer = (a: Autenticado) => temModuloFrota(a) || ehPosVendas(a);
const podeMover = (a: Autenticado) => a.isAdmin || ehPosVendas(a);

async function nomeDe(a: Autenticado): Promise<string> {
  const { data } = await supabase.from('financeiro_usu').select('nome').eq('id', a.userId).maybeSingle();
  return String(data?.nome || a.email || a.userId);
}

const lista = (x: unknown) => (Array.isArray(x) ? x.map((v) => String(v || '')).filter(Boolean) : []);

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeVer(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  try {
    const cand = req.nextUrl.searchParams.get('candidatos');
    if (cand) return NextResponse.json(await candidatosOS(supabase, resolverPlaca(cand)));
    const [r, veics] = await Promise.all([
      carregarOficina(supabase),
      supabase.from('frota_veiculos').select('placa, marca, modelo, descricao')
        .eq('tipo_registro', 'veiculo').eq('ativo', true).order('placa'),
    ]);
    // a lista de carros para abrir a OS vem daqui: quem é do pós-vendas pode
    // não ter a Frota (e a rota de veículos exige)
    const veiculos = (veics.data || []).map((v) => ({
      placa: v.placa as string,
      descricao: [v.marca, v.modelo].filter(Boolean).join(' ') || (v.descricao as string) || '',
    }));
    if (!r.tabela) return NextResponse.json({ migracaoFaltando: true, error: MSG_MIGRACAO_OFICINA, os: [], veiculos, podeMover: podeMover(auth) });
    return NextResponse.json({ os: r.os, veiculos, podeMover: podeMover(auth) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeVer(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const acao = String(body.acao || '');
  const id = String(body.id || '');
  const quem = await nomeDe(auth);
  const precisaMover = ['mover', 'item', 'remover'].includes(acao);
  if (precisaMover && !podeMover(auth)) {
    return NextResponse.json({ error: 'Só o pós-vendas move a ordem de serviço da frota.' }, { status: 403 });
  }

  try {
    if (acao === 'abrir') {
      const placa = resolverPlaca(String(body.placa || ''));
      if (!placa) return NextResponse.json({ error: 'Escolha o veículo.' }, { status: 400 });
      const osId = await abrirOS(supabase, {
        placa, descricao: body.descricao, oficina: body.oficina, fornecedor: body.fornecedor, os_pos: body.os_pos,
        imobiliza: body.imobiliza !== false,
        pendencia_ids: lista(body.pendencia_ids), plano_ids: lista(body.plano_ids), avulsos: lista(body.avulsos),
      }, quem);
      await logFrota(auth, { acao: 'criar', entidade: 'os_frota', entidadeId: osId, entidadeLabel: `OS da frota aberta no ${placa}`, detalhes: { placa } });
      return NextResponse.json({ ok: true, id: osId });
    }
    if (!id) return NextResponse.json({ error: 'Informe a OS.' }, { status: 400 });

    if (acao === 'incluir') {
      await adicionarItens(supabase, id, { pendencia_ids: lista(body.pendencia_ids), plano_ids: lista(body.plano_ids), avulsos: lista(body.avulsos) }, quem);
      return NextResponse.json({ ok: true });
    }
    if (acao === 'mover') {
      if (!ehEtapa(body.para)) return NextResponse.json({ error: 'Etapa inválida.' }, { status: 400 });
      const km = body.km != null && String(body.km).trim() !== '' ? Number(String(body.km).replace(/\D/g, '')) : null;
      const r = await moverOS(supabase, id, body.para, {
        km, foto_url: body.foto_url ? String(body.foto_url) : null, peca: body.peca ?? null,
        previsao_peca: body.previsao_peca ?? null, retirado_por: body.retirado_por ?? null, motivo: body.motivo ?? null,
      }, quem);
      await logFrota(auth, {
        acao: 'editar', entidade: 'os_frota', entidadeId: id,
        entidadeLabel: `${r.rotulo} ${r.placa}: ${ETAPA_INFO[r.de].label} → ${ETAPA_INFO[r.para].label}`,
        detalhes: { de: r.de, para: r.para, km, resumo: r.resumo },
      });
      // concluir/cancelar: o motor reavalia as pendências na hora
      if (r.para === 'concluida' || r.para === 'cancelada') sincronizarPendencias().catch(() => {});
      return NextResponse.json({ ok: true, resumo: r.resumo });
    }
    if (acao === 'item') {
      await marcarItem(supabase, id, String(body.item_id || ''), body.feito === true, {
        foto_url: body.foto_url !== undefined ? (body.foto_url ? String(body.foto_url) : null) : undefined,
        obs: body.obs !== undefined ? String(body.obs || '') : undefined,
      }, quem);
      return NextResponse.json({ ok: true });
    }
    if (acao === 'remover') {
      await removerItem(supabase, id, String(body.item_id || ''), quem);
      return NextResponse.json({ ok: true });
    }
    if (acao === 'requisicao') {
      const reqId = await criarRequisicaoDaOS(supabase, id, quem);
      await logFrota(auth, { acao: 'criar', entidade: 'os_frota', entidadeId: id, entidadeLabel: `Requisição #${reqId} criada pela OS da frota`, detalhes: { requisicao: reqId } });
      return NextResponse.json({ ok: true, requisicao: reqId });
    }
    return NextResponse.json({ error: 'Ação desconhecida.' }, { status: 400 });
  } catch (e) {
    if (e instanceof ErroOficina) return NextResponse.json({ error: e.message, migracaoFaltando: e.status === 503 || undefined }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
