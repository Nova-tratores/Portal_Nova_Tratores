// Opa → Mapa: planta da loja por andar com os territórios (pni_locais).
// Tudo em % da planta (0–100), igual ao mapa do Pátio (/visual-estoque/patio).
// Regras PURAS — banco em /api/opa/mapa, tela em components/opa/mapa/.

export interface Retangulo { x: number; y: number; w: number; h: number }
/** Ponto em % da própria caixa (0–100), para a forma personalizada. */
export interface Ponto { x: number; y: number }

/** Forma de um lugar ou de uma área: a caixa (x, y, w, h) é sempre o retângulo em volta dela. */
export type Forma = 'retangulo' | 'circulo' | 'triangulo' | 'L' | 'personalizada'
export const FORMAS: { id: Forma; nome: string }[] = [
  { id: 'retangulo', nome: 'Retângulo' }, { id: 'circulo', nome: 'Círculo' }, { id: 'triangulo', nome: 'Triângulo' },
  { id: 'L', nome: 'Em L' }, { id: 'personalizada', nome: 'Personalizada' },
]

/** O que um item da planta do andar é: área/setor (Oficina, Peças…) ou estrutura (parede, porta…). */
export type TipoBloco = 'area' | 'parede' | 'porta' | 'janela' | 'corredor' | 'escada'
export const TIPOS_ESTRUTURA: { id: Exclude<TipoBloco, 'area'>; nome: string; w: number; h: number }[] = [
  { id: 'parede', nome: 'Parede', w: 20, h: 1 },
  { id: 'porta', nome: 'Porta', w: 5, h: 2 },
  { id: 'janela', nome: 'Janela', w: 8, h: 1 },
  { id: 'corredor', nome: 'Corredor', w: 30, h: 5 },
  { id: 'escada', nome: 'Escada', w: 6, h: 10 },
]
export const nomeDoTipo = (t: TipoBloco) => (t === 'area' ? 'Área' : TIPOS_ESTRUTURA.find((x) => x.id === t)?.nome || 'Área')

export interface Bloco extends Retangulo { id: string; nome: string; tipo?: TipoBloco; forma?: Forma; pontos?: Ponto[] | null; cor?: string | null }

/** Cores para pintar áreas e estrutura (a 1ª é o padrão: sem cor própria). */
export const CORES_BLOCO = ['#64748B', '#2563EB', '#059669', '#D97706', '#7C3AED', '#DB2777', '#0891B2', '#65A30D', '#DC2626', '#92400E']
export const corValida = (c: unknown): string | null => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c.toUpperCase() : null)
export interface Andar { id: string; nome: string; ordem: number; blocos: Bloco[]; ativo: boolean }
export interface PosicaoLocal extends Retangulo { local_id: string; andar_id: string; forma?: Forma; pontos?: Ponto[] | null }

export const MIN_LADO = 3          // % — menor que isso some na tela do celular
export const MIN_FINO = 0.6        // parede/janela/porta: fininha, mas ainda dá para pegar
const LARGURA_NOVO = 14, ALTURA_NOVO = 10

const num = (v: unknown, padrao = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || padrao)
const arred = (v: number) => Math.round(v * 10) / 10

/** Mantém o retângulo dentro da planta e com tamanho mínimo (arredonda em 0,1 %). */
export function limitarRet(r: Partial<Retangulo>, min = MIN_LADO): Retangulo {
  const w = Math.min(100, Math.max(min, num(r.w, LARGURA_NOVO)))
  const h = Math.min(100, Math.max(min, num(r.h, ALTURA_NOVO)))
  const x = Math.min(100 - w, Math.max(0, num(r.x)))
  const y = Math.min(100 - h, Math.max(0, num(r.y)))
  return { x: arred(x), y: arred(y), w: arred(w), h: arred(h) }
}

/** Por onde se puxa: o corpo (mover), um lado (n/s/l/o) ou o canto de baixo à direita. */
export type Puxador = 'mover' | 'n' | 's' | 'l' | 'o' | 'se'

/**
 * Retângulo depois de arrastar `dx`/`dy` (% da planta) pelo puxador. Puxar o lado esquerdo (o) ou
 * o de cima (n) mexe na posição E no tamanho, segurando o lado oposto no lugar (como no PowerPoint).
 */
