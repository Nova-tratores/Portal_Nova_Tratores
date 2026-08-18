'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Clock, PlusCircle, Pencil, ArrowRightLeft, ShieldCheck, ShieldX, ShieldAlert, Trash2 } from 'lucide-react';

interface Props { reqId: number; titulo?: string; open: boolean; onClose: () => void }

interface Evento {
  tipo: 'criar' | 'editar' | 'mover_status' | 'deletar' | 'pedido' | 'aprovado' | 'recusado' | 'consumido';
  quando: string;
  quem: string;
  descricao: string;
  detalhe?: string;
}

const FMT_CAMPOS: Record<string, string> = {
  valor_despeza: 'Valor', valor_cobrado_cliente: 'Valor cobrado ao cliente', fornecedor: 'Fornecedor',
  numero_nota: 'Nº da Nota', titulo: 'Título', tipo: 'Tipo', setor: 'Setor', solicitante: 'Solicitante',
  data: 'Data', obs: 'Observação', status: 'Status', hodometro: 'Hodómetro', ordem_servico: 'Ordem de Serviço',
  Chassis_Modelo: 'Chassis / Modelo', cliente: 'Cliente', veiculo: 'Veículo', quem_ferramenta: 'Destinação',
  enviado_financeiro_data: 'Envio ao Financeiro',
};

const dataHora = (iso: string) => {
  try { return new Date(iso).toLocaleString('pt-BR'); } catch { return iso; }
};

export default function HistoricoModal({ reqId, titulo, open, onClose }: Props) {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    const [aud, aut] = await Promise.all([
      supabase.from('audit_log').select('*').eq('entidade', 'requisicao').eq('entidade_id', String(reqId)).order('created_at', { ascending: false }),
      supabase.from('requisicao_autorizacoes').select('*').eq('requisicao_id', reqId).order('criado_em', { ascending: false }),
    ]);

    const evs: Evento[] = [];

    for (const a of (aud.data || [])) {
      const campos = a.detalhes && typeof a.detalhes === 'object'
        ? Object.keys(a.detalhes).map(k => FMT_CAMPOS[k] || k)
        : [];
      if (a.acao === 'criar') {
        evs.push({ tipo: 'criar', quando: a.created_at, quem: a.user_nome || '—', descricao: 'Requisição criada' });
      } else if (a.acao === 'mover_status') {
        const de = a.detalhes?.de, para = a.detalhes?.para;
        evs.push({ tipo: 'mover_status', quando: a.created_at, quem: a.user_nome || '—', descricao: 'Mudou de fase', detalhe: de && para ? `${de} → ${para}` : undefined });
      } else if (a.acao === 'deletar') {
        evs.push({ tipo: 'deletar', quando: a.created_at, quem: a.user_nome || '—', descricao: 'Movida para a lixeira' });
      } else {
        evs.push({ tipo: 'editar', quando: a.created_at, quem: a.user_nome || '—', descricao: 'Alterou', detalhe: campos.join(', ') || undefined });
      }
    }

    for (const p of (aut.data || [])) {
      evs.push({ tipo: 'pedido', quando: p.criado_em, quem: p.solicitante_nome || '—', descricao: 'Pediu permissão para alterar', detalhe: p.motivo });
      if (p.status === 'aprovado' && p.resolvido_em) {
        evs.push({ tipo: 'aprovado', quando: p.resolvido_em, quem: p.dev_nome || 'Dev', descricao: `Permissão APROVADA (pedido de ${p.solicitante_nome || '—'})` });
      } else if (p.status === 'recusado' && p.resolvido_em) {
        evs.push({ tipo: 'recusado', quando: p.resolvido_em, quem: p.dev_nome || 'Dev', descricao: `Permissão RECUSADA (pedido de ${p.solicitante_nome || '—'})` });
      } else if (p.status === 'consumido') {
        if (p.resolvido_em) evs.push({ tipo: 'aprovado', quando: p.resolvido_em, quem: p.dev_nome || 'Dev', descricao: `Permissão APROVADA (pedido de ${p.solicitante_nome || '—'})` });
        if (p.consumido_em) evs.push({ tipo: 'consumido', quando: p.consumido_em, quem: p.solicitante_nome || '—', descricao: 'Alteração efetuada com a permissão' });
      }
    }

    evs.sort((a, b) => new Date(b.quando).getTime() - new Date(a.quando).getTime());
    setEventos(evs);
    setLoading(false);
  }, [reqId]);

  useEffect(() => { if (open) carregar(); }, [open, carregar]);

  if (!open) return null;

  const iconFor = (t: Evento['tipo']) => {
    switch (t) {
      case 'criar': return <PlusCircle size={15} className="text-emerald-600" />;
      case 'editar': return <Pencil size={15} className="text-blue-600" />;
      case 'mover_status': return <ArrowRightLeft size={15} className="text-indigo-600" />;
      case 'deletar': return <Trash2 size={15} className="text-black" />;
      case 'pedido': return <ShieldAlert size={15} className="text-amber-600" />;
      case 'aprovado': return <ShieldCheck size={15} className="text-emerald-600" />;
      case 'recusado': return <ShieldX size={15} className="text-orange-600" />;
      case 'consumido': return <Pencil size={15} className="text-amber-700" />;
    }
  };

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 70000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 18, width: 560, maxWidth: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg,#0f172a,#334155)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <Clock size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#1E293B' }}>Histórico da Requisição #{reqId}</h3>
              {titulo && <p style={{ fontSize: 12, color: '#94A3B8', margin: 0, maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titulo}</p>}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B' }}>
            <X size={17} />
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '14px 22px 20px' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>A carregar histórico...</div>
          ) : eventos.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#CBD5E1', fontSize: 13 }}>Sem registos no histórico.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {eventos.map((e, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 4px', borderBottom: i < eventos.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                  <div style={{ marginTop: 2 }}>{iconFor(e.tipo)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#1E293B', margin: 0 }}>
                      {e.descricao}
                      {e.detalhe && <span style={{ fontWeight: 500, color: '#64748B' }}> — {e.detalhe}</span>}
                    </p>
                    <p style={{ fontSize: 11.5, color: '#94A3B8', margin: '2px 0 0' }}>
                      <span style={{ fontWeight: 600, color: '#64748B' }}>{e.quem}</span> · {dataHora(e.quando)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
