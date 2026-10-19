'use client';
// Opção 5 · Valor × urgência — cada bolha é um cliente: para a DIREITA = movimenta
// mais dinheiro com a gente; para CIMA = mais motivos para ligar (score).
// Os 4 cantos viram 4 jeitos de agir; clicar num canto mostra a lista dele.
import { useMemo, useState } from 'react';
import type { ClienteIV } from '@/lib/inteligencia-vendas/tipos';
import { Avatar, BD, CARD, EstilosOport, MU, SUAVE, TX, reais, tipo, valorCliente } from './comum';
import { QUADRANTES } from '../vivo/kit';

type Canto = 'ja' | 'whats' | 'visitar' | 'cultivar';
const CANTOS: Record<Canto, { nome: string; dica: string; cor: string }> = {
  ja: { nome: 'Ligue já', dica: 'quente e movimenta bastante', cor: '#dc2626' },
  whats: { nome: 'Mande mensagem', dica: 'quente, mas movimenta pouco', cor: '#ea580c' },
  visitar: { nome: 'Visite', dica: 'movimenta bastante, ainda frio', cor: '#2563eb' },
  cultivar: { nome: 'Cultive', dica: 'frio e movimenta pouco', cor: '#64748b' },
};
const W = 1000, H = 560, PE = 64, PB = 48, PT = 20, PD = 20;

