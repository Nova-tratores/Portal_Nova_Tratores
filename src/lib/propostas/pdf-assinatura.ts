// Bloco de assinatura + rodapé do PDF da proposta comercial (jsPDF, A4 retrato).
//
// Lib PURA: não toca DOM, Supabase nem jsPDF diretamente — recebe um `doc` com
// a interface mínima usada (PdfDoc) pra dar pra testar com um doc falso.
//
// Layout (mm):
//   ┌ data por extenso (esq.)                                              ┐
//   │ ───────────── 75 ─────────────      ───────────── 75 ─────────────    │
//   │ COMPRADOR                            VENDEDOR                         │
//   │ CLIENTE (quebra)                     carimbo_nome                     │
//   │ CPF/CNPJ formatado                   cargo — telefone                 │
//   │ End_Entrega (quebra)                 razão social                     │
//   │ Cidade                               CNPJ                             │
//   └──────────────────────────────────────────────────────────────────────┘
// SEM imagem de assinatura (decisão de 14/09/2026): as duas linhas ficam vazias
// pra assinar no papel; a coluna do vendedor é só texto (carimbo). As linhas
// ficam na MESMA altura; a data ocupa a faixa acima delas, à esquerda.
// A altura do bloco é calculada pelo nº de linhas do splitTextToSize. Padrão
// 9 pt; se não couber antes do rodapé tenta 8,5 e 8 pt (endereço rural em
// maiúsculas costuma dar 3 linhas); se ainda não couber, o bloco vai inteiro
// pra uma página nova — nunca sobrepõe o rodapé.
//
// Rodapé (7 pt, todas as páginas): razão social · IE · endereço · telefone
// à esquerda, "Proposta nº X — página N de M" à direita.

export type PdfDoc = {
  setFont(name: string, style?: string): unknown
  setFontSize(n: number): unknown
  setTextColor(r: number, g?: number, b?: number): unknown
  setDrawColor(r: number, g?: number, b?: number): unknown
  setLineWidth(w: number): unknown
  line(x1: number, y1: number, x2: number, y2: number): unknown
  text(txt: string | string[], x: number, y: number, opts?: { align?: 'left' | 'center' | 'right' }): unknown
  splitTextToSize(txt: string, maxWidth: number): string[]
  getTextWidth(txt: string): number
  addPage(): unknown
  getNumberOfPages(): number
  setPage(n: number): unknown
  internal: { pageSize: { getWidth(): number; getHeight(): number } }
}

export type PropostaAssinatura = {
  id?: number | string | null
  Cliente?: string | null
  'Cpf/Cpnj'?: string | null   // (sic) nome real da coluna em "Formulario"
  End_Entrega?: string | null
  Cidade?: string | null
  criado_em?: string | null
  created_at?: string | null
}

export type VendedorAssinatura = {
  id?: number
  nome?: string | null
  carimbo_nome?: string | null
  carimbo_cargo?: string | null
  carimbo_telefone?: string | null
}

export type ConfigEmpresa = {
  razao_social?: string | null
  cnpj?: string | null
  ie?: string | null
  endereco?: string | null
  telefone?: string | null
}

export const MARGEM = 15
export const LARGURA_COLUNA = 75
export const FONTE_PT = 9
/** Tamanhos tentados em ordem: 9 pt é o padrão; só encolhe se o bloco não couber na página. */
export const FONTES_FALLBACK = [9, 8.5, 8]
/** Entrelinha em mm pra um tamanho em pt (1 pt = 0,3528 mm × ~1,07 de leading). */
export const alturaLinha = (fontePt: number): number => Math.round(fontePt * 0.375 * 100) / 100
export const ALTURA_LINHA = alturaLinha(FONTE_PT)   // 3,38 mm a 9 pt
export const FAIXA_DATA = 6              // faixa acima das linhas, onde vai a data
export const FOLGA_TOPO = 4              // respiro entre o fim do conteúdo anterior e a data
export const RODAPE_ALTURA = 10          // reservado no pé da página (filete + 1–2 linhas de 7 pt)
const PADDING_COL = 2                    // folga interna pra quebra não encostar na borda

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

// ---------------------------------------------------------------- formatação

/** CPF → 000.000.000-00 · CNPJ → 00.000.000/0000-00 · outro tamanho → como veio. */
export function formatarDocumento(raw: string | null | undefined): string {
  const s = String(raw ?? '').trim()
  const d = s.replace(/\D/g, '')
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  return s
}

/** Rótulo do documento pelo tamanho (11 = CPF, 14 = CNPJ); vazio quando não dá pra saber. */
export function rotuloDocumento(raw: string | null | undefined): string {
  const d = String(raw ?? '').replace(/\D/g, '')
  if (d.length === 11) return 'CPF'
  if (d.length === 14) return 'CNPJ'
  return ''
}

