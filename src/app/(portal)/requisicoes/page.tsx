'use client';
export const dynamic = 'force-dynamic';
import { useState, useEffect, useCallback, useMemo } from 'react';
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
  LayoutDashboard, Users2, Box, Activity, Trash2, Plus, X, UserPlus, Car, Bell, Info, CheckCheck, UserCircle, Edit3, Phone
} from 'lucide-react';

function RequisicoesPageInner() {
  const { log: auditLog } = useAuditLog();
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

  const lixeiraCount = useMemo(() => requisicoes.filter(r => r.status === 'lixeira').length, [requisicoes]);

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

  useEffect(() => {
    carregarDados();

    const channel = supabase.channel('main-realtime-stream')
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

        carregarDados(true);
        setTimeout(() => carregarDados(true), 2500);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== info.id)), 10000);

        const buscarEImprimir = async () => {
          let reqData = null;
          const delays = [3000, 2000, 3000, 4000]; // intervalos entre tentativas
          for (const delay of delays) {
            await new Promise(r => setTimeout(r, delay));
            const safeId = String(nova.IdReq).replace(/%/g, '');
            const { data } = await supabase
              .from('Requisicao')
              .select('*')
              .ilike('obs', `%[APPSHEET_ID:${safeId}]%`)
              .maybeSingle();
            if (data?.id) { reqData = data; break; }
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

        if (novo.ReqFotoNota && novo.ReqREF) {
          await supabase.from('Requisicao')
            .update({ recibo_fornecedor: novo.ReqFotoNota })
            .eq('id', novo.ReqREF);
        }

        carregarDados(true);
        setTimeout(() => carregarDados(true), 2500);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== info.id)), 10000);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'Requisicao' }, () => {
        carregarDados(true);
      })
      .subscribe();

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
    { id: 'lixeira', label: `Lixeira${lixeiraCount > 0 ? ` (${lixeiraCount})` : ''}`, icon: <Trash2 size={16} /> },
  ];

  return (
    <div style={{ padding: '24px 32px' }}>
      {reqParaImprimir && <TemplatePDF req={reqParaImprimir} onUpdate={() => {}} onPrint={() => {}} />}

      {/* Toasts */}
      <div className="fixed top-20 right-6 z-[200] flex flex-col gap-3 max-w-sm w-full pointer-events-none">
        {toasts.map((t: any) => (
          <div
            key={t.id}
            onClick={() => abrirNotificacao(t.idOriginal)}
            className="pointer-events-auto cursor-pointer bg-white border border-zinc-200 shadow-lg p-4 rounded-2xl flex gap-3 items-center hover:shadow-xl transition-shadow"
            style={{ borderLeft: '4px solid #dc2626' }}
          >
            <div className="w-9 h-9 bg-red-600 rounded-xl flex items-center justify-center text-white shrink-0"><Bell size={18} /></div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest">{t.tipoNotif}</p>
              <p className="text-sm font-semibold text-zinc-800 truncate">{t.titulo}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Notificações Modal */}
      {showNotifModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[300] flex items-center justify-end p-4" onClick={() => setShowNotifModal(false)}>
          <div className="bg-white w-full max-w-md h-[85vh] rounded-2xl shadow-xl border border-zinc-200 flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-zinc-100 flex justify-between items-center">
              <h2 className="text-lg font-bold text-zinc-900">Histórico</h2>
              <button onClick={() => { setShowNotifModal(false); setContadorNotif(0); }} className="w-8 h-8 bg-zinc-100 rounded-full flex items-center justify-center hover:bg-red-500 hover:text-white transition-all text-zinc-500"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {notificacoes.length === 0 ? <p className="text-center text-zinc-400 text-xs mt-20 uppercase font-semibold tracking-widest">Sem novas notificações</p> : notificacoes.map((n: any) => (
                <div
                  key={n.id}
                  onClick={() => abrirNotificacao(n.idOriginal)}
                  className="bg-zinc-50 p-4 rounded-xl border border-zinc-100 cursor-pointer hover:bg-red-50 hover:border-red-200 transition-colors"
                >
                  <div className="flex justify-between text-xs font-semibold text-red-600 mb-1"><span>{n.hora}</span> <CheckCheck size={12}/></div>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">{n.tipoNotif}</p>
                  <p className="text-sm font-semibold text-zinc-800">{n.titulo}</p>
                  <p className="text-xs text-zinc-500">{n.solicitante}</p>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-zinc-100"><button onClick={() => setNotificacoes([])} className="w-full py-3 bg-zinc-50 rounded-xl text-xs font-semibold uppercase hover:bg-zinc-100 transition-all text-zinc-600 border border-zinc-200">Limpar Tudo</button></div>
          </div>
        </div>
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
              onUpdate={async (id: number, dados: Record<string, unknown>) => {
                setRequisicoes(prev => prev.map(r => r.id === id ? { ...r, ...dados } : r));
                await supabase.from('Requisicao').update(dados).eq('id', id);
                auditLog({ sistema: 'requisicoes', acao: 'editar', entidade: 'requisicao', entidade_id: String(id), detalhes: dados });
              }}
              onPrint={dispararImpressao}
              idDestaque={idDestaque}
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
              await supabase.from('Requisicao').insert([nova]);
              auditLog({ sistema: 'requisicoes', acao: 'criar', entidade: 'requisicao', entidade_label: String(nova.titulo || '') });
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