export default function MatrizValor({ clientes, onFicha }: { clientes: ClienteIV[]; onFicha: (c: ClienteIV) => void }) {
  const [canto, setCanto] = useState<Canto>('ja');
  const [dica, setDica] = useState<{ c: ClienteIV; x: number; y: number } | null>(null);
  const { pts, corteV, corteS } = useMemo(() => {
    const vals = clientes.map(valorCliente).filter((v) => v > 0).sort((a, b) => a - b);
    const corteV = vals[Math.floor(vals.length / 2)] || 1000;
    const corteS = 35;
    const lmax = Math.log10(Math.max(10, ...vals));
    const sx = (v: number) => PE + (Math.log10(Math.max(10, v)) - 1) / (lmax - 1) * (W - PE - PD);
    const sy = (s: number) => PT + (1 - Math.min(70, s) / 70) * (H - PT - PB);
    return {
      corteV, corteS,
      pts: clientes.map((c, i) => {
        const v = valorCliente(c);
        const jx = ((i * 9301 + 49297) % 233280) / 233280 - .5;
        return { c, v, x: sx(v) + jx * 6, y: sy(c.score) + jx * 10, r: 4 + Math.min(6, c.oportunidades.length * 1.6), cx: sx(corteV), cy: sy(corteS) };
      }),
    };
  }, [clientes]);
  const cantoDe = (c: ClienteIV): Canto => {
    const quente = c.score >= corteS, vale = valorCliente(c) >= corteV;
    return quente && vale ? 'ja' : quente ? 'whats' : vale ? 'visitar' : 'cultivar';
  };
  const lista = clientes.filter((c) => cantoDe(c) === canto).sort((a, b) => b.score - a.score || valorCliente(b) - valorCliente(a));
  const cx = pts[0]?.cx ?? W / 2, cy = pts[0]?.cy ?? H / 2;
  const area: Record<Canto, [number, number, number, number]> = {
    ja: [cx, PT, W - PD - cx, cy - PT], whats: [PE, PT, cx - PE, cy - PT],
    visitar: [cx, cy, W - PD - cx, H - PB - cy], cultivar: [PE, cy, cx - PE, H - PB - cy],
  };

  return (
    <div style={{ padding: '18px clamp(12px, 2vw, 28px)', background: SUAVE, minHeight: 'calc(100vh - 160px)' }}>
      <EstilosOport />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(300px, 400px)', gap: 18, alignItems: 'start' }} className="mv-grade">
        <style>{`@media (max-width: 1050px) { .mv-grade { grid-template-columns: 1fr !important } }`}</style>
        <section style={{ background: CARD, borderRadius: 20, border: `1px solid ${BD}`, padding: 18, position: 'relative' }}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
            {QUADRANTES.map((q) => <span key={q.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, color: TX }}><span style={{ width: 11, height: 11, borderRadius: 11, background: q.cor }} />{q.nome}</span>)}
            <span style={{ marginLeft: 'auto', fontSize: 14, color: MU }}>bolha maior = mais motivos</span>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} onMouseLeave={() => setDica(null)}>
            {(Object.keys(CANTOS) as Canto[]).map((k) => {
              const [x, y, w, h] = area[k];
              const on = canto === k;
              return (
                <g key={k} onClick={() => setCanto(k)} style={{ cursor: 'pointer' }}>
                  <rect x={x} y={y} width={Math.max(0, w)} height={Math.max(0, h)} fill={CANTOS[k].cor} fillOpacity={on ? .09 : .03} style={{ transition: 'fill-opacity .3s' }} />
                  <text x={k === 'ja' || k === 'visitar' ? x + w - 12 : x + 12} y={k === 'ja' || k === 'whats' ? y + 26 : y + h - 14} textAnchor={k === 'ja' || k === 'visitar' ? 'end' : 'start'}
                    fontSize="20" fontWeight="800" fill={CANTOS[k].cor} opacity={on ? 1 : .55}>{CANTOS[k].nome}</text>
                </g>
              );
            })}
            <line x1={cx} y1={PT} x2={cx} y2={H - PB} stroke="#94a3b8" strokeDasharray="4 6" />
            <line x1={PE} y1={cy} x2={W - PD} y2={cy} stroke="#94a3b8" strokeDasharray="4 6" />
            <text x={(W + PE) / 2} y={H - 12} textAnchor="middle" fontSize="15" fill="#64748b" fontWeight="600">quanto movimenta com a gente →</text>
            <text x={18} y={(H - PB + PT) / 2} textAnchor="middle" fontSize="15" fill="#64748b" fontWeight="600" transform={`rotate(-90 18 ${(H - PB + PT) / 2})`}>mais motivos para ligar →</text>
            {pts.map(({ c, x, y, r }, i) => {
              const cor = tipo(c).cor;
              const fora = cantoDe(c) !== canto;
              return (
                <circle key={c.chave} cx={x} cy={y} r={r} fill={cor} fillOpacity={fora ? .35 : .9} stroke="#fefefe" strokeWidth="1.2"
                  style={{ cursor: 'pointer', transformOrigin: `${x}px ${y}px`, animation: `opEntra .5s ${Math.min(i, 300) * 3}ms both` }}
                  onClick={() => onFicha(c)}
                  onMouseEnter={(e) => { const b = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); setDica({ c, x: b.left + (x / W) * b.width, y: b.top + (y / H) * b.height }); }} />
              );
            })}
          </svg>
          {dica && (
            <div style={{ position: 'fixed', left: Math.min(dica.x + 14, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 300), top: dica.y + 14, zIndex: 9500, pointerEvents: 'none', width: 280, background: CARD, border: `1px solid ${BD}`, borderRadius: 14, padding: '12px 14px', boxShadow: '0 14px 34px rgba(15,23,42,.18)', color: TX }}>
              <div style={{ fontWeight: 800, fontSize: 15.5 }}>{dica.c.nome}</div>
              <div style={{ fontSize: 14, color: MU }}>{reais(valorCliente(dica.c))} · score {dica.c.score}</div>
              <div style={{ fontSize: 14.5, marginTop: 6 }}>{dica.c.oportunidades[0]?.titulo}</div>
              <div style={{ fontSize: 14, marginTop: 2, color: tipo(dica.c).cor, fontWeight: 700 }}>→ {dica.c.oportunidades[0]?.oferecer}</div>
            </div>
          )}
        </section>

        <aside style={{ background: CARD, borderRadius: 20, border: `1px solid ${BD}`, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: 12, background: SUAVE }}>
            {(['whats', 'ja', 'cultivar', 'visitar'] as Canto[]).map((k) => {
              const on = canto === k;
              const n = clientes.filter((c) => cantoDe(c) === k).length;
              return (
                <button key={k} type="button" onClick={() => setCanto(k)} style={{ border: on ? `2px solid ${CANTOS[k].cor}` : `1px solid ${BD}`, background: CARD, borderRadius: 14, padding: '10px 12px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: CANTOS[k].cor, lineHeight: 1.1 }}>{n}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: TX }}>{CANTOS[k].nome}</div>
                  <div style={{ fontSize: 12.5, color: MU }}>{CANTOS[k].dica}</div>
                </button>
              );
            })}
          </div>
          <div key={canto} style={{ display: 'grid', maxHeight: 'calc(100vh - 360px)', overflowY: 'auto' }}>
            {lista.slice(0, 40).map((c, i) => (
              <div key={c.chave} onClick={() => onFicha(c)} className="op-entra op-item" style={{ animationDelay: `${Math.min(i, 10) * 35}ms`, display: 'flex', gap: 12, alignItems: 'center', padding: '12px 14px', borderTop: `1px solid ${BD}`, cursor: 'pointer' }}>
                <Avatar nome={c.nome} cor={tipo(c).cor} tam={40} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: TX, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nome}</div>
                  <div style={{ fontSize: 13.5, color: tipo(c).cor, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.oportunidades[0]?.oferecer}</div>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
