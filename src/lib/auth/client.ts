'use client'
// Helper de cliente: monta o header Authorization com o token da sessão atual,
// pra mandar em chamadas fetch pras rotas que agora exigem login no servidor.
//
// Uso:
//   const res = await fetch('/api/...', {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
//     body: ...,
//   })
import { supabase } from '@/lib/supabase'

export async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
}

// fetch com o token da sessão (atalho para quando a chamada só precisa do login)
export async function fetchAuth(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = { ...((init.headers as Record<string, string>) || {}), ...(await authHeaders()) }
  return fetch(input, { ...init, headers })
}

// Página HTML servida como blob: os caminhos relativos (/Logo.png, /api/...) passam
// a valer a partir da origem do portal.
export function htmlComBase(html: string, origem: string = window.location.origin): string {
  const base = `<base href="${origem}/">`
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}${base}`)
  return `${base}${html}`
}

/** Abre um documento de rota que exige login (PDF ou página de impressão) numa aba nova.
 *  Link direto (<a href>/window.open) não leva o token e dá 401; aqui a aba abre na hora
 *  (o navegador não bloqueia) e recebe o documento depois de buscado com o login. */
export async function abrirComLogin(url: string): Promise<void> {
  const janela = window.open('', '_blank')
  const aviso = (texto: string) => {
    if (!janela) return
    janela.document.title = 'Documento'
    janela.document.body.innerHTML = ''
    const p = janela.document.createElement('p')
    p.style.cssText = 'font-family:system-ui,sans-serif;padding:24px;color:#334155'
    p.textContent = texto
    janela.document.body.appendChild(p)
  }
  aviso('Carregando documento…')
  // a impressão da Omie sem embed=1 redireciona para fora (o fetch não segue por CORS)
  if (/^\/api\/clientes\/print/.test(url) && !/[?&]embed=1/.test(url)) url += `${url.includes('?') ? '&' : '?'}embed=1`
  try {
    const r = await fetchAuth(url)
    if (!r.ok) {
      const j = await r.json().catch(() => null)
      throw new Error(j?.error || j?.erro || `Não foi possível abrir (${r.status})`)
    }
    const tipo = r.headers.get('content-type') || ''
    let blob: Blob
    if (tipo.includes('pdf')) blob = new Blob([await r.blob()], { type: 'application/pdf' })
    else {
      const html = tipo.includes('json') ? (await r.json().catch(() => null))?.html : await r.text()
      if (!html) throw new Error('O documento veio vazio')
      blob = new Blob([htmlComBase(html)], { type: 'text/html' })
    }
    const u = URL.createObjectURL(blob)
    if (janela) janela.location.href = u
    else window.location.href = u
    setTimeout(() => URL.revokeObjectURL(u), 5 * 60_000)
  } catch (e) {
    const msg = (e as Error).message || 'Erro ao abrir o documento'
    if (janela) aviso(msg)
    else alert(msg)
  }
}

/** Baixa um arquivo de rota que exige login (link com `download`). */
export async function baixarComLogin(url: string, nome?: string): Promise<void> {
  try {
    const r = await fetchAuth(url)
    if (!r.ok) {
      const j = await r.json().catch(() => null)
      throw new Error(j?.error || j?.erro || `Não foi possível baixar (${r.status})`)
    }
    const cd = r.headers.get('content-disposition') || ''
    const doCabecalho = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd)?.[1]
    const u = URL.createObjectURL(await r.blob())
    const a = document.createElement('a')
    a.href = u
    a.download = nome || (doCabecalho ? decodeURIComponent(doCabecalho) : 'arquivo')
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(u), 60_000)
  } catch (e) {
    alert((e as Error).message || 'Erro ao baixar')
  }
}
