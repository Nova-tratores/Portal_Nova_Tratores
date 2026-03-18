'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import {
 LayoutDashboard, ClipboardList, TrendingDown, TrendingUp,
 UserCheck, LogOut, Menu, MessageSquare, X, Send, Paperclip,
 FileText, Settings, User, CheckCheck, History, Bell, RefreshCw, ChevronRight, Clock, BarChart2
} from 'lucide-react'

export default function MenuLateral({ isSidebarOpen, setIsSidebarOpen, path, router, handleLogout, userProfile }) {
 const [isChatOpen, setIsChatOpen] = useState(false)
 const [mensagens, setMensagens] = useState([])
 const [novaMsg, setNovaMsg] = useState('')
 const [uploading, setUploading] = useState(false)
 const [usuariosMap, setUsuariosMap] = useState({}) // Mapeia IDs para fotos e nomes
 const scrollRef = useRef()
 const [notificacoesAtivas, setNotificacoesAtivas] = useState(0)
 
 // REF PARA O REALTIME ACESSAR O ESTADO ATUAL SEM REINICIAR O CANAL
 const isChatOpenRef = useRef(isChatOpen)
 useEffect(() => { isChatOpenRef.current = isChatOpen }, [isChatOpen])

 // ABRE O CHAT VIA EVENTO GLOBAL ou sessionStorage (para quando o usuário veio de outra página)
 useEffect(() => {
  // Ao montar: verifica se há flag do sessionStorage (usuário navegou de outra página)
  if (sessionStorage.getItem('openChatGeral') === '1') {
   sessionStorage.removeItem('openChatGeral')
   setIsChatOpen(true)
   setNotificacoesAtivas(0)
  }
  // Escuta evento imediato (usuário já estava na home quando clicou)
  const handler = () => {
   sessionStorage.removeItem('openChatGeral')
   setIsChatOpen(true)
   setNotificacoesAtivas(0)
  }
  window.addEventListener('abrirChatGeral', handler)
  return () => window.removeEventListener('abrirChatGeral', handler)
 }, [])

 // ESTADO PARA NOTIFICAÇÕES DE CARDS VENCIDOS
 const [alertasVencidos, setAlertasVencidos] = useState(0)

 // HISTÓRICO DE NOTIFICAÇÕES
 const [showHistorico, setShowHistorico] = useState(false)
 const [historico, setHistorico] = useState([])
 const [historicoNaoLidos, setHistoricoNaoLidos] = useState(0)

 const contarNaoLidos = () => {
  try {
   const hist = JSON.parse(localStorage.getItem('notif_historico') || '[]')
   setHistoricoNaoLidos(hist.filter(h => !h.lida).length)
  } catch(e) {}
 }

 const abrirHistorico = () => {
  try {
   const hist = JSON.parse(localStorage.getItem('notif_historico') || '[]')
   setHistorico(hist)
   localStorage.setItem('notif_historico', JSON.stringify(hist.map(h => ({ ...h, lida: true }))))
   setHistoricoNaoLidos(0)
  } catch(e) { setHistorico([]) }
  setShowHistorico(true)
 }

 const limparHistorico = () => {
  localStorage.removeItem('notif_historico')
  setHistorico([])
  setHistoricoNaoLidos(0)
 }

 const calcTempoHistorico = (dateStr) => {
  if (!dateStr) return ''
  const diffMs = new Date() - new Date(dateStr)
  const mins = Math.floor(diffMs / 60000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days}d atrás`
  if (hours > 0) return `${hours}h atrás`
  if (mins > 0) return `${mins}min atrás`
  return 'agora'
 }

 useEffect(() => {
  contarNaoLidos()
  const handler = () => contarNaoLidos()
  window.addEventListener('notif_historico_updated', handler)
  return () => window.removeEventListener('notif_historico_updated', handler)
 }, [])

 // --- CORREÇÃO DINÂMICA DAS ROTAS ---
 const rotaHome = userProfile?.funcao === 'Financeiro' ? '/financeiro/home-financeiro' : '/financeiro/home-posvendas';
 const rotaKanban = userProfile?.funcao === 'Financeiro' ? '/financeiro/kanban-financeiro' : '/financeiro/kanban';

 // 1. CARREGA MAPA DE USUÁRIOS (FOTOS E NOMES)
 useEffect(() => {
  const fetchUsers = async () => {
   const { data } = await supabase.from('financeiro_usu').select('id, nome, avatar_url')
   if (data) {
    const map = {}
    data.forEach(u => { map[u.id] = u })
    setUsuariosMap(map)
   }
  }
  fetchUsers()
 }, [])

 const checkVencidos = async () => {
  try {
   const { data } = await supabase.from('Chamado_NF').select('id').eq('status', 'vencido');
   setAlertasVencidos(data?.length || 0);
  } catch (e) { console.error(e); }
 };

 const loadMensagens = async () => {
  if (!userProfile?.id) return;
  const { data, error } = await supabase.from('mensagens_chat')
    .select('*')
    .is('chamado_id', null)
    .is('pagar_id', null)
    .is('receber_id', null)
    .is('rh_id', null)
    .order('created_at', { ascending: true })
    .limit(100);
  if (!error) setMensagens(data || []);
 };

 // --- EFEITO REALTIME CORRIGIDO ---
 useEffect(() => {
  const userId = userProfile?.id;
  if (!userId) return;

  loadMensagens();
  checkVencidos();

  const channelChat = supabase.channel(`global_sidebar_${userId}`)
   .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens_chat' }, 
    (payload) => {
     const msg = payload.new;
     if (!msg.chamado_id && !msg.pagar_id && !msg.receber_id && !msg.rh_id) {
      setMensagens(prev => {
       const jaExiste = prev.find(m => m.id === msg.id || (m.tempId && m.texto === msg.texto && m.usuario_id === msg.usuario_id));
       if (jaExiste) return prev.map(m => m.tempId && m.texto === msg.texto ? msg : m);
       return [...prev, msg];
      });
      if (!isChatOpenRef.current && msg.usuario_id !== userId) setNotificacoesAtivas(prev => prev + 1);
     }
    }
   )
   .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'mensagens_chat' }, (payload) => {
      setMensagens(prev => prev.map(m => m.id === payload.new.id ? payload.new : m));
   })
   .subscribe();

  const channelAlerts = supabase.channel(`vencidos_${userId}`)
   .on('postgres_changes', { event: '*', schema: 'public', table: 'Chamado_NF' }, () => checkVencidos())
   .subscribe();

  return () => { 
   supabase.removeChannel(channelChat);
   supabase.removeChannel(channelAlerts);
  };
 }, [userProfile?.id]);

 useEffect(() => {
  if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
 }, [mensagens, isChatOpen]);

 const enviarMsg = async (e) => {
  e.preventDefault();
  if (!novaMsg.trim() || !userProfile?.id) return;
  const t = novaMsg; setNovaMsg('');
  try { const a = new Audio(`/${userProfile?.som_notificacao || 'som-notificacao-1.mp3'}`); a.volume = 0.4; a.play().catch(() => {}) } catch(e) {}

  const msgOtimista = {
    id: Math.random(),
    texto: t,
    usuario_nome: userProfile.nome,
    usuario_id: userProfile.id,
    created_at: new Date().toISOString(),
    visualizado_por: [userProfile.id],
    tempId: true
  };
  setMensagens(prev => [...prev, msgOtimista]);

  const { error } = await supabase.from('mensagens_chat').insert([{
    texto: t,
    usuario_nome: userProfile.nome,
    usuario_id: userProfile.id,
    data_hora: new Date().toISOString(),
    visualizado_por: [userProfile.id]
  }]);

  if (error) {
    alert("Erro: " + error.message);
    loadMensagens();
  } else {
    // Notifica outros usuários via push (funciona mesmo com aba fechada)
    fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: {
          title: '💬 Mensagem no Chat',
          body: `${userProfile.nome}: "${t.length > 80 ? t.slice(0, 80) + '…' : t}"`,
          url: rotaHome,
          tag: 'chat-geral',
        },
        excludeUserId: userProfile.id,
      }),
    }).catch(() => {}) // Falha silenciosa — push não é crítico
  }
 };

 const handleUpload = async (e) => {
  const file = e.target.files[0];
  if (!file || !userProfile?.id) return;
  setUploading(true);
  try {
   const fileName = `${Date.now()}-${file.name.replace(/\s/g, '_')}`;
   await supabase.storage.from('chat-midia').upload(fileName, file);
   const { data: { publicUrl } } = supabase.storage.from('chat-midia').getPublicUrl(fileName);
   await supabase.from('mensagens_chat').insert([{ texto: file.type.startsWith('image') ? '📷 Foto' : '📎 Arquivo', midia_url: publicUrl, usuario_id: userProfile.id, usuario_nome: userProfile.nome, data_hora: new Date().toISOString(), visualizado_por: [userProfile.id] }]);
  } catch (err) { alert(err.message); } finally { setUploading(false); }
 };

 const getBtnStyle = (route) => {
    const isActive = path === route;
    return {
        background: isActive ? 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' : 'transparent',
        color: isActive ? '#fff' : '#475569',
        border: 'none', 
        padding: '20px 0', 
        cursor: 'pointer', 
        fontSize: '20px', 
        display: 'flex', 
        alignItems: 'center',
        width: isSidebarOpen ? 'calc(100% - 40px)' : '60px', 
        margin: isSidebarOpen ? '8px 20px' : '10px auto', 
        borderRadius: '20px', 
        transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        boxShadow: isActive ? '0 12px 24px rgba(15, 23, 42, 0.25)' : 'none',
        position: 'relative'
    };
 };

 const iconContainer = { minWidth: isSidebarOpen ? '70px' : '60px', display: 'flex', justifyContent: 'center', alignItems: 'center' };

 return (
  <>
   {/* --- BOTÃO FLUTUANTE DO CHAT --- */}
   <button 
    onClick={() => { setIsChatOpen(true); setNotificacoesAtivas(0); }}
    style={{ 
        position: 'fixed', bottom: '35px', right: '35px', width: '80px', height: '80px', 
        borderRadius: '28px', background: '#0f172a', color: '#fff', border: 'none', 
        cursor: 'pointer', boxShadow: '0 25px 50px rgba(0,0,0,0.4)', zIndex: 2100,
        display: 'flex', alignItems: 'center', justifyContent: 'center', transition: '0.4s'
    }}
    onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1) rotate(-8deg)'; }}
    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1) rotate(0deg)'; }}
   >
    <MessageSquare size={36} />
   </button>

   {/* --- MENU LATERAL GHOST (OPACIDADE 25%) --- */}
   <aside 
    onMouseEnter={() => setIsSidebarOpen(true)} onMouseLeave={() => setIsSidebarOpen(false)} 
    style={{ 
        width: isSidebarOpen ? '380px' : '100px', 
        background: 'rgba(255, 255, 255, 0.98)', 
        backdropFilter: 'blur(15px)',
        height: 'calc(100vh - 40px)', 
        position: 'fixed', 
        left: '20px', 
        top: '20px', 
        borderRadius: '40px',
        opacity: isSidebarOpen ? 1 : 0.25,
        boxShadow: isSidebarOpen ? '0 30px 60px rgba(0,0,0,0.12)' : '0 10px 20px rgba(0,0,0,0.05)',
        padding: '35px 0', 
        display: 'flex', 
        flexDirection: 'column', 
        transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s ease', 
        zIndex: 1100, 
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.5)',
        pointerEvents: 'auto'
    }}
   >
    {/* PERFIL NO TOPO */}
    <div style={{ padding: '0 25px', marginBottom: '40px', display: 'flex', alignItems: 'center', justifyContent: isSidebarOpen ? 'flex-start' : 'center' }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
            <img 
                src={userProfile?.avatar_url || 'https://citrhumdkfivdzbmayde.supabase.co/storage/v1/object/public/avatars/default.png'} 
                style={{ width: '85px', height: '85px', borderRadius: '26px', objectFit: 'cover', border: '2px solid #0f172a', padding: '2px', background: '#fff' }}
                alt="Avatar"
            />
            <div style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '18px', height: '18px', background: '#22c55e', borderRadius: '50%', border: '3px solid #fff' }}></div>
        </div>
        {isSidebarOpen && (
            <div style={{ marginLeft: '18px', animation: 'fadeIn 0.5s ease' }}>
                <p style={{ margin: 0, fontSize: '26px', fontWeight: '800', color: '#0f172a' }}>{userProfile?.nome}</p>
                <p style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px' }}>{userProfile?.funcao}</p>
            </div>
        )}
    </div>

    <div style={{ flex: 1 }}>
     <nav style={{ display: 'flex', flexDirection: 'column' }}>
      <button onClick={() => router.push(rotaHome)} style={getBtnStyle(rotaHome)}>
       <div style={iconContainer}><LayoutDashboard size={28} /></div>
       <span style={{ opacity: isSidebarOpen ? 1 : 0, whiteSpace: 'nowrap', fontWeight: '700' }}>Painel Geral</span>
      </button>

      <button onClick={() => router.push(rotaKanban)} style={getBtnStyle(rotaKanban)}>
       <div style={iconContainer}><ClipboardList size={28} /></div>
       <span style={{ opacity: isSidebarOpen ? 1 : 0, whiteSpace: 'nowrap', fontWeight: '700' }}>Fluxo Boletos</span>
       {alertasVencidos > 0 && (
         <div style={{ position: 'absolute', right: '20px', background: '#ef4444', color: '#fff', fontSize: '12px', fontWeight: '900', padding: '4px 12px', borderRadius: '15px', animation: 'pulse 2s infinite' }}>
            {alertasVencidos}
         </div>
       )}
      </button>

      <button onClick={() => router.push('/financeiro/dashboard')} style={getBtnStyle('/financeiro/dashboard')}>
       <div style={iconContainer}><BarChart2 size={28} /></div>
       <span style={{ opacity: isSidebarOpen ? 1 : 0, whiteSpace: 'nowrap', fontWeight: '700' }}>Relatorio NF</span>
      </button>

      <button onClick={() => router.push('/financeiro/relatorio-pagar')} style={getBtnStyle('/financeiro/relatorio-pagar')}>
       <div style={iconContainer}><TrendingDown size={28} /></div>
       <span style={{ opacity: isSidebarOpen ? 1 : 0, whiteSpace: 'nowrap', fontWeight: '700' }}>Relatorio Pagar</span>
      </button>

      <button onClick={abrirHistorico} style={{ ...getBtnStyle('_historico'), position: 'relative' }}>
       <div style={{ ...iconContainer, position: 'relative' }}>
        <History size={28} />
        {historicoNaoLidos > 0 && (
         <div style={{ position: 'absolute', top: '0px', right: '8px', background: '#ef4444', color: '#fff', fontSize: '10px', fontWeight: '900', minWidth: '18px', height: '18px', borderRadius: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', border: '2px solid #fff' }}>
          {historicoNaoLidos > 9 ? '9+' : historicoNaoLidos}
         </div>
        )}
       </div>
       <span style={{ opacity: isSidebarOpen ? 1 : 0, whiteSpace: 'nowrap', fontWeight: '700' }}>Historico</span>
      </button>

      <div style={{ height: '2px', background: 'linear-gradient(to right, transparent, #f1f5f9, transparent)', margin: '25px 40px' }}></div>

      <button onClick={() => router.push('/financeiro/historico-pagar')} style={getBtnStyle('/financeiro/historico-pagar')}>
       <div style={iconContainer}><TrendingDown size={28} /></div>
       <span style={{ opacity: isSidebarOpen ? 1 : 0, whiteSpace: 'nowrap' }}>Contas a Pagar</span>
      </button>
      <button onClick={() => router.push('/financeiro/historico-receber')} style={getBtnStyle('/financeiro/historico-receber')}>
       <div style={iconContainer}><TrendingUp size={28} /></div>
       <span style={{ opacity: isSidebarOpen ? 1 : 0, whiteSpace: 'nowrap' }}>Contas a Receber</span>
      </button>
      <button onClick={() => router.push('/financeiro/historico-rh')} style={getBtnStyle('/financeiro/historico-rh')}>
       <div style={iconContainer}><UserCheck size={28} /></div>
       <span style={{ opacity: isSidebarOpen ? 1 : 0, whiteSpace: 'nowrap' }}>Gestão RH</span>
      </button>
     </nav>
    </div>

    <div style={{ paddingBottom: '20px' }}>
     <button onClick={() => router.push('/financeiro/configuracoes')} style={getBtnStyle('/financeiro/configuracoes')}>
      <div style={iconContainer}><Settings size={28} /></div>
      <span style={{ opacity: isSidebarOpen ? 1 : 0, fontWeight: '600' }}>Configurações</span>
     </button>
     <div style={{ margin: '20px 40px', height: '1px', background: '#f1f5f9', display: isSidebarOpen ? 'block' : 'none' }}></div>
     <button onClick={handleLogout} style={{ ...getBtnStyle('sair'), color: '#ef4444' }}>
      <div style={iconContainer}><LogOut size={28} /></div>
      <span style={{ opacity: isSidebarOpen ? 1 : 0, fontWeight: '800' }}>Sair do Sistema</span>
     </button>
    </div>
   </aside>

   {/* --- CHAT MODAL AMPLIADO, ESTILIZADO E COM FOTOS --- */}
   {isChatOpen && (
    <div 
      onClick={() => setIsChatOpen(false)} 
      style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, animation: 'fadeIn 0.3s ease' }}
    >
     <div 
      onClick={(e) => e.stopPropagation()} 
      style={{ width: '750px', height: '88vh', background: '#fff', borderRadius: '55px', boxShadow: '0 60px 150px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', border: '1px solid #e2e8f0', overflow: 'hidden', animation: 'zoomIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
     >
      <div style={{ padding: '40px', background: '#0f172a', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
       <div>
         <span style={{ fontSize: '22px', fontWeight: '900', letterSpacing: '1px' }}>HUB DE COMUNICAÇÃO</span>
         <p style={{ margin: 0, fontSize: '14px', opacity: 0.5 }}>Realtime Ativado</p>
       </div>
       <button onClick={() => setIsChatOpen(false)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', cursor: 'pointer', padding: '15px', borderRadius: '20px' }}><X size={32} /></button>
      </div>

      <div ref={scrollRef} style={{ flex: 1, padding: '40px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '28px', background: '#f8fafc' }}>
       {(() => {
        const hoje = new Date(); hoje.setHours(0,0,0,0);
        const ontem = new Date(hoje.getTime() - 86400000);
        const getDateKey = (ts) => ts ? new Date(ts).toISOString().split('T')[0] : null;
        const getDateLabel = (key) => {
          if (!key) return null;
          const hojeKey = hoje.toISOString().split('T')[0];
          const ontemKey = ontem.toISOString().split('T')[0];
          if (key === hojeKey) return 'Hoje';
          if (key === ontemKey) return 'Ontem';
          const d = new Date(key + 'T12:00:00');
          return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
        };

        const items = [];
        let lastDateKey = null;

        mensagens.forEach((m, idx) => {
          const dateKey = getDateKey(m.created_at);

          // Insere separador de dia quando muda o dia
          if (dateKey && dateKey !== lastDateKey) {
            lastDateKey = dateKey;
            items.push(
              <div key={`day-${dateKey}`} style={{ display: 'flex', alignItems: 'center', gap: '16px', alignSelf: 'stretch', margin: '4px 0' }}>
                <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to right, transparent, #e2e8f0)' }} />
                <span style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', background: '#fff', padding: '5px 16px', borderRadius: '20px', border: '1px solid #e2e8f0', whiteSpace: 'nowrap', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                  {getDateLabel(dateKey)}
                </span>
                <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to left, transparent, #e2e8f0)' }} />
              </div>
            );
          }

          const souEu = String(m.usuario_id) === String(userProfile?.id);
          const userDaMsg = usuariosMap[m.usuario_id] || { nome: m.usuario_nome };
          const visualizadores = m.visualizado_por?.filter(id => id !== m.usuario_id)
                                  .map(id => usuariosMap[id]?.nome?.split(' ')[0]) || [];

          items.push(
            <div key={m.id || idx} style={{
              display: 'flex',
              flexDirection: souEu ? 'row-reverse' : 'row',
              gap: '15px',
              alignItems: 'flex-end',
              alignSelf: souEu ? 'flex-end' : 'flex-start',
              maxWidth: '90%',
              animation: 'slideIn 0.3s ease'
            }}>
              <img
                src={userDaMsg?.avatar_url || 'https://citrhumdkfivdzbmayde.supabase.co/storage/v1/object/public/avatars/default.png'}
                style={{ width: '48px', height: '48px', borderRadius: '16px', objectFit: 'cover', border: '2px solid #fff', boxShadow: '0 5px 15px rgba(0,0,0,0.1)' }}
                alt="User"
              />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: souEu ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  background: souEu ? 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' : '#fff',
                  color: souEu ? '#fff' : '#0f172a',
                  padding: '22px 28px',
                  borderRadius: souEu ? '32px 32px 5px 32px' : '32px 32px 32px 5px',
                  boxShadow: '0 12px 30px rgba(0,0,0,0.06)',
                  border: souEu ? 'none' : '1px solid #e2e8f0'
                }}>
                  {!souEu && <small style={{ fontSize: '12px', fontWeight: '900', color: '#3b82f6', display: 'block', marginBottom: '8px' }}>{m.usuario_nome?.toUpperCase()}</small>}
                  {m.midia_url && (
                    <div style={{ marginBottom: '18px' }}>
                      {m.midia_url.match(/\.(jpeg|jpg|gif|png|webp)$/i)
                        ? <img src={m.midia_url} style={{ width: '100%', borderRadius: '25px' }} />
                        : <a href={m.midia_url} target="_blank" style={{ fontSize: '15px', color: '#38bdf8', fontWeight: '800' }}>📎 Documento Anexo</a>
                      }
                    </div>
                  )}
                  <div style={{ fontSize: '18px', lineHeight: '1.7', fontWeight: '500' }}>{m.texto}</div>
                  <div style={{ textAlign: 'right', fontSize: '11px', opacity: 0.5, marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                    {m.created_at ? new Date(m.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--'}
                    {souEu && <CheckCheck size={18} color={m.visualizado_por?.length > 1 ? "#38bdf8" : "#94a3b8"} />}
                  </div>
                </div>
                {visualizadores.length > 0 && (
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px', fontWeight: '700', padding: '0 10px' }}>
                    Visto por: {visualizadores.join(', ')}
                  </div>
                )}
              </div>
            </div>
          );
        });

        return items;
       })()}
      </div>

      <form onSubmit={enviarMsg} style={{ padding: '40px', display: 'flex', gap: '25px', borderTop: '1px solid #f1f5f9', alignItems: 'center', background: '#fff' }}>
       <label style={{ cursor: 'pointer', padding: '22px', background: '#f1f5f9', borderRadius: '25px', display: 'flex' }}>
         <Paperclip size={30} color="#64748b" />
         <input type="file" hidden onChange={handleUpload} disabled={uploading} />
       </label>
       <input 
        value={novaMsg} 
        onChange={e => setNovaMsg(e.target.value)} 
        placeholder="Escreva algo..." 
        style={{ flex: 1, padding: '25px 35px', borderRadius: '35px', border: '1.5px solid #f1f5f9', outline: 'none', fontSize: '18px', background: '#f8fafc' }} 
       />
       <button type="submit" disabled={!novaMsg.trim()} style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: '30px', width: '75px', height:'75px', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow: '0 15px 30px rgba(15,23,42,0.3)' }}>
        <Send size={32} />
       </button>
      </form>
     </div>
    </div>
   )}

   {/* --- PAINEL DE HISTÓRICO DE NOTIFICAÇÕES --- */}
   {showHistorico && (
    <div
     onClick={() => setShowHistorico(false)}
     style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3100, animation: 'fadeIn 0.3s ease' }}
    >
     <div
      onClick={e => e.stopPropagation()}
      style={{ width: '520px', maxHeight: '85vh', background: '#fff', borderRadius: '32px', boxShadow: '0 60px 150px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'zoomIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
     >
      {/* Cabeçalho */}
      <div style={{ padding: '30px 35px', background: '#0f172a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
       <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <History size={20} color="#38bdf8" />
        <span style={{ fontSize: '13px', fontWeight: '800', color: '#fff', letterSpacing: '2px' }}>HISTORICO DE NOTIFICACOES</span>
       </div>
       <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        {historico.length > 0 && (
         <button onClick={limparHistorico} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#94a3b8', fontSize: '10px', cursor: 'pointer', fontWeight: '700', padding: '6px 14px', borderRadius: '8px', letterSpacing: '0.5px' }}>LIMPAR</button>
        )}
        <button onClick={() => setShowHistorico(false)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', cursor: 'pointer', padding: '10px', borderRadius: '14px' }}><X size={20} /></button>
       </div>
      </div>

      {/* Lista */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#f8fafc' }}>
       {historico.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
         <Bell size={40} color="#e2e8f0" />
         <p style={{ color: '#94a3b8', fontSize: '14px', margin: '16px 0 0', fontWeight: '500' }}>Nenhuma notificacao no historico</p>
        </div>
       ) : historico.map((n, idx) => (
        <div
         key={n.id || idx}
         style={{
          padding: '16px 24px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          gap: '14px',
          alignItems: 'center',
          background: n.lida ? 'transparent' : '#eff6ff',
          transition: 'background 0.15s',
         }}
         onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
         onMouseLeave={e => e.currentTarget.style.background = n.lida ? 'transparent' : '#eff6ff'}
        >
         <div style={{
          width: '42px', height: '42px', borderRadius: '14px', flexShrink: 0,
          background: n.tipo === 'chat' ? '#eff6ff' : '#f0fdf4',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `1px solid ${n.tipo === 'chat' ? '#bfdbfe' : '#bbf7d0'}`
         }}>
          {n.tipo === 'chat' ? <MessageSquare size={18} color="#3b82f6" /> : <RefreshCw size={18} color="#22c55e" />}
         </div>
         <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontSize: '10px', color: '#64748b', display: 'block', letterSpacing: '0.5px', fontWeight: '800', marginBottom: '3px' }}>{n.titulo}</b>
          <p style={{ fontSize: '13px', color: '#1e293b', margin: '0 0 4px', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.mensagem}</p>
          <small style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
           <Clock size={10} /> {calcTempoHistorico(n.data)}
          </small>
         </div>
         {!n.lida && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} />}
        </div>
       ))}
      </div>
     </div>
    </div>
   )}

   <style jsx>{`
    @keyframes pulse { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.1); opacity: 0.8; } 100% { transform: scale(1); opacity: 1; } }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes zoomIn { from { opacity: 0; transform: scale(0.9) translateY(40px); } to { opacity: 1; transform: scale(1) translateY(0); } }
    @keyframes slideIn { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
   `}</style>
  </>
 )
}