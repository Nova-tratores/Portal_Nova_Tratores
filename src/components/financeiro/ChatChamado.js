'use client'
import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Send } from 'lucide-react'

export default function ChatChamado({ registroId, tipo = 'boleto', userProfile, dark = false }) {
  const [mensagens, setMensagens] = useState([])
  const [novaMsg, setNovaMsg] = useState('')
  const scrollRef = useRef()

  const colunaLink = tipo === 'pagar' ? 'pagar_id' : tipo === 'receber' ? 'receber_id' : tipo === 'rh' ? 'rh_id' : 'chamado_id'
  const cleanId = registroId ? (String(registroId).includes('_p') ? String(registroId).split('_p')[0] : String(registroId)) : null

  useEffect(() => {
    if (!cleanId || !userProfile?.id) return
    supabase.from('mensagens_chat').select('*').eq(colunaLink, cleanId).order('created_at', { ascending: true }).then(({ data }) => setMensagens(data || []))
    const channel = supabase.channel(`chat_${colunaLink}_${cleanId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens_chat', filter: `${colunaLink}=eq.${cleanId}` }, payload => {
      if (String(payload.new.usuario_id) !== String(userProfile.id)) setMensagens(prev => [...prev, payload.new])
    }).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [cleanId, userProfile?.id, colunaLink])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [mensagens])

  const enviar = async (e) => {
    e.preventDefault()
    if (!novaMsg.trim()) return
    const texto = novaMsg; setNovaMsg('')
    setMensagens(prev => [...prev, { id: Date.now(), texto, usuario_nome: userProfile.nome, usuario_id: userProfile.id }])
    const payload = { texto, usuario_nome: userProfile.nome, usuario_id: userProfile.id }
    payload[colunaLink] = cleanId
    await supabase.from('mensagens_chat').insert([payload])
  }

  // Theme colors
  const bg = dark ? '#242427' : '#fff'
  const headerBg = dark ? '#3f3f44' : '#f8fafc'
  const border = dark ? '#55555a' : '#e2e8f0'
  const inputBg = dark ? '#2a2a2d' : '#fff'
  const textColor = dark ? '#fff' : '#1e293b'
  const myBubble = dark ? '#3b82f625' : '#0ea5e915'
  const otherBubble = dark ? '#3f3f44' : '#f1f5f9'
  const btnBg = dark ? '#fff' : '#0ea5e9'
  const btnColor = dark ? '#000' : '#fff'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', border: `1px solid ${border}`, borderRadius: '24px', overflow: 'hidden', background: bg, boxShadow: dark ? '0 20px 50px rgba(0,0,0,0.3)' : '0 20px 50px rgba(0,0,0,0.05)' }}>
      <div style={{ padding: '15px 25px', background: headerBg, borderBottom: `1px solid ${border}`, fontWeight: '400', fontSize: dark ? '12px' : '15px', color: '#94a3b8', letterSpacing: '1px' }}>CONVERSA DO PROCESSO</div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '25px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
        {mensagens.map((m) => (
          <div key={m.id} style={{
            alignSelf: String(m.usuario_id) === String(userProfile?.id) ? 'flex-end' : 'flex-start',
            background: String(m.usuario_id) === String(userProfile?.id) ? myBubble : otherBubble,
            color: textColor, padding: '14px 18px', borderRadius: '18px', maxWidth: '85%', border: `1px solid ${border}`
          }}>
            <span style={{ fontSize: dark ? '9px' : '11px', opacity: 0.6, display: 'block', marginBottom: '5px', textTransform: 'uppercase' }}>{m.usuario_nome?.toUpperCase()}</span>
            <span style={{ fontSize: '15px', lineHeight: '1.4' }}>{m.texto}</span>
          </div>
        ))}
      </div>
      <form onSubmit={enviar} style={{ padding: '20px', background: headerBg, display: 'flex', gap: '12px', borderTop: `1px solid ${border}` }}>
        <input value={novaMsg} onChange={e => setNovaMsg(e.target.value)} placeholder="Escreva..." style={{ flex: 1, padding: '14px', borderRadius: '12px', border: `1px solid ${border}`, background: inputBg, color: textColor, outline: 'none', fontSize: '15px' }} />
        <button type="submit" style={{ background: btnBg, color: btnColor, border: 'none', borderRadius: '12px', width: '45px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Send size={18} /></button>
      </form>
    </div>
  )
}
