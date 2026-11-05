// Opa → Mapa: planta da loja por andar com os territórios (pni_locais).
// Tudo em % da planta (0–100), igual ao mapa do Pátio (/visual-estoque/patio).
// Regras PURAS — banco em /api/opa/mapa, tela em components/opa/mapa/.

export interface Retangulo { x: number; y: number; w: number; h: number }
export interface Bloco extends Retangulo { id: string; nome: string }
export interface Andar { id: string; nome: string; ordem: number; blocos: Bloco[]; ativo: boolean }
export interface PosicaoLocal extends Retangulo { local_id: string; andar_id: string }

export const MIN_LADO = 3          // % — menor que isso some na tela do celular
const LARGURA_NOVO = 14, ALTURA_NOVO = 10

const num = (v: unknown, padrao = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || padrao)
const arred = (v: number) => Math.round(v * 10) / 10

/** Mantém o retângulo dentro da planta e com tamanho mínimo (arredonda em 0,1 %). */
export function limitarRet(r: Partial<Retangulo>): Retangulo {
  const w = Math.min(100, Math.max(MIN_LADO, num(r.w, LARGURA_NOVO)))
  const h = Math.min(100, Math.max(MIN_LADO, num(r.h, ALTURA_NOVO)))
  const x = Math.min(100 - w, Math.max(0, num(r.x)))
  const y = Math.min(100 - h, Math.max(0, num(r.y)))
  return { x: arred(x), y: arred(y), w: arred(w), h: arred(h) }
}

const sobrepoe = (a: Retangulo, b: Retangulo) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

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
  if (blocos.length > 60) return 'No máximo 60 blocos por andar.'
  const ids: string[] = []
  const saida: Bloco[] = []
  for (const b of blocos as Record<string, unknown>[]) {
    const nome = String(b?.nome ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
    if (!nome) return 'Todo bloco precisa de nome.'
    const id = String(b?.id || '') && !ids.includes(String(b.id)) ? String(b.id).slice(0, 60) : idUnico(nome, ids)
    ids.push(id)
    saida.push({ id, nome, ...limitarRet(b as Partial<Retangulo>) })
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
