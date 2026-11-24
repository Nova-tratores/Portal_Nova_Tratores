// REUNIÕES — convite (José, 23/11/2026): e-mail para quem foi chamado, pedindo para aceitar no portal,
// e o texto/link do WhatsApp (wa.me). Colunas em sql/reunioes-convite.sql.
// Nunca lança: convite que falha só vai para o log, a reunião segue.
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { enviarEmail } from '@/lib/dre-financeiro/email'
import type { Ticket } from '@/lib/tickets/constantes'

export const PORTAL = (process.env.PORTAL_URL || 'https://portal.novatratores.com').replace(/\/$/, '')

/** "(15) 99999-1234" → "5515999991234". Devolve null se não parece celular do Brasil. */
export function normalizarCelular(s: unknown): string | null {
  let d = String(s ?? '').replace(/\D/g, '')
  if (d.startsWith('0')) d = d.replace(/^0+/, '')
  if (d.length === 10 || d.length === 11) d = `55${d}`
  return /^55\d{10,11}$/.test(d) ? d : null
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

function quandoDe(t: Ticket): string {
  if (!t.reuniao_inicio) return ''
  const d = new Date(t.reuniao_inicio)
  const dia = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit' })
  const hora = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
  return `${dia} às ${hora}`
}

/** descrição que a pessoa escreveu (a automática "Reunião em dd/mm/aaaa às hh:mm." não entra) */
function descricaoLivre(t: Ticket): string {
  const d = (t.descricao || '').trim()
  return /^Reunião( da série ".*")? em \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}\.$/.test(d) ? '' : d
}

/** Texto do convite para o WhatsApp (o link leva direto à reunião, onde estão os botões Aceitar/Recusar). */
export function textoConviteWhats(t: Ticket, nomePessoa: string, quemConvida: string): string {
  const primeiro = nomePessoa.split(' ')[0] || nomePessoa
  const desc = descricaoLivre(t)
  return [
    `Olá, ${primeiro}! ${quemConvida} te chamou para a reunião *${t.titulo}*`,
    quandoDe(t) ? `📅 ${quandoDe(t)}` : '',
    desc ? `\n${desc}\n` : '',
    `Confirme se vai participar pelo portal: ${PORTAL}/reunioes/${t.id}`,
  ].filter(Boolean).join('\n')
}

/**
 * Manda o convite pelo NovaZap/Chatwoot (José, 24/11/2026: "em reuniões também é pelo Chatwoot").
 * Devolve quem ficou sem (sem celular no cadastro ou erro) para quem chamou avisar o autor.
 */
export async function enviarConvitesWhats(t: Ticket, pessoas: string[], autorId: string | null): Promise<{ nome: string; motivo: string }[]> {
  const { avisarPeloChatwoot, motivoTxt } = await import('@/lib/chatwoot/avisar-pessoa')
  const alvo = [...new Set(pessoas)].filter((id) => id && id !== autorId)
  if (!alvo.length) return []
  const ids = autorId ? [...alvo, autorId] : alvo
  let q = await supabaseAdmin.from('financeiro_usu').select('id, nome, celular, ativo').in('id', ids)
  if (q.error) q = await supabaseAdmin.from('financeiro_usu').select('id, nome, ativo').in('id', ids) as typeof q   // sem a coluna celular
  const porId = new Map((q.data || []).map((u) => [u.id as string, u as { id: string; nome: string; celular?: string | null; ativo: boolean | null }]))
  const quem = (autorId && porId.get(autorId)?.nome) || 'Alguém'
  const falhas: { nome: string; motivo: string }[] = []
  for (const id of alvo) {
    const u = porId.get(id)
    if (!u || u.ativo === false) continue
    const r = await avisarPeloChatwoot(u.celular, u.nome, textoConviteWhats(t, u.nome || '', quem))
    if (!r.ok) falhas.push({ nome: u.nome, motivo: motivoTxt(r) })
  }
  return falhas
}

/** Manda o convite por e-mail para cada pessoa (uma mensagem por pessoa, com o nome dela). */
export async function enviarConvitesEmail(t: Ticket, pessoas: string[], autorId: string | null): Promise<void> {
  try {
    const alvo = [...new Set(pessoas)].filter((id) => id && id !== autorId)
    if (!alvo.length) return
    const ids = autorId ? [...alvo, autorId] : alvo
    const { data } = await supabaseAdmin.from('financeiro_usu').select('id, nome, email, ativo').in('id', ids)
    const porId = new Map((data || []).map((u) => [u.id as string, u as { id: string; nome: string; email: string | null; ativo: boolean | null }]))
    const quem = (autorId && porId.get(autorId)?.nome) || 'Alguém'
    const link = `${PORTAL}/reunioes/${t.id}`
    const desc = descricaoLivre(t)
    for (const id of alvo) {
      const u = porId.get(id)
      if (!u?.email || u.ativo === false) continue
      const primeiro = (u.nome || '').split(' ')[0] || 'tudo bem'
      const html = `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#0f172a;max-width:560px">
  <p>Olá, ${esc(primeiro)}!</p>
  <p><b>${esc(quem)}</b> te chamou para uma reunião:</p>
  <div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px 18px;margin:12px 0">
    <div style="font-size:18px;font-weight:bold">${esc(t.titulo)}</div>
    ${quandoDe(t) ? `<div style="margin-top:6px;color:#475569">📅 ${esc(quandoDe(t))}</div>` : ''}
    ${desc ? `<div style="margin-top:10px;white-space:pre-wrap;color:#334155">${esc(desc)}</div>` : ''}
  </div>
  <p>Confirme se vai participar:</p>
  <p><a href="${link}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:bold">Aceitar ou recusar no portal</a></p>
  <p style="font-size:12.5px;color:#64748b">Se o botão não abrir, copie este endereço: ${link}</p>
</div>`
      const r = await enviarEmail({ to: u.email, subject: `Convite: ${t.titulo}${quandoDe(t) ? ` — ${quandoDe(t)}` : ''}`, html, fromNome: 'Reuniões · Portal Nova Tratores' })
      if (!r.ok) console.error('[reunioes] convite e-mail', u.email, r.motivo, r.erro)
    }
  } catch (e) { console.error('[reunioes] convite e-mail', e) }
}
