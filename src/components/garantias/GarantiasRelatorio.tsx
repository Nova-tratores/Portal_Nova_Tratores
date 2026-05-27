'use client';
import { useState, useEffect, useCallback } from 'react';
import { Loader2, TrendingUp, TrendingDown, Scale, ClipboardCheck, Printer, Clock, DollarSign, AlertTriangle, Wallet } from 'lucide-react';
import type { RelatorioGarantias } from '@/lib/garantias/types';
import { fmtMoeda } from '@/lib/garantias/format';

function Kpi({ icone, label, valor, cor }: { icone: React.ReactNode; label: string; valor: string; cor: string }) {
  return (
    <div
      style={{
        flex: '1 1 170px',
        background: 'var(--portal-bg-card)',
        border: '1px solid var(--portal-border)',
        borderRadius: 12,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>{label}</span>
        <div style={{ background: cor + '1c', borderRadius: 8, padding: 6, display: 'flex' }}>{icone}</div>
      </div>
      <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--portal-text)' }}>{valor}</span>
    </div>
  );
}

export default function GarantiasRelatorio({ refreshKey }: { refreshKey: number }) {
  const [rel, setRel] = useState<RelatorioGarantias | null>(null);
  const [loading, setLoading] = useState(true);
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (de) p.set('de', de);
      if (ate) p.set('ate', ate);
      const res = await fetch(`/api/garantias/relatorio${p.toString() ? `?${p}` : ''}`);
      const data = await res.json();
      setRel(data);
    } catch {
      setRel(null);
    } finally {
      setLoading(false);
    }
  }, [de, ate]);

  useEffect(() => {
    carregar();
  }, [carregar, refreshKey]);

  const maxValor = Math.max(
    1,
    ...(rel?.por_montadora || []).flatMap((m) => [m.lucro, m.prejuizo, m.recuperado_cliente, m.prejuizo_liquido])
  );

  const dateInput: React.CSSProperties = {
    padding: '7px 9px',
    borderRadius: 8,
    border: '1px solid var(--portal-border)',
    background: 'var(--portal-bg-input)',
    color: 'var(--portal-text)',
    fontSize: 13,
    outline: 'none',
  };

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>De</label>
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} style={dateInput} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>Até</label>
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} style={dateInput} />
        </div>
        <button
          onClick={() => window.print()}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8,
            border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)',
            color: 'var(--portal-text-secondary)', fontSize: 13, cursor: 'pointer', marginLeft: 'auto',
          }}
        >
          <Printer size={15} /> Imprimir
        </button>
      </div>

      {loading || !rel ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 50, color: 'var(--portal-text-muted)' }}>
          <Loader2 size={20} className="spin" />
        </div>
      ) : (
        <>
          {/* KPIs principais */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <Kpi icone={<TrendingUp size={16} color="#16a34a" />} label="Lucro (aprovadas)" valor={fmtMoeda(rel.totais.lucro)} cor="#16a34a" />
            <Kpi icone={<TrendingDown size={16} color="#dc2626" />} label="Prejuízo bruto (recusadas)" valor={fmtMoeda(rel.totais.prejuizo)} cor="#dc2626" />
            <Kpi icone={<DollarSign size={16} color="#f59e0b" />} label="Recuperado do cliente" valor={fmtMoeda(rel.totais.recuperado_cliente)} cor="#f59e0b" />
            <Kpi icone={<TrendingDown size={16} color="#b91c1c" />} label="Prejuízo líquido" valor={fmtMoeda(rel.totais.prejuizo_liquido)} cor="#b91c1c" />
            <Kpi icone={<Scale size={16} color="#0ea5e9" />} label="Saldo" valor={fmtMoeda(rel.totais.saldo)} cor="#0ea5e9" />
            <Kpi icone={<ClipboardCheck size={16} color="#6366f1" />} label="Finalizadas" valor={String(rel.totais.qtd_finalizadas)} cor="#6366f1" />
          </div>

          {/* KPIs de cobrança ao cliente */}
          {(rel.totais.a_receber > 0 || rel.totais.vencido > 0) && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
              <Kpi icone={<Wallet size={16} color="#0369a1" />} label="A receber do cliente" valor={fmtMoeda(rel.totais.a_receber)} cor="#0369a1" />
              <Kpi icone={<AlertTriangle size={16} color="#b91c1c" />} label="Vencido (cobrar)" valor={fmtMoeda(rel.totais.vencido)} cor="#b91c1c" />
            </div>
          )}

          {/* Por montadora */}
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--portal-text)', margin: '0 0 10px' }}>
            Desempenho por montadora
          </h3>
          {rel.por_montadora.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--portal-text-muted)', padding: 20, textAlign: 'center' }}>
              Sem dados no período.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {rel.por_montadora.map((m) => (
                <div
                  key={m.montadora_id || 'sem'}
                  style={{
                    border: '1px solid var(--portal-border)',
                    borderRadius: 12,
                    padding: 14,
                    background: 'var(--portal-bg-card)',
                    borderLeft: `4px solid ${m.cor || '#64748b'}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--portal-text)' }}>{m.nome}</span>
                    <span style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>
                      {m.qtd_total} garantia(s) · {m.qtd_aprovadas} aprovada(s) · {m.qtd_rejeitadas} recusada(s) · {m.qtd_abertas} aberta(s)
                    </span>
                  </div>

                  {/* Barras lucro / prejuízo / recuperado */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                    <Barra label="Lucro" valor={m.lucro} max={maxValor} cor="#16a34a" />
                    <Barra label="Prejuízo bruto" valor={m.prejuizo} max={maxValor} cor="#dc2626" />
                    {m.recuperado_cliente > 0 && (
                      <Barra label="Recuperado" valor={m.recuperado_cliente} max={maxValor} cor="#f59e0b" />
                    )}
                    {m.prejuizo_liquido > 0 && m.prejuizo_liquido !== m.prejuizo && (
                      <Barra label="Prej. líquido" valor={m.prejuizo_liquido} max={maxValor} cor="#b91c1c" />
                    )}
                  </div>

                  {/* Tempos + comparativo */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', marginTop: 10, fontSize: 12, color: 'var(--portal-text-secondary)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={13} /> Resolução média:{' '}
                      <strong>{m.tempo_medio_resolucao_dias != null ? `${m.tempo_medio_resolucao_dias} dia(s)` : '—'}</strong>
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={13} /> Em aberto na fábrica:{' '}
                      <strong>{m.tempo_medio_aberto_dias != null ? `${m.tempo_medio_aberto_dias} dia(s)` : '—'}</strong>
                    </span>
                    <span>
                      Saldo: <strong style={{ color: m.saldo >= 0 ? '#16a34a' : '#dc2626' }}>{fmtMoeda(m.saldo)}</strong>
                    </span>
                  </div>
                  {(m.qtd_cobrancas_pagas > 0 || m.qtd_cobrancas_pendentes > 0 || m.qtd_cobrancas_vencidas > 0) && (
                    <div style={{ fontSize: 11, color: 'var(--portal-text-muted)', marginTop: 4 }}>
                      Cobranças: {m.qtd_cobrancas_pagas} paga(s)
                      {m.qtd_cobrancas_pendentes > 0 ? ` · ${m.qtd_cobrancas_pendentes} pendente(s)` : ''}
                      {m.qtd_cobrancas_vencidas > 0 ? ` · ${m.qtd_cobrancas_vencidas} vencida(s)` : ''}
                      {m.a_receber > 0 ? ` · a receber ${fmtMoeda(m.a_receber)}` : ''}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--portal-text-muted)', marginTop: 4 }}>
                    Técnico: {m.total_tecnico_horas}h / {m.total_tecnico_km}km · Garantista: {m.total_garantista_horas}h / {m.total_garantista_km}km
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Barra({ label, valor, max, cor }: { label: string; valor: number; max: number; cor: string }) {
  const pct = Math.round((valor / max) * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--portal-text-muted)', width: 60 }}>{label}</span>
      <div style={{ flex: 1, height: 14, background: 'var(--portal-bg-secondary)', borderRadius: 7, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: cor, borderRadius: 7 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--portal-text)', width: 90, textAlign: 'right' }}>
        {fmtMoeda(valor)}
      </span>
    </div>
  );
}
