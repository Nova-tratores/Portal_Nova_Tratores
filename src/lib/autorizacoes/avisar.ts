// Aviso do pedido de autorização (José, 24/11/2026) — SÓ SERVIDOR.
// "Quando alguém pedir autorização, manda e-mail para quem foi solicitado, dizendo que para autorizar
//  é só entrar no portal; e manda mensagem pelo Chatwoot. Se não tiver o número da pessoa, me avisa."
// Vale para os 4 pedidos da aba Autorizações:
//   Requisição  → a lista "Pedido para"; vazia = todos que decidem (listarAutorizadores)
//   Comissão, Ficha cadastral → o(s) Diretor(es)
//   Solicitação de compra     → a Diretoria de Compras (config da SC)
// Quem pediu recebe no sino o nome de quem ficou sem o WhatsApp (sem celular no cadastro ou erro).
// Nunca lança: aviso que falha vai para o log e o pedido segue.
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { enviarEmail } from '@/lib/dre-financeiro/email'
import { PORTAL } from '@/lib/reunioes/convite'
import { avisarPeloChatwoot, motivoTxt } from '@/lib/chatwoot/avisar-pessoa'
import { parseValorBR } from '@/lib/requisicoes/autorizacao'
import { listarAutorizadores } from './server'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// o mesmo pedido não avisa de novo em menos de 10 min (clique duplo, tela aberta duas vezes)
const ultimoAviso = new Map<string, number>()

export type ResultadoAvisoPedido = { avisados: string[]; semWhats: { nome: string; motivo: string }[]; pulado?: string }

export type PedidoAviso = {
  /** identifica o pedido (para não repetir), ex.: "req:7091" */
  chave: string
  /** quem precisa autorizar (ids do login) */
  para: string[]
  /** quem pediu: não recebe o próprio aviso e é quem fica sabendo de quem ficou sem WhatsApp */
  autorId: string
  quemPediu: string
  /** "uma requisição", "a comissão do técnico"… — completa "pediu a sua autorização para ___" */
  oque: string
  titulo: string
  valor?: number | null
  /** linhas extras do cartão (fornecedor, motivo…) */
  linhas?: string[]
  /** onde o aviso do sino leva quem pediu */
  linkPedido: string
}