/** "Piraju (SP), 11 de setembro de 2026". `YYYY-MM-DD` é lido como data LOCAL. */
export function dataExtenso(data: Date | string | null | undefined, cidade = 'Piraju (SP)'): string {
  let d: Date
  if (data instanceof Date) d = data
  else if (typeof data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.trim())) {
    const [a, m, dia] = data.trim().split('-').map(Number)
    d = new Date(a, m - 1, dia)
  } else if (data) d = new Date(data)
  else d = new Date()
  if (Number.isNaN(d.getTime())) d = new Date()
  return `${cidade}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`
}

// ---------------------------------------------------------------- validação

/**
 * Motivos pelos quais o PDF NÃO pode ser gerado (lista vazia = pode).
 * Falha explícita: nada de PDF com linha vazia em silêncio.
 */
export function validarDadosAssinatura(
  vendedor: VendedorAssinatura | null | undefined,
  config: ConfigEmpresa | null | undefined,
): string[] {
  const erros: string[] = []
  const ONDE = 'cadastre em Gestão de Vendas → Ajustes por Venda → Vendedores → Carimbos'
  if (!vendedor) {
    erros.push('Proposta sem vendedor — escolha o vendedor no campo "Vendedor" e salve antes de gerar o PDF.')
  } else {
    const nome = vendedor.nome || `#${vendedor.id ?? '?'}`
    if (!(vendedor.carimbo_nome || '').trim()) erros.push(`Vendedor ${nome} sem nome de carimbo — ${ONDE}.`)
  }
  if (!config) {
    erros.push('Dados da empresa (tabela Configuracoes) não carregaram — tente de novo; se persistir, avise o Dev.')
  } else {
    if (!(config.razao_social || '').trim()) erros.push('Razão social da empresa não cadastrada em Configuracoes.')
    if (!(config.cnpj || '').trim()) erros.push('CNPJ da empresa não cadastrado em Configuracoes.')
  }
  return erros
}

// ---------------------------------------------------------------- medição

type LinhaTexto = { texto: string; negrito: boolean }

function linhasColuna(doc: PdfDoc, itens: LinhaTexto[], largura: number): LinhaTexto[] {
  const out: LinhaTexto[] = []
  for (const it of itens) {
    const t = (it.texto ?? '').trim()
    if (!t) continue
    doc.setFont('helvetica', it.negrito ? 'bold' : 'normal')
    for (const l of doc.splitTextToSize(t, largura)) out.push({ texto: l, negrito: it.negrito })
  }
  return out
}

function itensComprador(p: PropostaAssinatura): LinhaTexto[] {
  const doc = formatarDocumento(p['Cpf/Cpnj'])
  const rot = rotuloDocumento(p['Cpf/Cpnj'])
  return [
    { texto: 'COMPRADOR', negrito: true },
    { texto: String(p.Cliente ?? '').toUpperCase(), negrito: true },
    { texto: doc ? (rot ? `${rot}: ${doc}` : doc) : '', negrito: false },
    { texto: String(p.End_Entrega ?? ''), negrito: false },
    { texto: String(p.Cidade ?? ''), negrito: false },
  ]
}

function itensVendedor(v: VendedorAssinatura, c: ConfigEmpresa): LinhaTexto[] {
  const cargoTel = [v.carimbo_cargo, v.carimbo_telefone].map(s => (s ?? '').trim()).filter(Boolean).join(' — ')
  return [
    { texto: 'VENDEDOR', negrito: true },
    { texto: String(v.carimbo_nome ?? ''), negrito: true },
    { texto: cargoTel, negrito: false },
    { texto: String(c.razao_social ?? ''), negrito: false },
    { texto: c.cnpj ? `CNPJ: ${formatarDocumento(c.cnpj)}` : '', negrito: false },
  ]
}

export type MedidaBloco = {
  esquerda: LinhaTexto[]
  direita: LinhaTexto[]
  /** altura total do bloco (faixa da data + texto), em mm */
  altura: number
  /** tamanho da fonte (pt) com que foi medido */
  fonte: number
  /** entrelinha (mm) correspondente à fonte */
  entrelinha: number
}

/** Mede o bloco sem desenhar (usado pra decidir se cabe na página). */
export function medirBlocoAssinatura(
  doc: PdfDoc,
  args: { proposta: PropostaAssinatura; vendedor: VendedorAssinatura; config: ConfigEmpresa; fonte?: number },
): MedidaBloco {
  const fonte = args.fonte ?? FONTE_PT
  doc.setFontSize(fonte)
  const largura = LARGURA_COLUNA - PADDING_COL * 2
  const esquerda = linhasColuna(doc, itensComprador(args.proposta), largura)
  const direita = linhasColuna(doc, itensVendedor(args.vendedor, args.config), largura)
  const linhas = Math.max(esquerda.length, direita.length)
  const entrelinha = alturaLinha(fonte)
  // faixa da data + uma entrelinha por linha (a 1ª baseline fica uma entrelinha abaixo do filete)
  const altura = FAIXA_DATA + linhas * entrelinha
  return { esquerda, direita, altura, fonte, entrelinha }
}

/**
 * Escolhe a medida que cabe até `limite` a partir de `y`: tenta 9 pt, depois
 * 8,5 e 8. Se nada couber, devolve a medida a 9 pt com `cabe=false` (o bloco
 * vai inteiro pra uma página nova, em vez de estourar o rodapé).
 */
