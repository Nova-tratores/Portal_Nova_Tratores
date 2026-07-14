// Documentos do veículo (CRLV, apólice, IPVA, licenciamento, laudo...).
//   GET    ?veiculo_id=|placa=   lista (módulo)
//   POST   FormData              upload + linha (frota:documentos:editar)
//   DELETE ?id=                  remove linha + arquivo (frota:documentos:editar)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { logFrota, podeFrota, temModuloFrota } from '@/lib/frota/server';
import { resolverPlaca } from '@/lib/frota/placa';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BUCKET = 'frota-documentos';
const TIPOS = new Set(['crlv', 'seguro', 'ipva', 'licenciamento', 'contrato_locacao', 'laudo', 'outros']);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!temModuloFrota(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  let q = supabase.from('frota_documentos').select('*').order('vigencia_fim', { ascending: true, nullsFirst: false });
  const veiculoId = req.nextUrl.searchParams.get('veiculo_id');
  const placa = req.nextUrl.searchParams.get('placa');
  if (veiculoId) q = q.eq('veiculo_id', veiculoId);
  else if (placa) {
    const { data: v } = await supabase
      .from('frota_veiculos')
      .select('id')
      .eq('placa', resolverPlaca(placa))
      .maybeSingle();
    if (!v) return NextResponse.json({ documentos: [] });
    q = q.eq('veiculo_id', v.id);
  }
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ documentos: data || [] });
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeFrota(auth, 'documentos:editar')) {
    return NextResponse.json({ error: 'Sem permissão para enviar documentos.' }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get('file') as File | null;
  const veiculoId = String(form.get('veiculo_id') || '');
  const tipo = String(form.get('tipo') || 'outros');
  if (!veiculoId) return NextResponse.json({ error: 'Informe o veículo.' }, { status: 400 });
  if (!TIPOS.has(tipo)) return NextResponse.json({ error: 'Tipo de documento inválido.' }, { status: 400 });

  const { data: v } = await supabase
    .from('frota_veiculos')
    .select('id, placa, placa_exibicao')
    .eq('id', veiculoId)
    .maybeSingle();
  if (!v) return NextResponse.json({ error: 'Veículo não encontrado.' }, { status: 404 });

  let arquivoUrl: string | null = null;
  let nomeArquivo: string | null = null;
  if (file && file.size > 0) {
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: 'Arquivo acima de 15 MB.' }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    nomeArquivo = file.name;
    const seguro = file.name.replace(/[^\w.\-]+/g, '_').slice(-80);
    const path = `${v.placa}/${tipo}/${Date.now()}_${seguro}`;
    const { error: errUp } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: file.type || 'application/octet-stream', upsert: true });
    if (errUp) return NextResponse.json({ error: `Upload: ${errUp.message}` }, { status: 500 });
    arquivoUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  const dataOuNull = (k: string) => {
    const s = String(form.get(k) || '');
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  };
  const { data: doc, error } = await supabase
    .from('frota_documentos')
    .insert({
      veiculo_id: v.id,
      tipo,
      numero: String(form.get('numero') || '').trim() || null,
      emissor: String(form.get('emissor') || '').trim() || null,
      vigencia_inicio: dataOuNull('vigencia_inicio'),
      vigencia_fim: dataOuNull('vigencia_fim'),
      valor: Number(form.get('valor')) || null,
      arquivo_url: arquivoUrl,
      nome_arquivo: nomeArquivo,
      obs: String(form.get('obs') || '').trim() || null,
      criado_por: auth.email,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logFrota(auth, {
    acao: 'upload',
    entidade: 'documento',
    entidadeId: doc.id,
    entidadeLabel: `${tipo.toUpperCase()} · ${v.placa_exibicao || v.placa}`,
    detalhes: { tipo, vigencia_fim: doc.vigencia_fim, arquivo: nomeArquivo },
  });

  return NextResponse.json({ ok: true, documento: doc });
}

export async function DELETE(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeFrota(auth, 'documentos:editar')) {
    return NextResponse.json({ error: 'Sem permissão para excluir documentos.' }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get('id') || '';
  if (!id) return NextResponse.json({ error: 'Informe o id.' }, { status: 400 });

  const { data: doc } = await supabase.from('frota_documentos').select('*').eq('id', id).maybeSingle();
  if (!doc) return NextResponse.json({ error: 'Documento não encontrado.' }, { status: 404 });

  // apaga o arquivo do Storage (best-effort; a linha é a fonte da verdade)
  if (doc.arquivo_url) {
    const marca = `/object/public/${BUCKET}/`;
    const i = doc.arquivo_url.indexOf(marca);
    if (i >= 0) {
      const path = decodeURIComponent(doc.arquivo_url.slice(i + marca.length));
      await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    }
  }
  const { error } = await supabase.from('frota_documentos').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logFrota(auth, {
    acao: 'deletar',
    entidade: 'documento',
    entidadeId: id,
    entidadeLabel: `${String(doc.tipo).toUpperCase()} · ${doc.nome_arquivo || id.slice(0, 8)}`,
  });

  return NextResponse.json({ ok: true });
}
