'use client';
// Opção C · Mapa em destaque — o mapa dos municípios ocupa a tela; por cima, painéis
// de vidro: números (esquerda), "Ligue primeiro" (direita) e o radar pequeno (embaixo).
// Clicar numa bolha troca a lista para os clientes daquele município.
import { useState } from 'react';
import FichaCliente from '../FichaCliente';
import RadarClientes from './RadarClientes';
import MapaBolhas, { corFoco } from './MapaBolhas';
import { Conta, EstilosIV, QUADRANTES, compacto, corQ, quadranteDe } from './kit';
import type { Painel } from './usePainel';

const TX = '#0f172a', MU = '#475569';
const vidro: React.CSSProperties = { background: 'rgba(255,255,255,.78)', backdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,.9)', borderRadius: 22, boxShadow: '0 12px 40px rgba(15,23,42,.14)', padding: 16 };

export default function OpcaoMapa({ p }: { p: Painel }) {
  const [ajuda, setAjuda] = useState(false);
  const quentes = p.noFiltro.filter((c) => c.score >= 50).length;
  return (
    <div style={{ position: 'relative', minHeight: 'calc(100vh - 150px)', background: 'radial-gradient(900px 500px at 55% 45%, #dbeafe 0%, #eef2ff 40%, #f8fafc 100%)', overflow: 'hidden', padding: 'clamp(12px, 1.5vw, 22px)' }}>
      <EstilosIV />
      <style>{`
        .mp-grade { display: grid; grid-template-columns: 300px minmax(0, 1fr) 360px; gap: 18px; align-items: start }
        @media (max-width: 1200px) { .mp-grade { grid-template-columns: 1fr } .mp-mapa { order: -1 } }
      `}</style>
      <div className="mp-grade">
        {/* esquerda: números + tipos + radar pequeno */}
        <div style={{ display: 'grid', gap: 14 }}>
          <div className="iv-entra" style={vidro}>
            {[
              { t: 'Clientes para ligar', v: p.noFiltro.length, c: '#ef4444' },
              { t: 'Quentes', v: quentes, c: '#ea580c' },
              { t: 'Esperando retorno', v: p.urgentes.length, c: '#ca8a04' },
              { t: `Máquinas · ${p.mes.rotulo}`, v: p.totalMes?.valorMaquinas ?? 0, c: '#2563eb', f: (x: number) => `R$ ${compacto(x)}` },
            ].map((n, i) => (
              <div key={n.t} style={{ padding: '8px 4px', borderBottom: i < 3 ? '1px solid rgba(15,23,42,.08)' : 0 }}>
                <div style={{ fontSize: 13.5, color: MU, fontWeight: 700 }}>{n.t}</div>
                <div style={{ fontSize: 36, fontWeight: 900, color: n.c, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}><Conta valor={n.v} formato={n.f} /></div>
              </div>
            ))}
          </div>
          <div className="iv-entra" style={{ ...vidro, animationDelay: '120ms' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: MU, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Radar</div>
            {p.clientes && <RadarClientes clientes={p.noFiltro} filtro={p.quad} onFiltro={p.setQuad} onAbrir={p.setFicha} />}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {QUADRANTES.map((q) => (
                <button key={q.id} type="button" onClick={() => p.setQuad(p.quad === q.id ? '' : q.id)}
                  style={{ border: 0, borderRadius: 999, padding: '5px 10px', fontSize: 13, fontWeight: 800, cursor: 'pointer', background: p.quad === q.id ? q.cor : `${q.cor}1f`, color: p.quad === q.id ? '#fefefe' : q.cor }}>{q.nome}</button>
              ))}
            </div>
          </div>
        </div>

        {/* centro: o mapa grande */}
        <div className="mp-mapa iv-entra" style={{ position: 'relative', animationDelay: '60ms' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 22, color: TX }}>{p.mun ? p.mun.nome : 'Onde está o mercado'}</b>
            {p.mun && <span style={{ background: corFoco(p.mun.foco), color: '#fefefe', borderRadius: 999, padding: '3px 12px', fontWeight: 900, fontSize: 15 }}>foco {p.mun.foco}</span>}
            {p.filtros.map((f) => (
              <button key={f.k} type="button" onClick={f.limpa} style={{ border: 0, background: '#0f172a', color: '#fefefe', borderRadius: 999, padding: '6px 14px', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
                {QUADRANTES.find((q) => q.id === f.t)?.nome ?? f.t} ✕
              </button>
            ))}
            <button type="button" onClick={() => setAjuda(!ajuda)} style={{ marginLeft: 'auto', width: 40, height: 40, borderRadius: '50%', border: 0, ...vidro, padding: 0, fontSize: 18, fontWeight: 900, cursor: 'pointer', color: TX }}>?</button>
          </div>
          {ajuda && (
            <div className="iv-entra" style={{ ...vidro, position: 'absolute', right: 0, top: 52, zIndex: 5, width: 'min(380px, 90%)', fontSize: 15, lineHeight: 1.55, color: TX }}>
              Cada <b>bolha</b> é um município: maior = mais área plantada; <b>vermelho</b> = muito mercado e pouca presença nossa. <b>Clique</b> numa bolha para ver os clientes de lá. O <b>radar</b> à esquerda mostra os clientes; no centro = ligar primeiro.
            </div>
          )}
          {p.municipios
            ? <MapaBolhas municipios={p.municipios} selecionado={p.mun?.ibge ?? null} onSelecionar={p.setMun} contagem={p.contaMun} largura={900} altura={720} nomes={10} />
            : <div style={{ color: MU, padding: 60, textAlign: 'center', fontSize: 16 }}>Carregando o mapa…</div>}
          {p.mun && (
            <div className="iv-troca" style={{ ...vidro, marginTop: 10, display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 15, color: TX }}>
              <span><b style={{ fontSize: 22 }}>{compacto(p.mun.areaPlantadaHa)}</b> ha plantados</span>
              <span><b style={{ fontSize: 22 }}>{p.mun.imoveis ?? '—'}</b> imóveis rurais</span>
              <span><b style={{ fontSize: 22 }}>R$ {compacto(p.mun.invest36m || 0)}</b> em investimento</span>
              <span><b style={{ fontSize: 22 }}>{p.mun.clientesComTrator}</b> com trator nosso</span>
              <span style={{ color: '#15803d', fontWeight: 800 }}>Vender lá: {p.mun.linhas.join(' · ')}</span>
            </div>
          )}
        </div>

        {/* direita: ligue primeiro */}
        <div className="iv-entra" style={{ ...vidro, animationDelay: '180ms', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 190px)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: MU, letterSpacing: 1, textTransform: 'uppercase' }}>Ligue primeiro {p.mun ? `· ${p.mun.nome}` : ''}</div>
          <div style={{ fontSize: 30, fontWeight: 900, color: TX, marginBottom: 8 }}><Conta valor={p.lista.length} /> <span style={{ fontSize: 15, color: MU, fontWeight: 700 }}>clientes</span></div>
          <div style={{ display: 'grid', gap: 8, overflowY: 'auto' }}>
            {p.lista.slice(0, 30).map((c, i) => {
              const cor = corQ(quadranteDe(c)!);
              return (
                <button key={c.chave} type="button" onClick={() => p.setFicha(c)} className="iv-entra iv-linha"
                  style={{ animationDelay: `${Math.min(i, 10) * 40}ms`, display: 'grid', gridTemplateColumns: '6px minmax(0, 1fr) auto', gap: 10, alignItems: 'center', textAlign: 'left', border: 0, background: 'rgba(255,255,255,.7)', borderRadius: 14, padding: '10px 12px', cursor: 'pointer', color: TX, fontFamily: 'inherit' }}>
                  <span style={{ alignSelf: 'stretch', borderRadius: 6, background: cor }} />
                  <span style={{ minWidth: 0 }}>
                    <b style={{ display: 'block', fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nome}</b>
                    <span style={{ fontSize: 13.5, color: cor, fontWeight: 700 }}>{c.oportunidades[0]?.oferecer}</span>
                  </span>
                  <b style={{ fontSize: 20, color: cor }}>{c.score}</b>
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
