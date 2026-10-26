// Relação Opa × cadastro: o "Código já existente" que a pessoa digitou na
// captação bate com algum produto já cadastrado (Omie / PPV)? Regras PURAS —
// a rota /api/opa/pecas/relacao busca os dados e chama montarRelacao().
//
// Fontes: `produtos` (espelho da Omie: estoque, preço, marca, família; conta
// MINÚSCULA) e `produtos_caracteristicas` (as características do PPV: "Tipo:",
// locação #PRATELEIRA/#ANDAR/#CAIXA; conta MAIÚSCULA). Um código pode existir
// nas duas empresas (NOVA e CASTRO) — cada uma vira um "cadastro".
// Grafia: a Mahindra usa "RP-0734309419" e a Omie às vezes "0734309419" (e
// vice-versa) — procura as duas; espaços e caixa não importam.

import { BOM, celulaCsv } from './csv'
import { norm, posDeCar, segPlaceholder } from '@/lib/ajustes/posicao'
import { numeroCsv } from './regras'
import { ROTULO_QUALIDADE, ROTULO_STATUS, type Qualidade, type Status } from './tipos'

export interface ItemRelacao {
  id: string
  codigo: string
  codigo_fabricante: string | null
  /** embalagem errada: o código certo (sql/pni-13) — vale mais que o da embalagem */
  codigo_correto?: string | null
  descricao: string | null
  quantidade: number
  qualidade: Qualidade
  status: Status
  local_id: string | null
  local_tecnico: string | null
  preco_sugerido: number | null
  criado_em: string
}

export interface ProdutoCadastro {
  conta_omie: string
  codigo: string
  descricao: string | null
  estoque: number | null
  valor_unitario: number | null
  marca: string | null
  familia_nome: string | null
  inativo: boolean | null
}

export interface CaracteristicaCadastro {
  conta_omie: string
  codigo: string
  descricao: string | null
  caracteristicas: Record<string, string> | null
}

/** O que o portal sabe do código numa empresa. */
export interface Cadastro {
  empresa: 'NOVA' | 'CASTRO'
  codigo: string
  descricao: string | null
  tipo: string | null
  /** "23 · A · 06" (prateleira · andar · caixa) ou null */
  locacao: string | null
  /** cada parte da locação (null = não tem) */
  posicao: { prateleira: string | null; andar: string | null; caixa: string | null }
  estoque: number | null
  valor_unitario: number | null
  marca: string | null
  familia: string | null
  inativo: boolean
  /** demais características do PPV (fora Tipo e locação), na ordem do cadastro */
  outras: { nome: string; valor: string }[]
}

export interface LinhaRelacao {
  item: ItemRelacao
  /** vazio = só no Opa */
  cadastros: Cadastro[]
  /** por que está só no Opa (null quando achou) */
  motivo: 'sem_codigo' | 'nao_encontrado' | null
}

export interface Relacao {
  existentes: LinhaRelacao[]
  soOpa: LinhaRelacao[]
}

/** Chave de comparação: sem espaços, maiúscula. */
export function chaveCodigo(c: string | null | undefined): string {
  return String(c ?? '').replace(/\s+/g, '').toUpperCase()
}

/**
 * Grafias a procurar no cadastro: com e sem "RP-" e, quando digitaram algo a
 * mais separado por espaço ("Y8401970 GK"), cada pedaço com 4+ caracteres.
 */
export function variantesCodigo(c: string | null | undefined): string[] {
  const k = chaveCodigo(c)
  if (!k) return []
  const pedacos = String(c ?? '').trim().split(/\s+/).map(chaveCodigo).filter((p) => p.length >= 4 && p !== k)
  const out: string[] = []
  for (const x of [k, ...pedacos]) {
    const sem = x.replace(/^RP-?/, '')
    out.push(x, sem, `RP-${sem}`)
  }
  return [...new Set(out)].filter(Boolean)
}

/** Produto do cadastro cujo código CONTÉM o que foi digitado (o exato não existe). */
export interface Parecido { empresa: 'NOVA' | 'CASTRO'; codigo: string; descricao: string | null; inativo: boolean }

/**
 * Padrão ILIKE para achar o código digitado DENTRO do código cadastrado:
 * "348U1" → "%348U1%" (acha RP-006034348U1 e 006034348U1MHI); tira "RP-" e
 * trata traço/ponto/espaço como "qualquer coisa" ("348-U1" → "%348%U1%").
 * Menos de 4 letras/números = null (pedaço curto demais acharia tudo).
 */
export function padraoParecido(c: string | null | undefined): string | null {
  const pedacos = chaveCodigo(c).replace(/^RP-?/, '').split(/[^A-Z0-9]+/).filter(Boolean)
  if (pedacos.join('').length < 4) return null
  return `%${pedacos.join('%')}%`
}

