// Regras PURAS das Peças Não Identificadas. As de status espelham o banco
// (pni_transicao_valida / pni__conferir_requisitos — sql/pni-11-fluxo-novo):
// o banco é quem manda; aqui é só para a tela mostrar os botões certos e
// avisar antes de chamar a RPC. Mudou lá → muda aqui e nos testes.

import {
  ROTULO_QUALIDADE, ROTULO_STATUS, STATUS, STATUS_FINAIS,
  INFO_DECISAO, type Aplicacao, type Decisao, type Etapa, type Item, type Local, type Nomes, type Qualidade, type Status, type StatusFinal,
} from './tipos'

const VENDA: Status[] = ['a_venda', 'vendido']
const COM_PRECO: Status[] = ['a_venda', 'vendido']

export function ehFinal(s: Status): s is StatusFinal {
  return (STATUS_FINAIS as readonly Status[]).includes(s)
}

/** Destino que pede texto obrigatório (o que aconteceu) */
export function exigeMotivo(s: Status): boolean {
  return s === 'descartado' || s === 'outro_destino'
}

/** Fluxo novo: verificação ↔ separação → concluída; à venda → vendida (ou outro desfecho / volta). */
export function transicaoValida(de: Status, para: Status): boolean {
  if (de === para || ehFinal(de)) return false
  if (de === 'aguardando_identificacao') return para === 'identificado'
  if (de === 'identificado' || de === 'precificado') return para === 'aguardando_identificacao' || para === 'a_venda' || (ehFinal(para) && para !== 'vendido')
  if (de === 'a_venda') return para === 'identificado' || ehFinal(para)
  return false
}

export interface AcaoStatus {
  para: Status
  rotulo: string
  tipo: 'avancar' | 'voltar'
}

/** Ações de status fora das etapas: só sobram para quem está à venda. */
export function acoesDoStatus(s: Status): AcaoStatus[] {
  if (s !== 'a_venda') return []
  return [
    { para: 'vendido', rotulo: 'Vendida', tipo: 'avancar' },
    { para: 'identificado', rotulo: 'Voltar para separação', tipo: 'voltar' },
  ]
}

/** Etapa em que a peça está (null = encerrada). */
export function etapaDoItem(i: Pick<Item, 'status'>): Etapa | null {
  if (i.status === 'aguardando_identificacao') return 'verificacao'
  if (i.status === 'identificado' || i.status === 'precificado') return 'separacao'
  return 'concluida' // à venda e encerradas
}

/** O que falta para finalizar no destino (espelho de pni_finalizar). */
export function pendenciasDestino(decisao: Decisao | null, obs: string): string[] {
  if (!decisao) return ['escolher o destino']
  return INFO_DECISAO[decisao].obsObrigatoria && !obs.trim() ? [INFO_DECISAO[decisao].destino.toLowerCase()] : []
}

/** O que falta para separar com esta decisão (espelho de pni_separar). "outro" = destino criado. */
export function pendenciasSeparacao(decisao: Decisao | null, obs: string, destinoId?: string | null): string[] {
  if (!decisao) return ['escolher pra onde a peça vai']
  if (decisao === 'outro' && !destinoId && !obs.trim()) return ['escolher o destino']
  const info = INFO_DECISAO[decisao]
  return info.obsObrigatoria && !obs.trim() ? [info.obs.toLowerCase()] : []
}

/** O que falta para concluir a verificação (espelho de pni_verificar). */
export function pendenciasVerificacao(
  item: Pick<Item, 'decisao' | 'descricao' | 'aplicacoes' | 'preco_sugerido' | 'nao_identificavel'>, setor: string,
): string[] {
  const f: string[] = []
  if (!item.nao_identificavel) {
    if (!(item.descricao || '').trim()) f.push('descrição')
    if (item.aplicacoes.length === 0) f.push('aplicação')
  }
  if (!item.nao_identificavel && item.preco_sugerido == null) f.push('valor')
  if (!setor.trim()) f.push('setor consultado')
  return f
}

