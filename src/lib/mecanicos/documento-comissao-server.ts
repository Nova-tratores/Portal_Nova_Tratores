// Documentos da comissão autorizada e a pasta do funcionário no RH (05/11/2026) — SÓ SERVIDOR.
//  · montarDocumento: autorização (com o de acordo do técnico), recibo, ou os dois na mesma impressão;
//  · registrarRecibo: anexa o recibo assinado (escaneado);
//  · enviarParaPastaRH: copia o de acordo / o recibo assinados para a aba Documentos do funcionário no sistema do RH
//    (rh_documentos + bucket rh-documentos, caminho <funcionario>/<ts>-<nome>, igual ao upload do RH).
// SQL: sql/comissao-de-acordo-tecnico.sql + sql/comissao-recibo-pasta-rh.sql.
import fs from 'fs'
import path from 'path'
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { clienteRH } from './rh-server'
import { pedidoCompleto, codigoPedido, acharFuncionarioRH, registrarEvento, SemCiencia, type PedidoComissao } from './lancamento-comissao-server'
import { htmlAutorizacaoComissao } from './autorizacao-comissao-doc'
import { secaoRecibo, htmlReciboComissao, type DocRecibo } from './recibo-comissao-doc'
import { aceitaCiencia } from './de-acordo'
import { PCT_CAIXINHA, qtdParcelas, caixinhaDe } from './descontos-tecnico'
import { dadosEmpresa } from '@/lib/recibos/server'

type Rec = Record<string, unknown>

