// Checklist mensal de veículo NÃO-VINCULADO, feito pelo portal (mobile).
// Grava nas MESMAS tabelas do NT Mecânico (veiculo_checklist / _itens) e no mesmo
// bucket público `requisicoes`. Dedup por (placa, mês). Só quem tem o módulo Frota.
//
//   GET  ?placa=XXX                 -> status do mês (checklist + itens) + perguntas
//   POST { action:'iniciar', ... }  -> cria/abre a linha do mês
//   POST multipart action=salvar_item -> salva um item (com foto)
//   POST { action:'concluir', ... } -> fecha, calcula score
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { autenticar } from '@/lib/auth/server';
import { temModuloFrota } from '@/lib/frota/server';
import { resolverPlaca, extrairPlacaDeNumPlaca } from '@/lib/frota/placa';
import { responsavelVazio } from '@/lib/frota/responsavel';
import { CHECKLIST_ITEMS, calcularScore } from '@/lib/frota/checklist';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

const mesAtual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

async function nomeDoUsuario(userId: string, email: string | null): Promise<string> {
  const { data } = await supabase.from('financeiro_usu').select('nome').eq('id', userId).maybeSingle();
  return data?.nome || email || 'Usuário do portal';
}

// Confere se o veículo é mesmo "não-vinculado" (sem responsável na Frota e sem técnico).
/**
 * Veículo que NÃO deve mais entrar na rotina de checklist.
 *
 * Duas razões: saiu da frota (vendido/arquivado/inativo) ou foi desligado à
 * mão (`checklist_desativado` — ex.: carro parado no pátio). A trava fica AQUI,
 * no início do checklist, e não só na tela: o checklist também é aberto pelo
 * app dos mecânicos, e esconder o botão no portal não impediria nada.
 *
 * Tolerante à migração pendente: sem a coluna, o `select('*')` devolve a linha
 * sem ela e só a regra de ativo/status vale.
 */
async function checklistBloqueado(placaCanon: string): Promise<string | null> {
  const { data: v } = await supabase.from('frota_veiculos').select('*').eq('placa', placaCanon).maybeSingle();
  if (!v) return null; // veículo fora do cadastro: mantém o comportamento de antes
  const status = String((v as any).status || '').toLowerCase();
  if ((v as any).ativo === false || status === 'vendido' || status === 'arquivado') {
    return 'Veículo inativo (vendido/arquivado) — não faz mais checklist mensal.';
  }
  if ((v as any).checklist_desativado === true) {
    const motivo = String((v as any).checklist_desativado_motivo || '').trim();
    return `Checklist desativado neste veículo${motivo ? ` — ${motivo}` : '.'}`;
  }
  return null;
}