/** Destinos de encerramento que dá para escolher a qualquer momento (vendido sai pelo fluxo). */
export const DESTINOS: { status: StatusFinal; rotulo: string; dica: string }[] = [
  { status: 'guardado', rotulo: 'Guardada', dica: 'Onde/como foi guardada (ex.: entrou no estoque, prateleira X)' },
  { status: 'usado', rotulo: 'Usada', dica: 'Em que foi usada (ex.: OS 1234, trator do cliente Y)' },
  { status: 'descartado', rotulo: 'Descartada', dica: 'Motivo do descarte (obrigatório)' },
  { status: 'outro_destino', rotulo: 'Outro', dica: 'O que aconteceu com a peça (obrigatório)' },
]

/** O que falta para o item ficar no status `para` (vazio = pode). */
export function pendenciasPara(item: Pick<Item, 'descricao' | 'nao_identificavel' | 'preco_sugerido' | 'aplicacoes'>, para: Status, motivo?: string): string[] {
  const faltas: string[] = []
  if (VENDA.includes(para) && !item.nao_identificavel) {
    if (!(item.descricao || '').trim()) faltas.push('descrição')
    if (item.aplicacoes.length === 0) faltas.push('pelo menos uma aplicação')
  }
  if (COM_PRECO.includes(para) && item.preco_sugerido == null) faltas.push('preço sugerido')
  if (exigeMotivo(para) && !(motivo || '').trim()) faltas.push(para === 'descartado' ? 'motivo do descarte' : 'o que aconteceu')
  return faltas
}

/**
 * Campos do cadastro ainda em branco — o item pode ser salvo assim, mas a
 * tela mostra o aviso até alguém completar. Item encerrado não tem aviso.
 */
export function camposFaltando(item: Pick<Item, 'status' | 'local_id' | 'descricao' | 'aplicacoes' | 'preco_sugerido' | 'qualidade' | 'nao_identificavel'>): string[] {
  if (ehFinal(item.status) || item.status === 'a_venda') return []
  // aplicação e preço são da Verificação: antes dela não contam como falta
  const verificada = item.status !== 'aguardando_identificacao'
  const f: string[] = []
  if (!item.local_id) f.push('localização')
  if (!item.nao_identificavel) {
    if (!(item.descricao || '').trim()) f.push('descrição')
    if (verificada && item.aplicacoes.length === 0) f.push('aplicação')
  }
  if (verificada && item.preco_sugerido == null && !item.nao_identificavel) f.push('preço')
  if (item.qualidade === 'nao_avaliada') f.push('qualidade')
  return f
}

// ── Preço ───────────────────────────────────────────────────────────

/** "1.234,56" | "1234.56" | "150" → número; vazio → null; lixo → NaN. */
export function lerPreco(txt: string): number | null {
  const s = txt.trim().replace(/^R\$\s*/i, '')
  if (!s) return null
  let n: string
  if (s.includes(',')) n = s.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) n = s.replace(/\./g, '')
  else n = s
  if (!/^\d+(\.\d+)?$/.test(n)) return NaN
  return Math.round(Number(n) * 100) / 100
}

/**
 * Máscara de dinheiro para o campo de preço, no estilo caixa: só os dígitos
 * contam e os dois últimos são centavos. "15000" → "150,00"; "1234567" →
 * "12.345,67"; sem dígito → "". O resultado é lido por lerPreco.
 */
