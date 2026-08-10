'use client';
// Frota > Checklists — pendências do checklist mensal por técnico/veículo.
// Cruza os técnicos com veículo atribuído (NT Mecânico) com os checklists do mês:
// quem não fez = pendente; score baixo = suspeito. Fonte: /api/frota/checklists-mes.
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, Loader2, AlertTriangle, ChevronRight } from 'lucide-react';
import { authHeaders } from '@/lib/auth/client';

type Status = 'ok' | 'suspeito' | 'em_andamento' | 'pendente';
interface Item {
  origem: 'tecnico' | 'nao_vinculado'; placa_key: string;
  tecnico_nome: string; placa: string; descricao: string;
  status: Status; score: number | null; km: number | null; fim_em: string | null; checklist_id: string | null;
}
interface Resp {
  mes: string;
  resumo: { total: number; pendente: number; suspeito: number; em_andamento: number; ok: number };
  itens: Item[];
}

const ST: Record<Status, { label: string; cor: string; bg: string }> = {
  pendente: { label: 'Não fez', cor: '#c2410c', bg: '#ffedd5' },
  suspeito: { label: 'Suspeito', cor: '#b91c1c', bg: '#fee2e2' },
  em_andamento: { label: 'Em andamento', cor: '#b45309', bg: '#fef3c7' },
  ok: { label: 'Feito', cor: '#15803d', bg: '#dcfce7' },
};

const fmtDataHora = (s: string | null) =>
  s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

export default function FrotaChecklistsPage() {
  const router = useRouter();
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<Resp | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState<'todos' | Status>('todos');

  const carregar = useCallback(async (m: string) => {
    setCarregando(true); setErro('');
    try {
      const r = await fetch(`/api/frota/checklists-mes?mes=${m}`, { headers: await authHeaders() });
      const d = await r.json();
      if (!r.ok) { setErro(d.error || 'Falha ao carregar.'); setData(null); }
      else setData(d);
    } catch (e) { setErro(String(e)); }
    setCarregando(false);
  }, []);
  useEffect(() => { carregar(mes); }, [mes, carregar]);

  const itens = (data?.itens || []).filter((i) => filtro === 'todos' || i.status === filtro);

  const card = (chave: 'total' | Status, rot: string, cor: string) => {
    const n = chave === 'total' ? (data?.resumo.total || 0) : (data?.resumo[chave] || 0);
    const ativo = (chave === 'total' && filtro === 'todos') || filtro === chave;
    return (
      <button onClick={() => setFiltro(chave === 'total' ? 'todos' : chave)}
        style={{ textAlign: 'left', flex: 1, minWidth: 130, padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
          border: `1px solid ${ativo ? cor : 'var(--portal-border)'}`, background: ativo ? `${cor}14` : 'var(--portal-bg-card)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{rot}</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: cor, marginTop: 4 }}>{n}</div>
      </button>
    );
  };

  return (
    <div style={{ padding: 'clamp(12px, 4vw, 28px)', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ClipboardCheck size={20} color="var(--portal-text)" />
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--portal-text)', margin: 0 }}>Checklists mensais</h1>
        </div>
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value)}
          style={{ marginLeft: 'auto', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text)', fontSize: 14 }} />
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        {card('total', 'Total', '#334155')}
        {card('pendente', 'Não fizeram', ST.pendente.cor)}
        {card('suspeito', 'Suspeitos', ST.suspeito.cor)}
        {card('em_andamento', 'Em andamento', ST.em_andamento.cor)}
        {card('ok', 'Feitos', ST.ok.cor)}
      </div>

      {erro && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13, marginBottom: 16 }}>
          <AlertTriangle size={16} /> {erro}
        </div>
      )}

      {carregando ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--portal-text-muted)', fontSize: 14 }}>
          <Loader2 size={22} className="spin" style={{ marginBottom: 10 }} /><div>Carregando…</div>
        </div>
      ) : itens.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--portal-text-muted)', fontSize: 14 }}>
          {data && data.resumo.total === 0 ? 'Nenhum técnico com veículo atribuído (cadastro feito no NT Mecânico).' : 'Nada neste filtro.'}
        </div>
      ) : (
        <div style={{ border: '1px solid var(--portal-border)', borderRadius: 14, overflow: 'hidden', background: 'var(--portal-bg-card)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 110px 70px 70px 110px 20px', gap: 12, padding: '12px 18px', background: 'var(--portal-bg-secondary)', borderBottom: '1px solid var(--portal-border)', fontSize: 11, color: 'var(--portal-text-secondary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.4 }}>
            <span>Técnico / Veículo</span><span>Placa</span><span style={{ textAlign: 'center' }}>Situação</span><span style={{ textAlign: 'center' }}>Score</span><span style={{ textAlign: 'right' }}>KM</span><span style={{ textAlign: 'right' }}>Concluído</span><span></span>
          </div>
          {itens.map((it, i) => {
            const st = ST[it.status];
            return (
              <div key={i}
                onClick={it.origem === 'nao_vinculado' && it.placa_key ? () => router.push(`/frota/checklist/${encodeURIComponent(it.placa_key)}`) : undefined}
                style={{ display: 'grid', gridTemplateColumns: '1fr 120px 110px 70px 70px 110px 20px', gap: 12, padding: '12px 18px', borderBottom: '1px solid var(--portal-border)', alignItems: 'center', cursor: it.origem === 'nao_vinculado' && it.placa_key ? 'pointer' : 'default' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--portal-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {it.tecnico_nome}
                    {it.origem === 'nao_vinculado' && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 5, background: 'var(--portal-bg-secondary)', color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}>sem resp.</span>}
                  </div>
                  {it.descricao && <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.descricao}</div>}
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--portal-text)', fontFamily: 'monospace' }}>{it.placa}</span>
                <span style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: st.bg, color: st.cor }}>{st.label}</span>
                </span>
                <span style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: it.score != null && it.score < 50 ? '#b91c1c' : 'var(--portal-text-secondary)' }}>{it.score != null ? `${it.score}%` : '—'}</span>
                <span style={{ textAlign: 'right', fontSize: 13, color: 'var(--portal-text-secondary)' }}>{it.km != null ? it.km.toLocaleString('pt-BR') : '—'}</span>
                <span style={{ textAlign: 'right', fontSize: 12, color: 'var(--portal-text-muted)' }}>{fmtDataHora(it.fim_em)}</span>
                <span style={{ textAlign: 'center' }}>{it.origem === 'nao_vinculado' && it.placa_key ? <ChevronRight size={15} color="var(--portal-text-muted)" /> : null}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
