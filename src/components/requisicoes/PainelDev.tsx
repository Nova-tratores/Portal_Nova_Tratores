'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { aprovarPedido, recusarPedido, type Autorizacao } from '@/lib/requisicoes/autorizacao';
import { Code2, X, ShieldCheck, ShieldX, Clock, UserPlus, UserMinus, Bell } from 'lucide-react';

interface Props { devId: string; devNome: string }

const dataHora = (iso: string) => { try { return new Date(iso).toLocaleString('pt-BR'); } catch { return iso; } };

export default function PainelDev({ devId, devNome }: Props) {
  const [aberto, setAberto] = useState(false);
  const [tab, setTab] = useState<'pedidos' | 'devs'>('pedidos');
  const [pendentes, setPendentes] = useState<Autorizacao[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const carregarPendentes = useCallback(async () => {
    const { data } = await supabase
      .from('requisicao_autorizacoes')
      .select('*')
      .eq('status', 'pendente')
      .order('criado_em', { ascending: false });
    setPendentes(data || []);
  }, []);

  const carregarUsuarios = useCallback(async () => {
    setLoading(true);
    const [{ data: perms }, { data: users }] = await Promise.all([
      supabase.from('portal_permissoes').select('user_id, is_dev, is_admin'),
      supabase.from('financeiro_usu').select('id, nome, email').eq('ativo', true).order('nome'),
    ]);
    const permMap = new Map((perms || []).map((p: any) => [p.user_id, p]));
    const lista = (users || []).map((u: any) => ({
      ...u,
      is_dev: permMap.get(u.id)?.is_dev === true,
      temPerm: permMap.has(u.id),
    }));
    setUsuarios(lista);
    setLoading(false);
  }, []);

  useEffect(() => {
    carregarPendentes();
    const ch = supabase.channel('dev-autoriz-' + Date.now())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requisicao_autorizacoes' }, () => carregarPendentes())
      .subscribe();
    const intervalo = setInterval(carregarPendentes, 30000);
    return () => { supabase.removeChannel(ch); clearInterval(intervalo); };
  }, [carregarPendentes]);

  useEffect(() => { if (aberto && tab === 'devs') carregarUsuarios(); }, [aberto, tab, carregarUsuarios]);

  const aprovar = async (p: Autorizacao) => {
    await aprovarPedido(p.id, devId, devNome);
    if (p.solicitante_id) {
      await supabase.from('portal_notificacoes').insert([{
        user_id: p.solicitante_id, tipo: 'requisicao',
        titulo: `${devNome} aprovou a sua alteração na Req #${p.requisicao_id}`,
        descricao: 'Pode fazer UMA alteração na requisição.', link: '/requisicoes',
      }]);
    }
    carregarPendentes();
  };

  const recusar = async (p: Autorizacao) => {
    await recusarPedido(p.id, devId, devNome);
    if (p.solicitante_id) {
      await supabase.from('portal_notificacoes').insert([{
        user_id: p.solicitante_id, tipo: 'requisicao',
        titulo: `${devNome} recusou a alteração na Req #${p.requisicao_id}`,
        descricao: p.motivo, link: '/requisicoes',
      }]);
    }
    carregarPendentes();
  };

  const toggleDev = async (u: any) => {
    const novo = !u.is_dev;
    if (!novo && u.id === devId) { alert('Não pode remover o seu próprio acesso de Dev.'); return; }
    if (u.temPerm) {
      await supabase.from('portal_permissoes').update({ is_dev: novo }).eq('user_id', u.id);
    } else {
      await supabase.from('portal_permissoes').insert([{ user_id: u.id, is_dev: novo, is_admin: false, modulos_permitidos: [] }]);
    }
    carregarUsuarios();
  };

  return (
    <>
      {/* Botão flutuante (lembrete na tela do Dev) */}
      <button
        onClick={() => setAberto(true)}
        className="fixed bottom-8 left-8 z-[90] w-14 h-14 rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-700 text-white shadow-lg flex items-center justify-center hover:scale-105 transition-all print:hidden"
        title="Painel do Dev"
      >
        <Code2 size={22} />
        {pendentes.length > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1 rounded-full bg-red-600 text-white text-[11px] font-bold flex items-center justify-center border-2 border-white">
            {pendentes.length}
          </span>
        )}
      </button>

      {aberto && (
        <div className="fixed inset-0 z-[95] flex justify-end print:hidden" onClick={() => setAberto(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative w-[440px] max-w-[92vw] h-full bg-white shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-5 border-b border-zinc-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-zinc-900 to-zinc-700 text-white flex items-center justify-center"><Code2 size={20} /></div>
                <div>
                  <h3 className="text-base font-bold text-zinc-900">Painel do Dev</h3>
                  <p className="text-xs text-zinc-400">Olá, {devNome}</p>
                </div>
              </div>
              <button onClick={() => setAberto(false)} className="w-9 h-9 rounded-lg border border-zinc-200 flex items-center justify-center text-zinc-500 hover:bg-zinc-50"><X size={18} /></button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-2 border-b border-zinc-100">
              <button onClick={() => setTab('pedidos')} className={`flex-1 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 ${tab === 'pedidos' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}>
                <Bell size={15} /> Pedidos {pendentes.length > 0 && <span className="text-[11px] bg-red-600 text-white px-1.5 rounded-full">{pendentes.length}</span>}
              </button>
              <button onClick={() => setTab('devs')} className={`flex-1 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 ${tab === 'devs' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}>
                <UserPlus size={15} /> Gerir Devs
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {tab === 'pedidos' ? (
                pendentes.length === 0 ? (
                  <div className="py-20 text-center text-zinc-300 text-sm">Sem pedidos pendentes 🎉</div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {pendentes.map(p => (
                      <div key={p.id} className="border border-amber-200 bg-amber-50/50 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-bold text-zinc-800">Req #{p.requisicao_id}</span>
                          <span className="text-[11px] text-zinc-400 flex items-center gap-1"><Clock size={11} /> {dataHora(p.criado_em)}</span>
                        </div>
                        <p className="text-xs text-zinc-500 mb-1"><b className="text-zinc-700">{p.solicitante_nome || '—'}</b> quer alterar:</p>
                        <p className="text-sm text-zinc-700 bg-white border border-zinc-100 rounded-lg p-2 mb-3">{p.motivo}</p>
                        <div className="flex gap-2">
                          <button onClick={() => aprovar(p)} className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5"><ShieldCheck size={14} /> Aprovar</button>
                          <button onClick={() => recusar(p)} className="flex-1 py-2 rounded-lg bg-white border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold flex items-center justify-center gap-1.5"><ShieldX size={14} /> Recusar</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                loading ? (
                  <div className="py-20 text-center text-zinc-300 text-sm">A carregar...</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-zinc-400 mb-1">Só um Dev pode dar/retirar o acesso de Dev.</p>
                    {usuarios.map(u => (
                      <div key={u.id} className="flex items-center gap-3 p-3 border border-zinc-100 rounded-xl">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-zinc-800 truncate">{u.nome}</p>
                          <p className="text-[11px] text-zinc-400 truncate">{u.email}</p>
                        </div>
                        {u.is_dev && <span className="text-[10px] font-bold bg-zinc-900 text-white px-2 py-0.5 rounded-full">DEV</span>}
                        <button
                          onClick={() => toggleDev(u)}
                          className={`text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${u.is_dev ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                        >
                          {u.is_dev ? <><UserMinus size={13} /> Remover</> : <><UserPlus size={13} /> Tornar Dev</>}
                        </button>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