export function mascaraMoeda(digitado: string): string {
  const digitos = digitado.replace(/\D/g, '').replace(/^0+/, '').slice(0, 12)
  if (!digitos) return ''
  return (Number(digitos) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Número → texto do campo de preço ("1.234,50"); nulo → "". */
export function precoParaCampo(v: number | null | undefined): string {
  return v == null ? '' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtPreco(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** 1234.5 → "1234,50" (CSV: sem separador de milhar, Excel pt-BR lê como número) */
export function numeroCsv(v: number | null | undefined): string {
  if (v == null) return ''
  return v.toFixed(2).replace('.', ',')
}

// ── Datas ───────────────────────────────────────────────────────────

const TZ = 'America/Sao_Paulo'

/** ISO → "YYYY-MM-DD" no horário de Brasília (para filtro por data). */
export function diaLocal(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', { timeZone: TZ })
}

export function fmtDataHora(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export function fmtData(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: TZ })
}

// ── Aplicação em texto ──────────────────────────────────────────────

export function textoAplicacao(a: Aplicacao, nomes: Pick<Nomes, 'tipos' | 'marcas'>): string {
  const tipo = nomes.tipos[a.tipo_maquina_id] || '?'
  return a.marca_id ? `${tipo} ${nomes.marcas[a.marca_id] || '?'}` : `${tipo} (qualquer marca)`
}

export function textoAplicacoes(item: Pick<Item, 'aplicacoes' | 'nao_identificavel'>, nomes: Pick<Nomes, 'tipos' | 'marcas'>): string {
  if (item.aplicacoes.length === 0) return item.nao_identificavel ? 'Não identificável' : ''
  return item.aplicacoes.map((a) => textoAplicacao(a, nomes)).join('; ')
}

// ── Localização ─────────────────────────────────────────────────────

const AREA_DO_LOCAL: Record<string, { area: string; rotulo: string }> = {
  pos_vendas: { area: 'Pós-Vendas', rotulo: 'Térreo' },
  pos_vendas_2andar: { area: 'Pós-Vendas', rotulo: '2º andar' },
  pecas: { area: 'Peças', rotulo: 'Térreo' },
  pecas_2andar: { area: 'Peças', rotulo: '2º andar' },
  fundo_oficina: { area: 'Oficina', rotulo: 'Fundo' },
  lavador_torno: { area: 'Oficina', rotulo: 'Lavador/Torno' },
  box_tecnico: { area: 'Oficina', rotulo: 'Box Técnico' },
  barracao_2: { area: 'Barracão 2', rotulo: 'Barracão 2' },
}

/** Nome do local COM o setor ("Pós-Vendas · Térreo"): há "Térreo" em mais de um setor. */
export function nomeLocalCompleto(id: string, nome?: string): string {
  const info = AREA_DO_LOCAL[id]
  if (!info) return nome || id
  return info.area === info.rotulo ? info.rotulo : `${info.area} · ${info.rotulo}`
}

export function textoLocal(item: Pick<Item, 'local_id' | 'local_tecnico'>, locais: Record<string, string> = {}): string {
  if (!item.local_id) return ''
  const nome = nomeLocalCompleto(item.local_id, locais[item.local_id])
  return item.local_tecnico ? `${nome} (${item.local_tecnico})` : nome
}

/** Locais agrupados por área para a tela ("Pós-Vendas: Térreo | 2º andar"). Local desconhecido vai para "Outros". */
export interface GrupoLocal { titulo: string; itens: { local: Local; rotulo: string }[] }


export function agruparLocais(locais: Local[]): GrupoLocal[] {
  const grupos: GrupoLocal[] = []
  for (const l of [...locais].sort((a, b) => a.ordem - b.ordem)) {
    const info = AREA_DO_LOCAL[l.id] || { area: 'Outros', rotulo: l.nome }
    let g = grupos.find((x) => x.titulo === info.area)
    if (!g) { g = { titulo: info.area, itens: [] }; grupos.push(g) }
    g.itens.push({ local: l, rotulo: info.rotulo })
  }
  return grupos
}

// ── Filtros da visão do portal ──────────────────────────────────────

export interface Filtros {
  status: Status[]          // vazio = todos
  qualidade: Qualidade[]    // vazio = todas
  tipo: string              // id ou ''
  marca: string             // id ou ''
  local: string             // id do local ou ''
  precoMin: string          // texto digitado
  precoMax: string
  dataDe: string            // YYYY-MM-DD (criação)
  dataAte: string
  texto: string             // código, código do fabricante ou descrição
  soEtiquetaPendente: boolean
  soIncompletos: boolean
}

export const FILTROS_VAZIOS: Filtros = {
  status: [], qualidade: [], tipo: '', marca: '', local: '', precoMin: '', precoMax: '',
  dataDe: '', dataAte: '', texto: '', soEtiquetaPendente: false, soIncompletos: false,
}

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * Filtra os itens. Marca: a peça que serve "em qualquer marca" daquele tipo
 * também aparece ao filtrar uma marca (ela serve nessa marca). Tipo e marca
 * precisam casar na MESMA aplicação.
 */
export function filtrarItens(itens: Item[], f: Filtros): Item[] {
  const texto = semAcento(f.texto.trim())
  const min = lerPreco(f.precoMin)
  const max = lerPreco(f.precoMax)
  return itens.filter((i) => {
    if (f.status.length && !f.status.includes(i.status)) return false
    if (f.qualidade.length && !f.qualidade.includes(i.qualidade)) return false
    if (f.local && i.local_id !== f.local) return false
    if (f.tipo || f.marca) {
      const casa = i.aplicacoes.some((a) =>
        (!f.tipo || a.tipo_maquina_id === f.tipo) && (!f.marca || a.marca_id === f.marca || a.marca_id == null))
      if (!casa) return false
    }
    if (min != null && !Number.isNaN(min) && (i.preco_sugerido == null || i.preco_sugerido < min)) return false
    if (max != null && !Number.isNaN(max) && (i.preco_sugerido == null || i.preco_sugerido > max)) return false
    if (f.dataDe || f.dataAte) {
      const d = diaLocal(i.criado_em)
      if (f.dataDe && d < f.dataDe) return false
      if (f.dataAte && d > f.dataAte) return false
    }
    // (soEtiquetaPendente: não existe mais etiqueta pendente — filtro ignorado)
    if (f.soIncompletos && camposFaltando(i).length === 0) return false
    if (texto) {
      const alvo = semAcento([i.codigo, i.codigo_fabricante || '', i.descricao || '', i.local_tecnico || ''].join(' '))
      if (!alvo.includes(texto)) return false
    }
    return true
  })
}

/** Filtros ativos em texto (cabeçalho do PDF). */
export function resumoFiltros(f: Filtros, nomes: Pick<Nomes, 'tipos' | 'marcas' | 'locais'>): string[] {
  const r: string[] = []
  if (f.status.length) r.push(`Status: ${f.status.map((s) => ROTULO_STATUS[s]).join(', ')}`)
  if (f.qualidade.length) r.push(`Qualidade: ${f.qualidade.map((q) => ROTULO_QUALIDADE[q]).join(', ')}`)
  if (f.tipo) r.push(`Tipo: ${nomes.tipos[f.tipo] || '?'}`)
  if (f.marca) r.push(`Marca: ${nomes.marcas[f.marca] || '?'}`)
  if (f.local) r.push(`Local: ${nomes.locais?.[f.local] || f.local}`)
  if (f.precoMin.trim()) r.push(`Preço mín. ${f.precoMin.trim()}`)
  if (f.precoMax.trim()) r.push(`Preço máx. ${f.precoMax.trim()}`)
  if (f.dataDe) r.push(`Desde ${f.dataDe.split('-').reverse().join('/')}`)
  if (f.dataAte) r.push(`Até ${f.dataAte.split('-').reverse().join('/')}`)
  if (f.texto.trim()) r.push(`Busca: "${f.texto.trim()}"`)
  if (f.soIncompletos) r.push('Só cadastro incompleto')
  return r
}

// ── Totais ──────────────────────────────────────────────────────────

export interface Totais {
  porStatus: Record<Status, { itens: number; unidades: number }>
  itens: number
  unidades: number
  /** Σ quantidade × preço dos itens precificados ou à venda */
  valorSugerido: number
}

export function calcularTotais(itens: Item[]): Totais {
  const porStatus = Object.fromEntries(STATUS.map((s) => [s, { itens: 0, unidades: 0 }])) as Totais['porStatus']
  let unidades = 0
  let valor = 0
  for (const i of itens) {
    porStatus[i.status].itens++
    porStatus[i.status].unidades += i.quantidade
    unidades += i.quantidade
    if ((i.status === 'precificado' || i.status === 'a_venda') && i.preco_sugerido != null) {
      valor += i.quantidade * i.preco_sugerido
    }
  }
  return { porStatus, itens: itens.length, unidades, valorSugerido: Math.round(valor * 100) / 100 }
}

/** Fila do setor: mais antigo primeiro. */
export function ordenarFila(itens: Item[]): Item[] {
  return [...itens].sort((a, b) => a.criado_em.localeCompare(b.criado_em) || a.codigo.localeCompare(b.codigo))
}

// ── Código ──────────────────────────────────────────────────────────

/**
 * O código definitivo (PNI-000123) só é gerado quando a peça entra no
 * Destino; até lá ela tem um número provisório de captação (CAP-000045).
 */
export function codigoDefinitivo(codigo: string): boolean {
  return !/^CAP-/i.test(codigo)
}

/** Para texto corrido: o código, ou "captação nº 45" enquanto não tem código. */
export function nomeDoItem(codigo: string): string {
  return codigoDefinitivo(codigo) ? codigo : `captação nº ${Number(codigo.slice(4)) || codigo.slice(4)}`
}
