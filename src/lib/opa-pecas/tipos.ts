// Peças Não Identificadas (aba do Opa) — tipos e rótulos.
// Banco: sql/pni-01..04 (tabelas pni_*, maquina_tipos, maquina_marcas).

/** Fluxo de venda (anda uma etapa por vez) */
export const STATUS_FLUXO = ['aguardando_identificacao', 'identificado', 'precificado', 'a_venda'] as const
/** Destinos finais: toda peça termina num deles */
export const STATUS_FINAIS = ['vendido', 'descartado', 'guardado', 'usado', 'outro_destino'] as const
export const STATUS = [...STATUS_FLUXO, ...STATUS_FINAIS] as const
export type Status = (typeof STATUS)[number]
export type StatusFinal = (typeof STATUS_FINAIS)[number]

export const QUALIDADES = ['nao_avaliada', 'nova', 'usada_boa', 'usada_com_avaria', 'sucata'] as const
export type Qualidade = (typeof QUALIDADES)[number]

export const ROTULO_STATUS: Record<Status, string> = {
  aguardando_identificacao: 'Aguardando separação',
  identificado: 'Aguardando verificação',
  precificado: 'Aguardando destino',
  a_venda: 'À venda',
  vendido: 'Vendido',
  descartado: 'Descartado',
  guardado: 'Guardado',
  usado: 'Usado',
  outro_destino: 'Outro destino',
}

export const COR_STATUS: Record<Status, { bg: string; fg: string }> = {
  aguardando_identificacao: { bg: '#FEF3C7', fg: '#92400E' },
  identificado: { bg: '#DBEAFE', fg: '#1E40AF' },
  precificado: { bg: '#EDE9FE', fg: '#5B21B6' },
  a_venda: { bg: '#D1FAE5', fg: '#065F46' },
  vendido: { bg: '#E5E7EB', fg: '#374151' },
  descartado: { bg: '#FEE2E2', fg: '#991B1B' },
  guardado: { bg: '#CCFBF1', fg: '#115E59' },
  usado: { bg: '#E0E7FF', fg: '#3730A3' },
  outro_destino: { bg: '#F3F4F6', fg: '#4B5563' },
}

export const ROTULO_QUALIDADE: Record<Qualidade, string> = {
  nao_avaliada: 'Não avaliada',
  nova: 'Nova',
  usada_boa: 'Usada boa',
  usada_com_avaria: 'Com avaria',
  sucata: 'Sucata',
}

/** Como cada qualidade aparece na tela (ordem de exibição = ordem deste objeto). */
export const INFO_QUALIDADE: Record<Qualidade, { dica: string; cor: string; fundo: string }> = {
  nova: { dica: 'Sem uso', cor: '#047857', fundo: '#ECFDF5' },
  usada_boa: { dica: 'Usada, funciona', cor: '#1D4ED8', fundo: '#EFF6FF' },
  usada_com_avaria: { dica: 'Tem defeito ou dano', cor: '#B45309', fundo: '#FFFBEB' },
  sucata: { dica: 'Só vale o material', cor: '#B91C1C', fundo: '#FEF2F2' },
  nao_avaliada: { dica: 'Ninguém olhou ainda', cor: '#52525B', fundo: '#F4F4F5' },
}

/** Etapas de trabalho das peças (sql/pni-08-etapas.sql). */
export type Etapa = 'captacao' | 'separacao' | 'verificacao' | 'destino'

/** Decisões da separação. Descartar e outro encerram na hora; as demais vão para verificação. */
export const DECISOES = ['vender', 'guardar', 'usar', 'descartar', 'outro'] as const
export type Decisao = (typeof DECISOES)[number]

export type CampoDecisao = 'descricao' | 'codigo_fabricante' | 'qualidade' | 'aplicacao' | 'preco' | 'local'

