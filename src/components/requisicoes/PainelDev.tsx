'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { aprovarPedido, recusarPedido, type Autorizacao } from '@/lib/requisicoes/autorizacao';
import { Code2, X, ShieldCheck, ShieldX, Clock, Bell } from 'lucide-react';

interface Props { devId: string; devNome: string; inline?: boolean }

const dataHora = (iso: string) => { try { return new Date(iso).toLocaleString('pt-BR'); } catch { return iso; } };

export default function PainelDev({ devId, devNome, inline = false }: Props) {
  const [aberto, setAberto] = useState(false);
  const [pendentes, setPendentes] = useState<Autorizacao[]>([]);

  const carregarPendentes = useCallback(async () => {
    const { data } = await supabase
      .from('requisicao_autorizacoes')
      .select('*')
      .eq('status', 'pendente')
      .order('criado_em', { ascending: false });
    setPendentes(data || []);
  }, []);

  useEffect(() => {
    carregarPendentes();
    const ch = supabase.channel('dev-autoriz-' + Date.now())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requisicao_autorizacoes' }, () => carregarPendentes())
      .subscribe();
    const intervalo = setInterval(carregarPendentes, 30000);
    return () => { supabase.removeChannel(ch); clearInterval(intervalo); };
  }, [carregarPendentes]);

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

  return (
    <>
      {/* Gatilho: inline (pílula na barra de filtros, ao lado do Comparar) ou flutuante (legado) */}
      {inline ? (
        <button
          onClick={() => setAberto(true)}
          title="Painel do Dev — pedidos de permissão"
          className="shrink-0 px-4 py-2.5 rounded-full text-[14px] font-semibold border bg-zinc-900 border-zinc-900 text-white hover:bg-zinc-700 transition-all flex items-center gap-1.5 whitespace-nowrap print:hidden"
        >
          <Code2 size={14} /> Dev
          {pendentes.length > 0 && (
            <span className="ml-0.5 text-[11px] font-bold px-1.5 rounded-full bg-orange-500 text-white">{pendentes.length}</span>
          )}
        </button>
      ) : (
      <button
        onClick={() => setAberto(true)}
        className="fixed bottom-8 left-8 z-[90] w-14 h-14 rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-700 text-white shadow-lg flex items-center justify-center hover:scale-105 transition-all print:hidden"
        title="Painel do Dev — pedidos de permissão"
      >
        <Code2 size={22} />
        {pendentes.length > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1 rounded-full bg-orange-600 text-white text-[11px] font-bold flex items-center justify-center border-2 border-white">
            {pendentes.length}
          </span>
        )}
      </button>
      )}

      {aberto && (
        <div className="fixed inset-0 z-[95] flex justify-end print:hidden" onClick={() => setAberto(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative w-[440px] max-w-[92vw] h-full bg-white shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-5 border-b border-zinc-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-zinc-900 to-zinc-700 text-white flex items-center justify-center"><Code2 size={20} /></div>
                <div>
                  <h3 className="text-base font-bold text-black">Painel do Dev</h3>
                  <p className="text-xs text-black">Pedidos de permissão</p>
                </div>
              </div>
              <button onClick={() => setAberto(false)} className="w-9 h-9 rounded-lg border border-zinc-200 flex items-center justify-center text-black hover:bg-zinc-50"><X size={18} /></button>
            </div>

            <div className="px-4 py-2 border-b border-zinc-100 flex items-center gap-2 text-sm font-semibold text-black">
              <Bell size={15} /> Pendentes {pendentes.length > 0 && <span className="text-[11px] bg-orange-600 text-white px-1.5 rounded-full">{pendentes.length}</span>}
            </div>

            <div className="flex-1 overflow-auto p-4">
              {pendentes.length === 0 ? (
                <div className="py-20 text-center text-zinc-300 text-sm">Sem pedidos pendentes 🎉</div>
              ) : (
                <div className="flex flex-col gap-3">
                  {pendentes.map(p => (
                    <div key={p.id} className="border border-amber-200 bg-amber-50/50 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-bold text-black">Req #{p.requisicao_id}</span>
                        <span className="text-[11px] text-black flex items-center gap-1"><Clock size={11} /> {dataHora(p.criado_em)}</span>
                      </div>
                      <p className="text-xs text-black mb-1"><b className="text-black">{p.solicitante_nome || '—'}</b> quer alterar:</p>
                      <p className="text-sm text-black bg-white border border-zinc-100 rounded-lg p-2 mb-3">{p.motivo}</p>
                      <div className="flex gap-2">
                        <button onClick={() => aprovar(p)} className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5"><ShieldCheck size={14} /> Aprovar</button>
                        <button onClick={() => recusar(p)} className="flex-1 py-2 rounded-lg bg-white border border-orange-200 text-orange-600 hover:bg-orange-50 text-xs font-bold flex items-center justify-center gap-1.5"><ShieldX size={14} /> Recusar</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
