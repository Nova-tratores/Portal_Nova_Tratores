'use client'
// Avisos com o portal fechado — lado do aparelho (28/10/2026). O servidor está em portal-server.ts.
// iPhone: só funciona com o portal ADICIONADO À TELA DE INÍCIO (iOS 16.4+) e o pedido de permissão
// precisa vir de um toque (por isso o botão "Ativar" no sino).
import { authHeaders } from '@/lib/auth/client'

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

export type EstadoPush =
  | 'sem-suporte'      // navegador não tem push
  | 'iphone-instalar'  // iPhone fora da Tela de Início
  | 'desligado'        // VAPID não configurado no servidor
  | 'bloqueado'        // a pessoa negou a permissão
  | 'pode-ativar'      // ainda não pediu
  | 'ativo'

export function ehCelular(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
}

function ehIphone(): boolean {
  return typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

function instaladoNaTela(): boolean {
  if (typeof window === 'undefined') return false
  const nav = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true
}

function chaveBytes(base64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

let registro: Promise<ServiceWorkerRegistration | null> | null = null
function registrarSW(): Promise<ServiceWorkerRegistration | null> {
  if (!registro) {
    registro = navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(() => navigator.serviceWorker.ready)
      .catch(() => null)
  }
  return registro
}

// Guardado para o sino da tela não repetir o aviso que o push já mostra.
let ativoNesteAparelho = false
export function pushAtivo(): boolean { return ativoNesteAparelho }

export async function estadoPush(): Promise<EstadoPush> {
  if (typeof window === 'undefined') return 'sem-suporte'
  if (ehIphone() && !instaladoNaTela()) return 'iphone-instalar'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'sem-suporte'
  if (!VAPID_PUBLIC) return 'desligado'
  if (Notification.permission === 'denied') return 'bloqueado'
  if (Notification.permission !== 'granted') return 'pode-ativar'
  const reg = await registrarSW()
  const sub = await reg?.pushManager.getSubscription()
  ativoNesteAparelho = !!sub
  return sub ? 'ativo' : 'pode-ativar'
}

async function enviar(sub: PushSubscription): Promise<boolean> {
  const r = await fetch('/api/push/inscrever', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ inscricao: sub.toJSON(), aparelho: ehCelular() ? 'celular' : 'computador' }),
  }).catch(() => null)
  return !!r?.ok
}

// Chamar a partir de um TOQUE (o iPhone exige). Devolve o estado final.
export async function ativarPush(): Promise<EstadoPush> {
  const antes = await estadoPush()
  if (antes === 'sem-suporte' || antes === 'iphone-instalar' || antes === 'desligado' || antes === 'bloqueado') return antes
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return perm === 'denied' ? 'bloqueado' : 'pode-ativar'
  const reg = await registrarSW()
  if (!reg) return 'sem-suporte'
  let sub = await reg.pushManager.getSubscription()
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveBytes(VAPID_PUBLIC) })
  const ok = await enviar(sub)
  ativoNesteAparelho = ok
  return ok ? 'ativo' : 'pode-ativar'
}

export async function desativarPush(): Promise<void> {
  const reg = await registrarSW()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await fetch('/api/push/inscrever', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => {})
  await sub.unsubscribe().catch(() => {})
  ativoNesteAparelho = false
}

// Ao abrir o portal: quem já deu permissão tem a inscrição refeita/confirmada em silêncio
// (troca de usuário no mesmo aparelho, inscrição que expirou, banco limpo).
export async function renovarPushSilencioso(): Promise<void> {
  try {
    if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return
    if (!VAPID_PUBLIC || !('serviceWorker' in navigator) || !('PushManager' in window)) return
    const reg = await registrarSW()
    if (!reg) return
    let sub = await reg.pushManager.getSubscription()
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveBytes(VAPID_PUBLIC) })
    ativoNesteAparelho = await enviar(sub)
  } catch { /* fica com o sino da tela */ }
}

// Aviso na tela quando o push não está ativo (aba em segundo plano). No Android o `new Notification`
// não existe — tem que ser pelo service worker.
export async function mostrarAvisoLocal(titulo: string, corpo?: string, link?: string, tag?: string): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return
  try {
    const reg = 'serviceWorker' in navigator ? await registrarSW() : null
    if (reg) {
      await reg.showNotification(titulo, { body: corpo, icon: '/icon-192.png', tag, data: { link: link || '/dashboard' } })
      return
    }
    const n = new Notification(titulo, { body: corpo, icon: '/icon-192.png', tag })
    if (link) n.onclick = () => { window.focus(); window.location.href = link; n.close() }
  } catch { /* sem aviso */ }
}
