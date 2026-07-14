'use client';
// Frota > Manutenções — histórico unificado das 3 fontes:
// Rota Exata (espelho) ∪ registros manuais ∪ Requisições "Veicular Manutenção".
// Lê a vw_frota_manutencoes direto (RLS: leitura autenticada).
import { useEffect, useMemo, useState } from 'react';
import { Wrench, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatarPlaca } from '@/lib/frota/placa';
import type { ManutencaoView } from '@/lib/frota/tipos';

const fmtRS = (v: number | null) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const fmtData = (s: string | null) => (s ? new Date(`${String(s).slice(0, 10)}T00:00:00`).toLocaleDateString('pt-BR') : '—');

const ORIGEM: Record<string, { label: string; cor: string; bg: string }> = {
  rotaexata: { label: 'Rota Exata', cor: '#0f766e', bg: '#ccfbf1' },
  manual: { label: 'Portal', cor: '#1d4ed8', bg: '#dbeafe' },
  requisicao: { label: 'Requisição', cor: '#b45309', bg: '#fef3c7' },
};

export default function FrotaManutencoesPage() {
  const [linhas, setLinhas] = useState<ManutencaoView[]>([]);
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState('');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('vw_frota_manutencoes')
        .select('*')
        .order('data', { ascending: false, nullsFirst: false })
        .limit(500);
      if (error) { setErro(error.message); return; }
      setLinhas((data || []) as ManutencaoView[]);
    })();
  }, []);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas.filter(
      (m) =>
        !q ||
        m.placa.toLowerCase().includes(q) ||
        (m.descricao || '').toLowerCase().includes(q) ||
        (m.fornecedor || '').toLowerCase().includes(q),
    );
  }, [linhas, busca]);

  const total = visiveis.reduce((s, m) => s + (Number(m.valor_total) || 0), 0);

  return (
    <div style={{ padding: '28px 40px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--portal-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Wrench size={20} color="#0d9488" /> Manutenções
        </h2>
        <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted)' }}>
          {visiveis.length} registros · total {fmtRS(total)}
        </span>
        <div style={{ flex: 1 }} />
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--portal-text-muted)' }} />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Placa, descrição, fornecedor…"
            style={{ padding: '8px 12px 8px 30px', borderRadius: 8, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: 13, width: 260 }}
          />
        </div>
      </div>

      {erro && <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>{erro}</div>}

      <div style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '100px 110px 1fr 160px 110px 110px', gap: 0, padding: '10px 16px', background: 'var(--portal-bg-secondary)', fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
          <span>Data</span><span>Placa</span><span>Descrição</span><span>Fornecedor</span><span>Origem</span><span style={{ textAlign: 'right' }}>Valor</span>
        </div>
        {visiveis.map((m) => {
          const o = ORIGEM[m.origem] || ORIGEM.manual;
          return (
            <div key={`${m.origem}-${m.id}`} style={{ display: 'grid', gridTemplateColumns: '100px 110px 1fr 160px 110px 110px', padding: '9px 16px', borderTop: '1px solid var(--portal-border)', fontSize: 12.5, color: 'var(--portal-text-secondary)', alignItems: 'center' }}>
            <span>{fmtData(m.data)}</span>
            <strong style={{ color: 'var(--portal-text)' }}>{formatarPlaca(m.placa)}</strong>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.descricao || ''}>{m.descricao || m.tipo || '—'}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.fornecedor || '—'}</span>
            <span><span style={{ fontSize: 10.5, fontWeight: 700, color: o.cor, background: o.bg, borderRadius: 999, padding: '2px 8px' }}>{o.label}</span></span>
            <strong style={{ color: 'var(--portal-text)', textAlign: 'right' }}>{fmtRS(m.valor_total)}</strong>
            </div>
          );
        })}
        {visiveis.length === 0 && !erro && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--portal-text-muted)', fontSize: 13 }}>Nenhuma manutenção encontrada.</div>
        )}
      </div>
    </div>
  );
}
