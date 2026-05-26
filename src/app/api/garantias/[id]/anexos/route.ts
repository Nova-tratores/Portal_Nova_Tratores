import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS, TBL_GAR_ANEXOS, BUCKET_GARANTIAS } from '@/lib/garantias/constants';
import { registrarEvento } from '@/lib/garantias/server';

const CATEGORIAS = ['tecnico', 'garantista', 'pendencia_pedido', 'pendencia_resposta', 'retorno_fabrica', 'envio_fabrica'];

function sanitize(name: string) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9.\-_]/g, '');
}

// POST /api/garantias/[id]/anexos — upload via FormData
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const form = await req.formData();
  const file = form.get('file') as File | null;
  const categoria = String(form.get('categoria') || 'garantista');
  const enviadoPor = String(form.get('enviado_por') || '') || null;
  const pendenciaId = (form.get('pendencia_id') as string) || null;

  if (!file) return NextResponse.json({ error: 'Arquivo é obrigatório.' }, { status: 400 });
  if (!CATEGORIAS.includes(categoria)) {
    return NextResponse.json({ error: 'Categoria inválida.' }, { status: 400 });
  }

  const { data: g } = await supabase
    .from(TBL_GARANTIAS)
    .select('id, numero')
    .eq('id', id)
    .maybeSingle();
  if (!g) return NextResponse.json({ error: 'Garantia não encontrada.' }, { status: 404 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split('.').pop() || 'dat';
  const path = `${id}/${categoria}/${Date.now()}_${sanitize(file.name) || 'arquivo.' + ext}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET_GARANTIAS)
    .upload(path, buffer, { contentType: file.type || 'application/octet-stream', upsert: true });
  if (upErr) {
    console.error('Erro no upload de anexo:', upErr.message);
    return NextResponse.json({ error: 'Falha ao enviar o arquivo.' }, { status: 500 });
  }
  const { data: pub } = supabase.storage.from(BUCKET_GARANTIAS).getPublicUrl(path);
  const url = pub.publicUrl;

  const { data: anexo, error } = await supabase
    .from(TBL_GAR_ANEXOS)
    .insert({
      garantia_id: id,
      pendencia_id: pendenciaId,
      categoria,
      url,
      nome_arquivo: file.name,
      content_type: file.type || null,
      enviado_por: enviadoPor,
    })
    .select()
    .single();
  if (error) {
    console.error('Erro ao registrar anexo:', error.message);
    return NextResponse.json({ error: 'Falha ao registrar o anexo.' }, { status: 500 });
  }

  // Retorno da fábrica também grava a coluna obrigatória da garantia
  if (categoria === 'retorno_fabrica') {
    await supabase
      .from(TBL_GARANTIAS)
      .update({ retorno_fabrica_url: url, updated_at: new Date().toISOString() })
      .eq('id', id);
    await registrarEvento(id, {
      tipo: 'retorno_fabrica',
      ator: enviadoPor || 'Garantista',
      detalhe: 'Arquivo de retorno da fábrica anexado',
    });
  }

  return NextResponse.json({ anexo });
}

// DELETE /api/garantias/[id]/anexos?anexo=<id>
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const anexoId = req.nextUrl.searchParams.get('anexo');
  if (!anexoId) return NextResponse.json({ error: 'Anexo não informado.' }, { status: 400 });

  const { data: anexo } = await supabase
    .from(TBL_GAR_ANEXOS)
    .select('*')
    .eq('id', anexoId)
    .eq('garantia_id', id)
    .maybeSingle();
  if (!anexo) return NextResponse.json({ error: 'Anexo não encontrado.' }, { status: 404 });

  await supabase.from(TBL_GAR_ANEXOS).delete().eq('id', anexoId);

  if (anexo.categoria === 'retorno_fabrica') {
    await supabase.from(TBL_GARANTIAS).update({ retorno_fabrica_url: null }).eq('id', id);
  }

  return NextResponse.json({ success: true });
}
