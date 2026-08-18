'use client';
export const dynamic = 'force-dynamic';
import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { authHeaders } from '@/lib/auth/client';
import { filtrarDestinatarios } from '@/lib/notif/prefs';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { gateBtn, estiloSemPermissao } from '@/lib/permissoes/ui';
import SemPermissao from '@/components/SemPermissao';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import Kanban from '@/components/requisicoes/Kanban';
import FormReq from '@/components/requisicoes/FormReq';
import FormFornecedor from '@/components/requisicoes/FormFornecedor';
import TemplatePDF from '@/components/requisicoes/TemplatePDF';
import {
  LayoutDashboard, Users2, Box, Activity, Trash2, Plus, X, Bell, Info, CheckCheck, FileText, Printer, Tag
} from 'lucide-react';
import ModalTags from '@/components/requisicoes/ModalTags';
import PainelDev from '@/components/requisicoes/PainelDev';
import PecasNav from '@/components/ppv/PecasNav';

// A aba "Veículos" morreu na Fase 5 do Frota: o cadastro de veículos agora é
// SÓ no módulo Frota (/frota, botão "Novo veículo"), que mantém a SupaPlacas
// como projeção — o dropdown do FormReq e o Omie continuam funcionando igual.
const ABAS_VALIDAS = new Set(['kanban', 'usuarios', 'fornecedores', 'relatorio', 'lixeira', 'form_usuario']);

