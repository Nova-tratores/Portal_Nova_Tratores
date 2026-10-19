'use client';
// Radar de clientes: cada ponto é um cliente com oportunidade.
//   lado (quadrante) = tipo de conversa (Renovar · Vender mais · Conquistar · Recuperar)
//   distância do centro = temperatura (centro = score alto = ligar primeiro)
//   tamanho = quanto ele movimenta (peças 12 m + propostas abertas + máquinas)
// A varredura gira e acende cada ponto quando passa por ele.
import { useMemo, useState } from 'react';
import type { ClienteIV } from '@/lib/inteligencia-vendas/tipos';
import { CARD, BORDA, MUDO, QUADRANTES, TXT, hash, quadranteDe, type Quadrante } from './kit';

const S = 620, M = S / 2, RMIN = 36, RMAX = 236, VOLTA = 7;

export default function RadarClientes({ clientes, filtro, onFiltro, onAbrir, max = 800 }: {
  clientes: ClienteIV[]; filtro: Quadrante | ''; onFiltro: (q: Quadrante | '') => void; onAbrir: (c: ClienteIV) => void; max?: number;
}) {
  const [dica, setDica] = useState<{ c: ClienteIV; x: number; y: number } | null>(null);
  const pontos = useMemo(() => {
    const lista = clientes.filter((c) => c.score > 0).sort((a, b) => b.score - a.score).slice(0, max);
    return lista.map((c) => {
      const q = quadranteDe(c)!;
      const qi = QUADRANTES.findIndex((x) => x.id === q);
      const ang = qi * 90 + 7 + hash(c.chave) * 76;
      const r = RMIN + (1 - Math.min(100, c.score) / 100) * (RMAX - RMIN) + (hash(c.chave + 'r') - .5) * 44;
      const rad = ((ang - 90) * Math.PI) / 180;
      const peso = c.pecas12m + c.valorPropostasAbertas + c.valorMaquinas / 10;
      return { c, q, ang, x: M + r * Math.cos(rad), y: M + r * Math.sin(rad), tam: 3.2 + Math.min(7, Math.log10(peso + 1) * 1.15) };
    });
  }, [clientes, max]);
  const conta = (q: Quadrante) => pontos.filter((p) => p.q === q).length;
  const R = RMAX + 14;

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 620, margin: '0 auto', aspectRatio: '1' }}>
      <svg viewBox={`0 0 ${S} ${S}`} width="100%" height="100%" onMouseLeave={() => setDica(null)} role="img" aria-label="Radar de clientes">
        <defs>
          <radialGradient id="ivFundo"><stop offset="0%" stopColor="#ef4444" stopOpacity=".10" /><stop offset="60%" stopColor="#8b5cf6" stopOpacity=".04" /><stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" /></radialGradient>
          <linearGradient id="ivVarre" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#ef4444" stopOpacity="0" /><stop offset="100%" stopColor="#ef4444" stopOpacity=".28" /></linearGradient>
        </defs>
        <circle cx={M} cy={M} r={R} fill="url(#ivFundo)" />
        {QUADRANTES.map((q, i) => {
          const a0 = ((i * 90 - 90) * Math.PI) / 180, a1 = (((i + 1) * 90 - 90) * Math.PI) / 180;
          const meio = ((i * 90 + 45 - 90) * Math.PI) / 180;
          const apaga = filtro && filtro !== q.id;
          return (
            <g key={q.id} style={{ cursor: 'pointer' }} onClick={() => onFiltro(filtro === q.id ? '' : q.id)}>
              <path d={`M${M},${M} L${M + R * Math.cos(a0)},${M + R * Math.sin(a0)} A${R},${R} 0 0 1 ${M + R * Math.cos(a1)},${M + R * Math.sin(a1)} Z`}
                fill={q.cor} fillOpacity={filtro === q.id ? .13 : apaga ? .01 : .045} style={{ transition: 'fill-opacity .3s' }} />
              <text x={M + (R + 30) * Math.cos(meio)} y={M + (R + 30) * Math.sin(meio) - 7} fill={q.cor} fontSize="17" fontWeight="900" textAnchor="middle" opacity={apaga ? .3 : 1}>{q.nome.toUpperCase()}</text>
              <text x={M + (R + 30) * Math.cos(meio)} y={M + (R + 30) * Math.sin(meio) + 11} fill="#64748b" fontSize="13.5" fontWeight="700" textAnchor="middle" opacity={apaga ? .3 : 1}>{conta(q.id)} clientes</text>
            </g>
          );
        })}
        {[.25, .5, .75, 1].map((k) => <circle key={k} cx={M} cy={M} r={RMIN + (RMAX - RMIN) * k} fill="none" stroke="#94a3b8" strokeOpacity={k === 1 ? .5 : .25} strokeDasharray={k === 1 ? undefined : '3 6'} />)}
        <text x={M + 4} y={M - RMIN - (RMAX - RMIN) * .25 + 12} fill="#94a3b8" fontSize="11.5">mais quente</text>
        <text x={M + 4} y={M - RMAX + 12} fill="#94a3b8" fontSize="11.5">morno</text>
        <line x1={M} y1={M - R} x2={M} y2={M + R} stroke="#94a3b8" strokeOpacity=".25" />
        <line x1={M - R} y1={M} x2={M + R} y2={M} stroke="#94a3b8" strokeOpacity=".25" />
        <g className="iv-varre" style={{ transformOrigin: `${M}px ${M}px`, animationDuration: `${VOLTA}s` }}>
          <path d={`M${M},${M} L${M},${M - R} A${R},${R} 0 0 1 ${M + R * Math.sin(Math.PI / 4)},${M - R * Math.cos(Math.PI / 4)} Z`} fill="url(#ivVarre)" transform={`rotate(-45 ${M} ${M})`} />
          <line x1={M} y1={M} x2={M} y2={M - R} stroke="#ef4444" strokeWidth="2" strokeOpacity=".75" />
        </g>
        {pontos.map(({ c, q, ang, x, y, tam }) => {
          const cor = QUADRANTES.find((z) => z.id === q)!.cor;
          const apaga = filtro && filtro !== q;
          return (
            <g key={c.chave} style={{ cursor: 'pointer', opacity: apaga ? .12 : 1, transition: 'opacity .3s' }} onClick={() => onAbrir(c)}
              onMouseEnter={(e) => { const b = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); setDica({ c, x: b.left + (x / S) * b.width, y: b.top + (y / S) * b.height }); }}>
              <circle cx={x} cy={y} r={tam + 6} fill="transparent" />
              {c.score >= 50 && !apaga && <circle cx={x} cy={y} r={tam} fill="none" stroke={cor} strokeWidth="1.5" className="iv-onda" style={{ animationDelay: `${(ang / 360) * VOLTA}s` }} />}
              <circle cx={x} cy={y} r={tam} fill={cor} stroke="#fefefe" strokeWidth="1.2" className="iv-blip"
                style={{ animationDuration: `${VOLTA}s`, animationDelay: `${(ang / 360) * VOLTA}s`, transformOrigin: `${x}px ${y}px` }} />
            </g>
          );
        })}
        <circle cx={M} cy={M} r="7" fill="#ef4444" />
        <circle cx={M} cy={M} r="7" fill="none" stroke="#ef4444" className="iv-onda" />
      </svg>
      {dica && (
        <div style={{
          position: 'fixed', left: Math.min(dica.x + 14, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 300), top: dica.y + 12, zIndex: 9500,
          pointerEvents: 'none', width: 280, background: CARD, border: `1px solid ${BORDA}`, borderTop: `4px solid ${QUADRANTES.find((z) => z.id === quadranteDe(dica.c))!.cor}`,
          borderRadius: 12, padding: '10px 12px', boxShadow: '0 14px 34px rgba(15,23,42,.2)', color: TXT,
        }}>
          <div style={{ fontWeight: 900, fontSize: 15.5 }}>{dica.c.nome}</div>
          <div style={{ fontSize: 13.5, color: MUDO }}>{dica.c.cidade} · score {dica.c.score}</div>
          <div style={{ fontSize: 14, marginTop: 6 }}><b>Por quê:</b> {dica.c.oportunidades[0]?.titulo}</div>
          <div style={{ fontSize: 14, marginTop: 2 }}><b>Oferecer:</b> {dica.c.oportunidades[0]?.oferecer}</div>
          <div style={{ fontSize: 13, color: MUDO, marginTop: 6 }}>Clique para abrir a ficha</div>
        </div>
      )}
    </div>
  );
}
