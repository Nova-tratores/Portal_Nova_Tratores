// Anexos de MULTA (auto de infração, boleto, comprovante de pagamento,
// defesa...). O arquivo sobe pro bucket frota-documentos (multas/{id}/...)
// e a lista fica em frota_multas.anexos (JSONB [{url, nome, por, em}]).
//   POST   FormData { multa_id, file }   (frota:multas:editar)
//   DELETE ?multa_id=&url=               (frota:multas:editar)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { logFrota, podeFrota } from '@/lib/frota/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BUCKET = 'frota-documentos';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

interface Anexo { url: string; nome: string; por: string | null; em: string }

async function acharMulta(id: string) {
  const { data } = await supabase
    .from('frota_multas')
    .select('id, placa, numero_auto, anexos')
    .eq('id', id)
    .maybeSingle();
  return data;
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeFrota(auth, 'multas:editar')) {
    return NextResponse.json({ error: 'Sem permissão para editar multas.' }, { status: 403 });
  }

  const form = await req.formData();
  const multaId = String(form.get('multa_id') || '');
  const file = form.get('file') as File | null;
  if (!multaId) return NextResponse.json({ error: 'Informe a multa.' }, { status: 400 });
  if (!file || file.size === 0) return NextResponse.json({ error: 'Envie o arquivo.' }, { status: 400 });
  if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: 'Arquivo acima de 15 MB.' }, { status: 400 });

  const multa = await acharMulta(multaId);
  if (!multa) return NextResponse.json({ error: 'Multa não encontrada.' }, { status: 404 });

  const seguro = (file.name || 'anexo').replace(/[^\w.\-]+/g, '_').slice(-80);
  const path = `multas/${multa.id}/${Date.now()}_${seguro}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: errUp } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type || 'application/octet-stream', upsert: true });
  if (errUp) return NextResponse.json({ error: `Upload: ${errUp.message}` }, { status: 500 });

  const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const anexo: Anexo = { url, nome: file.name || seguro, por: auth.email || null, em: new Date().toISOString() };
  const anexos = [...(Array.isArray(multa.anexos) ? multa.anexos : []), anexo];

  const { error } = await supabase.from('frota_multas').update({ anexos }).eq('id', multa.id);
  if (error) {
    const msg = /anexos/.test(error.message)
      ? 'Aplique a migração sql/frota-venda.sql no Supabase (coluna anexos em frota_multas).'
      : error.message;
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  await logFrota(auth, {
    acao: 'anexar',
    entidade: 'multa',
    entidadeId: multa.id,
    entidadeLabel: `Multa ${multa.numero_auto || ''} · ${multa.placa}`.trim(),
    detalhes: { arquivo: anexo.nome },
  });

  return NextResponse.json({ ok: true, anexos });
}

export async function DELETE(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeFrota(auth, 'multas:editar')) {
    return NextResponse.json({ error: 'Sem permissão para editar multas.' }, { status: 403 });
  }

  const multaId = req.nextUrl.searchParams.get('multa_id') || '';
  const url = req.nextUrl.searchParams.get('url') || '';
  if (!multaId || !url) return NextResponse.json({ error: 'Informe multa_id e url.' }, { status: 400 });

  const multa = await acharMulta(multaId);
  if (!multa) return NextResponse.json({ error: 'Multa não encontrada.' }, { status: 404 });

  const antes = (Array.isArray(multa.anexos) ? multa.anexos : []) as Anexo[];
  const removido = antes.find((a) => a.url === url);
  if (!removido) return NextResponse.json({ error: 'Anexo não encontrado nesta multa.' }, { status: 404 });

  const { error } = await supabase
    .from('frota_multas')
    .update({ anexos: antes.filter((a) => a.url !== url) })
    .eq('id', multa.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // arquivo no Storage: best-effort (a linha é a fonte da verdade)
  const marca = `/object/public/${BUCKET}/`;
  const i = url.indexOf(marca);
  if (i >= 0) {
    await supabase.storage.from(BUCKET).remove([decodeURIComponent(url.slice(i + marca.length))]).catch(() => {});
  }

  await logFrota(auth, {
    acao: 'remover_anexo',
    entidade: 'multa',
    entidadeId: multa.id,
    entidadeLabel: `Multa ${multa.numero_auto || ''} · ${multa.placa}`.trim(),
    detalhes: { arquivo: removido.nome },
  });

  return NextResponse.json({ ok: true });
}