export async function avisarAutorizacao(p: PedidoAviso): Promise<ResultadoAvisoPedido> {
  try {
    const agora = Date.now()
    if (agora - (ultimoAviso.get(p.chave) || 0) < 10 * 60 * 1000) return { avisados: [], semWhats: [], pulado: 'já avisado há pouco' }
    ultimoAviso.set(p.chave, agora)
    const alvo = [...new Set(p.para)].filter((u) => u && u !== p.autorId)
    if (!alvo.length) return { avisados: [], semWhats: [] }

    // sem a coluna celular (sql/reunioes-convite.sql) lê sem ela: todos caem em "sem celular"
    let q = await sb.from('financeiro_usu').select('id, nome, email, celular, ativo').in('id', alvo)
    if (q.error) q = await sb.from('financeiro_usu').select('id, nome, email, ativo').in('id', alvo) as typeof q

    const link = `${PORTAL}/empresa?area=autorizacoes`
    const linhas = (p.linhas || []).filter(Boolean)
    const avisados: string[] = []
    const semWhats: { nome: string; motivo: string }[] = []
    for (const u of (q.data || []) as { id: string; nome: string; email: string | null; celular?: string | null; ativo: boolean | null }[]) {
      if (u.ativo === false) continue
      const primeiro = (u.nome || '').split(' ')[0] || 'tudo bem'

      if (u.email) {
        const html = `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#0f172a;max-width:560px">
  <p>Olá, ${esc(primeiro)}!</p>
  <p><b>${esc(p.quemPediu)}</b> pediu a sua autorização para ${esc(p.oque)}:</p>
  <div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px 18px;margin:12px 0">
    <div style="font-size:18px;font-weight:bold">${esc(p.titulo)}</div>
    ${p.valor ? `<div style="margin-top:6px;font-size:17px">${brl(p.valor)}</div>` : ''}
    ${linhas.map((l) => `<div style="margin-top:6px;white-space:pre-wrap;color:#475569">${esc(l)}</div>`).join('')}
  </div>
  <p>Para autorizar ou recusar, é só entrar no portal:</p>
  <p><a href="${link}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:bold">Abrir as autorizações no portal</a></p>
  <p style="font-size:12.5px;color:#64748b">Se o botão não abrir, copie este endereço: ${link}</p>
</div>`
        const e = await enviarEmail({ to: u.email, subject: `Autorização pedida: ${p.titulo}${p.valor ? ` — ${brl(p.valor)}` : ''}`, html, fromNome: 'Autorizações · Portal Nova Tratores' })
        if (!e.ok) console.error('[autorizacoes] e-mail', u.email, e.motivo)
      }

      const texto = [
        `Olá, ${primeiro}! ${p.quemPediu} pediu a sua autorização para ${p.oque}:`,
        `*${p.titulo}*${p.valor ? ` — ${brl(p.valor)}` : ''}`,
        ...linhas.map((l) => l.slice(0, 300)),
        `Para autorizar, é só entrar no portal: ${link}`,
      ].join('\n')
      const w = await avisarPeloChatwoot(u.celular, u.nome, texto)
      if (w.ok) avisados.push(u.nome)
      else semWhats.push({ nome: u.nome, motivo: motivoTxt(w) })
    }

    // "se não tiver o número, me avisa": quem pediu fica sabendo no sino
    if (semWhats.length) {
      await sb.from('portal_notificacoes').insert({
        user_id: p.autorId, tipo: 'sistema',
        titulo: `Aviso pelo WhatsApp não foi para ${semWhats.map((s) => s.nome.split(' ')[0]).join(', ')}`.slice(0, 200),
        descricao: (semWhats.map((s) => `${s.nome}: ${s.motivo}`).join('\n') + '\nO e-mail foi. O celular se cadastra em Admin › ⋯ › Celular (WhatsApp).').slice(0, 1000),
        link: p.linkPedido,
      })
    }
    return { avisados, semWhats }
  } catch (e) {
    console.error('[autorizacoes] aviso', p.chave, e)
    return { avisados: [], semWhats: [] }
  }
}

/** ids dos Diretores (portal_permissoes.is_diretor) */
export async function idsDiretores(): Promise<string[]> {
  const { data } = await sb.from('portal_permissoes').select('user_id').eq('is_diretor', true)
  return ((data || []) as { user_id: string }[]).map((x) => String(x.user_id))
}

/** Requisição: lê o pedido do banco e avisa (chamado pela tela logo depois de pedir). */
export async function avisarPedidoRequisicao(id: number, autorId: string): Promise<ResultadoAvisoPedido> {
  const { data: r } = await sb.from('Requisicao')
    .select('id, titulo, valor_despeza, fornecedor, solicitante, autorizacao_status, autorizacao_motivo, autorizacao_para').eq('id', id).maybeSingle()
  if (!r || r.autorizacao_status !== 'aguardando') return { avisados: [], semWhats: [], pulado: 'não está esperando autorização' }
  const para: string[] = Array.isArray(r.autorizacao_para) && r.autorizacao_para.length
    ? r.autorizacao_para.map(String)
    : (await listarAutorizadores()).filter((a) => a.decide).map((a) => a.id)
  const { data: eu } = await sb.from('financeiro_usu').select('nome').eq('id', autorId).maybeSingle()
  return avisarAutorizacao({
    chave: `req:${id}`, para, autorId,
    quemPediu: String(r.solicitante || eu?.nome || 'Alguém'),
    oque: 'uma requisição',
    titulo: `#${r.id} ${r.titulo || ''}`.trim(),
    valor: parseValorBR(r.valor_despeza) || null,
    linhas: [r.fornecedor ? `Fornecedor: ${r.fornecedor}` : '', r.autorizacao_motivo ? `“${r.autorizacao_motivo}”` : ''],
    linkPedido: `/requisicoes?req=${id}`,
  })
}
