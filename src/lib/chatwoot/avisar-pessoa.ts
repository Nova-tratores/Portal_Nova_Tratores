// Aviso para uma PESSOA DA EMPRESA pelo NovaZap (Chatwoot) — José, 24/11/2026:
// "quando alguém pedir autorização / chamar para reunião, manda mensagem pelo Chatwoot".
// SÓ SERVIDOR (usa o token da conta). Nunca lança: devolve o motivo quando não deu.
//
// Caminho: celular do cadastro (financeiro_usu.celular) → acha o contato no NovaZap pelos 8 últimos
// dígitos (pega com e sem o 9) → se não existe, cria na caixa de WhatsApp → conversa → mensagem.
// Caixa usada para criar contato: CHATWOOT_INBOX_AVISOS (id) ou, sem ela, a primeira caixa de WhatsApp/API.
import { chatwootConfigurado, baseApiConta, CHATWOOT_API_TOKEN } from './config'
import { buscarContatosPorTexto, chatwootGet, garantirConversaContato, enviarTextoConversa, enviarPdfConversa } from './cliente'
import { normalizarCelular } from '@/lib/reunioes/convite'

export type ResultadoAviso =
  | { ok: true }
  | { ok: false; motivo: 'sem_celular' | 'sem_chatwoot' | 'erro'; erro?: string }

let caixaCache: number | null = null
async function caixaWhatsApp(): Promise<number | null> {
  const env = Number(process.env.CHATWOOT_INBOX_AVISOS || '')
  if (env) return env
  if (caixaCache) return caixaCache
  const r = await chatwootGet<{ payload?: { id: number; channel_type?: string | null }[] }>('/inboxes')
  const c = (r?.payload || []).find((i) => /whatsapp|api/i.test(String(i.channel_type || '')))
  caixaCache = c?.id ?? null
  return caixaCache
}

async function acharOuCriarContato(celular: string, nome: string): Promise<number> {
  const fim = celular.slice(-8)
  const achados = await buscarContatosPorTexto(fim, 1)
  const c = achados.find((x) => String(x.phone_number || '').replace(/\D/g, '').endsWith(fim))
  if (c) return c.id
  const caixa = await caixaWhatsApp()
  if (!caixa) throw new Error('Nenhuma caixa de WhatsApp no NovaZap para criar o contato (defina CHATWOOT_INBOX_AVISOS).')
  const res = await fetch(`${baseApiConta()}/contacts`, {
    method: 'POST',
    headers: { api_access_token: CHATWOOT_API_TOKEN, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ inbox_id: caixa, name: nome || celular, phone_number: `+${celular}` }),
    cache: 'no-store',
  })
  const j = await res.json().catch(() => ({})) as { payload?: { contact?: { id?: number }; id?: number } }
  if (!res.ok) throw new Error(`NovaZap não criou o contato (${res.status})`)
  const id = Number(j?.payload?.contact?.id ?? j?.payload?.id ?? 0)
  if (!id) throw new Error('NovaZap não devolveu o contato criado.')
  return id
}

/** Manda `texto` no WhatsApp da pessoa, pelo NovaZap. */
export async function avisarPeloChatwoot(celularBruto: unknown, nome: string, texto: string): Promise<ResultadoAviso> {
  const celular = normalizarCelular(celularBruto)
  if (!celular) return { ok: false, motivo: 'sem_celular' }
  if (!chatwootConfigurado()) return { ok: false, motivo: 'sem_chatwoot' }
  try {
    const contato = await acharOuCriarContato(celular, nome)
    const conversa = await garantirConversaContato(contato)
    await enviarTextoConversa(conversa, texto)
    return { ok: true }
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e)
    console.error('[chatwoot] aviso para', nome, erro)
    return { ok: false, motivo: 'erro', erro }
  }
}

/**
 * Manda um PDF (com um texto antes) no WhatsApp de um CLIENTE, pelo NovaZap — 26/11/2026, proposta do consórcio.
 * Mesmo caminho do aviso: acha o contato pelo celular (ou cria) → conversa → texto → PDF.
 */
export async function enviarPdfPeloChatwoot(celularBruto: unknown, nome: string, texto: string, nomeArquivo: string, pdf: ArrayBuffer): Promise<ResultadoAviso> {
  const celular = normalizarCelular(celularBruto)
  if (!celular) return { ok: false, motivo: 'sem_celular' }
  if (!chatwootConfigurado()) return { ok: false, motivo: 'sem_chatwoot' }
  try {
    const contato = await acharOuCriarContato(celular, nome)
    const conversa = await garantirConversaContato(contato)
    if (texto) await enviarTextoConversa(conversa, texto)
    await enviarPdfConversa(conversa, nomeArquivo, pdf)
    return { ok: true }
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e)
    console.error('[chatwoot] PDF para', nome, erro)
    return { ok: false, motivo: 'erro', erro }
  }
}

/** Texto curto do "não deu" para mostrar/avisar. */
export function motivoTxt(r: ResultadoAviso): string {
  if (r.ok) return ''
  if (r.motivo === 'sem_celular') return 'não tem celular no cadastro'
  if (r.motivo === 'sem_chatwoot') return 'o NovaZap não está configurado neste servidor'
  return `o NovaZap deu erro (${(r.erro || '').slice(0, 80)})`
}
