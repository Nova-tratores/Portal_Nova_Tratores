// Patrimônio Loja (aba do Opa) — tipos, rótulos e regras PURAS (testadas).
// Banco: sql/patrimonio-01.sql. Tudo passa pelas rotas /api/patrimonio/*.

export const ESTADOS = ['novo', 'bom', 'regular', 'ruim', 'sem_uso'] as const
export type Estado = (typeof ESTADOS)[number]

export const INFO_ESTADO: Record<Estado, { rotulo: string; dica: string; cor: string; fundo: string }> = {
  novo: { rotulo: 'Novo', dica: 'Sem uso ou quase', cor: '#047857', fundo: '#ECFDF5' },
  bom: { rotulo: 'Bom', dica: 'Funciona bem', cor: '#1D4ED8', fundo: '#EFF6FF' },
  regular: { rotulo: 'Regular', dica: 'Funciona, com desgaste', cor: '#B45309', fundo: '#FFFBEB' },
  ruim: { rotulo: 'Ruim', dica: 'Com defeito ou dano', cor: '#B91C1C', fundo: '#FEF2F2' },
  sem_uso: { rotulo: 'Sem uso', dica: 'Não serve mais', cor: '#52525B', fundo: '#F4F4F5' },
}

export const SITUACOES = ['em_uso', 'guardado', 'emprestado', 'manutencao'] as const
export type Situacao = (typeof SITUACOES)[number] | 'baixado'

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  em_uso: 'Em uso', guardado: 'Guardado', emprestado: 'Emprestado', manutencao: 'Em manutenção', baixado: 'Baixado',
}

/** Sugestões de categoria (dá para digitar outra). */
export const CATEGORIAS_PADRAO = [
  'Tecnologia / informática', 'Celular / tablet', 'Eletrônico', 'Móvel de escritório', 'Material de escritório',
  'Copa e cozinha', 'Eletrodoméstico', 'Climatização', 'Ferramenta manual', 'Ferramenta elétrica',
  'Equipamento de oficina', 'Limpeza', 'Segurança / EPI', 'Decoração', 'Veículo / implemento', 'Outro',
]

/** Tags prontas para clicar (de tecnologia a caneca); as já usadas aparecem junto. */
export const TAGS_SUGERIDAS = [
  'tecnologia', 'computador', 'notebook', 'monitor', 'impressora', 'celular', 'rede/wi-fi', 'cadeira', 'mesa', 'armário',
  'escritório', 'oficina', 'copa', 'caneca', 'cafeteira', 'geladeira', 'ar-condicionado', 'ventilador', 'ferramenta',
  'elétrica', 'bateria', 'limpeza', 'segurança', 'epi', 'recepção', 'showroom', 'empréstimo',
]

export interface FotoPat { id: string; storage_path: string; ordem: number }

export interface ItemPat {
  id: string
  codigo: string
  descricao: string
  categoria: string | null
  marca: string | null
  modelo: string | null
  numero_serie: string | null
  estado: Estado
  situacao: Situacao
  /** quantas unidades iguais (sql/patrimonio-02); o valor é POR UNIDADE */
  quantidade: number
  /** última impressão da etiqueta (sql/patrimonio-02) */
  etiqueta_impressa_em?: string | null
  local_id: string | null
  local_tecnico: string | null
  responsavel: string | null
  valor_atual: number | null
  valor_compra: number | null
  data_compra: string | null
  fornecedor: string | null
  nota_fiscal: string | null
  garantia_ate: string | null
  tags: string[]
  observacoes: string | null
  criado_por: string | null
  criado_em: string
  atualizado_em: string
  fotos: FotoPat[]
}

export interface Movimentacao {
  id: string
  de_local_id: string | null
  de_local_tecnico: string | null
  de_responsavel: string | null
  para_local_id: string | null
  para_local_tecnico: string | null
  para_responsavel: string | null
  situacao: string | null
  motivo: string | null
  por_nome: string | null
  em: string
}

/** Campos do formulário (criar/editar). Valores em texto como digitados. */
export interface DadosForm {
  descricao: string
  quantidade: string
  categoria: string
  marca: string
  modelo: string
  numero_serie: string
  estado: Estado
  situacao: Situacao
  local_id: string
  local_tecnico: string
  responsavel: string
  valor_atual: string
  valor_compra: string
  data_compra: string
  fornecedor: string
  nota_fiscal: string
  garantia_ate: string
  tags: string[]
  observacoes: string
}

export const FORM_VAZIO: DadosForm = {
  descricao: '', quantidade: '1', categoria: '', marca: '', modelo: '', numero_serie: '', estado: 'bom', situacao: 'em_uso',
  local_id: '', local_tecnico: '', responsavel: '', valor_atual: '', valor_compra: '', data_compra: '',
  fornecedor: '', nota_fiscal: '', garantia_ate: '', tags: [], observacoes: '',
}

export function formDoItem(i: ItemPat): DadosForm {
  const n = (v: number | null) => (v == null ? '' : String(v).replace('.', ','))
  return {
    descricao: i.descricao, quantidade: String(i.quantidade || 1), categoria: i.categoria || '', marca: i.marca || '', modelo: i.modelo || '', numero_serie: i.numero_serie || '',
    estado: i.estado, situacao: i.situacao, local_id: i.local_id || '', local_tecnico: i.local_tecnico || '', responsavel: i.responsavel || '',
    valor_atual: n(i.valor_atual), valor_compra: n(i.valor_compra), data_compra: i.data_compra || '', fornecedor: i.fornecedor || '',
    nota_fiscal: i.nota_fiscal || '', garantia_ate: i.garantia_ate || '', tags: i.tags || [], observacoes: i.observacoes || '',
  }
}