// a logo vai dentro do HTML: o documento abre como blob (e vai para a pasta do RH), e a origem da requisição no
// Railway é a interna do contêiner — o endereço montado com ela não carrega no navegador (05/11/2026)
let logoCache: string | null = null
function logoEmbutida(): string {
  if (logoCache) return logoCache
  try { logoCache = `data:image/png;base64,${fs.readFileSync(path.join(process.cwd(), 'public', 'Logo_Nova.png')).toString('base64')}` } catch { return '/Logo_Nova.png' }
  return logoCache
}
const BUCKET_TERMOS = 'comissoes-termos'
const BUCKET_RH = 'rh-documentos'
const r2 = (n: number) => Math.round(n * 100) / 100
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const mesTxt = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(0, 4)}`
export type QualDoc = 'ciencia' | 'recibo'

/** Funcionário no RH: id, nome, CPF e empresa (para o recibo e a pasta). null se o RH não estiver configurado. */
async function funcionarioDoPedido(p: PedidoComissao): Promise<{ id: string; nome: string; cpf: string | null; empresa: string } | null> {
  const c = clienteRH()
  if (!c) return null
  const f = await acharFuncionarioRH(c, p.tecnico, 'id, nome, cpf, empresa, status')
  return f ? { id: String(f.id), nome: String(f.nome), cpf: (f.cpf as string) || null, empresa: String(f.empresa || 'NOVA') } : null
}

async function dadosRecibo(p: PedidoComissao, logo: string): Promise<DocRecibo> {
  const f = await funcionarioDoPedido(p).catch(() => null)
  const castro = f?.empresa === 'CASTRO'
  const emp = await dadosEmpresa(castro ? 'Castro Pecas' : 'Nova Tratores').catch(() => ({ razao_social: castro ? 'Castro Peças' : 'Nova Tratores', cnpj: null }))
  // neste pagamento sai a 1ª parcela de cada desconto; o pago pela caixinha não sai do técnico
  const descontos = (p.descontos || []).filter((x) => x.fonte !== 'caixinha')
    .map((x) => ({ descricao: `${x.tipo === 'requisicao' && x.ref ? `Requisição #${x.ref} — ` : ''}${x.descricao}${qtdParcelas(x) > 1 ? ` (parcela 1/${qtdParcelas(x)})` : ''}`, valor: r2(x.valor / qtdParcelas(x)) }))
  // assinada antes de a caixinha ser desligada (04/11/2026) continua com o 1% que foi retido de verdade
  const caixinha = p.info?.semCaixinha ? 0 : String(p.decidido_em || '') < '2026-11-04' ? r2(p.valor / 100) : caixinhaDe(p.valor)
  return {
    codigo: codigoPedido(p), tecnico: p.tecnico, nomeRh: f?.nome || p.info?.nomeRh, cpf: f?.cpf, mes: p.mes, comissao: Number(p.valor), descontos, caixinha,
    empresa: { razao: emp.razao_social, cnpj: emp.cnpj || null, cidade: castro ? null : 'Piraju' },
    logo, emitidoEm: new Date().toISOString(),
  }
}

/** HTML para imprimir: 'autorizacao' (com o de acordo), 'recibo' ou 'ambos' (de acordo + recibo, páginas separadas). */
export async function montarDocumento(p: PedidoComissao, qual: 'autorizacao' | 'recibo' | 'ambos' = 'autorizacao'): Promise<string> {
  const logo = logoEmbutida()
  const autorizada = !!p.assinatura_diretor && ['espelhada', 'erro_rh', 'substituida'].includes(p.status)
  if (qual === 'recibo') return htmlReciboComissao(await dadosRecibo(p, logo))
  const anexo = qual === 'ambos' && autorizada ? secaoRecibo(await dadosRecibo(p, logo)) : null
  return htmlAutorizacaoComissao({
    codigo: codigoPedido(p), tecnico: p.tecnico, nomeRh: p.info?.nomeRh, cargo: p.info?.cargo, mes: p.mes, pct: p.info?.pct ?? null, pagamentoPrevisto: p.info?.pagamento || null,
    linhas: (p.linhas || []).map((l) => ({ os: l.os, numero: l.numero || l.os, data: l.data || null, cliente: l.cliente, grupo: l.grupo || 'cliente', regra: l.regra || '', calculado: Number(l.calculado) || 0, valor: Number(l.valor) || 0, acao: l.acao, motivo: l.motivo, divisao: l.divisao || null, descontoCliente: l.descontoCliente || null })),
    solicitante: { nome: p.pedido_por || '—', papel: 'Pós-Vendas · pediu a autorização', em: p.assinatura_pedido_meta?.em || p.pedido_em, imagem: p.assinatura_pedido || null, ip: p.assinatura_pedido_meta?.ip },
    diretor: autorizada ? { nome: p.decidido_por || '—', papel: 'Diretor · autorizou', em: p.assinatura_diretor_meta?.em || p.decidido_em || p.pedido_em, imagem: p.assinatura_diretor || null, ip: p.assinatura_diretor_meta?.ip, observacao: p.observacao } : null,
    descontos: p.descontos || [], caixinhaPct: p.info?.semCaixinha ? 0 : autorizada && String(p.decidido_em || '') < '2026-11-04' ? 1 : PCT_CAIXINHA,
    tecnicoAcordo: autorizada ? { forma: p.ciencia_status === 'de_acordo' ? p.ciencia_forma || null : null, nome: p.ciencia_nome, em: p.ciencia_em, imagem: p.ciencia_assinatura || null, ip: p.ciencia_meta?.ip, registradoPor: p.ciencia_registrada_por, contestou: p.ciencia_status === 'contestou' ? p.ciencia_motivo || 'sem motivo' : null } : null,
    anexo, logo, emitidoEm: new Date().toISOString(),
    rh: autorizada ? { em: p.status === 'erro_rh' ? null : p.espelhado_em, erro: p.status === 'erro_rh' ? p.rh_erro || 'erro ao lançar' : null } : null,
  })
}

/** Anexa o recibo assinado (escaneado). Pode trocar o arquivo depois (ex.: escaneou torto). */
export async function registrarRecibo(id: string, arquivo: { nome: string; tipo: string; bytes: Buffer }, autor: { id: string; nome: string }) {
  const p = await pedidoCompleto(id)
  if (!p) throw Object.assign(new Error('Pedido não encontrado'), { status: 404 })
  if (!aceitaCiencia(p)) throw Object.assign(new Error('Só comissão autorizada pelo diretor tem recibo'), { status: 409 })
  if (!arquivo.bytes.length) throw Object.assign(new Error('Anexe o recibo assinado'), { status: 400 })
  const ext = (arquivo.nome.match(/\.([a-z0-9]{2,5})$/i)?.[1] || (arquivo.tipo === 'application/pdf' ? 'pdf' : 'jpg')).toLowerCase()
  const caminho = `${p.mes}/${p.id}/recibo-${Date.now()}.${ext}`
  const { error: eu } = await sb.storage.from(BUCKET_TERMOS).upload(caminho, arquivo.bytes, { contentType: arquivo.tipo, upsert: false })
  if (eu) throw /not found/i.test(eu.message) ? new SemCiencia() : new Error(`Não consegui guardar o recibo: ${eu.message}`)
  const agora = new Date().toISOString()
  const { error } = await sb.from('posvendas_comissoes').update({ recibo_em: agora, recibo_arquivo: caminho, recibo_arquivo_nome: arquivo.nome.slice(0, 200), recibo_registrado_por: autor.nome, recibo_registrado_por_id: autor.id, recibo_rh_doc_id: null, recibo_rh_erro: null }).eq('id', id)
  if (error) { if (/recibo_|column|schema cache/i.test(error.message)) throw new SemRecibo(); throw new Error(error.message) }
  await registrarEvento(p, 'recibo', autor, p.valor, { arquivo: arquivo.nome, troca: !!p.recibo_arquivo })
}
export class SemRecibo extends Error { constructor() { super('Falta rodar o SQL sql/comissao-recibo-pasta-rh.sql (recibo da comissão).') } }

/** Copia o documento assinado para a pasta do funcionário no RH. Grava o id ou o erro (para tentar de novo). */
export async function enviarParaPastaRH(id: string, qual: QualDoc): Promise<{ ok: boolean; erro?: string }> {
  const p = await pedidoCompleto(id)
  if (!p) return { ok: false, erro: 'Pedido não encontrado' }
  const colId = qual === 'ciencia' ? 'ciencia_rh_doc_id' : 'recibo_rh_doc_id'
  const colErro = qual === 'ciencia' ? 'ciencia_rh_erro' : 'recibo_rh_erro'
  const marcar = async (v: Rec) => { await sb.from('posvendas_comissoes').update(v).eq('id', id).then(() => {}, () => {}) }
  try {
    const c = clienteRH()
    if (!c) throw new Error('RH não configurado neste servidor (RH_SUPABASE_URL)')
    const f = await funcionarioDoPedido(p)
    if (!f) throw new Error(`Não achei ${p.tecnico} no RH`)
    // o arquivo: a folha escaneada; o de acordo assinado na tela vira o documento em HTML (com a assinatura)
    let bytes: Buffer, tipo: string, ext: string
    const caminho = qual === 'ciencia' ? p.ciencia_arquivo : p.recibo_arquivo
    if (caminho) {
      const { data, error } = await sb.storage.from(BUCKET_TERMOS).download(caminho)
      if (error || !data) throw new Error(`Não consegui ler o arquivo guardado: ${error?.message || 'vazio'}`)
      bytes = Buffer.from(await data.arrayBuffer()); tipo = data.type || 'application/octet-stream'; ext = caminho.split('.').pop() || 'jpg'
    } else if (qual === 'ciencia' && p.ciencia_status === 'de_acordo' && p.ciencia_forma === 'tela') {
      bytes = Buffer.from(await montarDocumento(p, 'autorizacao'), 'utf8'); tipo = 'text/html'; ext = 'html'
    } else throw new Error(qual === 'ciencia' ? 'O de acordo ainda não foi registrado' : 'O recibo ainda não foi anexado')
    const rotulo = qual === 'ciencia' ? 'de-acordo' : 'recibo'
    const path = `${f.id}/${Date.now()}-comissao-${p.mes}-${rotulo}.${ext}`
    const { error: eu } = await c.storage.from(BUCKET_RH).upload(path, bytes, { contentType: tipo, upsert: false })
    if (eu) throw new Error(`RH (arquivo): ${eu.message}`)
    const descricao = `Comissão ${mesTxt(p.mes)} — ${qual === 'ciencia' ? 'de acordo do técnico' : 'recibo'} assinado · ${codigoPedido(p)} (portal)`
    const { data: doc, error: ed } = await c.from('rh_documentos').insert({ funcionario_id: f.id, tipo: qual === 'ciencia' ? 'comissao_de_acordo' : 'comissao_recibo', descricao, arquivo_url: path, data_validade: null, criado_por: null }).select('id').single()
    if (ed) { await c.storage.from(BUCKET_RH).remove([path]).catch(() => {}); throw new Error(`RH: ${ed.message}`) }
    // se já tinha uma cópia anterior (arquivo trocado), a antiga sai da pasta
    const antigo = (p as unknown as Rec)[colId] as string | null
    if (antigo) {
      const { data: velho } = await c.from('rh_documentos').select('arquivo_url').eq('id', antigo).maybeSingle()
      await c.from('rh_documentos').delete().eq('id', antigo).then(() => {}, () => {})
      if ((velho as Rec | null)?.arquivo_url) await c.storage.from(BUCKET_RH).remove([String((velho as Rec).arquivo_url)]).catch(() => {})
    }
    await marcar({ [colId]: String((doc as Rec).id), [colErro]: null })
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await marcar({ [colErro]: msg.slice(0, 500) })
    return { ok: false, erro: msg }
  }
}

/** Link temporário (10 min) do arquivo guardado no portal. */
export async function arquivoDoPedido(id: string, qual: QualDoc): Promise<string | null> {
  const p = await pedidoCompleto(id)
  const caminho = qual === 'ciencia' ? p?.ciencia_arquivo : p?.recibo_arquivo
  if (!caminho) return null
  const { data, error } = await sb.storage.from(BUCKET_TERMOS).createSignedUrl(caminho, 600)
  if (error) throw new Error(error.message)
  return data?.signedUrl || null
}
