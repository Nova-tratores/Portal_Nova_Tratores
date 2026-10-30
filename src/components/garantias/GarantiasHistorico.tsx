'use client';
import { fetchAuth } from '@/lib/auth/client';
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
  // período da finalização (YYYY-MM-DD, dia de Brasília); vazio = sem limite
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAuth('/api/garantias?finalizadas=true');
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
    return lista.filter((g) => {
      if (t && ![g.numero, g.id_ordem, g.cliente, g.chassis, g.montadora?.nome]
        .some((v) => (v || '').toLowerCase().includes(t))) return false;
      if (de || ate) {
        const dia = diaBR(g.finalizada_em);
        if (!dia) return false;
        if (de && dia < de) return false;
        if (ate && dia > ate) return false;
      }
      return true;
    });
  }, [lista, filtro, de, ate]);

  const totalPago = useMemo(() => filtrada.reduce((s, g) => s + (Number(g.valor_pago_total) || 0), 0), [filtrada]);
  const aprovadas = filtrada.filter((g) => g.status === 'aprovada').length;

  const atalho = (tipo: 'hoje' | 'ontem' | 'semana' | 'mes' | 'mes_ant') => {
    const hoje = diaBR(new Date().toISOString())!;
    const [y, m, d] = hoje.split('-').map(Number);
    const iso = (dt: Date) => dt.toISOString().slice(0, 10);
    const utc = (yy: number, mm: number, dd: number) => new Date(Date.UTC(yy, mm - 1, dd));
    if (tipo === 'hoje') { setDe(hoje); setAte(hoje); }
    else if (tipo === 'ontem') { const o = iso(utc(y, m, d - 1)); setDe(o); setAte(o); }
    else if (tipo === 'semana') { const dow = (utc(y, m, d).getUTCDay() + 6) % 7; setDe(iso(utc(y, m, d - dow))); setAte(hoje); }
    else if (tipo === 'mes') { setDe(iso(utc(y, m, 1))); setAte(hoje); }
    else { setDe(iso(utc(y, m - 1, 1))); setAte(iso(utc(y, m, 0))); }
  };

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

  const inpData: React.CSSProperties = {
    padding: '7px 8px',
    borderRadius: 8,
    border: '1px solid var(--portal-border)',
    background: 'var(--portal-bg-input)',
    color: 'var(--portal-text)',
    fontSize: 12,
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12, color: 'var(--portal-text-secondary)' }}>
          <span style={{ fontWeight: 600 }}>Finalizada de</span>
          <input type="date" value={de} max={ate || undefined} onChange={(e) => setDe(e.target.value)} style={inpData} />
          <span>até</span>
          <input type="date" value={ate} min={de || undefined} onChange={(e) => setAte(e.target.value)} style={inpData} />
          <select value="" onChange={(e) => { if (e.target.value) atalho(e.target.value as 'hoje'); }} style={inpData} title="Períodos prontos">
            <option value="">Período…</option>
            <option value="hoje">Hoje</option>
            <option value="ontem">Ontem</option>
            <option value="semana">Esta semana</option>
            <option value="mes">Este mês</option>
            <option value="mes_ant">Mês anterior</option>
          </select>
          {(de || ate) && (
            <button onClick={() => { setDe(''); setAte(''); }} style={{ ...inpData, cursor: 'pointer' }}>Limpar</button>
          )}
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

      {(de || ate || filtro.trim()) && filtrada.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--portal-text-secondary)', marginBottom: 8 }}>
          {filtrada.length} garantia(s) · {aprovadas} aprovada(s) · {filtrada.length - aprovadas} recusada(s) · total pago <b>{fmtMoeda(totalPago)}</b>
        </div>
      )}

      {filtrada.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--portal-text-muted)', fontSize: 13 }}>
          {de || ate ? 'Nenhuma garantia finalizada nesse período.' : 'Nenhuma garantia finalizada.'}
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

// dia (YYYY-MM-DD) no fuso de Brasília — a finalização das 22h não pode cair no dia seguinte
function diaBR(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}