const semRP = (c: string) => chaveCodigo(c).replace(/^RP-?/, '')

/** Ordem dos parecidos: ativos primeiro, depois o código mais curto sem "RP-" (= mais perto do digitado), sem repetir. */
export function ordenarParecidos(lista: Parecido[], max = 8): Parecido[] {
  const vistos = new Set<string>()
  return [...lista]
    .sort((a, b) => Number(a.inativo) - Number(b.inativo) || semRP(a.codigo).length - semRP(b.codigo).length || (a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0))
    .filter((p) => { const k = p.empresa + '|' + chaveCodigo(p.codigo); if (vistos.has(k)) return false; vistos.add(k); return true })
    .slice(0, max)
}

const EMPRESA = (conta: string): 'NOVA' | 'CASTRO' => (conta.toUpperCase() === 'CASTRO' ? 'CASTRO' : 'NOVA')

/** O espelho da Omie guarda algumas descrições com entidades HTML ("2&quot;" = 2"). */
export function semEntidades(s: string): string {
  return s.replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

function texto(v: unknown): string | null {
  const s = semEntidades(String(v ?? '')).trim()
  return s && s !== '-' && s.toUpperCase() !== '#N/D' ? s : null
}

/** "23 · A · 06" a partir das características do PPV; null quando não tem nenhuma das três. */
/** Prateleira, andar e caixa (null = não tem). Mesma leitura da tela de Localização:
 *  nome sem caixa/acento, #ANDAR2/#CAIXA2 de reserva e "XXX"/"000"/"---" = vazio. */
export function posicaoDe(car: Record<string, string> | null | undefined): { prateleira: string | null; andar: string | null; caixa: string | null } {
  if (!car) return { prateleira: null, andar: null, caixa: null }
  const p = posDeCar(car)
  const limpa = (v: string) => { const t = texto(v); return t && !segPlaceholder(t) ? t : null }
  return { prateleira: limpa(p.prat), andar: limpa(p.andar), caixa: limpa(p.caixa) }
}

export function locacaoDe(car: Record<string, string> | null | undefined): string | null {
  const p = posicaoDe(car)
  const partes = [p.prateleira, p.andar, p.caixa]
  return partes.some(Boolean) ? partes.map((x) => x || '—').join(' · ') : null
}

/** Tipo da peça nas características ("Tipo:" no PPV). */
export function tipoDe(car: Record<string, string> | null | undefined): string | null {
  if (!car) return null
  const chave = Object.keys(car).find((k) => k.replace(/[:\s]/g, '').toUpperCase() === 'TIPO')
  return chave ? texto(car[chave]) : null
}

const CHAVES_FIXAS = new Set(['#prateleira', '#andar', '#caixa', '#andar2', '#caixa2'])

/** Características além de Tipo e locação ("Aplicação: 6075"…), sem as vazias. */
export function outrasCaracteristicas(car: Record<string, string> | null | undefined): { nome: string; valor: string }[] {
  if (!car) return []
  return Object.entries(car)
    .filter(([k]) => !CHAVES_FIXAS.has(norm(k)) && k.replace(/[:\s]/g, '').toUpperCase() !== 'TIPO')
    .map(([k, v]) => ({ nome: k.replace(/^#/, '').replace(/:\s*$/, '').trim(), valor: texto(v) || '' }))
    .filter((c) => c.nome && c.valor)
}

/** O código que vale para achar o produto: o correto (embalagem errada) ou o da embalagem. */
export function codigoDoItem(i: { codigo_fabricante: string | null; codigo_correto?: string | null }): string | null {
  return (i.codigo_correto || '').trim() || (i.codigo_fabricante || '').trim() || null
}

/** Cadastros (NOVA e/ou CASTRO) de um código, tentando as grafias com e sem "RP-". */
export function acharCadastros(cad: Map<string, Cadastro>, codigo: string | null | undefined): Cadastro[] {
  const vars = variantesCodigo(codigo)
  const achados: Cadastro[] = []
  for (const empresa of ['NOVA', 'CASTRO'] as const) {
    const c = vars.map((v) => cad.get(`${empresa}|${v}`)).find(Boolean)
    if (c) achados.push(c)
  }
  return achados
}

/** Junta itens do Opa com os cadastros achados. Sem código ou sem cadastro → "Só no Opa". */
export function montarRelacao(itens: ItemRelacao[], produtos: ProdutoCadastro[], caracteristicas: CaracteristicaCadastro[]): Relacao {
  const cad = indexarCadastros(produtos, caracteristicas)
  const existentes: LinhaRelacao[] = []
  const soOpa: LinhaRelacao[] = []
  for (const item of itens) {
    const codigo = codigoDoItem(item)
    if (!codigo) { soOpa.push({ item, cadastros: [], motivo: 'sem_codigo' }); continue }
    const achados = acharCadastros(cad, codigo)
    if (achados.length) existentes.push({ item, cadastros: achados, motivo: null })
    else soOpa.push({ item, cadastros: [], motivo: 'nao_encontrado' })
  }
  return { existentes, soOpa }
}

/** Índice (empresa, chave do código) → cadastro, a partir das duas fontes. */
export function indexarCadastros(produtos: ProdutoCadastro[], caracteristicas: CaracteristicaCadastro[]): Map<string, Cadastro> {
  const cad = new Map<string, Cadastro>()
  const pegar = (conta: string, codigo: string): Cadastro => {
    const empresa = EMPRESA(conta)
    const k = `${empresa}|${chaveCodigo(codigo)}`
    let c = cad.get(k)
    if (!c) {
      c = { empresa, codigo, descricao: null, tipo: null, locacao: null, estoque: null, valor_unitario: null, marca: null, familia: null, inativo: false, outras: [], posicao: { prateleira: null, andar: null, caixa: null } }
      cad.set(k, c)
    }
    return c
  }
  for (const p of produtos) {
    const c = pegar(p.conta_omie, p.codigo)
    c.descricao = texto(p.descricao) ?? c.descricao
    c.estoque = p.estoque ?? c.estoque
    c.valor_unitario = p.valor_unitario ?? c.valor_unitario
    c.marca = texto(p.marca) ?? c.marca
    c.familia = texto(p.familia_nome) ?? c.familia
    c.inativo = !!p.inativo
  }
  for (const p of caracteristicas) {
    const c = pegar(p.conta_omie, p.codigo)
    c.descricao = c.descricao ?? texto(p.descricao)
    c.tipo = tipoDe(p.caracteristicas)
    c.locacao = locacaoDe(p.caracteristicas)
    c.posicao = posicaoDe(p.caracteristicas)
    c.outras = outrasCaracteristicas(p.caracteristicas)
  }
  return cad
}

/** "Aplicação: 6075 · Material: aço" — para CSV, PDF e tela. */
export function textoCaracteristicas(c: Pick<Cadastro, 'outras'>): string {
  return c.outras.map((o) => `${o.nome}: ${o.valor}`).join(' · ')
}

export const ROTULO_MOTIVO: Record<'sem_codigo' | 'nao_encontrado', string> = {
  sem_codigo: 'Sem código existente',
  nao_encontrado: 'Código não cadastrado',
}

const COLUNAS = [
  'Fila', 'Código Opa', 'Código existente', 'Código correto (embalagem errada)', 'Descrição (Opa)', 'Qtde', 'Qualidade', 'Status', 'Local (Opa)', 'Preço sugerido (R$)',
  'Empresa', 'Código no cadastro', 'Descrição no cadastro', 'Tipo', 'Locação (prat · andar · caixa)', 'Estoque', 'Valor unitário (R$)', 'Marca', 'Família', 'Inativo', 'Características',
] as const

/** Linhas da exportação: uma por (peça × empresa onde existe); "Só no Opa" sai com o cadastro em branco. */
export function linhasRelacao(r: Relacao, local: (i: ItemRelacao) => string): string[][] {
  const base = (fila: string, i: ItemRelacao) => [
    fila, i.codigo, i.codigo_fabricante || '', i.codigo_correto || '', i.descricao || '', String(i.quantidade), ROTULO_QUALIDADE[i.qualidade] || i.qualidade,
    ROTULO_STATUS[i.status] || i.status, local(i), numeroCsv(i.preco_sugerido),
  ]
  const out: string[][] = []
  for (const l of r.existentes) {
    for (const c of l.cadastros) {
      out.push([...base('Já cadastrado', l.item), c.empresa, c.codigo, c.descricao || '', c.tipo || '', c.locacao || '',
        c.estoque == null ? '' : String(c.estoque).replace('.', ','), numeroCsv(c.valor_unitario), c.marca || '', c.familia || '', c.inativo ? 'Sim' : '', textoCaracteristicas(c)])
    }
  }
  for (const l of r.soOpa) {
    out.push([...base(`Só no Opa (${ROTULO_MOTIVO[l.motivo || 'sem_codigo'].toLowerCase()})`, l.item), '', '', '', '', '', '', '', '', '', '', ''])
  }
  return out
}

export function gerarCsvRelacao(r: Relacao, local: (i: ItemRelacao) => string): string {
  const linhas = [[...COLUNAS], ...linhasRelacao(r, local)]
  return BOM + linhas.map((l) => l.map(celulaCsv).join(';')).join('\r\n') + '\r\n'
}
