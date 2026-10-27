// Modo planilha do Orçamento (peças): regras puras — número no formato brasileiro,
// leitura do que foi colado do Excel e descoberta das colunas.
//
// Por quê (27/10/2026): o Zezo (Peças) monta o orçamento numa planilha VIRGEM do Excel
// (sem modelo, colunas na ordem que der) e manda para o Pós-vendas. Para ele montar no
// portal, colar o bloco da planilha tem que funcionar sem arrumar nada — por isso as
// colunas são descobertas pelo cabeçalho (se houver) ou pelo conteúdo.

export type CampoPlanilha = 'codigo' | 'descricao' | 'quantidade' | 'preco' | 'total'

export const ROTULO_CAMPO: Record<CampoPlanilha, string> = {
  codigo: 'Código', descricao: 'Descrição', quantidade: 'Qtd', preco: 'Unitário', total: 'Total',
}

export interface LinhaPlanilha { codigo: string; descricao: string; quantidade: number; preco: number }

/**
 * Número digitado/colado no jeito brasileiro ou americano: "1.290,00", "1290", "R$ 33,40",
 * "1,5", "1290.50", "1.290" (milhar). Devolve null se não for número.
 */
export function parseNumeroBR(entrada: unknown): number | null {
  if (typeof entrada === 'number') return Number.isFinite(entrada) ? entrada : null
  let s = String(entrada ?? '').trim().replace(/^R\$\s*/i, '').replace(/\s/g, '')
  if (!s) return null
  let negativo = false
  if (/^\(.*\)$/.test(s)) { negativo = true; s = s.slice(1, -1) }
  if (s.startsWith('-')) { negativo = true; s = s.slice(1) }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null
  const virgula = s.lastIndexOf(',')
  const ponto = s.lastIndexOf('.')
  let normal: string
  if (virgula >= 0 && ponto >= 0) {
    // o separador que vem por último é o decimal
    normal = virgula > ponto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (virgula >= 0) {
    // só vírgula: decimal, a menos que sejam vários grupos de milhar ("1,234,567")
    normal = (s.match(/,/g) || []).length > 1 ? s.replace(/,/g, '') : s.replace(',', '.')
  } else if (ponto >= 0) {
    // só ponto: "1.290" e "1.234.567" = milhar; "1290.5" / "33.40" = decimal
    const grupos = s.split('.')
    const milhar = grupos.length > 2 || (grupos.length === 2 && grupos[1].length === 3 && grupos[0].length <= 3 && grupos[0] !== '0')
    normal = milhar ? s.replace(/\./g, '') : s
  } else normal = s
  const n = Number(normal)
  if (!Number.isFinite(n)) return null
  return negativo ? -n : n
}

/** 1290.5 → "1.290,50" (sempre 2 casas). */
export function formatarMoedaBR(n: number): string {
  return (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Quantidade: inteiro sem casas; fracionado com até 3 ("1,5"). */
export function formatarQtdBR(n: number): string {
  return (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })
}

/** Texto colado (o Excel manda TAB entre células e quebra de linha entre linhas) → grade. */
export function lerColagem(texto: string): string[][] {
  const linhas = String(texto || '').replace(/\r\n?/g, '\n').split('\n')
  while (linhas.length && !linhas[linhas.length - 1].trim()) linhas.pop()
  const grade = linhas.map((l) => l.split('\t').map((c) => c.replace(/^"|"$/g, '').trim()))
  const largura = Math.max(0, ...grade.map((l) => l.length))
  // tira colunas vazias em todas as linhas (célula mesclada / coluna em branco)
  const usadas = Array.from({ length: largura }, (_, c) => grade.some((l) => (l[c] || '') !== ''))
  return grade
    .map((l) => l.filter((_, c) => usadas[c]))
    .filter((l) => l.some((c) => c !== ''))
}

/** É colagem de "bloco" (várias células)? Uma célula só fica com o colar normal do campo. */
export function ehBloco(texto: string): boolean {
  const t = String(texto || '').replace(/\r\n?/g, '\n').replace(/\n+$/, '')
  return t.includes('\t') || t.includes('\n')
}

const CABECALHOS: [CampoPlanilha, RegExp][] = [
  ['total', /^(valor\s*)?total|^subtotal|^vl\.?\s*total|^total\s*(r\$)?/i],
  ['preco', /^(pre[çc]o|valor|unit|vl\.?|r\$|venda)/i],
  ['quantidade', /^(qtd|qtde|quant|qde|qt\.?$|un\.?$|unid)/i],
  ['codigo', /^(c[óo]d|ref|sku|pe[çc]a\s*n|n[ºo°]?\s*pe[çc]a|part)/i],
  ['descricao', /^(desc|produto|item|pe[çc]a|nome|material)/i],
]

function campoDoCabecalho(texto: string): CampoPlanilha | null {
  const t = texto.trim()
  if (!t || parseNumeroBR(t) !== null) return null
  for (const [campo, re] of CABECALHOS) if (re.test(t)) return campo
  return null
}

/** Parece código de peça: sem espaço, com dígito, 3+ caracteres ("RP-006020909D1", "827265"). */
function pareceCodigo(v: string): boolean {
  const s = v.trim()
  if (s.length < 3 || /\s/.test(s) || !/\d/.test(s)) return false
  if (!/^[A-Za-z0-9][A-Za-z0-9.\-/_]*$/.test(s)) return false
  // número com cara de dinheiro/quantidade não é código ("1.290,00", "12", "33.40")
  if (/[,]/.test(s)) return false
  if (/^\d{1,4}$/.test(s)) return false
  if (/^\d+\.\d{1,2}$/.test(s)) return false
  return true
}

interface PerfilColuna { numerica: number; inteiros: number; codigo: number; texto: number; mediaTamanho: number; mediana: number }

function perfil(valores: string[]): PerfilColuna {
  const cheios = valores.filter((v) => v !== '')
  const n = Math.max(1, cheios.length)
  const nums = cheios.map((v) => (pareceCodigo(v) ? null : parseNumeroBR(v))).filter((x): x is number => x !== null)
  const ordenados = [...nums].sort((a, b) => a - b)
  return {
    numerica: nums.length / n,
    inteiros: nums.filter((x) => Number.isInteger(x)).length / n,
    codigo: cheios.filter(pareceCodigo).length / n,
    texto: cheios.filter((v) => /[A-Za-zÀ-ú]{3,}/.test(v) && /\s/.test(v)).length / n,
    mediaTamanho: cheios.reduce((s, v) => s + v.length, 0) / n,
    mediana: ordenados.length ? ordenados[Math.floor(ordenados.length / 2)] : 0,
  }
}

export interface DeteccaoColunas {
  /** 1ª linha é cabeçalho (não vira item). */
  cabecalho: boolean
  /** Um campo (ou null = ignorar) para cada coluna colada. */
  mapa: (CampoPlanilha | null)[]
}

/** Descobre o que é cada coluna colada: pelo cabeçalho, se houver; senão pelo conteúdo. */
export function detectarColunas(grade: string[][]): DeteccaoColunas {
  const largura = Math.max(0, ...grade.map((l) => l.length))
  if (largura === 0) return { cabecalho: false, mapa: [] }

  const primeira = grade[0] || []
  const doCab = Array.from({ length: largura }, (_, c) => campoDoCabecalho(primeira[c] || ''))
  const reconhecidos = doCab.filter(Boolean).length
  if (grade.length > 1 && reconhecidos >= Math.min(2, largura)) {
    // campo repetido no cabeçalho: fica só o primeiro
    const vistos = new Set<CampoPlanilha>()
    return { cabecalho: true, mapa: doCab.map((f) => (f && !vistos.has(f) ? (vistos.add(f), f) : null)) }
  }

  const corpo = grade
  const perfis = Array.from({ length: largura }, (_, c) => perfil(corpo.map((l) => l[c] || '')))
  const mapa: (CampoPlanilha | null)[] = Array(largura).fill(null)
  const livres = () => perfis.map((_, c) => c).filter((c) => mapa[c] === null)

  // números: quantidade = inteiros pequenos; unitário e total = o resto
  const numericas = livres().filter((c) => perfis[c].numerica >= 0.7)
  if (numericas.length >= 3) {
    // qtd × unit ≈ total identifica as três
    const achou = acharTrio(corpo, numericas)
    if (achou) { mapa[achou.q] = 'quantidade'; mapa[achou.p] = 'preco'; mapa[achou.t] = 'total' }
  }
  const restantesNum = numericas.filter((c) => mapa[c] === null)
  if (restantesNum.length >= 2 && !mapa.includes('quantidade')) {
    const q = [...restantesNum].sort((a, b) => (perfis[b].inteiros - perfis[a].inteiros) || (perfis[a].mediana - perfis[b].mediana))[0]
    mapa[q] = 'quantidade'
    const outras = restantesNum.filter((c) => c !== q)
    // de duas colunas de valor, a da esquerda é o unitário (total costuma vir depois)
    mapa[outras[0]] = 'preco'
    if (outras[1] !== undefined) mapa[outras[1]] = 'total'
  } else if (restantesNum.length === 1) {
    const c = restantesNum[0]
    const p = perfis[c]
    mapa[c] = p.inteiros === 1 && p.mediana <= 50 && !mapa.includes('quantidade') ? 'quantidade' : 'preco'
  }

  // textos: código = mais "cara de código"; descrição = o texto mais longo
  const textos = livres()
  const cod = textos.filter((c) => perfis[c].codigo >= 0.6).sort((a, b) => perfis[b].codigo - perfis[a].codigo || perfis[a].mediaTamanho - perfis[b].mediaTamanho)[0]
  if (cod !== undefined) mapa[cod] = 'codigo'
  const desc = livres().sort((a, b) => perfis[b].texto - perfis[a].texto || perfis[b].mediaTamanho - perfis[a].mediaTamanho)[0]
  if (desc !== undefined && perfis[desc].mediaTamanho > 0) mapa[desc] = 'descricao'

  return { cabecalho: false, mapa }
}

function acharTrio(grade: string[][], cols: number[]): { q: number; p: number; t: number } | null {
  for (const q of cols) for (const p of cols) for (const t of cols) {
    if (q === p || p === t || q === t) continue
    let ok = 0, total = 0
    for (const l of grade) {
      const vq = parseNumeroBR(l[q]), vp = parseNumeroBR(l[p]), vt = parseNumeroBR(l[t])
      if (vq === null || vp === null || vt === null) continue
      total++
      if (Math.abs(vq * vp - vt) <= Math.max(0.05, Math.abs(vt) * 0.01)) ok++
    }
    // a quantidade costuma ser a menor das três; evita trocar qtd e unitário quando qtd = 1
    if (total > 0 && ok / total >= 0.8) {
      const medQ = grade.reduce((s, l) => s + (parseNumeroBR(l[q]) || 0), 0)
      const medP = grade.reduce((s, l) => s + (parseNumeroBR(l[p]) || 0), 0)
      if (medQ <= medP) return { q, p, t }
    }
  }
  return null
}

/** Aplica o mapa às linhas coladas → itens do orçamento. Linha sem código nem descrição sai. */
export function linhasDaColagem(grade: string[][], det: DeteccaoColunas): LinhaPlanilha[] {
  const corpo = det.cabecalho ? grade.slice(1) : grade
  const col = (campo: CampoPlanilha) => det.mapa.indexOf(campo)
  const [cC, cD, cQ, cP, cT] = (['codigo', 'descricao', 'quantidade', 'preco', 'total'] as CampoPlanilha[]).map(col)
  const saida: LinhaPlanilha[] = []
  for (const l of corpo) {
    const codigo = cC >= 0 ? (l[cC] || '').trim() : ''
    const descricao = cD >= 0 ? (l[cD] || '').trim() : ''
    if (!codigo && !descricao) continue
    const qtdLida = cQ >= 0 ? parseNumeroBR(l[cQ]) : null
    const quantidade = qtdLida && qtdLida > 0 ? qtdLida : 1
    let preco = cP >= 0 ? parseNumeroBR(l[cP]) : null
    if ((preco === null || preco === 0) && cT >= 0) {
      const tot = parseNumeroBR(l[cT])
      if (tot !== null) preco = Math.round((tot / quantidade) * 100) / 100
    }
    saida.push({ codigo, descricao, quantidade, preco: preco ?? 0 })
  }
  return saida
}

/** Tabela para colar de volta no Excel (TAB/quebra de linha, números BR). */
export function paraExcel(itens: LinhaPlanilha[]): string {
  const linhas = [['Código', 'Descrição', 'Qtd', 'Unitário', 'Total'].join('\t')]
  for (const i of itens) {
    if (!i.codigo.trim() && !i.descricao.trim()) continue
    linhas.push([i.codigo, i.descricao, formatarQtdBR(i.quantidade), formatarMoedaBR(i.preco), formatarMoedaBR(i.quantidade * i.preco)].join('\t'))
  }
  return linhas.join('\r\n')
}

/** Linha vazia (sem código, descrição nem preço). */
export function linhaVazia(i: LinhaPlanilha): boolean {
  return !i.codigo.trim() && !i.descricao.trim() && !(Number(i.preco) > 0)
}

/** Margem sobre o preço de venda: (preço − custo) / preço. null sem custo ou sem preço. */
export function margem(preco: number, custo: number | null | undefined): number | null {
  if (!custo || !(preco > 0)) return null
  return (preco - custo) / preco
}
