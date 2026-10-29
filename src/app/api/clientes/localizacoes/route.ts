// Localizações do cliente (fazendas) na Pasta Clientes (José, 29/10/2026: "a localização salva no POS antes de faturar tem
// que aparecer na pasta do cliente, com um mapinha, e conseguir alterar também"). Mesma tabela da trava do faturar
// (clientes_localizacoes, por CPF/CNPJ).
// GET  ?doc=            → { localizacoes, semTabela }
// POST { acao:'link', url }                                → { lat, lng } (link do Google Maps, inclusive o curto)
//      { doc, cliente, nome, lat, lng, origem? }           → adiciona
//      { doc, acao:'renomear'|'mover'|'remover', id, ... } → altera uma do mesmo cliente
import { NextRequest, NextResponse } from 'next/server';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { localizacoesDoDocumento, adicionarLocalizacao, alterarLocalizacao } from '@/lib/pos/localizacao-cliente-server';
import { coordenadaDoLink } from '@/lib/clientes/link-maps-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'clientes' }, { modulo: 'pos' }]);
  if (g.resposta) return g.resposta;
  const doc = soDigitos(req.nextUrl.searchParams.get('doc'));
  if (doc.length !== 11 && doc.length !== 14) return NextResponse.json({ localizacoes: [], semTabela: false });
  try {
    const { lista, semTabela } = await localizacoesDoDocumento(doc);
    return NextResponse.json({ localizacoes: lista, semTabela });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'clientes' }, { modulo: 'pos' }]);
  if (g.resposta) return g.resposta;
  const autor = g.user.email || g.user.id;
  const b = await req.json().catch(() => ({}));
  try {
    if (b?.acao === 'link') {
      const c = await coordenadaDoLink(String(b.url || ''));
      if (!c) return NextResponse.json({ error: 'Não achei a coordenada nesse link. No Google Maps, toque no lugar, em Compartilhar e copie o link (ou cole a coordenada, ex.: -23.19, -49.38).' }, { status: 400 });
      return NextResponse.json(c);
    }
    const doc = soDigitos(b?.doc);
    if (doc.length !== 11 && doc.length !== 14) return NextResponse.json({ error: 'O cliente está sem CPF/CNPJ válido.' }, { status: 400 });
    if (b?.acao === 'renomear' || b?.acao === 'remover' || b?.acao === 'mover') {
      const acao = b.acao === 'remover' ? { remover: true as const } : b.acao === 'mover' ? { lat: Number(b.lat), lng: Number(b.lng) } : { nome: String(b.nome || '') };
      await alterarLocalizacao(doc, String(b.id || ''), acao, autor);
      return NextResponse.json({ ok: true });
    }
    const origem = b?.origem === 'link' ? 'link' : 'manual';
    const loc = await adicionarLocalizacao({ documento: doc, cliente: String(b?.cliente || ''), nome: String(b?.nome || ''), lat: Number(b?.lat), lng: Number(b?.lng), origem, autor });
    return NextResponse.json({ ok: true, localizacao: loc });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = /inválid|sem CPF|SQL|nome|já está cadastrada|Já existe|não é deste/.test(msg) ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
