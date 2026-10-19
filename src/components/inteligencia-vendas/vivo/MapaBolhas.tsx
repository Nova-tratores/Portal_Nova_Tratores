'use client';
// Mapa de bolhas dos municípios da loja, na posição real (centro dos imóveis do CAR).
//   tamanho = área plantada · cor = FOCO · anel = nossa presença · pulsa = foco 70+
//   linhas tracejadas saem da loja (Piraju) até os 5 municípios de maior foco
// Clique numa bolha = filtra a tela inteira por aquele município.
import { useMemo, useState } from 'react';
import type { MunicipioIV } from '@/lib/inteligencia-vendas/municipios';
import { BORDA, CARD, MUDO, TXT, compacto } from './kit';

const PAD = 34;
const PIRAJU = 3538808;
export const corFoco = (f: number) => (f >= 70 ? '#ef4444' : f >= 55 ? '#f59e0b' : f >= 40 ? '#3b82f6' : '#94a3b8');

export default function MapaBolhas({ municipios, selecionado, onSelecionar, contagem, largura = 560, altura = 440, escuro = false, legenda = true, nomes = 8 }: {
  municipios: MunicipioIV[]; selecionado: number | null; onSelecionar: (m: MunicipioIV | null) => void; contagem?: (m: MunicipioIV) => number;
  /** tamanho do desenho (proporção); a tela estica pela largura */
  largura?: number; altura?: number; escuro?: boolean; legenda?: boolean; nomes?: number;
}) {
  const W = largura, H = altura;
  const corNome = escuro ? '#e2e8f0' : '#334155', contorno = escuro ? 'rgba(2,6,23,.85)' : 'rgba(255,255,255,.85)';
  const [dica, setDica] = useState<{ m: MunicipioIV; x: number; y: number } | null>(null);
  const pts = useMemo(() => {
    const com = municipios.filter((m) => m.centro);
    if (!com.length) return [];
    const lats = com.map((m) => m.centro![0]), lngs = com.map((m) => m.centro![1]);
    const [la0, la1, lo0, lo1] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
    // mapa ESQUEMÁTICO: estica para ocupar o quadro inteiro (a região é mais alta que larga)
    const maxA = Math.max(1, ...com.map((m) => m.areaPlantadaHa));
    return com.map((m) => ({
      m, x: PAD + ((m.centro![1] - lo0) / ((lo1 - lo0) || 1)) * (W - 2 * PAD), y: PAD + ((la1 - m.centro![0]) / ((la1 - la0) || 1)) * (H - 2 * PAD),
      r: 5 + Math.sqrt(m.areaPlantadaHa / maxA) * 17,
    }));
  }, [municipios, W, H]);
  const loja = pts.find((p) => p.m.ibge === PIRAJU);
  const ordem = [...pts].sort((a, b) => b.m.foco - a.m.foco);
  const top = ordem.slice(0, 5);
  const comNome = new Set(ordem.slice(0, nomes).map((p) => p.m.ibge));

  if (!pts.length) return <div style={{ color: MUDO, fontSize: 14.5, padding: 30, textAlign: 'center' }}>Mapa indisponível (dados do Agro não carregados).</div>;
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} onMouseLeave={() => setDica(null)} role="img" aria-label="Mapa dos municípios">
        <defs>
          <radialGradient id="ivMapaFundo" cx="50%" cy="50%" r="60%"><stop offset="0%" stopColor="#3b82f6" stopOpacity=".07" /><stop offset="100%" stopColor="#3b82f6" stopOpacity="0" /></radialGradient>
          <filter id="ivSombra" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="3" stdDeviation="3" floodOpacity=".18" /></filter>
        </defs>
        {!escuro && <rect x="0" y="0" width={W} height={H} rx="16" fill="url(#ivMapaFundo)" />}
        {Array.from({ length: 9 }, (_, i) => <line key={`v${i}`} x1={(i + 1) * W / 10} y1="0" x2={(i + 1) * W / 10} y2={H} stroke="#94a3b8" strokeOpacity=".08" />)}
        {Array.from({ length: 7 }, (_, i) => <line key={`h${i}`} x1="0" y1={(i + 1) * H / 8} x2={W} y2={(i + 1) * H / 8} stroke="#94a3b8" strokeOpacity=".08" />)}
        {loja && top.filter((t) => t.m.ibge !== PIRAJU).map((t, i) => (
          <line key={t.m.ibge} x1={loja.x} y1={loja.y} x2={t.x} y2={t.y} stroke="#ef4444" strokeOpacity=".45" strokeWidth="1.6" strokeDasharray="5 6" className="iv-rota" style={{ animationDelay: `${i * .3}s` }} />
        ))}
        {[...pts].sort((a, b) => b.r - a.r).map(({ m, x, y, r }, i) => {
          const cor = corFoco(m.foco);
          const sel = selecionado === m.ibge;
          const apaga = selecionado != null && !sel;
          const pen = Math.min(1, (m.penetracao ?? 0) / .05);
          const circ = 2 * Math.PI * (r + 3);
          const n = contagem?.(m);
          return (
            <g key={m.ibge} style={{ cursor: 'pointer', opacity: apaga ? .35 : 1, transition: 'opacity .3s' }}
              onClick={() => onSelecionar(sel ? null : m)}
              onMouseEnter={(e) => { const b = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); setDica({ m, x: b.left + (x / W) * b.width, y: b.top + (y / H) * b.height }); }}>
              <g className="iv-cresce" style={{ animationDelay: `${i * 25}ms`, transformOrigin: `${x}px ${y}px` }}>
                {m.foco >= 70 && <circle cx={x} cy={y} r={r} fill="none" stroke={cor} strokeWidth="2" className="iv-onda-g" />}
                <circle cx={x} cy={y} r={r} fill={cor} fillOpacity={sel ? .95 : .78} stroke={sel ? (escuro ? '#fefefe' : '#0f172a') : (escuro ? 'rgba(255,255,255,.5)' : '#fefefe')} strokeWidth={sel ? 3 : 1.5} filter="url(#ivSombra)" />
                <circle cx={x} cy={y} r={r + 3} fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={`${circ * pen} ${circ}`} transform={`rotate(-90 ${x} ${y})`} />
                {r > 12 && <text x={x} y={y + 4} textAnchor="middle" fontSize="12.5" fontWeight="900" fill="#fefefe" style={{ pointerEvents: 'none' }}>{m.foco}</text>}
                {(comNome.has(m.ibge) || sel || m.ibge === PIRAJU) && (
                  <text x={x} y={y + r + 14} textAnchor="middle" fontSize="12.5" fontWeight="800" fill={corNome} style={{ pointerEvents: 'none', paintOrder: 'stroke', stroke: contorno, strokeWidth: 3 }}>
                    {m.ibge === PIRAJU ? '★ ' : ''}{m.nome}{n ? ` · ${n}` : ''}
                  </text>
                )}
              </g>
            </g>
          );
        })}
      </svg>
      {legenda && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 13, color: MUDO, marginTop: 6 }}>
        {[['#ef4444', 'foco 70+'], ['#f59e0b', '55–69'], ['#3b82f6', '40–54'], ['#94a3b8', 'menos']].map(([c, t]) => (
          <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 10, background: c }} />{t}</span>
        ))}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 12, height: 0, borderTop: '3px solid #16a34a' }} />anel = nossa presença</span>
        <span>bolha maior = mais área plantada</span>
      </div>}
      {dica && (
        <div style={{
          position: 'fixed', left: Math.min(dica.x + 14, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 290), top: dica.y + 12, zIndex: 9500,
          pointerEvents: 'none', width: 270, background: CARD, border: `1px solid ${BORDA}`, borderTop: `4px solid ${corFoco(dica.m.foco)}`,
          borderRadius: 12, padding: '10px 12px', boxShadow: '0 14px 34px rgba(15,23,42,.2)', color: TXT, fontSize: 14,
        }}>
          <div style={{ fontWeight: 900, fontSize: 15.5 }}>{dica.m.nome} · foco {dica.m.foco}</div>
          <div style={{ color: MUDO }}>{dica.m.culturas.slice(0, 3).map((c) => `${c.nome} ${compacto(c.ha)} ha`).join(' · ')}</div>
          <div style={{ marginTop: 5 }}>{compacto(dica.m.areaPlantadaHa)} ha plantados · {dica.m.imoveis ?? '—'} imóveis · R$ {compacto(dica.m.invest36m || 0)} de investimento</div>
          <div>{dica.m.clientesComTrator} clientes com trator nosso · {dica.m.oportunidades} com oportunidade</div>
          <div style={{ color: MUDO, marginTop: 4 }}>Clique para filtrar a tela</div>
        </div>
      )}
    </div>
  );
}