export function medirBlocoQueCabe(
  doc: PdfDoc,
  args: { proposta: PropostaAssinatura; vendedor: VendedorAssinatura; config: ConfigEmpresa },
  y: number,
  limite: number,
): MedidaBloco & { cabe: boolean } {
  for (const fonte of FONTES_FALLBACK) {
    const m = medirBlocoAssinatura(doc, { ...args, fonte })
    if (y + m.altura <= limite) return { ...m, cabe: true }
  }
  return { ...medirBlocoAssinatura(doc, { ...args, fonte: FONTE_PT }), cabe: false }
}

// ---------------------------------------------------------------- desenho

export type ArgsBloco = {
  proposta: PropostaAssinatura
  vendedor: VendedorAssinatura | null | undefined
  config: ConfigEmpresa | null | undefined
  /** y (mm) onde o bloco pode começar (fim do conteúdo anterior). */
  y: number
}

/**
 * Desenha o bloco de assinatura. Devolve o y final (mm) na página em que
 * terminou. Lança Error com mensagem legível se os dados não permitirem
 * (o chamador deve ter validado antes com validarDadosAssinatura).
 */
export function desenharBlocoAssinatura(doc: PdfDoc, args: ArgsBloco): number {
  const erros = validarDadosAssinatura(args.vendedor, args.config)
  if (erros.length) throw new Error(erros.join('\n'))
  const vendedor = args.vendedor as VendedorAssinatura
  const config = args.config as ConfigEmpresa

  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const limite = pageH - RODAPE_ALTURA       // nenhuma baseline abaixo daqui

  const medida = medirBlocoQueCabe(doc, { proposta: args.proposta, vendedor, config }, args.y + FOLGA_TOPO, limite)

  let y = args.y + FOLGA_TOPO
  if (!medida.cabe) {
    doc.addPage()
    y = MARGEM
  }
  doc.setFontSize(medida.fonte)

  const xEsq = MARGEM
  const xDir = pageW - MARGEM - LARGURA_COLUNA
  const yLinha = y + FAIXA_DATA

  // Data por extenso: alinhada à esquerda, na faixa acima das linhas.
  doc.setFont('helvetica', 'normal'); doc.setFontSize(medida.fonte); doc.setTextColor(0)
  doc.text(dataExtenso(args.proposta.criado_em || args.proposta.created_at), xEsq, yLinha - 2.5)

  // Linhas (mesma altura nas duas colunas)
  doc.setDrawColor(0); doc.setLineWidth(0.4)
  doc.line(xEsq, yLinha, xEsq + LARGURA_COLUNA, yLinha)
  doc.line(xDir, yLinha, xDir + LARGURA_COLUNA, yLinha)

  const desenharColuna = (linhas: LinhaTexto[], xCol: number) => {
    const xCentro = xCol + LARGURA_COLUNA / 2
    let yy = yLinha
    for (const l of linhas) {
      yy += medida.entrelinha
      doc.setFont('helvetica', l.negrito ? 'bold' : 'normal')
      doc.text(l.texto, xCentro, yy, { align: 'center' })
    }
    return yy   // baseline da última linha
  }
  const fimEsq = desenharColuna(medida.esquerda, xEsq)
  const fimDir = desenharColuna(medida.direita, xDir)
  return Math.max(fimEsq, fimDir)
}

/**
 * Rodapé em TODAS as páginas: IE, endereço e telefone da empresa à esquerda
 * (a razão social já vai na coluna do vendedor) e "Proposta nº X — página N de M"
 * à direita. Chamar DEPOIS de todo o conteúdo (precisa saber o total de páginas).
 */
export function desenharRodape(doc: PdfDoc, args: { config: ConfigEmpresa | null | undefined; propostaId: number | string | null | undefined }): void {
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const yTexto = pageH - 3.5                // baseline da última linha do rodapé
  const total = doc.getNumberOfPages()
  const c = args.config ?? {}
  const partes = [
    c.ie ? `I.E.: ${String(c.ie).trim()}` : '',
    (c.endereco ?? '').trim(),
    c.telefone ? `Tel.: ${String(c.telefone).trim()}` : '',
  ].filter(Boolean)
  const esquerda = partes.join(' · ')

  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(90)
    doc.setDrawColor(200); doc.setLineWidth(0.2)
    doc.line(MARGEM, yTexto - 5.5, pageW - MARGEM, yTexto - 5.5)
    const direita = `Proposta nº ${args.propostaId ?? '—'} — página ${i} de ${total}`
    const wDir = doc.getTextWidth(direita)
    doc.text(direita, pageW - MARGEM, yTexto, { align: 'right' })
    // esquerda: até 2 linhas, encolhida pra não invadir o texto da direita
    const larguraEsq = pageW - MARGEM * 2 - wDir - 4
    const linhasEsq = doc.splitTextToSize(esquerda, larguraEsq).slice(0, 2)
    linhasEsq.forEach((l, k) => doc.text(l, MARGEM, yTexto - (linhasEsq.length - 1 - k) * 2.8))
  }
  doc.setTextColor(0)
}
