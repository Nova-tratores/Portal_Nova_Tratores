'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Paperclip, FileIcon, Send, X, CheckCheck, MessageSquare } from 'lucide-react'

export default function Chat({ userProfile }) {
  const [isOpen, setIsOpen] = useState(false)
  const [mensagens, setMensagens] = useState([])
  const [novaMsg, setNovaMsg] = useState('')
  const [uploading, setUploading] = useState(false)
  const scrollRef = useRef()

  // 1. CARREGAR MENSAGENS E ATIVAR REALTIME
  useEffect(() => {
    if (!userProfile?.id) return

    const loadMensagens = async () => {
      const { data, error } = await supabase
        .from('mensagens_chat')
        .select('*')
        .is('chamado_id', null)
        .order('created_at', { ascending: true })
        .limit(100)

      if (!error) setMensagens(data || [])
    }

    loadMensagens()

    // CANAL REALTIME
    const channel = supabase.channel(`chat_global_${userProfile.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'mensagens_chat'
      }, (payload) => {

        // FILTRO MANUAL: Só processa se for mensagem geral (chamado_id nulo)
        if (payload.new.chamado_id !== null) return;

        // Notificação de som
        if (String(payload.new.usuario_id) !== String(userProfile.id)) {
          const somEscolhido = userProfile?.som_notificacao || 'som-notificacao-1.mp3'
          new Audio(`/${somEscolhido}`).play().catch(() => {})
        }

        setMensagens(prev => {
          const jaExiste = prev.some(m =>
            String(m.id) === String(payload.new.id) ||
            (m.tempId && m.texto === payload.new.texto && String(m.usuario_id) === String(payload.new.usuario_id))
          );

          if (jaExiste) {
            return prev.map(m =>
              (m.tempId && m.texto === payload.new.texto) ? payload.new : m
            );
          }
          return [...prev, payload.new];
        });
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userProfile?.id])

  // 2. AUTO-SCROLL
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [mensagens, isOpen])

  // 3. ENVIAR MENSAGEM
  const enviarMsg = async (e) => {
    if (e) e.preventDefault()
    if (!novaMsg.trim() || !userProfile?.id) return

    const textoEnvio = novaMsg
    setNovaMsg('')

    const msgOtimista = {
      id: `temp-${Date.now()}`,
      tempId: true,
      texto: textoEnvio,
      usuario_id: userProfile.id,
      usuario_nome: userProfile.nome,
      data_hora: new Date().toISOString(),
      visualizado_por: [userProfile.id]
    }

    setMensagens(prev => [...prev, msgOtimista])

    const { error } = await supabase.from('mensagens_chat').insert([{
      texto: textoEnvio,
      usuario_id: userProfile.id,
      usuario_nome: userProfile.nome,
      chamado_id: null,
      data_hora: new Date().toISOString(),
      visualizado_por: [userProfile.id]
    }])

    if (error) {
      console.error("Erro no envio:", error)
      setMensagens(prev => prev.filter(m => m.id !== msgOtimista.id))
    }
  }

  // 4. UPLOAD
  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file || !userProfile?.id) return
    setUploading(true)
    try {
      const fileName = `${Date.now()}-${file.name.replace(/\s/g, '_')}`
      const { error: upErr } = await supabase.storage.from('chat-midia').upload(fileName, file)
      if (upErr) throw upErr

      const { data: { publicUrl } } = supabase.storage.from('chat-midia').getPublicUrl(fileName)

      await supabase.from('mensagens_chat').insert([{
        texto: file.type.startsWith('image') ? 'Foto' : 'Arquivo',
        midia_url: publicUrl,
        usuario_id: userProfile.id,
        usuario_nome: userProfile.nome,
        chamado_id: null,
        data_hora: new Date().toISOString()
      }])
    } catch (err) {
      alert("Erro upload: " + err.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{ position: 'fixed', bottom: '30px', right: '30px', zIndex: 9999, fontFamily: 'Inter, Poppins, sans-serif' }}>

      {isOpen && (
        <div style={{
          position: 'absolute',
          bottom: '100px',
          right: 0,
          width: '520px',
          height: '750px',
          background: '#ffffff',
          borderRadius: '45px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 50px 100px rgba(0, 0, 0, 0.18)',
          border: '1px solid #fecaca',
          overflow: 'hidden',
          animation: 'chatZoomIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
        }}>

          {/* HEADER */}
          <div style={{
            padding: '35px',
            background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
            color: 'white',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 4px 20px rgba(220, 38, 38, 0.2)'
          }}>
            <div>
              <span style={{ fontWeight: '900', fontSize: '17px', letterSpacing: '1.5px', display: 'block', textTransform: 'uppercase' }}>Comunicação Interna</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <div style={{ width: '8px', height: '8px', background: '#86efac', borderRadius: '50%', boxShadow: '0 0 10px #86efac' }}></div>
                <span style={{ fontSize: '12px', opacity: 0.9, fontWeight: '600', letterSpacing: '0.5px' }}>SISTEMA ONLINE</span>
              </div>
            </div>
            <div
              onClick={() => setIsOpen(false)}
              style={{ background: 'rgba(255,255,255,0.2)', padding: '12px', borderRadius: '18px', cursor: 'pointer', transition: '0.3s' }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
            >
              <X size={24} style={{ opacity: 0.9 }} />
            </div>
          </div>

          {/* AREA DE MENSAGENS */}
          <div ref={scrollRef} style={{ flex: 1, padding: '30px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '22px', background: '#fef2f2' }}>
            {mensagens.map(m => {
              const souEu = String(m.usuario_id) === String(userProfile?.id)
              const hora = m.data_hora ? new Date(m.data_hora).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""
              return (
                <div key={m.id} style={{ alignSelf: souEu ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                  <div style={{
                    background: souEu ? 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)' : '#ffffff',
                    color: souEu ? 'white' : '#1e293b',
                    padding: '18px 24px',
                    borderRadius: souEu ? '30px 30px 4px 30px' : '30px 30px 30px 4px',
                    boxShadow: souEu ? '0 15px 30px rgba(220, 38, 38, 0.2)' : '0 10px 25px rgba(0,0,0,0.04)',
                    border: souEu ? 'none' : '1px solid #fecaca',
                    position: 'relative'
                  }}>
                    {!souEu && (
                      <b style={{ fontSize: '12px', display: 'block', color: '#dc2626', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                        {m.usuario_nome}
                      </b>
                    )}

                    {m.midia_url && (
                      <div style={{ marginBottom: '15px' }}>
                        {m.midia_url.match(/\.(jpeg|jpg|gif|png|webp)$/i)
                          ? <img src={m.midia_url} alt="imagem" style={{ width: '100%', borderRadius: '20px', cursor: 'pointer', transition: '0.4s', boxShadow: '0 5px 15px rgba(0,0,0,0.1)' }} onClick={() => window.open(m.midia_url)} />
                          : <a href={m.midia_url} target="_blank" rel="noreferrer" style={{ fontSize: '14px', color: souEu ? '#fecaca' : '#dc2626', display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', fontWeight: '700', padding: '10px', background: souEu ? 'rgba(255,255,255,0.1)' : '#fef2f2', borderRadius: '12px' }}>
                              <FileIcon size={20} /> VER ARQUIVO
                            </a>
                        }
                      </div>
                    )}

                    <span style={{ fontSize: '15px', lineHeight: '1.7', fontWeight: '500' }}>{m.texto}</span>

                    <div style={{ textAlign: 'right', fontSize: '11px', opacity: 0.7, marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                      {hora}
                      {souEu && <CheckCheck size={18} color={m.visualizado_por?.length > 1 ? "#fca5a5" : "rgba(255,255,255,0.5)"} />}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* RODAPE / INPUT */}
          <form onSubmit={enviarMsg} style={{ padding: '30px', display: 'flex', gap: '20px', borderTop: '1px solid #fecaca', background: 'white', alignItems: 'center' }}>
            <label style={{ cursor: 'pointer', padding: '15px', borderRadius: '22px', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: '0.3s', border: '1px solid #fecaca' }} onMouseEnter={(e)=>e.currentTarget.style.background='#fee2e2'} onMouseLeave={(e)=>e.currentTarget.style.background='#fef2f2'}>
              <Paperclip size={24} color="#dc2626" />
              <input type="file" style={{ display: 'none' }} onChange={handleUpload} disabled={uploading} />
            </label>

            <input
              value={novaMsg}
              onChange={e => setNovaMsg(e.target.value)}
              placeholder={uploading ? "Fazendo upload..." : "Digite uma mensagem..."}
              style={{
                flex: 1,
                border: '1.5px solid #fecaca',
                borderRadius: '25px',
                padding: '20px 28px',
                fontSize: '15px',
                outline: 'none',
                background: '#fff',
                transition: '0.3s',
                fontWeight: '500'
              }}
              onFocus={(e) => { e.target.style.borderColor = '#dc2626'; e.target.style.boxShadow = '0 0 0 3px rgba(220, 38, 38, 0.1)' }}
              onBlur={(e) => { e.target.style.borderColor = '#fecaca'; e.target.style.boxShadow = 'none' }}
            />

            <button
              type="submit"
              disabled={!novaMsg.trim()}
              style={{
                background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '25px',
                width: '65px',
                height: '65px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 15px 30px rgba(220, 38, 38, 0.3)',
                transition: '0.4s',
                opacity: novaMsg.trim() ? 1 : 0.5
              }}
              onMouseEnter={(e) => {
                if(!novaMsg.trim()) return;
                e.currentTarget.style.transform = 'scale(1.05) rotate(5deg)';
              }}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1) rotate(0deg)'}
            >
              <Send size={28} />
            </button>
          </form>
        </div>
      )}

      {/* BOTAO TOGGLE PRINCIPAL */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '85px',
          height: '85px',
          borderRadius: '30px',
          background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
          color: 'white',
          border: 'none',
          cursor: 'pointer',
          boxShadow: '0 25px 50px rgba(220, 38, 38, 0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: '0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          position: 'relative'
        }}
        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1) translateY(-8px)'}
        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1) translateY(0)'}
      >
        {isOpen ? <X size={40}/> : <MessageSquare size={40}/>}

        {!isOpen && mensagens.length > 0 && (
           <div style={{ position: 'absolute', top: '-5px', right: '-5px', background: '#ef4444', width: '25px', height: '25px', borderRadius: '50%', border: '4px solid white' }}></div>
        )}
      </button>

      <style jsx>{`
        @keyframes chatZoomIn {
          from { opacity: 0; transform: scale(0.9) translateY(40px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  )
}
