import { NextRequest, NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { fotoForaDoCatalogo, slugCatalogoDoModelo } from '@/lib/catalogo/foto-modelo';

export const dynamic = 'force-dynamic';

// GET /api/catalogo/foto-maquina?modelo=6075E%20CAB&chassi=MDI0751…
// Foto do trator para os cartões (fila Hoje, tratores vendidos…): 1º a do CATÁLOGO de
// peças pelo modelo (pedido do José, 26/10/2026); sem o modelo no catálogo, a foto do
// produto daquele chassi no cadastro do Omie. Só leitura; qualquer pessoa logada.

let catalogo: { em: number; fotos: Map<string, { url: string; nome: string }> } | null = null;
async function fotosCatalogo() {
  if (catalogo && Date.now() - catalogo.em < 3_600_000) return catalogo.fotos;
  const { data } = await supabaseAdmin.from('catalogo_modelos').select('slug, nome, image_url').not('image_url', 'is', null);
  const fotos = new Map((data || []).map((m) => [String(m.slug), { url: String(m.image_url), nome: String(m.nome) }]));
  catalogo = { em: Date.now(), fotos };
  return fotos;
}

export async function GET(req: NextRequest) {
  if (!(await autenticar(req))) return NextResponse.json({ ok: false, erro: 'Não autenticado' }, { status: 401 });
  const modelo = (req.nextUrl.searchParams.get('modelo') || '').slice(0, 120);
  const chassi = (req.nextUrl.searchParams.get('chassi') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 30);
  try {
    const slug = slugCatalogoDoModelo(modelo);
    const doCatalogo = slug ? (await fotosCatalogo()).get(slug) : undefined;
    if (doCatalogo) return NextResponse.json({ ok: true, url: doCatalogo.url, fonte: 'catalogo', nome: doCatalogo.nome }, { headers: { 'Cache-Control': 'private, max-age=3600' } });
    const fora = fotoForaDoCatalogo(modelo);
    if (fora) {
      const url = supabaseAdmin.storage.from('catalogo').getPublicUrl(fora).data.publicUrl;
      return NextResponse.json({ ok: true, url, fonte: 'catalogo', nome: null }, { headers: { 'Cache-Control': 'private, max-age=3600' } });
    }
    if (chassi.length >= 7) {
      const { data } = await supabaseAdmin.from('produtos').select('imagem_url, descricao')
        .ilike('codigo', `%${chassi.slice(-7)}`).ilike('familia_nome', 'Trator%').not('imagem_url', 'is', null).limit(1);
      const url = data?.[0]?.imagem_url;
      if (url && /^https:\/\//.test(url)) return NextResponse.json({ ok: true, url, fonte: 'produto', nome: null }, { headers: { 'Cache-Control': 'private, max-age=3600' } });
    }
    return NextResponse.json({ ok: true, url: null, fonte: null, nome: null });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
