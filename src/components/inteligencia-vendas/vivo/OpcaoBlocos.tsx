'use client';
// Opção B · Blocos — clara, blocos de tamanhos diferentes (estilo "bento"),
// números enormes, rótulo curto, muito respiro. Explicação só no "?".
import { useState } from 'react';
import FichaCliente from '../FichaCliente';
import RadarClientes from './RadarClientes';
import MapaBolhas from './MapaBolhas';
import { Conta, EstilosIV, QUADRANTES, compacto, corQ, iniciais, quadranteDe } from './kit';
import type { Painel } from './usePainel';

const TX = 'var(--portal-text, #0f172a)', MU = 'var(--portal-text-muted, #64748b)';

function Bloco({ children, area, fundo, atraso = 0, style }: { children: React.ReactNode; area: string; fundo?: string; atraso?: number; style?: React.CSSProperties }) {
  return (
    <section className="iv-entra bl-bloco" style={{ gridArea: area, animationDelay: `${atraso}ms`, background: fundo ?? 'var(--portal-bg-card, #fefefe)', borderRadius: 28, padding: 22, minWidth: 0, boxShadow: '0 1px 2px rgba(15,23,42,.04), 0 8px 24px rgba(15,23,42,.06)', ...style }}>
      {children}
    </section>
  );
}
const Rot = ({ t }: { t: string }) => <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: MU }}>{t}</div>;

