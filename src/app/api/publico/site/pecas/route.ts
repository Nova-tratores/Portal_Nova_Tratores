// Peças em estoque para o catálogo do site (aberto, sem login). Só "tem em estoque": sem preço e sem quantidade
// (decisão do José, 10/11/2026). ?grupo=mahindra|outras &q=busca &pagina=1.
// Cada peça: foto (bucket "site-pecas", se houver), nome, "serve em" (modelos) e o desenho da fábrica (Mahindra).
// Memória para não pesar no banco: estoque e lista de fotos 10 min; catálogo (modelos/desenhos) 6 h.
import { NextResponse } from 'next/server'
import { corsSite, passouLimite, sb } from '@/lib/marketing/redes/server'
import { buscarPecas, montarPecas, type GrupoPeca, type PecaSite, type ProdutoEstoque } from '@/lib/marketing/redes/pecas'
import { chaveCodigo, lerCatalogo, lerFotos, type DoCatalogo } from '@/lib/marketing/redes/desenhos'
import { modeloDaDescricao, servem } from '@/lib/marketing/redes/modelos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const POR_PAGINA = 30
const URL_FOTOS = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/site-pecas/`
let estoque: { em: number; pecas: PecaSite[]; fotos: Set<string> } | null = null
let catalogo: { em: number; dados: Map<string, DoCatalogo> } | null = null

async function carregar() {
  if (!estoque || Date.now() - estoque.em > 10 * 60_000) {
    const todos: ProdutoEstoque[] = []
    for (let de = 0; de < 20_000; de += 1000) {
      const { data, error } = await sb.from('produtos').select('codigo, descricao, marca, imagem_url')
        .eq('familia_nome', 'Peças').gt('estoque', 0).not('inativo', 'is', true).not('arquivado', 'is', true)
        .order('codigo').range(de, de + 999)
      if (error) throw new Error(error.message)
      todos.push(...((data || []) as ProdutoEstoque[]))
      if (!data || data.length < 1000) break
    }
    const fotos = await lerFotos().catch(() => new Set<string>())
    estoque = { em: Date.now(), pecas: montarPecas(todos), fotos }
  }
  if (!catalogo || Date.now() - catalogo.em > 6 * 3600_000) {
    // se falhar, segue sem modelos/desenhos e tenta de novo na próxima vez
    const dados = await lerCatalogo(estoque.pecas).catch(() => null)
    if (dados) catalogo = { em: Date.now(), dados }
  }
  return { pecas: estoque.pecas, fotos: estoque.fotos, cat: catalogo?.dados || new Map<string, DoCatalogo>() }
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
    const { pecas, fotos, cat } = await carregar()
    const achadas = buscarPecas(pecas, q, grupo)
    const itens = achadas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA).map((x) => {
      const c = cat.get(x.codigo)
      const chave = chaveCodigo(x.codigo)
      return {
        codigo: x.codigo, nome: x.nome, grupo: x.grupo, marca: x.marca,
        foto: fotos.has(chave) ? `${URL_FOTOS}${chave}.webp` : x.foto,
        serve: servem(c?.modelos || [], modeloDaDescricao(x.nome, x.grupo)),
        desenho: c?.desenho || null,
      }
    })
    return NextResponse.json({
      ok: true, total: achadas.length, pagina, porPagina: POR_PAGINA, itens,
      contagem: { mahindra: pecas.filter((x) => x.grupo === 'mahindra').length, outras: pecas.filter((x) => x.grupo === 'outras').length, comFoto: fotos.size },
    }, { headers: cors })
  } catch (e) {
    console.warn('[site/pecas]', e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: false, itens: [], total: 0 }, { status: 500, headers: cors })
  }
}
