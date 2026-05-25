'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Loader2, Printer, CheckCircle2, XCircle } from 'lucide-react';
import type { GarantiaResumo } from '@/lib/garantias/types';
import { fmtData, fmtMoeda } from '@/lib/garantias/format';

interface Props {
  onAbrir: (id: string) => void;
  refreshKey: number;
}

export default function GarantiasHistorico({ onAbrir, refreshKey }: Props) {
  const [lista, setLista] = useState<GarantiaResumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/garantias?finalizadas=true');
      const data = await res.json();
      setLista(data.garantias || []);
    } catch {
      setLista([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar, refreshKey]);

  const filtrada = useMemo(() => {
    const t = filtro.trim().toLowerCase();
    if (!t) return lista;
    return lista.filter((g) =>
      [g.numero, g.id_ordem, g.cliente, g.chassis, g.montadora?.nome]
        .some((v) => (v || '').toLowerCase().includes(t))
    );
  }, [lista, filtro]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 50, color: 'var(--portal-text-muted)' }}>
        <Loader2 size={20} className="spin" />
      </div>
    );
  }

  const th: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    color: 'var(--portal-text-muted)',
    padding: '8px 10px',
    textAlign: 'left',
    whiteSpace: 'nowrap',
  };
  const td: React.CSSProperties = {
    fontSize: 12,
    color: 'var(--portal-text)',
    padding: '8px 10px',
    borderTop: '1px solid var(--portal-border)',
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 240px' }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--portal-text-muted)' }} />
          <input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Filtrar por nº, OS, cliente, chassi, montadora..."
            style={{
              width: '100%',
              padding: '8px 10px 8px 32px',
              borderRadius: 8,
              border: '1px solid var(--portal-border)',
              background: 'var(--portal-bg-input)',
              color: 'var(--portal-text)',
              fontSize: 13,
              outline: 'none',
            }}
          />
        </div>
        <button
          onClick={() => window.print()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            borderRadius: 8,
            border: '1px solid var(--portal-border)',
            background: 'var(--portal-bg-input)',
            color: 'var(--portal-text-secondary)',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          <Printer size={15} /> Imprimir
        </button>
      </div>

      {filtrada.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--portal-text-muted)', fontSize: 13 }}>
          Nenhuma garantia finalizada.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--portal-border)', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Garantia</th>
                <th style={th}>OS</th>
                <th style={th}>Cliente</th>
                <th style={th}>Chassi</th>
                <th style={th}>Montadora</th>
                <th style={th}>Resultado</th>
                <th style={{ ...th, textAlign: 'right' }}>Valor pago</th>
                <th style={th}>Finalizada</th>
              </tr>
            </thead>
            <tbody>
              {filtrada.map((g) => (
                <tr
                  key={g.id}
                  onClick={() => onAbrir(g.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td style={{ ...td, fontWeight: 700 }}>{g.numero}</td>
                  <td style={td}>{g.id_ordem}</td>
                  <td style={td}>{g.cliente || '—'}</td>
                  <td style={td}>{g.chassis || '—'}</td>
                  <td style={td}>{g.montadora?.nome || '—'}</td>
                  <td style={td}>
                    {g.status === 'aprovada' ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#16a34a', fontWeight: 600 }}>
                        <CheckCircle2 size={13} /> Aprovada
                      </span>
                    ) : (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#dc2626', fontWeight: 600 }}>
                        <XCircle size={13} /> Recusada
                      </span>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmtMoeda(g.valor_pago_total)}</td>
                  <td style={td}>{fmtData(g.finalizada_em)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
