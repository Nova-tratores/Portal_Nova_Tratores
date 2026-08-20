// Rastreio de notas — AGRUPAMENTO (puro, testável): junta resultados de
// tabelas diferentes na mesma FICHA quando pertencem ao mesmo documento.
//
// Regras:
//  - chaves de identidade (da mais forte pra mais fraca):
//      chave:<44>  >  nf:<num>~cnpj:<14>  >  nf:<num>~forn:<slug>
//    NUNCA por número sozinho — mesmo nº com contrapartes diferentes são
//    fichas separadas (fornecedores repetem numeração de NF).
//  - arestas diretas (independem de número): conta a pagar ↔ requisição
//    (requisicao_ids/motivo "#id"), conta a pagar ↔ título Omie
//    (omie_cod_lancamento), faturamento ↔ título (doc fiscal + empresa),
//    NF de entrada ↔ título (jsonb contas_pagar), faturamento ↔ pasta do
//    cliente (nº OS/PV + empresa).
//  - vínculos manuais 'liga' unem por último (prioridade sobre tudo).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { mesmoNumero, numeroCanonico, numeroNormalizado, slugContraparte, soDigitos, type TermoNormalizado } from './normalizar'
import type { DocumentoFicha, RefDoc, SecoesFicha, VinculoFicha } from './tipos'
import { refKey } from './tipos'

export interface DocsBrutos {
  contaPagar: any[]
  requisicoes: any[]
  chamadosReceber: any[]
  nfEntrada: any[]
  nfSaida: any[]
  /** linhas de contas_pagar/contas_receber do espelho DRE, com campo extra `tipo` */
  titulosOmie: any[]
  /** linhas de portal_nt_clientes_os/_pv, com campo extra `origem: 'os'|'pv'` */
  pastaCliente: any[]
}

export interface VinculoRow {
  id: number
  tipo_a: string
  id_a: string
  tipo_b: string
  id_b: string
  tipo_vinculo: string
  criado_por_nome: string | null
}

/** Ids das requisições que geraram a conta a pagar (coluna nova; fallback:
 *  parse do "#id" no motivo — linhas antigas, sem backfill). */