export const INFO_DECISAO: Record<Decisao, {
  rotulo: string
  dica: string
  cor: string
  /** campos liberados na separação para quem escolheu esta decisão */
  campos: CampoDecisao[]
  /** como a peça fica ao finalizar no destino */
  final: StatusFinal
  /** pergunta do destino (etapa 4) */
  destino: string
  /** texto da observação (vazio = sem observação) */
  obs: string
  obsObrigatoria: boolean
  encerra: boolean
}> = {
  vender: { rotulo: 'Vender', dica: 'Vai para venda após verificar valor e aplicação', cor: '#047857',
    campos: ['descricao', 'codigo_fabricante', 'qualidade', 'aplicacao', 'preco'], obs: '', obsObrigatoria: false, encerra: false,
    final: 'vendido', destino: 'Para quem foi vendida e por quanto' },
  guardar: { rotulo: 'Guardar no estoque', dica: 'Entra no estoque após a verificação', cor: '#0F766E',
    campos: ['descricao', 'codigo_fabricante', 'aplicacao', 'preco', 'local'], obs: '', obsObrigatoria: false, encerra: false,
    final: 'guardado', destino: 'Onde foi guardada (ex.: código no estoque, prateleira)' },
  usar: { rotulo: 'Usar na oficina', dica: 'Vai ser usada num serviço ou OS', cor: '#4338CA',
    campos: ['descricao', 'aplicacao'], obs: 'Em que vai ser usada (ex.: OS 1234)', obsObrigatoria: false, encerra: false,
    final: 'usado', destino: 'Em que foi usada (OS, máquina)' },
  descartar: { rotulo: 'Descartar', dica: 'Sucata, sem uso — encerra a peça', cor: '#B91C1C',
    campos: [], obs: 'Motivo do descarte', obsObrigatoria: true, encerra: true,
    final: 'descartado', destino: 'Motivo do descarte' },
  outro: { rotulo: 'Outro', dica: 'Outra coisa aconteceu — encerra a peça', cor: '#52525B',
    campos: [], obs: 'O que aconteceu com a peça', obsObrigatoria: true, encerra: true,
    final: 'outro_destino', destino: 'O que aconteceu com a peça' },
}

/** Setores com quem o valor e a aplicação são conferidos. */
export const SETORES_VERIFICACAO = ['Peças', 'Pós-Vendas', 'Oficina', 'Comercial', 'Fornecedor', 'Outro'] as const

export interface Foto {
  id: string
  storage_path: string
  ordem: number
}

export interface Aplicacao {
  id?: string
  tipo_maquina_id: string
  marca_id: string | null
}

export interface Item {
  id: string
  codigo: string
  codigo_fabricante: string | null
  descricao: string | null
  quantidade: number
  qualidade: Qualidade
  status: Status
  nao_identificavel: boolean
  preco_sugerido: number | null
  motivo_descarte: string | null
  observacoes: string | null
  etiqueta_impressa_em: string | null
  /** chave do link público da etiqueta (/e/<chave>, sem login) */
  token_publico: string
  local_id: string | null
  /** técnico do Box Técnico (nome) */
  local_tecnico: string | null
  /** o que aconteceu com a peça ao encerrar (motivo/descrição) */
  desfecho: string | null
  encerrado_em: string | null
  encerrado_por: string | null
  /** etapa 2 — o que foi decidido na separação */
  decisao: Decisao | null
  decisao_obs: string | null
  decidido_em: string | null
  decidido_por: string | null
  /** etapa 3 — verificação de valor e aplicação com o setor responsável */
  verificado_em: string | null
  verificado_por: string | null
  verificado_setor: string | null
  verificado_com: string | null
  verificacao_obs: string | null
  criado_por: string
  criado_em: string
  atualizado_por: string | null
  atualizado_em: string
  fotos: Foto[]
  aplicacoes: Aplicacao[]
}

export interface Lookup {
  id: string
  nome: string
  ativo: boolean
  ordem: number
}

export interface Local {
  id: string
  nome: string
  exige_tecnico: boolean
  ordem: number
  ativo: boolean
}

export interface Historico {
  id: number
  campo: 'criacao' | 'status' | 'qualidade' | 'preco' | 'codigo' | 'exclusao' | 'localizacao'
  de: string | null
  para: string | null
  motivo: string | null
  usuario: string | null
  em: string
}

/** Nomes por id (tipos, marcas e usuários), para montar textos. */
export interface Nomes {
  tipos: Record<string, string>
  marcas: Record<string, string>
  usuarios: Record<string, string>
  /** id do local → nome */
  locais?: Record<string, string>
}
