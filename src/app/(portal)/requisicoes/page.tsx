'use client';
export const dynamic = 'force-dynamic';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import Kanban from '@/components/requisicoes/Kanban';
import FormReq from '@/components/requisicoes/FormReq';
import FormFornecedor from '@/components/requisicoes/FormFornecedor';
import FormUsuario from '@/components/requisicoes/FormUsuario';
import FormVeiculo from '@/components/requisicoes/FormVeiculo';
import TemplatePDF from '@/components/requisicoes/TemplatePDF';
import {
  LayoutDashboard, Users2, Box, Activity, Trash2, Plus, X, UserPlus, Car, Bell, Info, CheckCheck, UserCircle, Edit3, Phone, FileText, Printer
} from 'lucide-react';

function RequisicoesPageInner() {
  const { userProfile } = useAuth();
  const { log: auditLog } = useAuditLog();
  const userName = userProfile?.nome || 'Alguém';
  const [abaAtiva, setAbaAtiva] = useState('kanban');
  const [requisicoes, setRequisicoes] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [veiculos, setVeiculos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [usuarioEditando, setUsuarioEditando] = useState<any>(null);
  const [veiculoEditando, setVeiculoEditando] = useState<any>(null);
  const [reqParaImprimir, setReqParaImprimir] = useState<any>(null);
  const [notificacoes, setNotificacoes] = useState<any[]>([]);
  const [toasts, setToasts] = useState<any[]>([]);
  const [showNotifModal, setShowNotifModal] = useState(false);
  const [contadorNotif, setContadorNotif] = useState(0);
  const [idDestaque, setIdDestaque] = useState<any>(null);
  const [filtroRelTipo, setFiltroRelTipo] = useState('');
  const [filtroRelSetor, setFiltroRelSetor] = useState('');
  const [filtroRelSolicitante, setFiltroRelSolicitante] = useState('');
  const [filtroRelBusca, setFiltroRelBusca] = useState('');

  const lixeiraCount = useMemo(() => requisicoes.filter(r => r.status === 'lixeira').length, [requisicoes]);

  const reqAbertas = useMemo(() => {
    return requisicoes.filter(r => r.status !== 'financeiro' && r.status !== 'lixeira')
      .filter(r => !filtroRelTipo || (r.tipo || r.ReqTipo) === filtroRelTipo)
      .filter(r => !filtroRelSetor || r.setor === filtroRelSetor)
      .filter(r => !filtroRelSolicitante || r.solicitante === filtroRelSolicitante)
      .filter(r => {
        if (!filtroRelBusca) return true;
        const b = filtroRelBusca.toLowerCase();
        return (r.titulo || '').toLowerCase().includes(b) || String(r.id).includes(b) || (r.cliente || '').toLowerCase().includes(b) || (r.Chassis_Modelo || '').toLowerCase().includes(b);
      })
      .sort((a: any, b: any) => (b.id || 0) - (a.id || 0));
  }, [requisicoes, filtroRelTipo, filtroRelSetor, filtroRelSolicitante, filtroRelBusca]);

  const dispararImpressao = (dados: any) => {
    setReqParaImprimir(dados);
    setTimeout(() => {
      window.print();
      setReqParaImprimir(null);
    }, 800);
  };

  const abrirNotificacao = (idReq: any) => {
    setAbaAtiva('kanban');
    setIdDestaque(idReq);
    setShowNotifModal(false);
    setTimeout(() => setIdDestaque(null), 500);
  };

  const tocarAlerta = () => {
    try {
      if (typeof window !== 'undefined') {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const bip = (delay: number, freq: number) => {
          const oscillator = audioCtx.createOscillator();
          const gainNode = audioCtx.createGain();
          oscillator.type = 'triangle';
          oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);
          gainNode.gain.setValueAtTime(0.7, audioCtx.currentTime + delay);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + delay + 0.4);
          oscillator.connect(gainNode);
          gainNode.connect(audioCtx.destination);
          oscillator.start(audioCtx.currentTime + delay);
          oscillator.stop(audioCtx.currentTime + delay + 0.4);
        };
        bip(0, 1600); bip(0.2, 2000); bip(0.4, 1600);
      }
    } catch (e) { console.error("Erro áudio:", e); }
  };

  const carregarDados = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    try {
      const buscarTodasReqs = async () => {
        let todas: any[] = [];
        let from = 0;
        const PAGE = 1000;
        while (true) {
          const { data, error } = await supabase
            .from('Requisicao')
            .select('*')
            .order('id', { ascending: false })
            .range(from, from + PAGE - 1);
          if (error || !data) break;
          todas = todas.concat(data);
          if (data.length < PAGE) break;
          from += PAGE;
        }
        return todas;
      };

      const [allReqs, resUser, resVei] = await Promise.all([
        buscarTodasReqs(),
        supabase.from('req_usuarios').select('*').order('nome', { ascending: true }),
        supabase.from('SupaPlacas').select('*').order('NumPlaca', { ascending: true })
      ]);

      if (allReqs) {
        setRequisicoes(allReqs.map(r => ({
          ...r,
          status: r.status || 'pedido',
          tipo: r.tipo || r.ReqTipo || 'Peça',
          titulo: r.titulo || r.Material_Serv_Solicitado || "",
          solicitante: r.solicitante || r.ReqSolicitante || "",
          setor: r.setor || r.ReqQuem || "",
          veiculo: r.veiculo || r.ReqVeiculo || "",
          hodometro: r.hodometro || r.ReqHodometro || "",
          valor_despeza: r.valor_despeza || "0,00",
          obs: r.obs || r.Motivo || r.ReqMotivo || "",
          quem_ferramenta: r.quem_ferramenta || r.ferramenta_quem || ""
        })));
      }
      if (resUser.data) setUsuarios(resUser.data);
      if (resVei.data) setVeiculos(resVei.data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, []);

  // Refresh ao voltar para a aba
  const refreshSilencioso = useCallback(() => carregarDados(true), [carregarDados]);
  useRefreshOnFocus(refreshSilencioso);

  // Rastreia quais cards foram editados enquanto estavam abertos
  const cardsEditadosRef = useRef<Set<number>>(new Set());

  const handleUpdateReq = useCallback(async (id: number, dados: Record<string, unknown>) => {
    setRequisicoes(prev => prev.map(r => r.id === id ? { ...r, ...dados } : r));
    const { error } = await supabase.from('Requisicao').update(dados).eq('id', id);
    if (error) { console.error('[Requisições] Erro ao atualizar:', error); carregarDados(true); return }
    auditLog({ sistema: 'requisicoes', acao: 'editar', entidade: 'requisicao', entidade_id: String(id), detalhes: dados });
    // Marca que esse card foi editado (notificação só ao fechar)
    cardsEditadosRef.current.add(id);
  }, [carregarDados])

  const handleCardFechado = useCallback((id: number) => {
    if (cardsEditadosRef.current.has(id)) {
      cardsEditadosRef.current.delete(id);
      const req = requisicoes.find(r => r.id === id);
      notificarUsuariosReq('requisicao', `${userName} alterou requisição #${id}`, req?.titulo || `Requisição #${id}`, '/requisicoes');
    }
  }, [requisicoes, userName]);

  // Notificar usuários com acesso a requisições via portal_notificacoes (bell icon)
  const notificarUsuariosReq = async (tipo: string, titulo: string, descricao?: string, link?: string) => {
    try {
      const { data: permissoes } = await supabase
        .from('portal_permissoes')
        .select('user_id, is_admin, modulos_permitidos');
      if (!permissoes || permissoes.length === 0) return;
      const usuariosComAcesso = permissoes.filter(
        (p: any) => p.is_admin
      );
      if (usuariosComAcesso.length === 0) return;
      await supabase.from('portal_notificacoes').insert(
        usuariosComAcesso.map((a: { user_id: string }) => ({
          user_id: a.user_id,
          tipo,
          titulo,
          descricao: descricao || null,
          link: link || null,
        }))
      );
    } catch (err) { console.error('[Requisições] Erro ao notificar usuários:', err); }
  };

  useEffect(() => {
    carregarDados();

    const channel = supabase.channel('main-realtime-stream-' + Date.now())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'Supa-Solicitacao_Req' }, (payload) => {
        tocarAlerta();
        const nova = payload.new;
        const info = {
          id: Date.now(),
          idOriginal: nova.IdReq,
          titulo: nova.Material_Serv_Solicitado || "Nova Solicitação",
          solicitante: nova.ReqEmail || "Técnico (APP)",
          tipoNotif: "Nova Solicitação!",
          hora: new Date().toLocaleTimeString()
        };
        setToasts(prev => [info, ...prev]);
        setNotificacoes(prev => [info, ...prev]);
        setContadorNotif(prev => prev + 1);

        // Criar notificação no bell icon para admins
        notificarUsuariosReq(
          'requisicao',
          'Nova Solicitação de Requisição',
          nova.Material_Serv_Solicitado || 'Solicitação via APP',
          '/requisicoes'
        );

        carregarDados(true);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== info.id)), 10000);

        const buscarEImprimir = async () => {
          let reqData = null;
          const delays = [3000, 2000, 3000, 4000]; // intervalos entre tentativas
          for (const delay of delays) {
            await new Promise(r => setTimeout(r, delay));
            const safeId = String(nova.IdReq).replace(/%/g, '');
            // Busca por [APPSHEET_ID:...] (legado)
            const { data: dataLegado } = await supabase
              .from('Requisicao')
              .select('*')
              .ilike('obs', `%[APPSHEET_ID:${safeId}]%`)
              .maybeSingle();
            if (dataLegado?.id) { reqData = dataLegado; break; }
            // Busca pelo titulo + solicitante (app técnico)
            if (nova.Material_Serv_Solicitado && nova.ReqSolicitante) {
              const { data: dataApp } = await supabase
                .from('Requisicao')
                .select('*')
                .eq('titulo', nova.Material_Serv_Solicitado.toUpperCase())
                .eq('solicitante', nova.ReqSolicitante)
                .order('id', { ascending: false })
                .limit(1)
                .maybeSingle();
              if (dataApp?.id) { reqData = dataApp; break; }
            }
          }

          let nomeExibicao = nova.ReqEmail || "Técnico";
          if (nova.ReqEmail?.includes('@')) {
            const emailLimpo = nova.ReqEmail.trim().toLowerCase();
            const { data: userData } = await supabase
              .from('req_usuarios')
              .select('nome')
              .ilike('email', emailLimpo)
              .maybeSingle();
            if (userData?.nome) nomeExibicao = userData.nome;
          }

          dispararImpressao({
            id: reqData?.id || nova.IdReq || "NOVA",
            titulo: nova.Material_Serv_Solicitado || "SOLICITAÇÃO APP",
            tipo: nova.ReqTipo || "Peça",
            solicitante: nomeExibicao,
            setor: nova.ReqQuem || "Oficina",
            data: nova.ReqData || new Date().toISOString(),
            veiculo: nova.ReqVeiculo || "",
            hodometro: nova.ReqHodometro || "",
            Motivo: nova.ReqMotivo || "",
            obs: nova.ReqMotivo || "",
            valor_despeza: "0,00",
            impresso_por: "AUTO-GERADO PELO APP",
            quem_ferramenta: nova.ferramenta_quem || "",
            created_at: reqData?.created_at,
          });
        };
        buscarEImprimir();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'Supa-AtualizarReq' }, async (payload) => {
        tocarAlerta();
        const novo = payload.new;
        const info = {
          id: Date.now(),
          idOriginal: novo.ReqREF,
          titulo: "Card Sincronizado",
          solicitante: "Técnico (APP)",
          tipoNotif: "Card Atualizado!",
          hora: new Date().toLocaleTimeString()
        };
        setToasts(prev => [info, ...prev]);
        setNotificacoes(prev => [info, ...prev]);
        setContadorNotif(prev => prev + 1);

        // Criar notificação no bell icon para admins
        notificarUsuariosReq(
          'requisicao',
          'Requisição Atualizada pelo Técnico',
          `Requisição #${novo.ReqREF} foi atualizada`,
          '/requisicoes'
        );

        if (novo.ReqFotoNota && novo.ReqREF) {
          await supabase.from('Requisicao')
            .update({ recibo_fornecedor: novo.ReqFotoNota })
            .eq('id', novo.ReqREF);
        }

        carregarDados(true);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== info.id)), 10000);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'Requisicao' }, () => {
        carregarDados(true);
      })
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Requisições] Realtime conectado')
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[Requisições] Erro realtime:', status, err?.message)
          // Reconectar após 3s
          setTimeout(() => {
            supabase.removeChannel(channel)
            carregarDados(true)
          }, 3000)
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [carregarDados]);

  const salvarUsuario = async (dados: any) => {
    if (usuarioEditando) {
      const { error } = await supabase.from('req_usuarios').update(dados).eq('id', usuarioEditando.id);
      if (error) { console.error('Erro ao editar usuário:', error); alert('Erro ao salvar: ' + error.message); return; }
      auditLog({ sistema: 'requisicoes', acao: 'editar', entidade: 'usuario', entidade_id: usuarioEditando.id, entidade_label: dados.nome });
    } else {
      const { error } = await supabase.from('req_usuarios').insert([dados]);
      if (error) { console.error('Erro ao criar usuário:', error); alert('Erro ao cadastrar: ' + error.message); return; }
      auditLog({ sistema: 'requisicoes', acao: 'criar', entidade: 'usuario', entidade_label: dados.nome });
    }
    setUsuarioEditando(null); setAbaAtiva('usuarios'); await carregarDados(true);
  };

  const salvarVeiculo = async (dados: any) => {
    if (veiculoEditando) {
      const { error } = await supabase.from('SupaPlacas').update(dados).eq('IdPlaca', veiculoEditando.IdPlaca);
      if (error) { console.error('Erro ao editar veículo:', error); alert('Erro ao salvar: ' + error.message); return; }
      auditLog({ sistema: 'requisicoes', acao: 'editar', entidade: 'veiculo', entidade_id: veiculoEditando.IdPlaca, entidade_label: dados.NumPlaca });
    } else {
      const { error } = await supabase.from('SupaPlacas').insert([dados]);
      if (error) { console.error('Erro ao criar veículo:', error); alert('Erro ao cadastrar: ' + error.message); return; }
      auditLog({ sistema: 'requisicoes', acao: 'criar', entidade: 'veiculo', entidade_label: dados.NumPlaca });
    }
    setVeiculoEditando(null); setAbaAtiva('veiculos'); await carregarDados(true);
  };

  const tabs = [
    { id: 'kanban', label: 'Kanban', icon: <LayoutDashboard size={16} /> },
    { id: 'usuarios', label: 'Usuários', icon: <UserCircle size={16} /> },
    { id: 'veiculos', label: 'Veículos', icon: <Car size={16} /> },
    { id: 'fornecedores', label: 'Fornecedores', icon: <Users2 size={16} /> },
    { id: 'relatorio', label: 'Relatório', icon: <FileText size={16} /> },
    { id: 'lixeira', label: `Lixeira${lixeiraCount > 0 ? ` (${lixeiraCount})` : ''}`, icon: <Trash2 size={16} /> },
  ];

  return (
    <div style={{ padding: '24px 32px' }}>
      {reqParaImprimir && <TemplatePDF req={reqParaImprimir} onUpdate={() => {}} onPrint={() => {}} />}

      {/* Toasts */}
      <div className="fixed top-20 right-6 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none print:hidden">
        {toasts.map((t: any) => (
          <div
            key={t.id}
            onClick={() => abrirNotificacao(t.idOriginal)}
            className="pointer-events-auto cursor-pointer rounded-2xl overflow-hidden hover:scale-[1.02] transition-all"
            style={{
              background: '#fff',
              boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
              border: '1px solid #f0f0f0',
              animation: 'toastSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <div style={{ height: '3px', background: 'linear-gradient(90deg, #dc2626, #ef4444)', animation: 'toastProgress 6s linear forwards' }} />
            <div className="flex items-center gap-3 p-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center text-white shrink-0 shadow-md shadow-red-200">
                <Bell size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-0.5">{t.tipoNotif}</p>
                <p className="text-[13px] font-semibold text-zinc-800 truncate">{t.titulo}</p>
              </div>
              <div className="text-[10px] text-zinc-400 font-medium shrink-0">agora</div>
            </div>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes toastSlideIn {
          from { opacity: 0; transform: translateX(120%); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes toastProgress {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>

      {/* Notificações — Painel lateral */}
      {showNotifModal && (
        <>
          {/* Overlay sutil */}
          <div
            className="fixed inset-0 z-[10000] print:hidden"
            style={{ background: 'rgba(0,0,0,0.12)', transition: 'opacity 0.3s' }}
            onClick={() => { setShowNotifModal(false); setContadorNotif(0); }}
          />
          {/* Painel */}
          <div
            className="fixed top-0 right-0 bottom-0 z-[10001] print:hidden flex flex-col"
            style={{
              width: '400px', maxWidth: '90vw',
              background: 'linear-gradient(180deg, #ffffff 0%, #fafafa 100%)',
              boxShadow: '-12px 0 48px rgba(0,0,0,0.08)',
              animation: 'notifSlideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              padding: '28px 24px 20px', flexShrink: 0,
              borderBottom: '1px solid #f0f0f0',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#1a1a1a', margin: 0, letterSpacing: '-0.3px' }}>Notificações</h2>
                  <p style={{ fontSize: '12px', color: '#a3a3a3', margin: '4px 0 0', fontWeight: '500' }}>
                    {notificacoes.length === 0 ? 'Nenhuma atualização' : `${notificacoes.length} ${notificacoes.length === 1 ? 'atualização' : 'atualizações'} recentes`}
                  </p>
                </div>
                <button
                  onClick={() => { setShowNotifModal(false); setContadorNotif(0); }}
                  style={{
                    width: '32px', height: '32px', borderRadius: '10px',
                    background: '#f5f5f5', border: 'none', color: '#a3a3a3',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#dc2626' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#f5f5f5'; e.currentTarget.style.color = '#a3a3a3' }}
                >
                  <X size={16} />
                </button>
              </div>
              {notificacoes.length > 0 && (
                <button
                  onClick={() => setNotificacoes([])}
                  style={{
                    width: '100%', padding: '8px', borderRadius: '10px',
                    background: '#fef2f2', border: '1px solid #fecaca',
                    color: '#dc2626', fontSize: '11px', fontWeight: '600',
                    cursor: 'pointer', transition: 'all 0.2s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#fef2f2' }}
                >
                  <CheckCheck size={13} /> Limpar todas
                </button>
              )}
            </div>

            {/* Lista */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
              {notificacoes.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px' }}>
                  <div style={{
                    width: '64px', height: '64px', borderRadius: '20px',
                    background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <Bell size={28} color="#d4d4d4" />
                  </div>
                  <p style={{ fontSize: '14px', color: '#a3a3a3', fontWeight: '500' }}>Tudo em dia!</p>
                  <p style={{ fontSize: '12px', color: '#d4d4d4' }}>Nenhuma notificação pendente</p>
                </div>
              ) : notificacoes.map((n: any, i: number) => (
                <div
                  key={n.id}
                  onClick={() => abrirNotificacao(n.idOriginal)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: '14px',
                    padding: '16px', borderRadius: '14px', cursor: 'pointer',
                    marginBottom: '4px', transition: 'all 0.2s',
                    background: 'transparent',
                    border: '1px solid transparent',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.border = '1px solid #f0f0f0'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.border = '1px solid transparent'; e.currentTarget.style.boxShadow = 'none' }}
                >
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '12px',
                    background: 'linear-gradient(135deg, #fef2f2, #fff1f2)',
                    border: '1px solid #fecaca',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <Bell size={16} color="#dc2626" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: '13px', fontWeight: '600', color: '#1a1a1a',
                      margin: 0, lineHeight: '1.4',
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any
                    }}>{n.titulo}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                      <span style={{
                        fontSize: '11px', color: '#a3a3a3', fontWeight: '500'
                      }}>{n.solicitante}</span>
                      <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: '#d4d4d4' }} />
                      <span style={{
                        fontSize: '11px', color: '#dc2626', fontWeight: '600'
                      }}>{n.hora}</span>
                    </div>
                  </div>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '8px',
                    background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, marginTop: '4px'
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <style>{`
            @keyframes notifSlideIn {
              from { transform: translateX(100%); }
              to { transform: translateX(0); }
            }
          `}</style>
        </>
      )}

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div>
            <h2 style={{ fontSize: '28px', fontWeight: '800', color: '#1a1a1a', marginBottom: '6px' }}>
              Requisições
            </h2>
            <p style={{ color: '#a3a3a3', fontSize: '14px' }}>
              Kanban de requisições de materiais e serviços
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => { setShowNotifModal(true); setContadorNotif(0); }}
              style={{
                position: 'relative', padding: '8px 14px', borderRadius: '10px',
                background: '#fff', border: '1px solid #e5e5e5',
                color: '#737373', fontSize: '13px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'Inter'
              }}
            >
              <Bell size={16} />
              Alertas
              {contadorNotif > 0 && (
                <span style={{
                  position: 'absolute', top: '-6px', right: '-6px',
                  width: '18px', height: '18px', borderRadius: '50%',
                  background: '#dc2626', color: '#fff', fontSize: '10px', fontWeight: '700',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>{contadorNotif}</span>
              )}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', background: '#f5f5f5', padding: '4px', borderRadius: '12px', width: 'fit-content' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setAbaAtiva(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 16px', borderRadius: '8px',
                background: abaAtiva === tab.id ? '#fff' : 'transparent',
                border: abaAtiva === tab.id ? '1px solid #e5e5e5' : '1px solid transparent',
                boxShadow: abaAtiva === tab.id ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                color: abaAtiva === tab.id ? '#dc2626' : '#737373',
                fontSize: '13px', fontWeight: abaAtiva === tab.id ? '600' : '500',
                cursor: 'pointer', fontFamily: 'Inter', transition: 'all 0.2s'
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-32">
          <Activity className="animate-spin text-red-500" />
        </div>
      ) : (
        <div className="print:hidden">
          {abaAtiva === 'kanban' && (
            <Kanban
              requisicoes={requisicoes}
              onUpdate={handleUpdateReq}
              onPrint={dispararImpressao}
              idDestaque={idDestaque}
              onCardFechado={handleCardFechado}
            />
          )}

          {abaAtiva === 'usuarios' && (
            <div>
              <div className="flex justify-between items-center mb-8">
                <span className="text-sm text-zinc-500">{usuarios.length} colaboradores cadastrados</span>
                <button onClick={() => { setUsuarioEditando(null); setAbaAtiva('form_usuario'); }} className="bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-xl font-semibold flex items-center gap-2 text-sm transition-all">
                  <UserPlus size={16} /> Novo Colaborador
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {usuarios.map(u => (
                  <div key={u.id} className="bg-white border border-zinc-200 p-6 rounded-2xl hover:border-red-200 transition-all group">
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center text-red-600"><UserCircle size={20} /></div>
                      <button onClick={() => { setUsuarioEditando(u); setAbaAtiva('form_usuario'); }} className="p-2 text-zinc-400 hover:text-red-600 transition-colors"><Edit3 size={16} /></button>
                    </div>
                    <h3 className="text-base font-semibold text-zinc-800 mb-1">{u.nome}</h3>
                    <p className="text-xs text-zinc-400 mb-3">{u.email}</p>
                    <div className="flex items-center gap-2 text-red-600 text-xs font-semibold"><Phone size={12} /> {u.telefone || 'Sem Telefone'}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {abaAtiva === 'veiculos' && (
            <div>
              <div className="flex justify-between items-center mb-8">
                <span className="text-sm text-zinc-500">{veiculos.length} veículos cadastrados</span>
                <button onClick={() => { setVeiculoEditando(null); setAbaAtiva('form_veiculo'); }} className="bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-xl font-semibold flex items-center gap-2 text-sm transition-all">
                  <Plus size={16} /> Novo Veículo
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {veiculos.map(v => (
                  <div key={v.IdPlaca} className="bg-white border border-zinc-200 p-5 rounded-2xl hover:border-red-200 transition-all flex justify-between items-center">
                    <div>
                      <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest mb-1">PLACA</p>
                      <h3 className="text-base font-semibold text-zinc-800 uppercase">{v.NumPlaca}</h3>
                    </div>
                    <button onClick={() => { setVeiculoEditando(v); setAbaAtiva('form_veiculo'); }} className="p-2 text-zinc-400 hover:text-red-600 transition-colors"><Edit3 size={16} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {abaAtiva === 'form_usuario' && (
            <div className="max-w-3xl mx-auto">
              <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
                <FormUsuario usuarioParaEditar={usuarioEditando} onSave={salvarUsuario} onCancel={() => setAbaAtiva('usuarios')} />
              </div>
            </div>
          )}

          {abaAtiva === 'form_veiculo' && (
            <div className="max-w-3xl mx-auto">
              <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
                <FormVeiculo veiculoParaEditar={veiculoEditando} onSave={salvarVeiculo} onCancel={() => setAbaAtiva('veiculos')} />
              </div>
            </div>
          )}

          {abaAtiva === 'fornecedores' && (
            <FormFornecedor onSave={async (n: Record<string, unknown>) => {
              const { error } = await supabase.from('Fornecedores').insert([n]);
              if (error) { console.error('Erro ao criar fornecedor:', error); alert('Erro ao cadastrar: ' + error.message); return; }
              auditLog({ sistema: 'requisicoes', acao: 'criar', entidade: 'fornecedor', entidade_label: String(n.nome || '') });
            }} />
          )}

          {abaAtiva === 'relatorio' && (() => {
            const tipos = [...new Set(requisicoes.filter(r => r.status !== 'lixeira').map(r => r.tipo || r.ReqTipo).filter(Boolean))].sort();
            const setores = [...new Set(requisicoes.filter(r => r.status !== 'lixeira').map(r => r.setor).filter(Boolean))].sort();
            const solicitantes = [...new Set(requisicoes.filter(r => r.status !== 'lixeira').map(r => r.solicitante).filter(Boolean))].sort();
            const veiculosList = veiculos || [];
            const usuariosList = usuarios || [];
            const getNome = (email: string) => { const u = usuariosList.find((x: any) => x.email === email?.trim()); return u?.nome || email || '—'; };
            const getPlaca = (id: any) => { const v = veiculosList.find((x: any) => String(x.IdPlaca) === String(id)); return v?.NumPlaca || ''; };
            const fases = [
              { id: 'pedido', label: 'Pedido Realizado', cor: '#ef4444' },
              { id: 'completa', label: 'Atualizada por Técnico', cor: '#06b6d4' },
              { id: 'aguardando', label: 'Aguardando Fornecedor', cor: '#f97316' },
            ];
            const getDetalhe = (r: any) => {
              const tipo = (r.tipo || r.ReqTipo || '').toLowerCase();
              const setor = (r.setor || '').toLowerCase();
              if (setor.includes('cliente')) return r.cliente || '';
              if (['veicular abastecimento', 'veicular manutenção'].includes(tipo)) return getPlaca(r.veiculo) || r.veiculo || '';
              if (setor.includes('trator') && setor.includes('loja')) return r.Chassis_Modelo || '';
              if (['trator abastecimento', 'quadri abastecimento'].includes(tipo)) return r.Chassis_Modelo || '';
              if (tipo === 'ferramenta') return r.quem_ferramenta || '';
              return '';
            };
            const handlePrint = () => {
              const el = document.getElementById('relatorio-req-print');
              if (!el) return;
              const w = window.open('', '_blank');
              if (!w) return;
              w.document.write(`<!DOCTYPE html><html><head><title>Relatório Requisições</title><style>
                @page { size: A4; margin: 10mm; }
                body { font-family: Arial, sans-serif; font-size: 10pt; color: #1e293b; margin: 0; padding: 10px; }
                h1 { font-size: 14pt; margin: 0 0 4px; }
                .info { font-size: 9pt; color: #64748b; margin-bottom: 12px; }
                .fase-header { display: flex; align-items: center; gap: 8px; margin: 16px 0 6px; padding: 6px 10px; border-radius: 6px; }
                .fase-header h2 { font-size: 11pt; margin: 0; color: #fff; }
                .fase-header .count { font-size: 9pt; color: rgba(255,255,255,0.8); }
                table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
                th { background: #f1f5f9; padding: 5px 8px; text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.3px; color: #64748b; border-bottom: 2px solid #e2e8f0; }
                td { padding: 4px 8px; border-bottom: 1px solid #f1f5f9; font-size: 9pt; }
                tr:nth-child(even) { background: #fafbfc; }
                .total { margin-top: 8px; text-align: right; font-size: 10pt; font-weight: 700; }
              </style></head><body>${el.innerHTML}</body></html>`);
              w.document.close();
              w.onload = () => { w.print(); };
            };
            return (
            <div>
              <div className="flex flex-wrap gap-3 mb-6 items-end no-print">
                <div>
                  <label className="text-xs text-zinc-500 font-medium block mb-1">Buscar</label>
                  <input type="text" placeholder="ID, título, cliente..." value={filtroRelBusca} onChange={e => setFiltroRelBusca(e.target.value)} className="border border-zinc-200 rounded-lg px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-red-200" />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 font-medium block mb-1">Tipo</label>
                  <select value={filtroRelTipo} onChange={e => setFiltroRelTipo(e.target.value)} className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200">
                    <option value="">Todos</option>
                    {tipos.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-500 font-medium block mb-1">Setor</label>
                  <select value={filtroRelSetor} onChange={e => setFiltroRelSetor(e.target.value)} className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200">
                    <option value="">Todos</option>
                    {setores.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-500 font-medium block mb-1">Solicitante</label>
                  <select value={filtroRelSolicitante} onChange={e => setFiltroRelSolicitante(e.target.value)} className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200">
                    <option value="">Todos</option>
                    {solicitantes.map(s => <option key={s} value={s}>{getNome(s)}</option>)}
                  </select>
                </div>
                <button onClick={() => { setFiltroRelBusca(''); setFiltroRelTipo(''); setFiltroRelSetor(''); setFiltroRelSolicitante(''); }} className="text-xs text-zinc-400 hover:text-red-600 underline py-2">Limpar filtros</button>
                <button onClick={handlePrint} className="ml-auto bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 text-zinc-700 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all">
                  <Printer size={14} /> Imprimir
                </button>
              </div>

              <div className="text-xs text-zinc-500 mb-3 font-medium">{reqAbertas.length} requisição(ões) aberta(s)</div>

              <div id="relatorio-req-print">
                <h1 style={{ display: 'none' }}>Nova Tratores — Requisições em Aberto</h1>
                <div className="info" style={{ display: 'none' }}>Gerado em: {new Date().toLocaleDateString('pt-BR')} | {reqAbertas.length} requisições</div>

                {fases.map(fase => {
                  const items = reqAbertas.filter(r => r.status === fase.id);
                  if (items.length === 0) return null;
                  return (
                    <div key={fase.id} style={{ marginBottom: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 8, background: fase.cor, marginBottom: 8 }}>
                        <h2 style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: 0 }}>{fase.label}</h2>
                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>({items.length})</span>
                      </div>
                      <div className="overflow-x-auto rounded-lg border border-zinc-200">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-zinc-50 text-left text-xs text-zinc-500 uppercase tracking-wider">
                              <th className="px-3 py-2 font-semibold">#</th>
                              <th className="px-3 py-2 font-semibold">Título</th>
                              <th className="px-3 py-2 font-semibold">Solicitante</th>
                              <th className="px-3 py-2 font-semibold">Tipo</th>
                              <th className="px-3 py-2 font-semibold">Setor</th>
                              <th className="px-3 py-2 font-semibold">Detalhes</th>
                              <th className="px-3 py-2 font-semibold text-right">Valor</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((r: any) => (
                              <tr key={r.id} className="border-t border-zinc-100 hover:bg-zinc-50 transition-colors">
                                <td className="px-3 py-2 font-semibold text-zinc-700">{r.id}</td>
                                <td className="px-3 py-2 text-zinc-800 font-medium" style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.titulo || r.Material_Serv_Solicitado || '—'}</td>
                                <td className="px-3 py-2 text-zinc-600">{getNome(r.solicitante)}</td>
                                <td className="px-3 py-2"><span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-zinc-100 text-zinc-600">{r.tipo || r.ReqTipo || '—'}</span></td>
                                <td className="px-3 py-2 text-zinc-600 text-xs">{r.setor || '—'}</td>
                                <td className="px-3 py-2 text-zinc-600 text-xs">{getDetalhe(r)}</td>
                                <td className="px-3 py-2 text-zinc-700 font-medium text-right whitespace-nowrap">R$ {r.valor_despeza || '0,00'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
                {reqAbertas.length === 0 && (
                  <div className="py-16 text-center text-zinc-400 text-sm">Nenhuma requisição aberta encontrada</div>
                )}
              </div>
            </div>)
          })()}

          {abaAtiva === 'lixeira' && (
            <div>
              <div className="flex justify-between items-center mb-8">
                <div>
                  <p className="text-sm text-zinc-500">Requisições excluídas — restaure ou apague definitivamente</p>
                </div>
                {lixeiraCount > 0 && (
                  <button
                    onClick={async () => {
                      if (!confirm('Apagar TODAS as requisições da lixeira permanentemente?')) return;
                      const ids = requisicoes.filter(r => r.status === 'lixeira').map(r => r.id);
                      await supabase.from('Requisicao').delete().in('id', ids);
                      auditLog({ sistema: 'requisicoes', acao: 'deletar', entidade: 'requisicao', detalhes: { quantidade: ids.length, tipo: 'esvaziar_lixeira' } });
                      notificarUsuariosReq('requisicao', `${userName} esvaziou a lixeira`, `${ids.length} requisições excluídas`, '/requisicoes');
                      carregarDados(true);
                    }}
                    className="bg-red-50 hover:bg-red-600 border border-red-200 text-red-600 hover:text-white px-5 py-2.5 rounded-xl font-semibold text-xs uppercase tracking-wider flex items-center gap-2 transition-all"
                  >
                    <Trash2 size={14} /> Esvaziar Lixeira
                  </button>
                )}
              </div>

              {lixeiraCount === 0 ? (
                <div className="flex flex-col items-center justify-center py-32 text-zinc-300">
                  <Trash2 size={48} className="mb-4 opacity-30" />
                  <p className="text-sm font-semibold text-zinc-400">Lixeira vazia</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {requisicoes.filter(r => r.status === 'lixeira').map(r => (
                    <div key={r.id} className="bg-white border border-zinc-200 rounded-2xl p-6 hover:border-red-200 transition-all">
                      <div className="flex items-start gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-zinc-50 flex items-center justify-center text-zinc-400 font-medium text-sm border border-zinc-200">
                          {r.id}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{r.tipo || r.ReqTipo}</span>
                          <h3 className="text-sm font-semibold text-zinc-800 leading-tight mt-0.5 line-clamp-2">{r.titulo || r.Material_Serv_Solicitado || '—'}</h3>
                        </div>
                      </div>

                      <div className="space-y-1.5 text-xs text-zinc-500 border-t border-zinc-100 pt-3 mb-4">
                        <div className="flex justify-between"><span>Solicitante</span><span className="text-zinc-700 font-medium truncate max-w-[150px]">{r.solicitante || '—'}</span></div>
                        <div className="flex justify-between"><span>Setor</span><span className="text-zinc-700 font-medium">{r.setor || '—'}</span></div>
                        <div className="flex justify-between"><span>Valor</span><span className="text-zinc-700 font-medium">R$ {r.valor_despeza || '0,00'}</span></div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            await supabase.from('Requisicao').update({ status: 'pedido' }).eq('id', r.id);
                            setRequisicoes(prev => prev.map(x => x.id === r.id ? { ...x, status: 'pedido' } : x));
                            auditLog({ sistema: 'requisicoes', acao: 'mover_status', entidade: 'requisicao', entidade_id: String(r.id), entidade_label: r.titulo, detalhes: { de: 'lixeira', para: 'pedido' } });
                            notificarUsuariosReq('requisicao', `${userName} restaurou requisição #${r.id}`, r.titulo || '', '/requisicoes');
                          }}
                          className="flex-1 bg-zinc-50 hover:bg-red-600 border border-zinc-200 hover:border-red-500 text-zinc-600 hover:text-white py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all flex items-center justify-center gap-2"
                        >
                          <Activity size={14} /> Restaurar
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm(`Excluir a requisição #${r.id} permanentemente?`)) return;
                            await supabase.from('Requisicao').delete().eq('id', r.id);
                            setRequisicoes(prev => prev.filter(x => x.id !== r.id));
                            auditLog({ sistema: 'requisicoes', acao: 'deletar', entidade: 'requisicao', entidade_id: String(r.id), entidade_label: r.titulo });
                            notificarUsuariosReq('requisicao', `${userName} excluiu requisição #${r.id}`, r.titulo || '', '/requisicoes');
                          }}
                          className="w-10 h-10 flex items-center justify-center rounded-xl bg-red-50 hover:bg-red-600 border border-red-200 text-red-500 hover:text-white transition-all"
                          title="Excluir permanentemente"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* FAB - Nova Requisição */}
      <button
        onClick={() => setAbaAtiva(abaAtiva === 'form' ? 'kanban' : 'form')}
        style={{
          position: 'fixed', bottom: '32px', right: '32px',
          width: '56px', height: '56px',
          background: abaAtiva === 'form' ? '#dc2626' : 'linear-gradient(135deg, #dc2626, #b91c1c)',
          color: '#fff', borderRadius: '16px', border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 24px rgba(220,38,38,0.3)',
          cursor: 'pointer', zIndex: 110, transition: 'all 0.3s',
          transform: abaAtiva === 'form' ? 'rotate(45deg)' : 'rotate(0deg)'
        }}
        className="print:hidden"
      >
        <Plus size={24} />
      </button>

      {/* Form Modal */}
      {abaAtiva === 'form' && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[100] flex items-center justify-center p-4 print:hidden">
          <div className="w-full max-w-5xl bg-white rounded-2xl border border-zinc-200 overflow-y-auto max-h-[90vh] shadow-xl">
            <FormReq onSave={async (nova: Record<string, unknown>) => {
              const { error } = await supabase.from('Requisicao').insert([nova]);
              if (error) {
                console.error('[Requisições] Erro ao criar:', error);
                alert('Erro ao criar requisição: ' + error.message);
                return;
              }
              auditLog({ sistema: 'requisicoes', acao: 'criar', entidade: 'requisicao', entidade_label: String(nova.titulo || '') });
              notificarUsuariosReq('requisicao', `${userName} criou uma requisição`, String(nova.titulo || 'Nova requisição'), '/requisicoes');
              setAbaAtiva('kanban');
              carregarDados(true);
            }} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function RequisicoesPage() {
  const { userProfile } = useAuth();
  const { temAcesso, loading: loadingPerm } = usePermissoes(userProfile?.id);
  if (!loadingPerm && userProfile && !temAcesso('requisicoes')) return <SemPermissao />;
  return <RequisicoesPageInner />;
}
