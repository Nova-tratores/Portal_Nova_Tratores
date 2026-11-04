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
  const [resultado, setResultado] = useState<'' | 'aprovada' | 'recusada'>('');

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
      if (resultado === 'aprovada' && g.status !== 'aprovada') return false;
      if (resultado === 'recusada' && g.status === 'aprovada') return false;
      if (de || ate) {
        const dia = diaBR(g.finalizada_em);
        if (!dia) return false;
        if (de && dia < de) return false;
        if (ate && dia > ate) return false;
      }
      return true;
    });
  }, [lista, filtro, de, ate, resultado]);

  const totalPago = useMemo(() => filtrada.reduce((s, g) => s + (Number(g.valor_pago_total) || 0), 0), [filtrada]);
  const aprovadas = filtrada.filter((g) => g.status === 'aprovada').length;

  // folha própria para imprimir: só a lista filtrada + totais no fim (o window.print() levava a tela inteira)
  const imprimir = () => {
    const w = window.open('', '_blank');
    if (!w) { alert('O navegador bloqueou a janela de impressão. Libere pop-ups para o portal.'); return; }
    const soma = (k: 'valor_pago_horas' | 'valor_pago_km' | 'valor_pago_pecas') =>
      filtrada.reduce((s, g) => s + (Number(g[k]) || 0), 0);
    const filtros = [
      resultado === 'aprovada' ? 'Só aprovadas' : resultado === 'recusada' ? 'Só recusadas' : 'Aprovadas e recusadas',
      de || ate ? `Finalizadas ${de ? 'de ' + fmtDia(de) : ''}${ate ? ' até ' + fmtDia(ate) : ''}` : 'Todo o período',
      filtro.trim() ? `Busca: "${filtro.trim()}"` : '',
    ].filter(Boolean).join(' · ');
    const linhas = filtrada.map((g) => `
      <tr>
        <td><b>${esc(g.numero)}</b></td>
        <td>${esc(g.id_ordem)}</td>
        <td>${esc(g.cliente || '—')}</td>
        <td>${esc(g.chassis || '—')}</td>
        <td>${esc(g.montadora?.nome || '—')}</td>
        <td class="${g.status === 'aprovada' ? 'ok' : 'nao'}">${g.status === 'aprovada' ? 'Aprovada' : 'Recusada'}</td>
        <td>${esc(fmtData(g.finalizada_em))}</td>
        <td class="num">${esc(fmtMoeda(g.valor_pago_total))}</td>
      </tr>`).join('');
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Garantias finalizadas</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; font-size: 11px; }
  .topo { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #be123c; padding-bottom: 6px; margin-bottom: 10px; }
  h1 { font-size: 18px; margin: 0; }
  .sub { color: #555; margin-top: 3px; }
  .emitido { color: #555; text-align: right; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th { background: #f3f4f6; text-align: left; font-size: 10px; text-transform: uppercase; padding: 6px; border-bottom: 1px solid #999; }
  td { padding: 5px 6px; border-bottom: 1px solid #ddd; vertical-align: top; }
  tr { page-break-inside: avoid; }
  tbody tr:nth-child(even) td { background: #fafafa; }
  .num { text-align: right; white-space: nowrap; }
  .ok { color: #15803d; font-weight: bold; }
  .nao { color: #b91c1c; font-weight: bold; }
  .totais { margin-top: 14px; margin-left: auto; width: 340px; border: 1px solid #999; page-break-inside: avoid; }
  .totais td { border-bottom: 1px solid #eee; }
  .totais tr:last-child td { border-top: 2px solid #111; font-size: 13px; font-weight: bold; }
</style></head><body>
<div class="topo">
  <div><h1>Garantias finalizadas — Nova Tratores</h1><div class="sub">${esc(filtros)}</div></div>
  <div class="emitido">Emitido em ${esc(new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))}</div>
</div>
<table>
  <thead><tr><th>Garantia</th><th>OS</th><th>Cliente</th><th>Chassi</th><th>Montadora</th><th>Resultado</th><th>Finalizada</th><th class="num">Valor pago</th></tr></thead>
  <tbody>${linhas || '<tr><td colspan="8">Nenhuma garantia.</td></tr>'}</tbody>
</table>
<table class="totais">
  <tr><td>Garantias</td><td class="num">${filtrada.length}</td></tr>
  <tr><td>Aprovadas</td><td class="num">${aprovadas}</td></tr>
  <tr><td>Recusadas</td><td class="num">${filtrada.length - aprovadas}</td></tr>
  <tr><td>Mão de obra (horas)</td><td class="num">${esc(fmtMoeda(soma('valor_pago_horas')))}</td></tr>
  <tr><td>Deslocamento (km)</td><td class="num">${esc(fmtMoeda(soma('valor_pago_km')))}</td></tr>
  <tr><td>Peças</td><td class="num">${esc(fmtMoeda(soma('valor_pago_pecas')))}</td></tr>
  <tr><td>Total pago</td><td class="num">${esc(fmtMoeda(totalPago))}</td></tr>
</table>
<script>window.onload = function () { window.print(); };</script>
</body></html>`);
    w.document.close();
  };

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
          <select value={resultado} onChange={(e) => setResultado(e.target.value as typeof resultado)} style={inpData} title="Resultado">
            <option value="">Aprovadas e recusadas</option>
            <option value="aprovada">Só aprovadas</option>
            <option value="recusada">Só recusadas</option>
          </select>
        </div>
        <button
          onClick={imprimir}
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

      {(de || ate || resultado || filtro.trim()) && filtrada.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--portal-text-secondary)', marginBottom: 8 }}>
          {filtrada.length} garantia(s) · {aprovadas} aprovada(s) · {filtrada.length - aprovadas} recusada(s) · total pago <b>{fmtMoeda(totalPago)}</b>
        </div>
      )}

      {filtrada.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--portal-text-muted)', fontSize: 13 }}>
          {de || ate || resultado ? 'Nenhuma garantia finalizada com esses filtros.' : 'Nenhuma garantia finalizada.'}
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

// YYYY-MM-DD → DD/MM/YYYY
function fmtDia(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