export function redimensionar(o: Retangulo, puxador: Puxador, dx: number, dy: number, min = MIN_LADO): Retangulo {
  if (puxador === 'mover') return limitarRet({ ...o, x: o.x + dx, y: o.y + dy }, min)
  let { x, y, w, h } = o
  if (puxador === 'l' || puxador === 'se') w = Math.min(100 - o.x, Math.max(min, o.w + dx))
  if (puxador === 's' || puxador === 'se') h = Math.min(100 - o.y, Math.max(min, o.h + dy))
  if (puxador === 'o') {
    const direita = o.x + o.w
    x = Math.min(direita - min, Math.max(0, o.x + dx)); w = direita - x
  }
  if (puxador === 'n') {
    const baixo = o.y + o.h
    y = Math.min(baixo - min, Math.max(0, o.y + dy)); h = baixo - y
  }
  return limitarRet({ x, y, w, h }, min)
}

/** Tamanho mínimo do item: parede/janela/porta podem ser fininhas. */
export const minDoTipo = (t?: TipoBloco) => (t === 'parede' || t === 'janela' || t === 'porta' ? MIN_FINO : MIN_LADO)

/** Retângulo puxado na planta com o dedo/mouse (de um canto ao outro). Clique sem arrastar → tamanho padrão centrado. */
export function retanguloDoArrasto(x0: number, y0: number, x1: number, y1: number, padrao: { w: number; h: number }, min = MIN_LADO): Retangulo {
  const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0)
  if (w < 1.5 && h < 1.5) return limitarRet({ x: x0 - padrao.w / 2, y: y0 - padrao.h / 2, w: padrao.w, h: padrao.h }, min)
  return limitarRet({ x: Math.min(x0, x1), y: Math.min(y0, y1), w, h }, min)
}

/** Pontos clicados na planta → a caixa em volta + os pontos em % dessa caixa. */
export function caixaDosPontos(pontos: Ponto[]): { ret: Retangulo; pontos: Ponto[] } | null {
  if (pontos.length < 3) return null
  const xs = pontos.map((p) => p.x), ys = pontos.map((p) => p.y)
  const ret = limitarRet({ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) })
  const rel = (v: number, ini: number, tam: number) => arred(Math.min(100, Math.max(0, ((v - ini) / tam) * 100)))
  return { ret, pontos: pontos.map((p) => ({ x: rel(p.x, ret.x, ret.w), y: rel(p.y, ret.y, ret.h) })) }
}

/** Contorno da forma em % da caixa (SVG viewBox 0 0 100 100). Círculo é desenhado à parte (elipse). */
export function pontosDaForma(forma: Forma | undefined, pontos?: Ponto[] | null): string {
  if (forma === 'triangulo') return '50,0 100,100 0,100'
  if (forma === 'L') return '0,0 50,0 50,50 100,50 100,100 0,100'
  if (forma === 'personalizada' && pontos && pontos.length >= 3) return pontos.map((p) => p.x + ',' + p.y).join(' ')
  return '0,0 100,0 100,100 0,100'
}

/** Limpa forma/pontos que vieram da tela. */
export function validarForma(forma: unknown, pontos: unknown): { forma: Forma; pontos: Ponto[] | null } {
  const f = FORMAS.some((x) => x.id === forma) ? (forma as Forma) : 'retangulo'
  if (f !== 'personalizada') return { forma: f, pontos: null }
  const lista = Array.isArray(pontos) ? (pontos as Record<string, unknown>[]).slice(0, 40)
    .map((p) => ({ x: arred(Math.min(100, Math.max(0, num(p?.x)))), y: arred(Math.min(100, Math.max(0, num(p?.y)))) })) : []
  return lista.length >= 3 ? { forma: f, pontos: lista } : { forma: 'retangulo', pontos: null }
}

/** Área (setor) do andar onde caiu o ponto — a menor que contém, para "dentro de Peças". */
export function areaNoPonto(blocos: Bloco[], x: number, y: number): Bloco | null {
  const dentro = blocos.filter((b) => (b.tipo || 'area') === 'area' && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)
  return dentro.sort((a, b) => a.w * a.h - b.w * b.h)[0] || null
}

