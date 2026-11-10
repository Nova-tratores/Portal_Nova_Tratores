// Catálogo de peças do site (José, 10/11/2026): todas as peças em estoque, separadas em Mahindra e outras marcas.
// Puro (testado em __tests__/pecas.test.ts). O site mostra só "tem em estoque": nada de preço nem quantidade.

export type GrupoPeca = 'mahindra' | 'outras'

export interface ProdutoEstoque { codigo: string; descricao: string; marca: string | null; imagem_url: string | null }
export interface PecaSite { codigo: string; nome: string; grupo: GrupoPeca; marca: string; foto: string | null; busca: string }

const ENTIDADES: Record<string, string> = { '&quot;': '"', '&amp;': '&', '&#39;': "'", '&lt;': '<', '&gt;': '>' }
export const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const soLetrasNumeros = (s: string) => norm(s).replace(/[^a-z0-9]/g, '')

/** Código de peça Mahindra: "RP-…" ou 0 + 8 dígitos + letra(s) (ex.: 007637553U91, 005555460R1). */
const CODIGO_MAHINDRA = /^(rp-|ra-|0\d{8}[a-z]{1,2}\d{0,3}$)/i

export function grupoDaPeca(p: ProdutoEstoque): GrupoPeca {
  if (/mahindra/i.test(p.marca || '') || /mahindra/i.test(p.descricao || '') || CODIGO_MAHINDRA.test((p.codigo || '').trim())) return 'mahindra'
  return 'outras'
}

/** Marca para mostrar (só nas outras marcas; "N/D" e razão social viram algo curto). */
export function marcaCurta(marca: string | null): string {
  const m = (marca || '').trim()
  if (!m || /^n\/?d$/i.test(m) || /mahindra/i.test(m)) return ''
  const curta = m.split(/\s+(?:ltda|s\.?a\.?|industria|ind\.?|comercio|solucoes)\b/i)[0]
  return curta.length > 24 ? curta.slice(0, 24) : curta.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\B\w+/g, (w) => w.toLowerCase())
}

export function limparNome(descricao: string): string {
  let s = (descricao || '').replace(/&(quot|amp|#39|lt|gt);/g, (e) => ENTIDADES[e] || e).replace(/\s+/g, ' ').trim()
  // "PECA X = 123 = 456" → mantém (os códigos equivalentes ajudam o cliente a achar), só tira espaço sobrando
  s = s.replace(/\s*=\s*/g, ' = ')
  return s
}

/** Converte o estoque do Omie (já filtrado: família Peças, estoque > 0, ativo) em peças do site, sem repetir código. */
export function montarPecas(produtos: ProdutoEstoque[]): PecaSite[] {
  const vistos = new Map<string, PecaSite>()
  for (const p of produtos) {
    const codigo = (p.codigo || '').trim()
    if (!codigo || vistos.has(codigo)) {
      // mesma peça nas duas empresas (Nova e Castro): fica a que tiver foto
      const ja = vistos.get(codigo)
      if (ja && !ja.foto && p.imagem_url) ja.foto = p.imagem_url
      continue
    }
    const nome = limparNome(p.descricao)
    vistos.set(codigo, {
      codigo, nome, grupo: grupoDaPeca(p), marca: marcaCurta(p.marca), foto: p.imagem_url || null,
      busca: `${soLetrasNumeros(codigo)} ${norm(nome)} ${soLetrasNumeros(nome)}`,
    })
  }
  return [...vistos.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** Busca: todas as palavras precisam aparecer (no nome ou no código, ignorando pontuação). */
export function buscarPecas(pecas: PecaSite[], q: string, grupo?: GrupoPeca): PecaSite[] {
  const termos = norm(q).split(/\s+/).filter(Boolean).map((t) => ({ t, so: t.replace(/[^a-z0-9]/g, '') }))
  return pecas.filter((p) => (!grupo || p.grupo === grupo) && termos.every(({ t, so }) => p.busca.includes(t) || (so.length >= 3 && p.busca.includes(so))))
}
