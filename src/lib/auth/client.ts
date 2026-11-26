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

// Token guardado pelo próprio Supabase no aparelho (chave sb-<projeto>-auth-token).
function tokenGuardado(): string | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k || !/^sb-.+-auth-token$/.test(k)) continue
      const v = JSON.parse(localStorage.getItem(k) || 'null')
      const t = v?.access_token || v?.currentSession?.access_token
      if (t) return t
    }
  } catch { /* sem acesso ao armazenamento */ }
  return null
}

// iPhone, 25/11/2026 (Visão da empresa em "Carregando…" para sempre): o
// getSession() pode ir à internet renovar o login SEM limite de tempo (Safari
// voltando de segundo plano, 4G fraco) e prendia TODAS as buscas da tela.
// Agora espera no máximo 6 s; depois disso usa o token guardado no aparelho
// (se tiver vencido, o servidor recusa e a tela mostra o aviso, em vez de travar).
export async function authHeaders(): Promise<Record<string, string>> {
  let relogio: ReturnType<typeof setTimeout> | undefined
  const limite = new Promise<null>((ok) => { relogio = setTimeout(() => ok(null), 6000) })
  const token = await Promise.race([
    supabase.auth.getSession().then(({ data: { session } }) => session?.access_token || null).catch(() => null),
    limite,
  ]).finally(() => clearTimeout(relogio)) ?? tokenGuardado()
  return token ? { Authorization: `Bearer ${token}` } : {}
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
export async function abrirComLogin(url: string, jaAberta?: Window | null): Promise<void> {
  // jaAberta: aba aberta antes de um await (no clique), para o navegador não bloquear
  const janela = jaAberta ?? window.open('', '_blank')
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
