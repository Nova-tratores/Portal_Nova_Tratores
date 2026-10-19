'use client';
// Opção A · Sala de controle — fundo escuro, radar grande no centro com brilho,
// números em neon, pouco texto (a explicação fica no botão "?").
import { useState } from 'react';
import FichaCliente from '../FichaCliente';
import RadarClientes from './RadarClientes';
import MapaBolhas from './MapaBolhas';
import { Conta, EstilosIV, QUADRANTES, compacto, corQ, iniciais, quadranteDe } from './kit';
import type { Painel } from './usePainel';

const T = '#e2e8f0', M = '#94a3b8', VIDRO = 'rgba(15,23,42,.72)', LINHA = 'rgba(148,163,184,.18)';

export default function OpcaoSala({ p }: { p: Painel }) {
  const [ajuda, setAjuda] = useState(false);
  const quentes = p.noFiltro.filter((c) => c.score >= 50).length;
  const caixa: React.CSSProperties = { background: VIDRO, border: `1px solid ${LINHA}`, borderRadius: 20, padding: 18, backdropFilter: 'blur(8px)', minWidth: 0 };
  const titulo = (t: string) => <div style={{ fontSize: 13, letterSpacing: 1.4, textTransform: 'uppercase', color: M, fontWeight: 800, marginBottom: 12 }}>{t}</div>;

  return (
    <div style={{ background: 'radial-gradient(1200px 600px at 50% 0%, #1e1b4b 0%, #0b1120 45%, #050816 100%)', color: T, minHeight: 'calc(100vh - 150px)', padding: 'clamp(14px, 2vw, 28px)', position: 'relative', overflow: 'hidden' }}>
      <EstilosIV />
      <style>{`
        .sala-brilho { text-shadow: 0 0 18px currentColor }
        .sala-cartao { transition: transform .2s, border-color .2s } .sala-cartao:hover { transform: translateY(-2px); border-color: rgba(255,255,255,.35) }
        @keyframes salaTicker { from { transform: translateY(0) } to { transform: translateY(-50%) } }
        .sala-ticker { animation: salaTicker 40s linear infinite } .sala-ticker:hover { animation-play-state: paused }
      `}</style>

      {/* filtros + ajuda */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 36, marginBottom: 14, flexWrap: 'wrap' }}>
        {p.filtros.length === 0 && <span style={{ color: M, fontSize: 14 }}>Clique no radar, numa bolha do mapa ou num vendedor para filtrar</span>}
        {p.filtros.map((f) => (
          <button key={f.k} type="button" onClick={f.limpa} style={{ border: '1px solid rgba(255,255,255,.3)', background: 'rgba(255,255,255,.1)', color: T, borderRadius: 999, padding: '6px 14px', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
            {QUADRANTES.find((q) => q.id === f.t)?.nome ?? f.t} ✕
          </button>
        ))}
        <button type="button" onClick={() => setAjuda(!ajuda)} title="Como ler" style={{ marginLeft: 'auto', width: 38, height: 38, borderRadius: '50%', border: '1px solid rgba(255,255,255,.3)', background: 'rgba(255,255,255,.08)', color: T, fontSize: 17, fontWeight: 900, cursor: 'pointer' }}>?</button>
      </div>
      {ajuda && (
        <div className="iv-entra" style={{ ...caixa, position: 'absolute', right: 28, top: 68, zIndex: 10, width: 'min(420px, 90vw)', fontSize: 15, lineHeight: 1.55 }}>
          <b>Radar:</b> cada ponto é um cliente. No centro = ligar primeiro. O lado = tipo de conversa.<br />
          <b>Mapa:</b> bolha = município; vermelho = muito mercado e pouca presença nossa.<br />
          <b>Tudo filtra:</b> clique em qualquer coisa; o ✕ tira o filtro.
        </div>
      )}

      {/* números */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 14, marginBottom: 16 }}>
        {[
          { t: 'Clientes para ligar', v: p.noFiltro.length, c: '#f87171' },
          { t: 'Quentes', v: quentes, c: '#fb923c' },
          { t: 'Esperando retorno', v: p.urgentes.length, c: '#facc15' },
          { t: `Máquinas · ${p.mes.rotulo}`, v: p.totalMes?.valorMaquinas ?? 0, c: '#38bdf8', f: (x: number) => `R$ ${compacto(x)}` },
        ].map((n, i) => (
          <div key={n.t} className="iv-entra sala-cartao" style={{ ...caixa, animationDelay: `${i * 80}ms`, borderTop: `3px solid ${n.c}` }}>
            <div style={{ fontSize: 14, color: M, fontWeight: 700 }}>{n.t}</div>
            <div className="sala-brilho" style={{ fontSize: 46, fontWeight: 900, color: n.c, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}><Conta valor={n.v} formato={n.f} /></div>
          </div>
        ))}
      </div>

      {/* tipos · radar · ligue primeiro */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(0, 2.2fr) minmax(280px, 1.3fr)', gap: 16, marginBottom: 16 }} className="sala-grade">
        <style>{`@media (max-width: 1100px) { .sala-grade { grid-template-columns: 1fr !important } }`}</style>
        <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          {QUADRANTES.map((q, i) => {
            const n = p.noFiltro.filter((c) => quadranteDe(c) === q.id).length;
            const on = p.quad === q.id;
            return (
              <button key={q.id} type="button" onClick={() => p.setQuad(on ? '' : q.id)} className="iv-entra sala-cartao"
                style={{ ...caixa, animationDelay: `${200 + i * 80}ms`, textAlign: 'left', cursor: 'pointer', color: T, fontFamily: 'inherit', borderColor: on ? q.cor : LINHA, boxShadow: on ? `0 0 24px ${q.cor}66` : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 17, fontWeight: 900, color: q.cor }}>{q.nome}</span>
                  <span className="sala-brilho" style={{ fontSize: 30, fontWeight: 900, color: q.cor }}>{n}</span>
                </div>
                <div style={{ height: 6, borderRadius: 6, background: 'rgba(255,255,255,.08)', marginTop: 8, overflow: 'hidden' }}>
                  <div className="iv-barra" style={{ height: '100%', width: `${(n / Math.max(1, p.noFiltro.length)) * 100}%`, background: q.cor, boxShadow: `0 0 10px ${q.cor}` }} />
                </div>
              </button>
            );
          })}
        </div>
        <div style={{ ...caixa, display: 'grid', placeItems: 'center' }}>
          {p.clientes ? <RadarClientes clientes={p.noFiltro} filtro={p.quad} onFiltro={p.setQuad} onAbrir={p.setFicha} /> : <span style={{ color: M }}>Ligando o radar…</span>}
        </div>
        <div style={{ ...caixa, overflow: 'hidden', maxHeight: 640 }}>
          {titulo('Ligue primeiro')}
          <div style={{ overflow: 'hidden', height: 560 }}>
            <div className={p.lista.length > 8 ? 'sala-ticker' : ''} style={{ display: 'grid', gap: 10 }}>
              {[...p.lista.slice(0, 14), ...(p.lista.length > 8 ? p.lista.slice(0, 14) : [])].map((c, i) => {
                const cor = corQ(quadranteDe(c)!);
                return (
                  <button key={`${c.chave}-${i}`} type="button" onClick={() => p.setFicha(c)} className="sala-cartao"
                    style={{ textAlign: 'left', border: `1px solid ${LINHA}`, borderLeft: `4px solid ${cor}`, background: 'rgba(255,255,255,.04)', borderRadius: 14, padding: '10px 12px', cursor: 'pointer', color: T, fontFamily: 'inherit' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <b style={{ fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nome}</b>
                      <b className="sala-brilho" style={{ color: cor, fontSize: 18 }}>{c.score}</b>
                    </div>
                    <div style={{ fontSize: 13.5, color: cor, fontWeight: 700 }}>{c.oportunidades[0]?.oferecer}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* mapa · vendedores */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(480px, 100%), 1fr))', gap: 16 }}>
        <div style={caixa}>
          {titulo('Onde está o mercado')}
          {p.municipios && <MapaBolhas municipios={p.municipios} selecionado={p.mun?.ibge ?? null} onSelecionar={p.setMun} contagem={p.contaMun} escuro legenda={false} largura={640} altura={400} />}
        </div>
        <div style={caixa}>
          {titulo(`Vendedores · ${p.mes.rotulo}`)}
          <div style={{ display: 'grid', gap: 12 }}>
            {p.vendedores.slice(0, 8).map(({ v, s }, i) => {
              const max = Math.max(1, p.vendedores[0]?.s.valorMaquinas || 0);
              const on = p.vend === v.nome;
              return (
                <button key={v.id} type="button" onClick={() => p.setVend(on ? '' : v.nome)} className="iv-entra"
                  style={{ animationDelay: `${i * 70}ms`, display: 'grid', gridTemplateColumns: '44px minmax(0, 1fr) auto', gap: 12, alignItems: 'center', border: 0, background: on ? 'rgba(56,189,248,.12)' : 'transparent', borderRadius: 12, padding: 6, cursor: 'pointer', color: T, fontFamily: 'inherit', textAlign: 'left' }}>
                  <span style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg, #38bdf8, #6366f1)', display: 'grid', placeItems: 'center', fontWeight: 900 }}>{iniciais(v.nome)}</span>
                  <span style={{ minWidth: 0 }}>
                    <b style={{ fontSize: 15 }}>{v.nome}</b>
                    <span style={{ display: 'block', height: 8, borderRadius: 8, background: 'rgba(255,255,255,.08)', marginTop: 6, overflow: 'hidden' }}>
                      <span className="iv-barra" style={{ display: 'block', height: '100%', width: `${(s.valorMaquinas / max) * 100}%`, background: 'linear-gradient(90deg, #38bdf8, #818cf8)', boxShadow: '0 0 12px #38bdf8', animationDelay: `${i * 70}ms` }} />
                    </span>
                  </span>
                  <b className="sala-brilho" style={{ fontSize: 18, color: '#38bdf8' }}>R$ <Conta valor={s.valorMaquinas} formato={compacto} /></b>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {p.ficha && <FichaCliente c={p.ficha} onFechar={() => p.setFicha(null)} />}
    </div>
  );
}
