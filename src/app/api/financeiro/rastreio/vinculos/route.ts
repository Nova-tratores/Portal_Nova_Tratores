// RASTREIO DE NOTAS — vínculos MANUAIS entre documentos.
//   POST   { a: {tipo,id}, b: {tipo,id} }  → liga (idempotente)
//   DELETE { id } ou { a, b }              → desfaz
// Par canônico: ordena (tipo,id) antes de gravar — o UNIQUE do banco pega a
// duplicata invertida. Escrita só via service role (RLS sem policy de escrita).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { exigirPermissao } from '@/lib/ajustes/permissao-server';
import { registrarAuditLog } from '@/lib/server/audit-notify';
import type { RefDoc } from '@/lib/financeiro/rastreio/tipos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const TIPOS = new Set(['finan_pagar', 'requisicao', 'chamado_nf', 'nota_entrada', 'nota_saida', 'titulo_omie']);

function validarRef(x: any): RefDoc | null {
  const tipo = String(x?.tipo || '');
  const id = String(x?.id || '').trim();
  if (!TIPOS.has(tipo) || !id || id.length > 60) return null;
  return { tipo: tipo as RefDoc['tipo'], id };
}

// par canônico: menor primeiro (ordena por 'tipo:id')
function canonizar(a: RefDoc, b: RefDoc): [RefDoc, RefDoc] {
  return `${a.tipo}:${a.id}` <= `${b.tipo}:${b.id}` ? [a, b] : [b, a];
}

export async function POST(req: NextRequest) {
  try {
    const quem = await exigirPermissao(req, 'financeiro', 'rastreio');
    const body = await req.json().catch(() => ({}));
    const a = validarRef(body.a);
    const b = validarRef(body.b);
    if (!a || !b) return NextResponse.json({ error: 'Documentos inválidos.' }, { status: 400 });
    if (a.tipo === b.tipo && a.id === b.id) return NextResponse.json({ error: 'Não dá pra vincular um documento a ele mesmo.' }, { status: 400 });

    const [pa, pb] = canonizar(a, b);
    const { error } = await supabase.from('portal_doc_vinculos').upsert(
      {
        tipo_a: pa.tipo, id_a: pa.id, tipo_b: pb.tipo, id_b: pb.id,
        tipo_vinculo: 'liga',
        criado_por: quem.id,
        criado_por_nome: quem.nome || quem.email || '',
      },
      { onConflict: 'tipo_a,id_a,tipo_b,id_b', ignoreDuplicates: true },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    try {
      await registrarAuditLog({
        userId: quem.id, userName: quem.nome || quem.email || '',
        sistema: 'financeiro', acao: 'rastreio_vincular', entidade: 'doc_vinculo',
        entidadeId: `${pa.tipo}:${pa.id}`, entidadeLabel: `${pa.tipo} ${pa.id} ↔ ${pb.tipo} ${pb.id}`,
        detalhes: { a: pa, b: pb },
      });
    } catch { /* best-effort */ }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const st = (e as { http?: number })?.http || 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : 'erro' }, { status: st });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const quem = await exigirPermissao(req, 'financeiro', 'rastreio');
    const body = await req.json().catch(() => ({}));
    const auditar = async (rotulo: string) => {
      try {
        await registrarAuditLog({
          userId: quem.id, userName: quem.nome || quem.email || '',
          sistema: 'financeiro', acao: 'rastreio_desvincular', entidade: 'doc_vinculo',
          entidadeId: rotulo, entidadeLabel: rotulo, detalhes: {},
        });
      } catch { /* best-effort */ }
    };
    if (body.id != null) {
      const id = Number(body.id);
      if (!Number.isFinite(id)) return NextResponse.json({ error: 'id inválido.' }, { status: 400 });
      const { error } = await supabase.from('portal_doc_vinculos').delete().eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await auditar(`vinculo #${id}`);
      return NextResponse.json({ ok: true });
    }
    const a = validarRef(body.a);
    const b = validarRef(body.b);
    if (!a || !b) return NextResponse.json({ error: 'Informe o id do vínculo ou os dois documentos.' }, { status: 400 });
    const [pa, pb] = canonizar(a, b);
    const { error } = await supabase.from('portal_doc_vinculos').delete()
      .eq('tipo_a', pa.tipo).eq('id_a', pa.id).eq('tipo_b', pb.tipo).eq('id_b', pb.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await auditar(`${pa.tipo} ${pa.id} ↔ ${pb.tipo} ${pb.id}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const st = (e as { http?: number })?.http || 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : 'erro' }, { status: st });
  }
}