// ── regras puras ─────────────────────────────────────────────────────

/** "1.234,56" / "1234.56" / "R$ 300" → número; vazio → null; inválido → NaN. */
export function lerValor(s: string): number | null {
  const t = String(s ?? '').replace(/R\$|\s/g, '')
  if (!t) return null
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  const n = Number(normal)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN
}

/** Tag limpa: minúscula, sem # e sem espaços sobrando (até 30 letras). */
export function limparTag(t: string): string {
  return String(t ?? '').trim().replace(/^#+/, '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 30)
}

export function juntarTags(atuais: string[], novas: string): string[] {
  const out = [...atuais]
  for (const p of novas.split(/[,;]/)) {
    const t = limparTag(p)
    if (t && !out.includes(t)) out.push(t)
  }
  return out.slice(0, 20)
}

const dataOk = (s: string) => !s || /^\d{4}-\d{2}-\d{2}$/.test(s)

/** Valida e converte o formulário no que vai para o banco. */
export function validarForm(f: DadosForm): { erros: string[]; dados: Record<string, unknown> } {
  const erros: string[] = []
  const t = (s: string) => s.trim() || null
  if (!f.descricao.trim()) erros.push('a descrição')
  if (!f.local_id) erros.push('onde está')
  const valorAtual = lerValor(f.valor_atual)
  const valorCompra = lerValor(f.valor_compra)
  if (Number.isNaN(valorAtual)) erros.push('o valor (número inválido)')
  if (Number.isNaN(valorCompra)) erros.push('o valor de compra (número inválido)')
  if (!dataOk(f.data_compra) || !dataOk(f.garantia_ate)) erros.push('uma data válida')
  if (!(ESTADOS as readonly string[]).includes(f.estado)) erros.push('o estado')
  const qtd = Math.floor(Number(String(f.quantidade ?? '1').replace(',', '.')))
  if (!Number.isFinite(qtd) || qtd < 1 || qtd > 100000) erros.push('a quantidade (1 ou mais)')
  return {
    erros,
    dados: {
      descricao: f.descricao.trim().slice(0, 300), quantidade: Number.isFinite(qtd) && qtd >= 1 ? Math.min(qtd, 100000) : 1, categoria: t(f.categoria), marca: t(f.marca), modelo: t(f.modelo),
      numero_serie: t(f.numero_serie), estado: f.estado, situacao: f.situacao,
      local_id: f.local_id || null, local_tecnico: t(f.local_tecnico), responsavel: t(f.responsavel),
      valor_atual: Number.isNaN(valorAtual) ? null : valorAtual, valor_compra: Number.isNaN(valorCompra) ? null : valorCompra,
      data_compra: f.data_compra || null, fornecedor: t(f.fornecedor), nota_fiscal: t(f.nota_fiscal),
      garantia_ate: f.garantia_ate || null, tags: f.tags.map(limparTag).filter(Boolean), observacoes: t(f.observacoes),
    },
  }
}

export interface FiltrosPat { texto: string; categoria: string; local: string; estado: string; tag: string }
export const FILTROS_VAZIOS: FiltrosPat = { texto: '', categoria: '', local: '', estado: '', tag: '' }

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function filtrarItens(itens: ItemPat[], f: FiltrosPat, nomeLocal: (id: string) => string = (id) => id): ItemPat[] {
  const termos = semAcento(f.texto).split(/\s+/).filter(Boolean)
  return itens.filter((i) => {
    if (f.categoria && (i.categoria || '') !== f.categoria) return false
    if (f.local && i.local_id !== f.local) return false
    if (f.estado && i.estado !== f.estado) return false
    if (f.tag && !i.tags.includes(f.tag)) return false
    if (!termos.length) return true
    const alvo = semAcento([i.codigo, i.descricao, i.marca, i.modelo, i.numero_serie, i.categoria, i.responsavel, i.local_tecnico,
      i.local_id ? nomeLocal(i.local_id) : '', ...i.tags].filter(Boolean).join(' '))
    return termos.every((t) => alvo.includes(t))
  })
}

/** Totais: o valor é POR UNIDADE → soma valor × quantidade. */
export function totais(itens: ItemPat[]): { itens: number; unidades: number; valor: number; semValor: number } {
  let valor = 0
  let semValor = 0
  let unidades = 0
  for (const i of itens) {
    const q = i.quantidade || 1
    unidades += q
    if (i.valor_atual != null) valor += i.valor_atual * q
    else if (i.valor_compra != null) valor += i.valor_compra * q
    else semValor++
  }
  return { itens: itens.length, unidades, valor: Math.round(valor * 100) / 100, semValor }
}

/** "Box Técnico · Gabriel" / "Pós-Vendas" — onde está, para a tela. */
export function textoOnde(localId: string | null, tecnico: string | null, nomeLocal: (id: string) => string): string {
  if (!localId) return 'Sem local'
  return [nomeLocal(localId), tecnico].filter(Boolean).join(' · ')
}

/** Mudou de lugar, de mão ou de situação? (gera movimentação). */
export function mudouOnde(a: { local_id: string | null; local_tecnico: string | null; responsavel: string | null; situacao: string },
                          b: { local_id: string | null; local_tecnico: string | null; responsavel: string | null; situacao: string }): boolean {
  const n = (s: string | null) => (s || '').trim()
  return n(a.local_id) !== n(b.local_id) || n(a.local_tecnico) !== n(b.local_tecnico) || n(a.responsavel) !== n(b.responsavel) || a.situacao !== b.situacao
}