export default function OpcaoBlocos({ p }: { p: Painel }) {
  const [ajuda, setAjuda] = useState(false);
  const quentes = p.noFiltro.filter((c) => c.score >= 50).length;
  return (
    <div style={{ padding: 'clamp(14px, 2vw, 28px)', background: 'linear-gradient(180deg, #f8fafc, #eef2ff)', minHeight: 'calc(100vh - 150px)' }}>
      <EstilosIV />
      <style>{`
        .bl-grade { display: grid; gap: 18px; grid-template-columns: repeat(6, minmax(0, 1fr));
          grid-template-areas: "n1 n2 n3 n4 lista lista" "radar radar mapa mapa lista lista" "radar radar mapa mapa lista lista" "tipos tipos tipos vend vend vend" }
        @media (max-width: 1200px) { .bl-grade { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-areas: "n1 n2" "n3 n4" "radar radar" "mapa mapa" "lista lista" "tipos tipos" "vend vend" } }
        .bl-bloco { transition: transform .25s, box-shadow .25s } .bl-bloco:hover { transform: translateY(-3px); box-shadow: 0 2px 4px rgba(15,23,42,.05), 0 16px 36px rgba(15,23,42,.10) }
      `}</style>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 38, marginBottom: 14, flexWrap: 'wrap' }}>
        {p.filtros.map((f) => (
          <button key={f.k} type="button" onClick={f.limpa} style={{ border: 0, background: '#0f172a', color: '#fefefe', borderRadius: 999, padding: '8px 16px', fontWeight: 800, fontSize: 14.5, cursor: 'pointer', fontFamily: 'inherit' }}>
            {QUADRANTES.find((q) => q.id === f.t)?.nome ?? f.t} ✕
          </button>
        ))}
        {p.filtros.length === 0 && <span style={{ color: MU, fontSize: 15 }}>Toque em qualquer bloco para filtrar</span>}
        <button type="button" onClick={() => setAjuda(!ajuda)} style={{ marginLeft: 'auto', width: 40, height: 40, borderRadius: '50%', border: 0, background: '#fefefe', boxShadow: '0 4px 12px rgba(15,23,42,.1)', color: TX, fontSize: 18, fontWeight: 900, cursor: 'pointer' }}>?</button>
      </div>
      {ajuda && (
        <div className="iv-entra" style={{ background: '#0f172a', color: '#fefefe', borderRadius: 20, padding: '14px 18px', fontSize: 15, lineHeight: 1.6, marginBottom: 16 }}>
          <b>Radar:</b> cada ponto é um cliente; no centro = ligar primeiro. · <b>Mapa:</b> vermelho = muito mercado e pouca presença nossa. · <b>Tudo filtra:</b> toque e a tela toda muda.
        </div>
      )}

      <div className="bl-grade">
        {[
          { a: 'n1', t: 'Para ligar', v: p.noFiltro.length, c: '#ef4444', bg: 'linear-gradient(135deg, #fee2e2, #fff1f2)' },
          { a: 'n2', t: 'Quentes', v: quentes, c: '#ea580c', bg: 'linear-gradient(135deg, #ffedd5, #fff7ed)' },
          { a: 'n3', t: 'Esperando retorno', v: p.urgentes.length, c: '#ca8a04', bg: 'linear-gradient(135deg, #fef9c3, #fefce8)' },
          { a: 'n4', t: `Máquinas · ${p.mes.rotulo}`, v: p.totalMes?.valorMaquinas ?? 0, c: '#2563eb', bg: 'linear-gradient(135deg, #dbeafe, #eff6ff)', f: (x: number) => `R$ ${compacto(x)}` },
        ].map((n, i) => (
          <Bloco key={n.a} area={n.a} fundo={n.bg} atraso={i * 70}>
            <Rot t={n.t} />
            <div style={{ fontSize: 'clamp(30px, 2.9vw, 52px)', fontWeight: 900, color: n.c, lineHeight: 1.05, marginTop: 6, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><Conta valor={n.v} formato={n.f} /></div>
          </Bloco>
        ))}

        <Bloco area="radar" atraso={200}>
          <Rot t="Radar de clientes" />
          {p.clientes ? <RadarClientes clientes={p.noFiltro} filtro={p.quad} onFiltro={p.setQuad} onAbrir={p.setFicha} /> : <div style={{ color: MU, padding: 40 }}>carregando…</div>}
        </Bloco>

        <Bloco area="mapa" atraso={260}>
          <Rot t="Onde está o mercado" />
          {p.municipios && <MapaBolhas municipios={p.municipios} selecionado={p.mun?.ibge ?? null} onSelecionar={p.setMun} contagem={p.contaMun} legenda={false} largura={480} altura={560} nomes={6} />}
        </Bloco>

        <Bloco area="lista" atraso={320} style={{ display: 'flex', flexDirection: 'column' }}>
          <Rot t="Ligue primeiro" />
          <div style={{ display: 'grid', gap: 10, marginTop: 12, overflowY: 'auto', maxHeight: 820 }}>
            {p.lista.slice(0, 20).map((c, i) => {
              const cor = corQ(quadranteDe(c)!);
              return (
                <button key={c.chave} type="button" onClick={() => p.setFicha(c)} className="iv-entra iv-linha"
                  style={{ animationDelay: `${Math.min(i, 10) * 40}ms`, display: 'flex', gap: 12, alignItems: 'center', textAlign: 'left', border: 0, background: 'var(--portal-bg-secondary, #f8fafc)', borderRadius: 18, padding: '12px 14px', cursor: 'pointer', color: TX, fontFamily: 'inherit' }}>
                  <span style={{ width: 46, height: 46, flexShrink: 0, borderRadius: 14, background: cor, color: '#fefefe', display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: 18 }}>{c.score}</span>
                  <span style={{ minWidth: 0 }}>
                    <b style={{ display: 'block', fontSize: 15.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nome}</b>
                    <span style={{ fontSize: 14, color: cor, fontWeight: 700 }}>{c.oportunidades[0]?.oferecer}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Bloco>

        <Bloco area="tipos" atraso={380}>
          <Rot t="Tipo de conversa" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: 12, marginTop: 12 }}>
            {QUADRANTES.map((q) => {
              const n = p.noFiltro.filter((c) => quadranteDe(c) === q.id).length;
              const on = p.quad === q.id;
              return (
                <button key={q.id} type="button" onClick={() => p.setQuad(on ? '' : q.id)} title={q.frase}
                  style={{ border: on ? `2px solid ${q.cor}` : '2px solid transparent', background: `${q.cor}14`, borderRadius: 20, padding: '14px 16px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: TX }}>
                  <div style={{ fontSize: 40, fontWeight: 900, color: q.cor, lineHeight: 1 }}><Conta valor={n} /></div>
                  <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>{q.nome}</div>
                </button>
              );
            })}
          </div>
        </Bloco>

        <Bloco area="vend" atraso={440}>
          <Rot t={`Vendedores · ${p.mes.rotulo}`} />
          <div style={{ display: 'flex', gap: 14, marginTop: 14, overflowX: 'auto', paddingBottom: 4 }}>
            {p.vendedores.slice(0, 8).map(({ v, s }, i) => {
              const on = p.vend === v.nome;
              return (
                <button key={v.id} type="button" onClick={() => p.setVend(on ? '' : v.nome)} className="iv-entra"
                  style={{ animationDelay: `${i * 60}ms`, flex: '0 0 170px', border: on ? '2px solid #2563eb' : '2px solid transparent', background: 'var(--portal-bg-secondary, #f8fafc)', borderRadius: 20, padding: 14, cursor: 'pointer', textAlign: 'center', fontFamily: 'inherit', color: TX }}>
                  <span style={{ width: 52, height: 52, borderRadius: '50%', margin: '0 auto', background: 'linear-gradient(135deg, #60a5fa, #2563eb)', color: '#fefefe', display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: 18 }}>{iniciais(v.nome)}</span>
                  <div style={{ fontSize: 14.5, fontWeight: 800, marginTop: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.nome}</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#2563eb' }}>R$ <Conta valor={s.valorMaquinas} formato={compacto} /></div>
                </button>
              );
            })}
          </div>
        </Bloco>
      </div>
      {p.ficha && <FichaCliente c={p.ficha} onFechar={() => p.setFicha(null)} />}
    </div>
  );
}
