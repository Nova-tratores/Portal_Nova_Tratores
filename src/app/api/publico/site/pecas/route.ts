// Peças em estoque para o catálogo do site (aberto, sem login). Só "tem em estoque": sem preço e sem quantidade
// (decisão do José, 10/11/2026). ?grupo=mahindra|outras &q=busca &pagina=1. Cache do estoque: 10 min.
import { NextResponse } from 'next/server'
import { corsSite, passouLimite, sb } from '@/lib/site/server'
import { buscarPecas, montarPecas, type GrupoPeca, type PecaSite, type ProdutoEstoque } from '@/lib/site/pecas'
import { anexarDesenhos, type Desenho } from '@/lib/site/desenhos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const POR_PAGINA = 30
let cache: { em: number; pecas: PecaSite[]; desenhos: Map<string, Desenho> } | null = null

async function carregar() {
  if (cache && Date.now() - cache.em < 10 * 60_000) return cache
  const todos: ProdutoEstoque[] = []
  for (let de = 0; de < 20_000; de += 1000) {
    const { data, error } = await sb.from('produtos').select('codigo, descricao, marca, imagem_url')
      .eq('familia_nome', 'Peças').gt('estoque', 0).not('inativo', 'is', true).not('arquivado', 'is', true)
      .order('codigo').range(de, de + 999)
    if (error) throw new Error(error.message)
    todos.push(...((data || []) as ProdutoEstoque[]))
    if (!data || data.length < 1000) break
  }
  const pecas = montarPecas(todos)
  // desenho da fábrica (vista explodida) para as Mahindra que estão no catálogo do portal; se falhar, segue sem
  const desenhos = await anexarDesenhos(pecas).catch(() => new Map<string, Desenho>())
  cache = { em: Date.now(), pecas, desenhos }
  return cache
}

export function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsSite(req) })
}

export async function GET(req: Request) {
  const cors = { ...corsSite(req), 'Cache-Control': 'public, max-age=120' }
  if (passouLimite(req, 'site-pecas', 120, 60_000)) return NextResponse.json({ ok: false }, { status: 429, headers: cors })
  const u = new URL(req.url)
  const grupo = (['mahindra', 'outras'].includes(u.searchParams.get('grupo') || '') ? u.searchParams.get('grupo') : undefined) as GrupoPeca | undefined
  const q = (u.searchParams.get('q') || '').slice(0, 80)
  const pagina = Math.max(1, Math.min(Number(u.searchParams.get('pagina')) || 1, 200))
  try {
    const { pecas, desenhos } = await carregar()
    const achadas = buscarPecas(pecas, q, grupo)
    const itens = achadas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA).map((x) => ({ codigo: x.codigo, nome: x.nome, grupo: x.grupo, marca: x.marca, foto: x.foto, desenho: desenhos.get(x.codigo) || null }))
    return NextResponse.json({
      ok: true, total: achadas.length, pagina, porPagina: POR_PAGINA, itens,
      contagem: { mahindra: pecas.filter((x) => x.grupo === 'mahindra').length, outras: pecas.filter((x) => x.grupo === 'outras').length, comDesenho: desenhos.size },
    }, { headers: cors })
  } catch (e) {
    console.warn('[site/pecas]', e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: false, itens: [], total: 0 }, { status: 500, headers: cors })
  }
}
