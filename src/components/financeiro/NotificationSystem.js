'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Bell, RefreshCw, MessageSquare, ChevronRight } from 'lucide-react'
import { formatarMoeda } from '@/lib/financeiro/utils'
import { useRouter, usePathname } from 'next/navigation'

// ─── MARCA AÇÃO PRÓPRIA (evita auto-notificação) ─────────────────────────────
const minhasAcoes = new Set()
export function marcarMinhaAcao(tabela, id) {
  const key = `${tabela}:${id}`
  minhasAcoes.add(key)
  setTimeout(() => minhasAcoes.delete(key), 15000)
}

// ─── CONVERTE VAPID BASE64 → Uint8Array ──────────────────────────────────────
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i)
  return output
}

export default function NotificationSystem({ userProfile }) {
  const [notificacoes, setNotificacoes] = useState([])
  const [toasts, setToasts]             = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [realtimeVersion, setRealtimeVersion] = useState(0)
  const audioRef       = useRef(null)
  const reconectarRef  = useRef(null)
  const router         = useRouter()
  const pathname       = usePathname()

  const rotaHome = userProfile?.funcao === 'Financeiro' ? '/home-financeiro' : '/home-posvendas'

  // ─── RECONECTA QUANDO A ABA VOLTA AO FOCO ────────────────────────────────
  useEffect(() => {
    const handleVisible = () => {
      if (document.visibilityState === 'visible') {
        setRealtimeVersion(v => v + 1)
      }
    }
    document.addEventListener('visibilitychange', handleVisible)
    return () => document.removeEventListener('visibilitychange', handleVisible)
  }, [])

  // ─── REGISTRO DO SERVICE WORKER + PUSH SUBSCRIPTION ──────────────────────
  useEffect(() => {
    if (!userProfile?.id || typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

    const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!VAPID_PUBLIC) return // push desabilitado se chave não configurada

    const registrarPush = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js')
        await navigator.serviceWorker.ready

        let sub = await reg.pushManager.getSubscription()

        if (!sub) {
          const perm = await Notification.requestPermission()
          if (perm !== 'granted') return

          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
          })
        }

        // Salva subscription no servidor
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub.toJSON(), userId: userProfile.id }),
        })
      } catch (e) {
        console.warn('[Push] Falha ao registrar:', e)
      }
    }

    registrarPush()
  }, [userProfile?.id])

  // ─── AUDIO UNLOCK ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userProfile) return
    const somEscolhido = userProfile?.som_notificacao || 'som-notificacao-1.mp3'

    const unlock = () => {
      const audio = new Audio(`/${somEscolhido}`)
      audio.volume = 0
      audio.play()
        .then(() => {
          audio.pause()
          audio.currentTime = 0
          audio.volume = 1
          audioRef.current = audio
        })
        .catch(() => {})
    }

    document.addEventListener('click', unlock, { once: true })
    return () => document.removeEventListener('click', unlock)
  }, [userProfile?.som_notificacao])

  const tocarSom = () => {
    try {
      if (audioRef.current) {
        audioRef.current.currentTime = 0
        audioRef.current.play().catch(() => {})
      } else {
        new Audio(`/${userProfile?.som_notificacao || 'som-notificacao-1.mp3'}`).play().catch(() => {})
      }
    } catch (e) {}
  }

  // ─── NAVEGAÇÃO AO CLICAR ──────────────────────────────────────────────────
  const handleNotifClick = (n) => {
    setShowDropdown(false)
    setNotificacoes(prev => prev.filter(item => item.id !== n.id))
    setToasts(prev => prev.filter(item => item.id !== n.id))

    if (!n.registro_id) {
      sessionStorage.setItem('openChatGeral', '1')
      window.dispatchEvent(new CustomEvent('abrirChatGeral'))
      if (!pathname?.includes('home-')) router.push(rotaHome)
      return
    }

    router.push(`${rotaHome}?id=${n.registro_id}&tipo=${n.tipo_fluxo}`)
  }

  const addToast = (notif) => {
    const id = Date.now()
    setToasts(prev => [{ ...notif, id }, ...prev])
    tocarSom()
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 8000)
    // Salva no histórico persistente (localStorage)
    try {
      const hist = JSON.parse(localStorage.getItem('notif_historico') || '[]')
      localStorage.setItem('notif_historico', JSON.stringify(
        [{ ...notif, id, lida: false }, ...hist].slice(0, 200)
      ))
      window.dispatchEvent(new CustomEvent('notif_historico_updated'))
    } catch(e) {}
  }

  // ─── REALTIME COM RECONEXÃO AUTOMÁTICA ───────────────────────────────────
  useEffect(() => {
    if (!userProfile?.id) return

    const channel = supabase
      .channel(`notifs_${userProfile.id}_v${realtimeVersion}`)

      // 1. MENSAGENS DO CHAT
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'mensagens_chat'
      }, (payload) => {
        if (String(payload.new.usuario_id) === String(userProfile.id)) return

        const autor = payload.new.usuario_nome || 'Alguém'
        const texto = payload.new.texto || ''

        const registro_id =
          payload.new.chamado_id  ||
          payload.new.pagar_id    ||
          payload.new.receber_id  ||
          payload.new.rh_id       ||
          null

        const tipo_fluxo =
          payload.new.chamado_id  ? 'boleto'   :
          payload.new.pagar_id    ? 'pagar'    :
          payload.new.receber_id  ? 'receber'  :
          payload.new.rh_id       ? 'rh'       :
          'chat_geral'

        const novaNotif = {
          id: Date.now(),
          titulo: registro_id ? 'MENSAGEM NO CARD' : 'MENSAGEM NO CHAT',
          mensagem: `${autor}: "${texto}"`,
          data: new Date().toISOString(),
          tipo: 'chat',
          registro_id,
          tipo_fluxo,
        }
        setNotificacoes(prev => [novaNotif, ...prev])
        addToast(novaNotif)
      })

      // 2. CARD MOVIMENTADO (boleto)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'Chamado_NF'
      }, (payload) => {
        if (payload.old.status === payload.new.status) return
        const keyCard = `Chamado_NF:${payload.new.id}`
        if (minhasAcoes.has(keyCard)) { minhasAcoes.delete(keyCard); return }

        const statusLabel = {
          gerar_boleto:          'Gerar Boleto',
          enviar_cliente:        'Enviar ao Cliente',
          aguardando_vencimento: 'Aguardando Vencimento',
          vencido:               'Vencido',
          pago:                  'Pago',
          concluido:             'Concluído',
        }

        const novaNotif = {
          id: Date.now(),
          titulo: 'CARD MOVIMENTADO',
          mensagem: `${payload.new.nom_cliente} → ${statusLabel[payload.new.status] || payload.new.status}`,
          data: new Date().toISOString(),
          tipo: 'movimento',
          registro_id: payload.new.id,
          tipo_fluxo: 'boleto',
        }
        setNotificacoes(prev => [novaNotif, ...prev])
        addToast(novaNotif)
      })

      // 3. NOVO LANÇAMENTO PAGAR
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'finan_pagar' }, (payload) => {
        const keyPagar = `finan_pagar:${payload.new.id}`
        if (minhasAcoes.has(keyPagar)) { minhasAcoes.delete(keyPagar); return }

        const novaNotif = {
          id: Date.now(),
          titulo: 'NOVO PAGAMENTO',
          mensagem: `${payload.new.fornecedor} — ${formatarMoeda(payload.new.valor)}`,
          data: new Date().toISOString(),
          tipo: 'movimento',
          registro_id: payload.new.id,
          tipo_fluxo: 'pagar',
        }
        setNotificacoes(prev => [novaNotif, ...prev])
        addToast(novaNotif)
      })

      .subscribe((status) => {
        // Reconecta automaticamente em caso de erro ou desconexão
        if (status === 'CHANNEL_ERROR' || status === 'CLOSED' || status === 'TIMED_OUT') {
          if (reconectarRef.current) clearTimeout(reconectarRef.current)
          reconectarRef.current = setTimeout(() => {
            setRealtimeVersion(v => v + 1)
          }, 5000)
        } else if (status === 'SUBSCRIBED') {
          if (reconectarRef.current) clearTimeout(reconectarRef.current)
        }
      })

    return () => {
      if (reconectarRef.current) clearTimeout(reconectarRef.current)
      supabase.removeChannel(channel)
    }
  }, [userProfile?.id, realtimeVersion])

  // Não renderiza no login nem sem usuário logado
  if (!userProfile || pathname === '/login') return null

  const temNotif = notificacoes.length > 0

  return (
    <>
      {/* ═══════════════════════════════════════════════════════════
          SINO — canto superior direito, circular, moderno
      ═══════════════════════════════════════════════════════════ */}
      <div style={{ position: 'fixed', top: '20px', right: '24px', zIndex: 2050 }}>

        {/* Botão circular */}
        <button
          onClick={() => setShowDropdown(s => !s)}
          style={{
            position: 'relative',
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: temNotif
              ? 'linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)'
              : 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            boxShadow: temNotif
              ? '0 6px 28px rgba(14,165,233,0.5), 0 0 0 4px rgba(14,165,233,0.2)'
              : '0 6px 20px rgba(0,0,0,0.4)',
            transition: 'all 0.3s ease',
          }}
        >
          <Bell
            size={28}
            color="#fff"
            fill={temNotif ? '#fff' : 'none'}
            strokeWidth={2}
            style={temNotif ? { animation: 'bellRing 0.6s ease' } : {}}
          />
          {temNotif && (
            <span style={{
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              background: '#ef4444',
              color: '#fff',
              fontSize: '10px',
              minWidth: '18px',
              height: '18px',
              borderRadius: '9px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: '900',
              padding: '0 4px',
              border: '2px solid #fff',
              boxShadow: '0 2px 8px rgba(239,68,68,0.6)',
              lineHeight: 1,
            }}>
              {notificacoes.length > 9 ? '9+' : notificacoes.length}
            </span>
          )}
        </button>

        {/* ─── DROPDOWN ─────────────────────────────────────────── */}
        {showDropdown && (
          <div style={{
            position: 'absolute',
            top: '74px',
            right: 0,
            width: '390px',
            background: '#fff',
            borderRadius: '20px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.07)',
            zIndex: 9999,
            overflow: 'hidden',
          }}>
            {/* Cabeçalho */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 20px',
              background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Bell size={14} color="#38bdf8" />
                <span style={{ fontSize: '11px', fontWeight: '800', color: '#fff', letterSpacing: '1.5px' }}>
                  NOTIFICAÇÕES
                </span>
                {temNotif && (
                  <span style={{ background: '#ef4444', color: '#fff', fontSize: '10px', padding: '2px 8px', borderRadius: '20px', fontWeight: '900' }}>
                    {notificacoes.length}
                  </span>
                )}
              </div>
              {temNotif && (
                <button
                  onClick={e => { e.stopPropagation(); setNotificacoes([]) }}
                  style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#94a3b8', fontSize: '10px', cursor: 'pointer', fontWeight: '700', padding: '5px 10px', borderRadius: '8px', letterSpacing: '0.5px' }}
                >
                  LIMPAR
                </button>
              )}
            </div>

            {/* Lista */}
            <div style={{ maxHeight: '440px', overflowY: 'auto' }}>
              {notificacoes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '44px 20px' }}>
                  <Bell size={36} color="#e2e8f0" />
                  <p style={{ color: '#94a3b8', fontSize: '13px', margin: '12px 0 0', fontWeight: '500' }}>
                    Nenhuma novidade no momento
                  </p>
                </div>
              ) : notificacoes.map(n => (
                <div
                  key={n.id}
                  onClick={() => handleNotifClick(n)}
                  style={{
                    padding: '14px 20px',
                    borderBottom: '1px solid #f8fafc',
                    cursor: 'pointer',
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'center',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '12px', flexShrink: 0,
                    background: n.tipo === 'chat' ? '#eff6ff' : '#f0fdf4',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {n.tipo === 'chat'
                      ? <MessageSquare size={18} color="#3b82f6" />
                      : <RefreshCw size={18} color="#22c55e" />
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontSize: '10px', color: '#64748b', display: 'block', letterSpacing: '0.5px', fontWeight: '800' }}>{n.titulo}</b>
                    <p style={{ fontSize: '13px', color: '#1e293b', margin: '3px 0 2px', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.mensagem}</p>
                    <small style={{ fontSize: '10px', color: '#cbd5e1', fontWeight: '600' }}>
                      {new Date(n.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </small>
                  </div>
                  <ChevronRight size={14} color="#cbd5e1" style={{ flexShrink: 0 }} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════
          TOASTS — abaixo do sino, canto superior direito
      ═══════════════════════════════════════════════════════════ */}
      <div style={{
        position: 'fixed',
        top: '96px',
        right: '24px',
        zIndex: 100000,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        pointerEvents: 'none',
      }}>
        {toasts.map(t => (
          <div
            key={t.id}
            onClick={() => handleNotifClick(t)}
            style={{
              pointerEvents: 'auto',
              background: '#fff',
              borderRadius: '14px',
              borderLeft: `4px solid ${t.tipo === 'chat' ? '#3b82f6' : '#22c55e'}`,
              padding: '14px 18px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
              minWidth: '300px',
              maxWidth: '360px',
              display: 'flex',
              gap: '12px',
              alignItems: 'center',
              cursor: 'pointer',
              border: '1px solid #f1f5f9',
              animation: 'slideInRight 0.3s ease',
            }}
          >
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
              background: t.tipo === 'chat' ? '#eff6ff' : '#f0fdf4',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {t.tipo === 'chat'
                ? <MessageSquare size={16} color="#3b82f6" />
                : <RefreshCw size={16} color="#22c55e" />
              }
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ fontSize: '10px', color: '#94a3b8', display: 'block', letterSpacing: '0.5px', fontWeight: '800' }}>{t.titulo}</b>
              <p style={{ fontSize: '13px', margin: '3px 0 0', color: '#1e293b', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.mensagem}</p>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes bellRing {
          0%   { transform: rotate(0deg);   }
          20%  { transform: rotate(18deg);  }
          40%  { transform: rotate(-18deg); }
          60%  { transform: rotate(12deg);  }
          80%  { transform: rotate(-8deg);  }
          100% { transform: rotate(0deg);   }
        }
        @keyframes slideInRight {
          from { transform: translateX(110%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </>
  )
}