export function requisicaoIdsDe(row: { requisicao_ids?: unknown; motivo?: string | null; is_requisicao?: boolean }): number[] {
  if (Array.isArray(row.requisicao_ids) && row.requisicao_ids.length > 0) {
    return row.requisicao_ids.map(Number).filter(Number.isFinite)
  }
  if (!row.is_requisicao) return []
  return [...String(row.motivo || '').matchAll(/#(\d{1,9})\b/g)].map((m) => Number(m[1]))
}

/** 'Nova Tratores'/'NOVA'/'Castro Pecas'/'CASTRO'… → 'NOVA' | 'CASTRO' | null */
export function mapEmpresaOmie(v: unknown): 'NOVA' | 'CASTRO' | null {
  const s = String(v ?? '').toUpperCase()
  if (!s) return null
  if (s.includes('CASTRO')) return 'CASTRO'
  if (s.includes('NOVA')) return 'NOVA'
  return null
}

const empresaCompativel = (a: unknown, b: unknown) => {
  const ea = mapEmpresaOmie(a)
  const eb = mapEmpresaOmie(b)
  return ea === null || eb === null || ea === eb
}

// ---------------------------------------------------------------------------
// nós internos do union-find
// ---------------------------------------------------------------------------

interface No {
  /** tipo largo: inclui pseudo-tipos internos (pasta_os/pasta_pv, não vinculáveis) */
  ref: { tipo: string; id: string }
  doc: any
  /** chaves de identidade (chave:<44> / nf:<n>~cnpj:<c> / nf:<n>~forn:<slug>) */
  chaves: string[]
  secao: keyof SecoesFicha
}

// Emite AS DUAS chaves quando der (cnpj E slug do nome): um doc "forte" (com
// CNPJ do XML) precisa encontrar a requisição "fraca" (só nome do fornecedor)
// — se cada lado emitisse uma chave só, viviam em espaços disjuntos e o mesmo
// documento virava duas fichas.
const chavesIdentidade = (num: unknown, cnpj: unknown, nome: unknown): string[] => {
  const n = numeroNormalizado(num)
  if (!n) return []
  const out: string[] = []
  const c = soDigitos(cnpj)
  if (c.length === 14 || c.length === 11) out.push(`nf:${n}~cnpj:${c}`)
  const slug = slugContraparte(nome)
  if (slug) out.push(`nf:${n}~forn:${slug}`)
  return out
}

function nosDe(docs: DocsBrutos): No[] {
  const nos: No[] = []

  for (const d of docs.contaPagar) {
    const chaves: string[] = []
    if (d.nfe_chave) chaves.push(`chave:${soDigitos(d.nfe_chave)}`)
    chaves.push(...chavesIdentidade(d.numero_NF, d.nfe_cnpj_emitente, d.fornecedor))
    nos.push({ ref: { tipo: 'finan_pagar', id: String(d.id) }, doc: d, chaves, secao: 'contaPagar' })
  }
  for (const d of docs.requisicoes) {
    nos.push({
      ref: { tipo: 'requisicao', id: String(d.id) },
      doc: d,
      chaves: chavesIdentidade(d.numero_nota, null, d.fornecedor),
      secao: 'requisicoes',
    })
  }
  for (const d of docs.chamadosReceber) {
    const chaves: string[] = []
    for (const num of [d.num_nf_servico, d.num_nf_peca]) {
      chaves.push(...chavesIdentidade(num, d.cnpj_cliente, d.nom_cliente))
    }
    nos.push({ ref: { tipo: 'chamado_nf', id: String(d.id) }, doc: d, chaves, secao: 'chamadosReceber' })
  }
  for (const d of docs.nfEntrada) {
    const chaves: string[] = []
    const chave44 = soDigitos(d.complemento?.cChaveNFe || d.chave || '')
    if (chave44.length === 44) chaves.push(`chave:${chave44}`)
    const cnpjEmit = d.emitente?.cnpj_cpf || d.emitente?.cnpj || (chave44.length === 44 ? chave44.slice(6, 20) : null)
    chaves.push(...chavesIdentidade(d.numero_nf, cnpjEmit, d.nome_emitente))
    nos.push({ ref: { tipo: 'nota_entrada', id: String(d.ncod_nf ?? d.id ?? `${d.numero_nf}-${d.conta_omie}`) }, doc: d, chaves, secao: 'nfEntrada' })
  }
  for (const d of docs.nfSaida) {
    const chaves: string[] = []
    if (d.chave_nfe) chaves.push(`chave:${soDigitos(d.chave_nfe)}`)
    chaves.push(...chavesIdentidade(d.numero, d.cliente_doc, d.cliente_nome))
    nos.push({ ref: { tipo: 'nota_saida', id: String(d.n_cod_nf) }, doc: d, chaves, secao: 'nfSaida' })
  }
  for (const d of docs.titulosOmie) {
    // título NÃO ganha chave de identidade por número (não tem contraparte
    // nominal confiável) — entra só por aresta direta
    nos.push({ ref: { tipo: 'titulo_omie', id: String(d.codigo_lancamento) }, doc: d, chaves: [], secao: 'titulosOmie' })
  }
  for (const d of docs.pastaCliente) {
    nos.push({
      ref: { tipo: `pasta_${d.origem}`, id: String(d.origem === 'os' ? d.num_os : d.num_pedido) },
      doc: d,
      chaves: [],
      secao: 'pastaCliente',
    })
  }
  return nos
}

/** arestas diretas entre nós (pares de refKey) */
function arestasDe(nos: No[]): Array<[string, string]> {
  const arestas: Array<[string, string]> = []
  const fps = nos.filter((n) => n.ref.tipo === 'finan_pagar')
  const reqs = nos.filter((n) => n.ref.tipo === 'requisicao')
  const chamados = nos.filter((n) => n.ref.tipo === 'chamado_nf')
  const entradas = nos.filter((n) => n.ref.tipo === 'nota_entrada')
  const titulos = nos.filter((n) => n.ref.tipo === 'titulo_omie')
  const pastas = nos.filter((n) => String(n.ref.tipo).startsWith('pasta_'))

  for (const fp of fps) {
    const ids = requisicaoIdsDe(fp.doc)
    for (const req of reqs) {
      if (ids.includes(Number(req.doc.id))) arestas.push([refKey(fp.ref), refKey(req.ref)])
    }
    const codigos = String(fp.doc.omie_cod_lancamento || '').split(',').map((s) => s.trim()).filter(Boolean)
    for (const t of titulos) {
      if (codigos.includes(String(t.doc.codigo_lancamento))) arestas.push([refKey(fp.ref), refKey(t.ref)])
    }
  }
  for (const ch of chamados) {
    for (const t of titulos) {
      if (t.doc.tipo !== 'receber') continue
      if (!empresaCompativel(t.doc.conta_omie, ch.doc.omie_empresa)) continue
      if (mesmoNumero(t.doc.numero_documento_fiscal, ch.doc.num_nf_servico)
        || mesmoNumero(t.doc.numero_documento_fiscal, ch.doc.num_nf_peca)) {
        arestas.push([refKey(ch.ref), refKey(t.ref)])
      }
    }
    for (const p of pastas) {
      if (!empresaCompativel(p.doc.empresa, ch.doc.omie_empresa)) continue
      const casaOs = p.doc.origem === 'os' && mesmoNumero(p.doc.num_os, ch.doc.omie_num_os)
      const casaPv = p.doc.origem === 'pv' && mesmoNumero(p.doc.num_pedido, ch.doc.omie_num_pedido)
      if (casaOs || casaPv) arestas.push([refKey(ch.ref), refKey(p.ref)])
    }
  }
  for (const ne of entradas) {
    const cps: any[] = Array.isArray(ne.doc.contas_pagar) ? ne.doc.contas_pagar : []
    for (const t of titulos) {
      if (t.doc.tipo !== 'pagar') continue
      const porJson = cps.some((cp) => String(cp?.codigo_lancamento ?? cp?.codigo_lancamento_omie ?? '') === String(t.doc.codigo_lancamento))
      const porDoc = mesmoNumero(t.doc.numero_documento_fiscal, ne.doc.numero_nf)
        && empresaCompativel(t.doc.conta_omie, ne.doc.conta_omie)
      if (porJson || porDoc) arestas.push([refKey(ne.ref), refKey(t.ref)])
    }
  }
  return arestas
}

// ---------------------------------------------------------------------------
// union-find
// ---------------------------------------------------------------------------

class UF {
  private pai = new Map<string, string>()
  find(x: string): string {
    let r = this.pai.get(x)
    if (r === undefined) { this.pai.set(x, x); return x }
    if (r === x) return x
    r = this.find(r)
    this.pai.set(x, r)
    return r
  }
  union(a: string, b: string) {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.pai.set(ra, rb)
  }
}

export function agruparResultados(
  docs: DocsBrutos,
  vinculos: VinculoRow[],
  termo: TermoNormalizado,
): { fichas: Array<DocumentoFicha & { nosPorSecao: Record<keyof SecoesFicha, any[]> }>; totalDocs: number } {
  const nos = nosDe(docs)
  const uf = new UF()

  // 1) une por chave de identidade compartilhada
  const porChave = new Map<string, string[]>()
  for (const no of nos) {
    uf.find(refKey(no.ref))
    for (const ch of no.chaves) porChave.set(ch, [...(porChave.get(ch) || []), refKey(no.ref)])
  }
  for (const [, keys] of porChave) for (let i = 1; i < keys.length; i++) uf.union(keys[0], keys[i])

  // 2) arestas diretas
  for (const [a, b] of arestasDe(nos)) uf.union(a, b)

  // 3) vínculos manuais 'liga' — por último, prioridade máxima
  const manuais = vinculos.filter((v) => v.tipo_vinculo === 'liga')
  const manualKeys = new Set<string>()
  for (const v of manuais) {
    const ka = `${v.tipo_a}:${v.id_a}`
    const kb = `${v.tipo_b}:${v.id_b}`
    manualKeys.add(ka)
    manualKeys.add(kb)
    uf.union(ka, kb)
  }

  // 4) componentes → fichas
  const grupos = new Map<string, No[]>()
  for (const no of nos) {
    const raiz = uf.find(refKey(no.ref))
    grupos.set(raiz, [...(grupos.get(raiz) || []), no])
  }

  const fichas = [...grupos.values()].map((grupo) => montarFicha(grupo, manuais, manualKeys))

  // docKey precisa ser ÚNICO (é a key do React na lista): fichas distintas com
  // mesmo nº e contraparte vazia colidiriam — sufixa a repetição
  const vistos = new Map<string, number>()
  for (const f of fichas) {
    const n = (vistos.get(f.docKey) || 0) + 1
    vistos.set(f.docKey, n)
    if (n > 1) f.docKey = `${f.docKey}~${n}`
  }

  // ordena: match exato do termo primeiro
  const alvo = termo.tipo === 'chave_nfe' ? termo.nNFDaChave : termo.bruto
  fichas.sort((a, b) => Number(pontuacao(b, termo, alvo)) - Number(pontuacao(a, termo, alvo)))

  return { fichas, totalDocs: nos.length }
}

function pontuacao(f: DocumentoFicha, termo: TermoNormalizado, alvo: string | null): number {
  let p = 0
  if (termo.chaveNfe && f.chaveNfe === termo.chaveNfe) p += 100
  if (alvo && f.numeroNf && mesmoNumero(f.numeroNf, alvo)) p += 50
  if (termo.requisicaoId && f.secoes.requisicoes.some((r: any) => Number(r.id) === termo.requisicaoId)) p += 50
  p += Math.min(f.anexos.length, 10) // fichas mais completas primeiro no empate
  return p
}

function montarFicha(
  grupo: No[],
  manuais: VinculoRow[],
  manualKeys: Set<string>,
): DocumentoFicha & { nosPorSecao: Record<keyof SecoesFicha, any[]> } {
  const secoes: SecoesFicha = {
    contaPagar: [], requisicoes: [], chamadosReceber: [], nfEntrada: [], nfSaida: [], titulosOmie: [], pastaCliente: [],
  }
  const nosPorSecao = secoes as unknown as Record<keyof SecoesFicha, any[]>
  for (const no of grupo) secoes[no.secao].push(no.doc)

  // representantes: nº da NF / chave / contraparte / valor
  const fp = secoes.contaPagar[0]
  const ne = secoes.nfEntrada[0]
  const ns = secoes.nfSaida[0]
  const ch = secoes.chamadosReceber[0]
  const req = secoes.requisicoes[0]

  // exibição canônica preserva nº composto ('1384/1547' — não '13841547')
  const numeroNf = numeroCanonico(
    fp?.numero_NF ?? ne?.numero_nf ?? ns?.numero ?? ch?.num_nf_servico ?? ch?.num_nf_peca ?? req?.numero_nota,
  ) || null
  const chaveNfe = soDigitos(fp?.nfe_chave || ns?.chave_nfe || ne?.complemento?.cChaveNFe || '') || null
  const contraparte = {
    nome: fp?.fornecedor ?? ne?.nome_emitente ?? req?.fornecedor ?? ch?.nom_cliente ?? ns?.cliente_nome ?? null,
    doc: (soDigitos(fp?.nfe_cnpj_emitente) || soDigitos(ch?.cnpj_cliente) || soDigitos(ns?.cliente_doc)) || null,
  }
  const valorRef = Number(fp?.valor ?? ne?.valor_nf ?? ns?.valor_nf ?? ch?.valor_servico) || null

  const keysDoGrupo = new Set(grupo.map((n) => refKey(n.ref)))
  const vinculosDaFicha: VinculoFicha[] = manuais
    .filter((v) => keysDoGrupo.has(`${v.tipo_a}:${v.id_a}`) || keysDoGrupo.has(`${v.tipo_b}:${v.id_b}`))
    .map((v) => ({
      id: v.id,
      a: { tipo: v.tipo_a as RefDoc['tipo'], id: v.id_a },
      b: { tipo: v.tipo_b as RefDoc['tipo'], id: v.id_b },
      criado_por_nome: v.criado_por_nome,
    }))

  const docKey = chaveNfe
    ? `chave:${chaveNfe}`
    : numeroNf
      ? `nf:${numeroNf}~${contraparte.doc ? `cnpj:${contraparte.doc}` : `forn:${slugContraparte(contraparte.nome)}`}`
      : refKey(grupo[0].ref)

  return {
    docKey,
    numeroNf,
    chaveNfe,
    contraparte,
    valorRef,
    vinculoManual: grupo.some((n) => manualKeys.has(refKey(n.ref))),
    secoes,
    anexos: [], // preenchidos pela rota (resolve URLs/CSV)
    vinculos: vinculosDaFicha,
    nosPorSecao,
  }
}