function RequisicoesPageInner() {
  const { userProfile } = useAuth();
  const { isDev, pode } = usePermissoes(userProfile?.id);
  // Permissões granulares das Requisições
  const podeCriar = pode('requisicoes', 'criar');
  const podeEditar = pode('requisicoes', 'editar');
  const podeMoverFase = pode('requisicoes', 'mover_fase');
  const podeFornecedor = pode('requisicoes', 'criar_fornecedor');
  const podeTags = pode('requisicoes', 'tags');
  const podeExcluir = pode('requisicoes', 'excluir');
  const podeImprimir = pode('requisicoes', 'imprimir');
  const { log: auditLog } = useAuditLog();
  const userName = userProfile?.nome || 'Alguém';
  const searchParams = useSearchParams();
  const abaInicial = (() => {
    const a = searchParams.get('aba');
    return a && ABAS_VALIDAS.has(a) ? a : 'kanban';
  })();
  const editarFornecedorId = searchParams.get('editar');
  const [abaAtiva, setAbaAtiva] = useState(abaInicial);
  const [requisicoes, setRequisicoes] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [veiculos, setVeiculos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reqParaImprimir, setReqParaImprimir] = useState<any>(null);
  const [anexosParaImprimir, setAnexosParaImprimir] = useState<{ label: string; dataUrl: string }[]>([]);
  const [notificacoes, setNotificacoes] = useState<any[]>([]);
  const [toasts, setToasts] = useState<any[]>([]);
  const [showNotifModal, setShowNotifModal] = useState(false);
  const [showTagsModal, setShowTagsModal] = useState(false);
  const [contadorNotif, setContadorNotif] = useState(0);
  // Deep-link: /requisicoes?req=<id> abre o card direto (usado pelo Frota >
  // Manutenções; o Kanban sobe o card pro topo da coluna e expande o modal).
  const [idDestaque, setIdDestaque] = useState<any>(() => {
    const r = searchParams.get('req');
    return r && /^\d+$/.test(r) ? Number(r) : null;
  });
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
        return (r.titulo || '').toLowerCase().includes(b) || String(r.id).includes(b) || (r.cliente || '').toLowerCase().includes(b) || (r.Chassis_Modelo || '').toLowerCase().includes(b) || (r.numero_nota || '').toLowerCase().includes(b);
      })
      .sort((a: any, b: any) => (b.id || 0) - (a.id || 0));
  }, [requisicoes, filtroRelTipo, filtroRelSetor, filtroRelSolicitante, filtroRelBusca]);

  // `anexos` são folhas já convertidas em imagem (ver lib/requisicoes/anexos-pdf):
  // saem como páginas extras do MESMO documento, depois da requisição.
  const dispararImpressao = (dados: any, anexos: { label: string; dataUrl: string }[] = []) => {
    setReqParaImprimir(dados);
    setAnexosParaImprimir(anexos);
    setTimeout(() => {
      window.print();
      setReqParaImprimir(null);
      setAnexosParaImprimir([]);
    }, anexos.length ? 1400 : 800);   // dá tempo das imagens entrarem no layout
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
        supabase.from('financeiro_usu').select('*').eq('ativo', true).order('nome', { ascending: true }),
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
    if (error) { console.error('[Requisições] Erro ao atualizar:', error?.message, error?.code, error?.details, error?.hint); carregarDados(true); return }
    auditLog({ sistema: 'requisicoes', acao: 'editar', entidade: 'requisicao', entidade_id: String(id), detalhes: dados });
    // Marca que esse card foi editado (notificação só ao fechar)
    cardsEditadosRef.current.add(id);
  }, [carregarDados, auditLog])

  const handleCardFechado = useCallback((id: number) => {
    // Fechou o card do deep-link: solta o destaque (senão ele reabre no rerender)
    setIdDestaque((atual: any) => (String(atual) === String(id) ? null : atual));
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
        .select('user_id, is_admin, modulos_permitidos, categoria, notif_silenciado');
      if (!permissoes || permissoes.length === 0) return;
      // Respeita as preferências de silenciar (módulo 'requisicoes').
      const ids = filtrarDestinatarios('requisicoes', permissoes.filter((p: any) => p.is_admin));
      if (ids.length === 0) return;
      await supabase.from('portal_notificacoes').insert(
        ids.map((user_id) => ({
          user_id,
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
              .from('financeiro_usu')
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

  const tabs = [
    { id: 'kanban', label: 'Kanban', icon: <LayoutDashboard size={16} /> },
    podeFornecedor && { id: 'fornecedores', label: 'Fornecedores', icon: <Users2 size={16} /> },
    { id: 'relatorio', label: 'Relatório', icon: <FileText size={16} /> },
    podeExcluir && { id: 'lixeira', label: `Lixeira${lixeiraCount > 0 ? ` (${lixeiraCount})` : ''}`, icon: <Trash2 size={16} /> },
  ].filter(Boolean) as { id: string; label: string; icon: React.ReactNode }[];

  return (
    <div className="pecas-skin">
    {/* Sistema Peças: barra padronizada do módulo */}
    <div className="print:hidden"><PecasNav /></div>
    <div className="px-3 py-3 md:px-8 md:py-6">
      {reqParaImprimir && <TemplatePDF req={reqParaImprimir} anexos={anexosParaImprimir} onUpdate={() => {}} onPrint={() => {}} />}
      <ModalTags open={showTagsModal} onClose={() => setShowTagsModal(false)} />

      {/* Toasts */}
      <div className="fixed top-20 right-6 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none print:hidden">
        {toasts.map((t: any) => (
          <div
            key={t.id}
            onClick={() => abrirNotificacao(t.idOriginal)}
            className="pointer-events-auto cursor-pointer rounded-2xl overflow-hidden hover:scale-[1.02] transition-all"
            style={{
              background: 'var(--portal-bg-card)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
              border: '1px solid var(--portal-border)',
              animation: 'toastSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <div style={{ height: '3px', background: 'linear-gradient(90deg, #EA580C, #F97316)', animation: 'toastProgress 6s linear forwards' }} />
            <div className="flex items-center gap-3 p-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center text-white shrink-0 shadow-md shadow-orange-200">
                <Bell size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mb-0.5">{t.tipoNotif}</p>
                <p className="text-[13px] font-semibold text-black truncate">{t.titulo}</p>
              </div>
              <div className="text-[10px] text-black font-medium shrink-0">agora</div>
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
              background: 'linear-gradient(180deg, var(--portal-bg-card) 0%, var(--portal-bg-secondary) 100%)',
              boxShadow: '-12px 0 48px rgba(0,0,0,0.08)',
              animation: 'notifSlideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              padding: '28px 24px 20px', flexShrink: 0,
              borderBottom: '1px solid var(--portal-border)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--portal-text)', margin: 0, letterSpacing: '-0.3px' }}>Notificações</h2>
                  <p style={{ fontSize: '12px', color: 'var(--portal-text-muted)', margin: '4px 0 0', fontWeight: '500' }}>
                    {notificacoes.length === 0 ? 'Nenhuma atualização' : `${notificacoes.length} ${notificacoes.length === 1 ? 'atualização' : 'atualizações'} recentes`}
                  </p>
                </div>
                <button
                  onClick={() => { setShowNotifModal(false); setContadorNotif(0); }}
                  style={{
                    width: '32px', height: '32px', borderRadius: '10px',
                    background: 'var(--portal-bg-secondary)', border: 'none', color: 'var(--portal-text-muted)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#FFEDD5'; e.currentTarget.style.color = '#EA580C' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--portal-bg-secondary)'; e.currentTarget.style.color = 'var(--portal-text-muted)' }}
                >
                  <X size={16} />
                </button>
              </div>
              {notificacoes.length > 0 && (
                <button
                  onClick={() => setNotificacoes([])}
                  style={{
                    width: '100%', padding: '8px', borderRadius: '10px',
                    background: '#FFF7ED', border: '1px solid #FED7AA',
                    color: '#EA580C', fontSize: '11px', fontWeight: '600',
                    cursor: 'pointer', transition: 'all 0.2s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#FFEDD5' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#FFF7ED' }}
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
                    background: 'var(--portal-bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <Bell size={28} color="var(--portal-text-faint)" />
                  </div>
                  <p style={{ fontSize: '14px', color: 'var(--portal-text-muted)', fontWeight: '500' }}>Tudo em dia!</p>
                  <p style={{ fontSize: '12px', color: 'var(--portal-text-faint)' }}>Nenhuma notificação pendente</p>
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
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--portal-bg-card)'; e.currentTarget.style.border = '1px solid var(--portal-border)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.border = '1px solid transparent'; e.currentTarget.style.boxShadow = 'none' }}
                >
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '12px',
                    background: 'linear-gradient(135deg, #FFF7ED, #fff1f2)',
                    border: '1px solid #FED7AA',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <Bell size={16} color="#EA580C" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: '13px', fontWeight: '600', color: 'var(--portal-text)',
                      margin: 0, lineHeight: '1.4',
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any
                    }}>{n.titulo}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                      <span style={{
                        fontSize: '11px', color: 'var(--portal-text-muted)', fontWeight: '500'
                      }}>{n.solicitante}</span>
                      <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'var(--portal-text-faint)' }} />
                      <span style={{
                        fontSize: '11px', color: '#EA580C', fontWeight: '600'
                      }}>{n.hora}</span>
                    </div>
                  </div>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '8px',
                    background: 'var(--portal-bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, marginTop: '4px'
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--portal-text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
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

      {/* Header — sem título/subtítulo: guias (maiores) + Tags numa linha só */}
      <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
        {/* Tabs (rolam na horizontal no celular quando não cabem) */}
        <div style={{ display: 'flex', gap: '4px', background: 'var(--portal-bg-secondary)', padding: '5px', borderRadius: '12px', width: 'fit-content', maxWidth: '100%', overflowX: 'auto' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setAbaAtiva(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '7px',
                padding: '10px 22px', borderRadius: '8px',
                background: abaAtiva === tab.id ? 'var(--portal-bg-card)' : 'transparent',
                border: abaAtiva === tab.id ? '1px solid var(--portal-border)' : '1px solid transparent',
                boxShadow: abaAtiva === tab.id ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                color: abaAtiva === tab.id ? '#EA580C' : '#6b7280',
                fontSize: '15px', fontWeight: abaAtiva === tab.id ? '700' : '500',
                cursor: 'pointer', fontFamily: 'Inter', transition: 'all 0.2s',
                whiteSpace: 'nowrap', flexShrink: 0
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowTagsModal(true)}
          {...gateBtn(podeTags)}
          style={{
            padding: '10px 18px', borderRadius: '10px',
            background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)',
            color: '#525252', fontSize: '15px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '7px', fontFamily: 'Inter',
            ...estiloSemPermissao(podeTags)
          }}
        >
          <Tag size={17} />
          Tags
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-32">
          <Activity className="animate-spin text-orange-500" />
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
              podeEditar={podeEditar}
              podeMoverFase={podeMoverFase}
              podeImprimir={podeImprimir}
              podeExcluir={podeExcluir}
              extraControles={isDev && userProfile ? <PainelDev devId={userProfile.id} devNome={userProfile.nome} inline /> : null}
            />
          )}

          {abaAtiva === 'fornecedores' && (
            <FormFornecedor
              editarId={editarFornecedorId}
              onSave={async (n: Record<string, unknown>) => {
                const { error } = await supabase.from('Fornecedores').insert([n]);
                if (error) { console.error('Erro ao criar fornecedor:', error); alert('Erro ao cadastrar: ' + error.message); return; }
                auditLog({ sistema: 'requisicoes', acao: 'criar', entidade: 'fornecedor', entidade_label: String(n.nome || '') });
              }}
            />
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
              { id: 'pedido', label: 'Pedido Realizado', cor: '#F97316' },
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
                  <label className="text-xs text-black font-medium block mb-1">Buscar</label>
                  <input type="text" placeholder="ID, título, cliente, nº nota..." value={filtroRelBusca} onChange={e => setFiltroRelBusca(e.target.value)} className="border border-zinc-200 rounded-lg px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-orange-200" />
                </div>
                <div>
                  <label className="text-xs text-black font-medium block mb-1">Tipo</label>
                  <select value={filtroRelTipo} onChange={e => setFiltroRelTipo(e.target.value)} className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200">
                    <option value="">Todos</option>
                    {tipos.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-black font-medium block mb-1">Setor</label>
                  <select value={filtroRelSetor} onChange={e => setFiltroRelSetor(e.target.value)} className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200">
                    <option value="">Todos</option>
                    {setores.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-black font-medium block mb-1">Solicitante</label>
                  <select value={filtroRelSolicitante} onChange={e => setFiltroRelSolicitante(e.target.value)} className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200">
                    <option value="">Todos</option>
                    {solicitantes.map(s => <option key={s} value={s}>{getNome(s)}</option>)}
                  </select>
                </div>
                <button onClick={() => { setFiltroRelBusca(''); setFiltroRelTipo(''); setFiltroRelSetor(''); setFiltroRelSolicitante(''); }} className="text-xs text-black hover:text-orange-600 underline py-2">Limpar filtros</button>
                <button onClick={handlePrint} className="ml-auto bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 text-black px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all">
                  <Printer size={14} /> Imprimir
                </button>
              </div>

              <div className="text-xs text-black mb-3 font-medium">{reqAbertas.length} requisição(ões) aberta(s)</div>

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
                            <tr className="bg-zinc-50 text-left text-xs text-black uppercase tracking-wider">
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
                                <td className="px-3 py-2 font-semibold text-black">{r.id}</td>
                                <td className="px-3 py-2 text-black font-medium" style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.titulo || r.Material_Serv_Solicitado || '—'}</td>
                                <td className="px-3 py-2 text-black">{getNome(r.solicitante)}</td>
                                <td className="px-3 py-2"><span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-zinc-100 text-black">{r.tipo || r.ReqTipo || '—'}</span></td>
                                <td className="px-3 py-2 text-black text-xs">{r.setor || '—'}</td>
                                <td className="px-3 py-2 text-black text-xs">{getDetalhe(r)}</td>
                                <td className="px-3 py-2 text-black font-medium text-right whitespace-nowrap">R$ {r.valor_despeza || '0,00'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
                {reqAbertas.length === 0 && (
                  <div className="py-16 text-center text-black text-sm">Nenhuma requisição aberta encontrada</div>
                )}
              </div>
            </div>)
          })()}

          {abaAtiva === 'lixeira' && (
            <div>
              <div className="flex justify-between items-center mb-8">
                <div>
                  <p className="text-sm text-black">Requisições excluídas — restaure quando necessário</p>
                </div>
              </div>

              {lixeiraCount === 0 ? (
                <div className="flex flex-col items-center justify-center py-32 text-zinc-300">
                  <Trash2 size={48} className="mb-4 opacity-30" />
                  <p className="text-sm font-semibold text-black">Lixeira vazia</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {requisicoes.filter(r => r.status === 'lixeira').map(r => (
                    <div key={r.id} className="bg-white border border-zinc-200 rounded-2xl p-6 hover:border-orange-200 transition-all">
                      <div className="flex items-start gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-zinc-50 flex items-center justify-center text-black font-medium text-sm border border-zinc-200">
                          {r.id}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-bold text-black uppercase tracking-widest">{r.tipo || r.ReqTipo}</span>
                          <h3 className="text-sm font-semibold text-black leading-tight mt-0.5 line-clamp-2">{r.titulo || r.Material_Serv_Solicitado || '—'}</h3>
                        </div>
                      </div>

                      <div className="space-y-1.5 text-xs text-black border-t border-zinc-100 pt-3 mb-4">
                        <div className="flex justify-between"><span>Solicitante</span><span className="text-black font-medium truncate max-w-[150px]">{r.solicitante || '—'}</span></div>
                        <div className="flex justify-between"><span>Setor</span><span className="text-black font-medium">{r.setor || '—'}</span></div>
                        <div className="flex justify-between"><span>Valor</span><span className="text-black font-medium">R$ {r.valor_despeza || '0,00'}</span></div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            await supabase.from('Requisicao').update({ status: 'pedido' }).eq('id', r.id);
                            setRequisicoes(prev => prev.map(x => x.id === r.id ? { ...x, status: 'pedido' } : x));
                            auditLog({ sistema: 'requisicoes', acao: 'mover_status', entidade: 'requisicao', entidade_id: String(r.id), entidade_label: r.titulo, detalhes: { de: 'lixeira', para: 'pedido' } });
                            notificarUsuariosReq('requisicao', `${userName} restaurou requisição #${r.id}`, r.titulo || '', '/requisicoes');
                          }}
                          className="flex-1 bg-zinc-50 hover:bg-orange-600 border border-zinc-200 hover:border-orange-500 text-black hover:text-white py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all flex items-center justify-center gap-2"
                        >
                          <Activity size={14} /> Restaurar
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

      {/* Painel do Dev (só visível para Devs) */}
      {/* Painel do Dev agora fica inline na barra de filtros do Kanban (extraControles) */}

      {/* Card aberto (modal de detalhes) → os botões flutuantes somem */}
      <style>{`body[data-req-modal="1"] .fab-nova-req, body[data-req-modal="1"] .fab-painel-dev { display: none !important; }`}</style>

      {/* FAB - Nova Requisição */}
      <button
        onClick={() => setAbaAtiva(abaAtiva === 'form' ? 'kanban' : 'form')}
        {...gateBtn(podeCriar)}
        style={{
          position: 'fixed', bottom: '32px', right: '32px',
          width: '56px', height: '56px',
          background: abaAtiva === 'form' ? '#EA580C' : 'linear-gradient(135deg, #EA580C, #C2410C)',
          color: '#fff', borderRadius: '16px', border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 24px rgba(220,38,38,0.3)',
          cursor: 'pointer', zIndex: 110, transition: 'all 0.3s',
          transform: abaAtiva === 'form' ? 'rotate(45deg)' : 'rotate(0deg)',
          ...estiloSemPermissao(podeCriar)
        }}
        className="print:hidden fab-nova-req"
      >
        <Plus size={24} />
      </button>

      {/* Form Modal */}
      {podeCriar && abaAtiva === 'form' && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[100] flex items-center justify-center p-4 print:hidden">
          <div className="w-full max-w-5xl bg-white rounded-2xl border border-zinc-200 overflow-y-auto max-h-[90vh] shadow-xl">
            <FormReq onSave={async (nova: Record<string, unknown>) => {
              nova.criado_por = userName;
              // Grupos escolhidos na criação (não é coluna — remove antes do insert)
              const gruposEscolhidos: number[] = Array.isArray(nova._grupos) ? (nova._grupos as number[]) : [];
              delete nova._grupos;
              const { data: ins, error } = await supabase.from('Requisicao').insert([nova]).select('id').single();
              if (error) {
                console.error('[Requisições] Erro ao criar:', error);
                alert('Erro ao criar requisição: ' + error.message);
                return;
              }
              // Vincula a nova requisição aos grupos escolhidos (best-effort)
              if (ins?.id && gruposEscolhidos.length > 0) {
                await Promise.all(gruposEscolhidos.map((gid) =>
                  fetch('/api/pos/requisicoes/grupos/membros', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ grupo_id: gid, req_id: ins.id, acao: 'add', usuario: userName }),
                  }).catch(() => {})
                ));
              }
              auditLog({ sistema: 'requisicoes', acao: 'criar', entidade: 'requisicao', entidade_label: String(nova.titulo || '') });
              notificarUsuariosReq('requisicao', `${userName} criou uma requisição`, String(nova.titulo || 'Nova requisição'), '/requisicoes');
              // Veicular Manutenção → a pendência da Frota nasce NA HORA (o motor
              // cria pro carro com o km do hodômetro e fecha sozinho quando a
              // requisição chegar ao financeiro)
              if (nova.tipo === 'Veicular Manutenção') {
                fetch('/api/frota/pendencias/sync', { method: 'POST', headers: await authHeaders() }).catch(() => {});
              }
              setAbaAtiva('kanban');
              carregarDados(true);
            }} />
          </div>
        </div>
      )}
    </div>
    </div>
  );
}

export default function RequisicoesPage() {
  const { userProfile } = useAuth();
  const { temAcesso, loading: loadingPerm } = usePermissoes(userProfile?.id);
  if (!loadingPerm && userProfile && !temAcesso('requisicoes')) return <SemPermissao />;
  return (
    <Suspense fallback={<div style={{ padding: '60px', textAlign: 'center', color: '#6b7280' }}>Carregando...</div>}>
      <RequisicoesPageInner />
    </Suspense>
  );
}
