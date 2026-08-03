// =============================================================================
// CATÁLOGO DE OCORRÊNCIAS — fonte única da verdade.
//
// 4 categorias (OS, PV, RH, Frota) com subcategorias e PONTOS FIXOS
// (escala 1..10 sobre a base 100/mês do painel — pontos NUNCA são digitados
// à mão). Régua definida em 24/07/2026 (usuário ajustou: pilotagem 4,
// requisição de abastecimento 5). `tipoLegado` mantém a coluna `tipo`
// compatível com integrações antigas (fila de atrasos do RH filtra
// tipo='atraso'). `auto: true` = subcategoria gerável por automação.
//
// O app NT_Mecanicos consome via GET /api/ocorrencias/catalogo (com cache
// e fallback local) — mudar pontos/labels aqui não exige redeploy do app.
// =============================================================================

export type CategoriaOcorrencia = 'os' | 'pv' | 'rh' | 'frota'

export interface SubcategoriaOcorrencia {
  slug: string
  label: string
  pontos: number
  /** Dica curta exibida no formulário. */
  ajuda?: string
  /** Valor gravado na coluna `tipo` (compat com integrações antigas). */
  tipoLegado?: string
  /** Gerável por automação (badge AUTO). */
  auto?: boolean
}

export interface CategoriaInfo {
  label: string
  cor: string
  icone: string // nome do ícone lucide (referência p/ UIs)
  subcategorias: SubcategoriaOcorrencia[]
}

export const CATALOGO_OCORRENCIAS: Record<CategoriaOcorrencia, CategoriaInfo> = {
  os: {
    label: 'OS',
    cor: '#0c63e4',
    icone: 'Wrench',
    subcategorias: [
      { slug: 'retorno_servico', label: 'Retorno de serviço', pontos: 8, ajuda: 'Serviço voltou por falha de execução' },
      { slug: 'falta_informacao_os', label: 'Falta de informação', pontos: 3, ajuda: 'OS sem dados essenciais (relato, horas, fotos…)' },
      { slug: 'reclamacao_cliente', label: 'Reclamação de cliente', pontos: 6 },
      { slug: 'saida_sem_os', label: 'Saída sem OS', pontos: 7, ajuda: 'Atendimento externo sem OS aberta' },
      { slug: 'alimentacao_sem_troco', label: 'Alimentação sem troco', pontos: 3, ajuda: 'Não devolveu troco/comprovante da alimentação' },
      { slug: 'entregue_os_fisica', label: 'Entregue OS física', pontos: 2, ajuda: 'Processo é digital' },
      { slug: 'atraso_ordem', label: 'Atraso de ordem', pontos: 4, ajuda: 'OS estourou a previsão de execução' },
      { slug: 'apontamento_horas_incorreto', label: 'Apontamento de horas incorreto', pontos: 3, ajuda: 'Horas não apontadas ou erradas na OS' },
      { slug: 'sem_requisicao', label: 'Não pediu requisição', pontos: 10, ajuda: 'Usou peça/serviço sem abrir a requisição' },
    ],
  },
  pv: {
    label: 'PV',
    cor: '#7c3aed',
    icone: 'ShoppingCart',
    subcategorias: [
      { slug: 'falta_informacao_pv', label: 'Falta de informação', pontos: 3 },
      { slug: 'extravio_peca', label: 'Extravio de peça', pontos: 8 },
      { slug: 'peca_danificada', label: 'Peça danificada', pontos: 6 },
    ],
  },
  rh: {
    label: 'RH',
    cor: '#d97706',
    icone: 'Users',
    subcategorias: [
      { slug: 'pandora_cuidados', label: 'Cuidados com a Pandora/oficina', pontos: 3, ajuda: 'Portão aberto, segurança da mascote e do pátio' },
      { slug: 'atraso_sem_justificativa', label: 'Atraso +5min s/ justificativa', pontos: 2, tipoLegado: 'atraso' },
      { slug: 'falta_sem_justificativa', label: 'Falta no dia s/ justificativa', pontos: 10 },
      { slug: 'atos_subversivos', label: 'Atos subversivos / agitador', pontos: 7 },
      { slug: 'falta_epi', label: 'Falta de EPI', pontos: 5 },
      { slug: 'organizacao', label: 'Organização individual/coletiva', pontos: 2 },
      { slug: 'tomou_opa', label: 'Tomou OPA', pontos: 4 },
      { slug: 'saida_antecipada', label: 'Embora mais cedo sem aviso', pontos: 5 },
      { slug: 'ferramenta_danificada_perdida', label: 'Ferramenta danificada/perdida', pontos: 5 },
      { slug: 'uniforme_apresentacao', label: 'Uniforme/apresentação', pontos: 2 },
    ],
  },
  frota: {
    label: 'Frota',
    cor: '#0d9488',
    icone: 'Car',
    subcategorias: [
      { slug: 'checklist_carro', label: 'Checklist do carro', pontos: 2, ajuda: 'Não fez o checklist ao pegar/devolver' },
      { slug: 'carro_sujo', label: 'Carro sujo', pontos: 2 },
      { slug: 'multa_autuacao', label: 'Multa/autuação', pontos: 8, auto: true },
      { slug: 'quebra_acidente', label: 'Quebra/acidente de carro', pontos: 9 },
      { slug: 'deslocamento_desnecessario', label: 'Deslocamento desnecessário', pontos: 4 },
      { slug: 'pilotagem_perigosa', label: 'Pilotagem indevida/perigosa', pontos: 4, ajuda: 'Julgamento manual (vídeo/denúncia)' },
      { slug: 'excesso_velocidade', label: 'Excesso de velocidade', pontos: 6, auto: true, ajuda: 'Automática: 115+ km/h sustentado no rastreador' },
      { slug: 'consumo_anormal', label: 'Consumo de combustível anormal', pontos: 5, auto: true },
      { slug: 'requisicao_abastecimento', label: 'Requisição p/ abastecimento', pontos: 5, auto: true, ajuda: 'Abasteceu por requisição em vez do cartão' },
    ],
  },
}

