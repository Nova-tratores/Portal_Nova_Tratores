// Máquinas do site editáveis pelo portal (José, 12/11/2026: "incluir, excluir ou alterar uma informação").
// Os campos espelham o schema do site (website/src/content.config.ts). Puro: testado em __tests__/produtos.test.ts.

export type Categoria = 'tratores' | 'implementos'
export interface Foto { src: string; alt: string }
export interface DadosProduto {
  slug: string
  categoria: Categoria
  titulo: string
  marca: string
  modelo: string
  potencia_cv?: number
  specs: Record<string, string>
  fotos: Foto[]
  ideal_para: string[]
  ideal_motivos: string[]
  pontos: string[]
  descricao_site: string
  meta_description: string
  exibir_preco: boolean
  preco?: number
  pronta_entrega: boolean
  publicar: boolean
}

/** Campos que a tela edita (os de preço/selo/ocultar continuam nas colunas próprias de site_catalogo). */
export const CAMPOS_EDITAVEIS = ['categoria', 'titulo', 'marca', 'modelo', 'potencia_cv', 'specs', 'fotos', 'ideal_para', 'ideal_motivos', 'pontos', 'descricao_site', 'meta_description'] as const
export type CampoEditavel = (typeof CAMPOS_EDITAVEIS)[number]

export const ROTULO_CAMPO: Record<CampoEditavel, string> = {
  categoria: 'Tipo', titulo: 'Nome', marca: 'Marca', modelo: 'Modelo', potencia_cv: 'Potência', specs: 'Ficha técnica',
  fotos: 'Fotos', ideal_para: 'Ideal para', ideal_motivos: 'Por que serve', pontos: 'Pontos fortes', descricao_site: 'Descrição', meta_description: 'Texto do Google',
}

const texto = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const lista = (v: unknown, max: number, tam: number) =>
  (Array.isArray(v) ? v : []).map((x) => texto(x, tam)).filter(Boolean).slice(0, max)

/** "Plantadeira Kuhn PG 7/9" → "plantadeira-kuhn-pg-7-9" (trator ganha "trator-" na frente, como no site). */
export function slugDe(titulo: string, categoria: Categoria): string {
  const s = titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100)
  return categoria === 'tratores' && !s.startsWith('trator-') ? `trator-${s}` : s
}

/** Texto do Google a partir da descrição (até 155 letras, cortando na palavra). */
export function metaDe(descricao: string, nome: string): string {
  const base = descricao.trim() || `${nome} na Nova Tratores, concessionária Mahindra em Piraju/SP.`
  if (base.length <= 155) return base
  return base.slice(0, 154).replace(/\s+\S*$/, '') + '…'
}

/**
 * Confere e limpa os campos mudados que vieram da tela. Só passa o que é editável; listas e ficha substituem inteiras.
 * Devolve o erro do primeiro campo ruim.
 */
export function limparDados(b: Record<string, unknown>): { ok: true; dados: Partial<DadosProduto> } | { ok: false; erro: string } {
  const d: Partial<DadosProduto> = {}
  for (const c of CAMPOS_EDITAVEIS) {
    if (!(c in b)) continue
    const v = b[c]
    switch (c) {
      case 'categoria':
        if (v !== 'tratores' && v !== 'implementos') return { ok: false, erro: 'Tipo: trator ou implemento' }
        d.categoria = v; break
      case 'titulo': case 'marca': case 'modelo': {
        const t = texto(v, c === 'titulo' ? 120 : 60)
        if (!t) return { ok: false, erro: `${ROTULO_CAMPO[c]} não pode ficar vazio` }
        d[c] = t; break
      }
      case 'potencia_cv': {
        if (v === null || v === '' || v === undefined) { d.potencia_cv = undefined; break }
        const n = Math.round(Number(v))
        if (!Number.isFinite(n) || n < 5 || n > 600) return { ok: false, erro: 'Potência: número de cv entre 5 e 600' }
        d.potencia_cv = n; break
      }
      case 'descricao_site': d.descricao_site = String(v ?? '').trim().slice(0, 2000); break
      case 'meta_description': d.meta_description = texto(v, 160); break
      case 'ideal_para': d.ideal_para = lista(v, 8, 80); break
      case 'ideal_motivos': d.ideal_motivos = lista(v, 8, 200); break
      case 'pontos': d.pontos = lista(v, 12, 200); break
      case 'specs': {
        const o: Record<string, string> = {}
        const pares = Array.isArray(v) ? v : Object.entries((v as Record<string, unknown>) || {})
        for (const p of pares.slice(0, 40)) {
          const [k, val] = Array.isArray(p) ? p : [(p as { nome?: unknown }).nome, (p as { valor?: unknown }).valor]
          const kk = texto(k, 60), vv = texto(val, 200)
          if (kk && vv) o[kk] = vv
        }
        d.specs = o; break
      }
      case 'fotos': {
        const fotos: Foto[] = []
        for (const f of (Array.isArray(v) ? v : []).slice(0, 20)) {
          const src = texto((f as Foto)?.src, 400)
          // caminho do site (pasta/arquivo.jpg) ou URL https do Storage
          if (!src || !(/^https:\/\//.test(src) || /^[\w.-]+\/[\w./-]+\.(png|jpe?g|webp|avif)$/i.test(src))) return { ok: false, erro: 'Foto com endereço inválido' }
          fotos.push({ src, alt: texto((f as Foto)?.alt, 160) })
        }
        d.fotos = fotos; break
      }
    }
  }
  return { ok: true, dados: d }
}

/** Máquina nova: completa os campos que faltam (o site exige todos). */
export function produtoNovo(slug: string, d: Partial<DadosProduto>): DadosProduto {
  const categoria = d.categoria || 'implementos'
  const titulo = d.titulo || 'Máquina nova'
  const nome = categoria === 'tratores' ? `${d.marca || 'Mahindra'} ${d.modelo || ''}`.trim() : titulo
  const fotos = (d.fotos || []).map((f) => ({ ...f, alt: f.alt || nome }))
  return {
    slug, categoria, titulo, marca: d.marca || (categoria === 'tratores' ? 'Mahindra' : ''), modelo: d.modelo || titulo,
    potencia_cv: d.potencia_cv, specs: d.specs || {}, fotos, ideal_para: d.ideal_para || [], ideal_motivos: d.ideal_motivos || [],
    pontos: d.pontos || [], descricao_site: d.descricao_site || '', meta_description: d.meta_description || metaDe(d.descricao_site || '', nome),
    exibir_preco: false, pronta_entrega: false, publicar: true,
  }
}
