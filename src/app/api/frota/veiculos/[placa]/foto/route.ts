// POST /api/frota/veiculos/[placa]/foto — troca a FOTO do veículo pela Ficha.
//
// A foto mora em Placas.imagem_url (é a mesma que o Visual Estoque e os cards
// usam), então o veículo precisa do vínculo id_placa. O arquivo sobe pro
// bucket frota-documentos (path {placa}/foto/...) e a URL pública é gravada.
// Permissão: frota:veiculos:editar.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { logFrota, podeFrota } from '@/lib/frota/server';
import { resolverPlaca } from '@/lib/frota/placa';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BUCKET = 'frota-documentos';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

export async function POST(req: NextRequest, { params }: { params: Promise<{ placa: string }> }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeFrota(auth, 'veiculos:editar')) {
    return NextResponse.json({ error: 'Sem permissão para editar veículos.' }, { status: 403 });
  }

  const { placa: placaParam } = await params;
  const placa = resolverPlaca(decodeURIComponent(placaParam));
  const { data: v } = await supabase
    .from('frota_veiculos')
    .select('id, placa, placa_exibicao, id_placa')
    .eq('placa', placa)
    .maybeSingle();
  if (!v) return NextResponse.json({ error: 'Veículo não encontrado.' }, { status: 404 });
  if (v.id_placa == null) {
    return NextResponse.json(
      { error: 'Este veículo não tem cadastro no Visual Estoque (Placas) — a foto mora lá. Fale com o admin pra criar o vínculo.' },
      { status: 400 },
    );
  }

  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file || file.size === 0) return NextResponse.json({ error: 'Envie a imagem.' }, { status: 400 });
  if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: 'Imagem acima de 8 MB.' }, { status: 400 });
  if (!/^image\//.test(file.type || '')) return NextResponse.json({ error: 'O arquivo precisa ser uma imagem.' }, { status: 400 });

  const seguro = (file.name || 'foto.jpg').replace(/[^\w.\-]+/g, '_').slice(-60);
  const path = `${v.placa}/foto/${Date.now()}_${seguro}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: errUp } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type || 'image/jpeg', upsert: true });
  if (errUp) return NextResponse.json({ error: `Upload: ${errUp.message}` }, { status: 500 });

  const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const { error } = await supabase.from('Placas').update({ imagem_url: url }).eq('IdPlaca', v.id_placa);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logFrota(auth, {
    acao: 'editar',
    entidade: 'veiculo',
    entidadeId: v.placa,
    entidadeLabel: `${v.placa_exibicao || v.placa} · foto`,
    detalhes: { alterados: { imagem_url: { de: '(anterior)', para: url } } },
  });

  return NextResponse.json({ ok: true, imagem_url: url });
}