export const CATEGORIAS: CategoriaOcorrencia[] = ['os', 'pv', 'rh', 'frota']

/** Tipos antigos (linhas categoria='legado') — só para RENDER das existentes. */
export const LEGADO_TIPOS: Record<string, { label: string; color: string }> = {
  atraso: { label: 'Atraso', color: '#D97706' },
  erro: { label: 'Erro', color: '#DC2626' },
  retrabalho: { label: 'Retrabalho', color: '#B91C1C' },
  falta_material: { label: 'Falta Material', color: '#7C3AED' },
  outros: { label: 'Outros', color: '#71717A' },
}

export function getSubcategoria(
  categoria: CategoriaOcorrencia | string,
  slug: string | null | undefined,
): SubcategoriaOcorrencia | null {
  const cat = CATALOGO_OCORRENCIAS[categoria as CategoriaOcorrencia]
  if (!cat || !slug) return null
  return cat.subcategorias.find((s) => s.slug === slug) ?? null
}

/** Rótulo pronto pra qualquer linha (nova ou legada). */
export function rotuloOcorrencia(o: {
  categoria?: string | null
  subcategoria?: string | null
  tipo?: string | null
}): { label: string; cor: string; categoriaLabel: string } {
  if (o.categoria && o.categoria !== 'legado') {
    const cat = CATALOGO_OCORRENCIAS[o.categoria as CategoriaOcorrencia]
    const sub = getSubcategoria(o.categoria, o.subcategoria)
    return {
      label: sub?.label ?? o.subcategoria ?? o.tipo ?? 'Ocorrência',
      cor: cat?.cor ?? '#71717A',
      categoriaLabel: cat?.label ?? o.categoria.toUpperCase(),
    }
  }
  const leg = LEGADO_TIPOS[o.tipo ?? ''] ?? LEGADO_TIPOS.outros
  return { label: leg.label, cor: leg.color, categoriaLabel: 'Legado' }
}
