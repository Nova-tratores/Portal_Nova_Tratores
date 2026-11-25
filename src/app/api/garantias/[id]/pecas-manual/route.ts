import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS, TBL_GAR_PECAS, STATUS_FINALIZADOS } from '@/lib/garantias/constants';
import { registrarEvento } from '@/lib/garantias/server';
import { protegerRota, autorDe } from '@/lib/ajustes/permissao-server';
import { normalizarPeca } from '@/lib/garantias/so-pecas';

// Peças de garantia digitadas pelo garantista (garantia só de peças, sem OS).
// POST   { cod_produto?, descricao, quantidade, preco_unitario }  → inclui
// DELETE ?peca=<id>                                               → remove
// Só enquanto a garantia não foi enviada à fábrica nem finalizada.
const PERM = [{ modulo: 'garantias', acao: 'analisar' }, { modulo: 'garantias', acao: 'criar' }];
const EDITAVEIS = ['aberta', 'em_analise', 'bo_tecnico'];

async function carregar(id: string) {
  const { data } = await supabase.from(TBL_GARANTIAS).select('id, numero, status').eq('id', id).maybeSingle();
  if (!data) return { erro: NextResponse.json({ error: 'Garantia não encontrada.' }, { status: 404 }) };
  if ((STATUS_FINALIZADOS as string[]).includes(data.status) || !EDITAVEIS.includes(data.status)) {
    return { erro: NextResponse.json({ error: 'Só dá para mexer nas peças antes de enviar à fábrica.' }, { status: 409 }) };
  }
  return { g: data };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guarda = await protegerRota(req, PERM);
  if (guarda.resposta) return guarda.resposta;
  const { id } = await params;
  const r = await carregar(id);
  if (r.erro) return r.erro;
  const peca = normalizarPeca(await req.json().catch(() => ({})));
  if (!peca) return NextResponse.json({ error: 'Informe a descrição ou o código da peça.' }, { status: 400 });

  const { data, error } = await supabase
    .from(TBL_GAR_PECAS)
    .insert({ garantia_id: id, ...peca, origem: 'manual', fonte_ppv_id: null })
    .select()
    .single();
  if (error) return NextResponse.json({ error: 'Falha ao incluir a peça.' }, { status: 500 });
  await registrarEvento(id, {
    tipo: 'peca_incluida',
    ator: autorDe(guarda.user),
    detalhe: `Peça incluída: ${peca.cod_produto ? `${peca.cod_produto} · ` : ''}${peca.descricao} x${peca.quantidade}`,
  });
  return NextResponse.json({ peca: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guarda = await protegerRota(req, PERM);
  if (guarda.resposta) return guarda.resposta;
  const { id } = await params;
  const pecaId = req.nextUrl.searchParams.get('peca') || '';
  if (!pecaId) return NextResponse.json({ error: 'Peça não informada.' }, { status: 400 });
  const r = await carregar(id);
  if (r.erro) return r.erro;

  const { data: p } = await supabase
    .from(TBL_GAR_PECAS).select('id, cod_produto, descricao, quantidade')
    .eq('id', pecaId).eq('garantia_id', id).maybeSingle();
  if (!p) return NextResponse.json({ error: 'Peça não encontrada nesta garantia.' }, { status: 404 });
  const { error } = await supabase.from(TBL_GAR_PECAS).delete().eq('id', pecaId).eq('garantia_id', id);
  if (error) return NextResponse.json({ error: 'Falha ao remover a peça.' }, { status: 500 });
  await registrarEvento(id, {
    tipo: 'peca_removida',
    ator: autorDe(guarda.user),
    detalhe: `Peça removida: ${p.cod_produto ? `${p.cod_produto} · ` : ''}${p.descricao} x${p.quantidade}`,
  });
  return NextResponse.json({ ok: true });
}