async function estaVinculado(placaCanon: string): Promise<boolean> {
  const { data: veic } = await supabase.from('frota_veiculos').select('id').eq('placa', placaCanon).maybeSingle();
  if (veic) {
    const { data: resp } = await supabase.from('frota_responsaveis').select('id, motorista_nome').eq('veiculo_id', veic.id).is('fim', null).maybeSingle();
    if (resp && !responsavelVazio(resp.motorista_nome)) return true;
  }
  const { data: tvs } = await supabase.from('tecnico_veiculos').select('placa');
  return (tvs || []).some((t) => resolverPlaca(extrairPlacaDeNumPlaca(t.placa)) === placaCanon);
}

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!temModuloFrota(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const placa = resolverPlaca(req.nextUrl.searchParams.get('placa') || '');
  if (!placa) return NextResponse.json({ error: 'Passe ?placa=' }, { status: 400 });

  const { data: checklist } = await supabase
    .from('veiculo_checklist')
    .select('*')
    .eq('placa', placa)
    .eq('mes_referencia', mesAtual())
    .maybeSingle();

  let itens: any[] = [];
  if (checklist) {
    const { data } = await supabase.from('veiculo_checklist_itens').select('*').eq('checklist_id', checklist.id).order('created_at');
    itens = data || [];
  }
  const { data: veic } = await supabase.from('frota_veiculos').select('placa_exibicao, modelo, marca').eq('placa', placa).maybeSingle();
  return NextResponse.json({ checklist: checklist || null, itens, items: CHECKLIST_ITEMS, veiculo: veic || null });
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!temModuloFrota(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const contentType = req.headers.get('content-type') || '';

  // ── salvar_item (multipart, com foto) ──
  if (contentType.includes('multipart/form-data')) {
    const fd = await req.formData();
    if ((fd.get('action') as string) !== 'salvar_item') return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
    const checklistId = fd.get('checklist_id') as string;
    const itemKey = fd.get('item_key') as string;
    const resposta = fd.get('resposta') as string;
    const observacao = (fd.get('observacao') as string) || '';
    const categoria = fd.get('categoria') as string;
    const titulo = fd.get('titulo') as string;
    const foto = fd.get('foto') as File | null;
    if (!checklistId || !itemKey) return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 });

    let fotoUrl: string | null = null;
    let fotoTamanho: number | null = null;
    if (foto) {
      const ext = foto.name.split('.').pop() || 'jpg';
      const path = `checklist/${checklistId}/${itemKey}.${ext}`;
      const buffer = Buffer.from(await foto.arrayBuffer());
      fotoTamanho = buffer.length;
      const { error: upErr } = await supabase.storage.from('requisicoes').upload(path, buffer, { upsert: true, contentType: foto.type });
      if (upErr) return NextResponse.json({ error: `Falha no upload da foto: ${upErr.message}` }, { status: 500 });
      fotoUrl = supabase.storage.from('requisicoes').getPublicUrl(path).data.publicUrl;
    }

    const { data: existing } = await supabase.from('veiculo_checklist_itens').select('id').eq('checklist_id', checklistId).eq('item_key', itemKey).maybeSingle();
    if (existing) {
      await supabase.from('veiculo_checklist_itens').update({ resposta, observacao, foto_url: fotoUrl, foto_tamanho: fotoTamanho, respondido_em: new Date().toISOString() }).eq('id', existing.id);
    } else {
      await supabase.from('veiculo_checklist_itens').insert({ checklist_id: checklistId, item_key: itemKey, categoria, titulo, resposta, observacao, foto_url: fotoUrl, foto_tamanho: fotoTamanho, respondido_em: new Date().toISOString() });
    }
    await supabase.from('veiculo_checklist').update({ status: 'em_andamento' }).eq('id', checklistId).eq('status', 'pendente');
    return NextResponse.json({ ok: true, foto_url: fotoUrl });
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action;

  // ── iniciar ──
  if (action === 'iniciar') {
    const placa = resolverPlaca(body.placa || '');
    if (!placa) return NextResponse.json({ error: 'Placa inválida' }, { status: 400 });
    const bloqueio = await checklistBloqueado(placa);
    if (bloqueio) return NextResponse.json({ error: bloqueio }, { status: 400 });
    if (await estaVinculado(placa)) {
      return NextResponse.json({ error: 'Este veículo tem responsável — o checklist é feito por quem é responsável.' }, { status: 400 });
    }
    const mesRef = mesAtual();
    const { data: existente } = await supabase.from('veiculo_checklist').select('id, status').eq('placa', placa).eq('mes_referencia', mesRef).maybeSingle();
    if (existente) {
      if (existente.status === 'completo' || existente.status === 'suspeito') {
        return NextResponse.json({ error: 'Checklist deste mês já foi concluído.' }, { status: 400 });
      }
      if (body.km) await supabase.from('veiculo_checklist').update({ km: Number(body.km) }).eq('id', existente.id);
      const { data: itens } = await supabase.from('veiculo_checklist_itens').select('*').eq('checklist_id', existente.id).order('created_at');
      return NextResponse.json({ id: existente.id, itens: itens || [], items: CHECKLIST_ITEMS });
    }

    const insertData: Record<string, any> = {
      tecnico_nome: await nomeDoUsuario(auth.userId, auth.email),
      placa, mes_referencia: mesRef, status: 'pendente',
      share_token: randomUUID().replace(/-/g, ''),
      inicio_em: new Date().toISOString(), loc_inicio: body.loc || null,
    };
    if (body.km) insertData.km = Number(body.km);
    const { data, error } = await supabase.from('veiculo_checklist').insert(insertData).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ id: data.id, itens: [], items: CHECKLIST_ITEMS });
  }

  // ── concluir ──
  if (action === 'concluir') {
    const { checklist_id, loc } = body;
    const { data: checklist } = await supabase.from('veiculo_checklist').select('*').eq('id', checklist_id).single();
    if (!checklist) return NextResponse.json({ error: 'Checklist não encontrado' }, { status: 404 });
    const { data: itens } = await supabase.from('veiculo_checklist_itens').select('*').eq('checklist_id', checklist_id);
    if (!itens || itens.length === 0) return NextResponse.json({ error: 'Nenhum item foi salvo. Refaça o checklist.' }, { status: 400 });

    const duracao = Math.round((Date.now() - new Date(checklist.inicio_em).getTime()) / 1000);
    const { score, alertas } = calcularScore({ ...checklist, duracao_total_seg: duracao, loc_fim: loc }, itens);
    const status = score < 50 ? 'suspeito' : 'completo';

    const [refY, refM] = String(checklist.mes_referencia || '').split('-');
    const mesNome = new Date(Number(refY), Number(refM) - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    let titulo = `Checklist ${checklist.placa} de ${mesNome}`;
    if (checklist.km) titulo += ` com ${Number(checklist.km).toLocaleString('pt-BR')} km`;

    const { error } = await supabase.from('veiculo_checklist').update({
      status, fim_em: new Date().toISOString(), duracao_total_seg: duracao,
      score_confianca: score, alertas: JSON.stringify(alertas), loc_fim: loc, titulo,
    }).eq('id', checklist_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: full } = await supabase.from('veiculo_checklist').select('share_token').eq('id', checklist_id).maybeSingle();
    return NextResponse.json({ status, score, alertas, duracao, titulo, share_token: full?.share_token || null });
  }

  return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
}