const sobrepoe =(a: Retangulo, b: Retangulo) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/** Primeiro espaço livre (varrendo de cima para baixo, da esquerda para a direita) para um lugar novo. */
export function retanguloNovo(ocupados: Retangulo[], w = LARGURA_NOVO, h = ALTURA_NOVO): Retangulo {
  for (let y = 6; y + h <= 98; y += 4) {
    for (let x = 4; x + w <= 98; x += 4) {
      const r = { x, y, w, h }
      if (!ocupados.some((o) => sobrepoe(r, o))) return r
    }
  }
  return limitarRet({ x: 43, y: 45, w, h })   // tudo cheio: no meio, por cima
}

/** Paleta clara o bastante para ler o nome por cima, nos dois temas. */
export const PALETA = ['#2563EB', '#059669', '#D97706', '#7C3AED', '#DB2777', '#0891B2', '#65A30D', '#DC2626', '#4F46E5', '#CA8A04']
export const COR_SEM_DEPARTAMENTO = '#64748B'

/** Cor fixa por departamento (pela ordem da lista, o padrão fica cinza só se não houver outro). */
export function corDoDepartamento(depId: string | null | undefined, ids: string[]): string {
  if (!depId) return COR_SEM_DEPARTAMENTO
  const i = ids.indexOf(depId)
  return i < 0 ? COR_SEM_DEPARTAMENTO : PALETA[i % PALETA.length]
}

/** Andares ativos em ordem (térreo primeiro) e o vizinho de cima/baixo. */
export function andaresOrdenados(andares: Andar[]): Andar[] {
  return andares.filter((a) => a.ativo).sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome))
}
export function andarVizinho(andares: Andar[], atual: string, direcao: 1 | -1): Andar | null {
  const lista = andaresOrdenados(andares)
  const i = lista.findIndex((a) => a.id === atual)
  if (i < 0) return lista[0] || null
  return lista[i + direcao] || null
}

/** id legível e único para andar/bloco novo ("2º andar" → andar_2, "Mezanino" → mezanino_2 se já existir). */
export function idUnico(nome: string, existentes: string[], prefixo = ''): string {
  const base = (prefixo + nome).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/º|ª/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'item'
  let id = base, n = 2
  while (existentes.includes(id)) id = `${base}_${n++}`
  return id
}

/** Limpa os blocos que vieram da tela antes de gravar (nome obrigatório, retângulo válido, até 60). */
export function validarBlocos(blocos: unknown): Bloco[] | string {
  if (!Array.isArray(blocos)) return 'Lista de blocos inválida.'
  if (blocos.length > 200) return 'No máximo 200 itens por andar.'
  const ids: string[] = []
  const saida: Bloco[] = []
  for (const b of blocos as Record<string, unknown>[]) {
    const nome = String(b?.nome ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
    if (!nome) return 'Todo bloco precisa de nome.'
    const id = String(b?.id || '') && !ids.includes(String(b.id)) ? String(b.id).slice(0, 60) : idUnico(nome, ids)
    ids.push(id)
    const tipo: TipoBloco = TIPOS_ESTRUTURA.some((t) => t.id === b?.tipo) ? (b.tipo as TipoBloco) : 'area'
    const { forma, pontos } = validarForma(b?.forma, b?.pontos)
    const cor = corValida(b?.cor)
    saida.push({ id, nome, tipo, ...(tipo === 'area' && forma !== 'retangulo' ? { forma, pontos } : {}), ...(cor ? { cor } : {}), ...limitarRet(b as Partial<Retangulo>, minDoTipo(tipo)) })
  }
  return saida
}

export interface OpaNoMapa { id: string; titulo: string; local: string | null; responsavel: string | null; created_at: string }
/** Opas abertos agrupados por lugar (mais antigos primeiro). */
export function opasPorLocal(opas: OpaNoMapa[]): Record<string, OpaNoMapa[]> {
  const m: Record<string, OpaNoMapa[]> = {}
  for (const o of [...opas].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (o.local) (m[o.local] ||= []).push(o)
  }
  return m
}
