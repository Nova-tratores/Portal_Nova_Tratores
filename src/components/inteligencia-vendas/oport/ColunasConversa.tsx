'use client';
// Opção 3 · Colunas por conversa — quadro com 4 colunas (Renovar, Vender mais,
// Conquistar, Recuperar). Cada coluna diz em uma linha o que é; cada cartão diz
// quem, por quê e o que oferecer, com Ligar / WhatsApp.
import { useState } from 'react';
import type { ClienteIV } from '@/lib/inteligencia-vendas/tipos';
import { QUADRANTES, quadranteDe } from '../vivo/kit';
import { Acoes, BD, CARD, EstilosOport, MU, SUAVE, Temperatura, TX, reais, valorCliente } from './comum';

export default function ColunasConversa({ clientes, onFicha }: { clientes: ClienteIV[]; onFicha: (c: ClienteIV) => void }) {
  const [soQuentes, setSoQuentes] = useState(false);
  const base = clientes.filter((c) => !soQuentes || c.score >= 35);
  return (
    <div style={{ padding: '18px clamp(12px, 2vw, 28px)', background: SUAVE, minHeight: 'calc(100vh - 160px)' }}>
      <EstilosOport />
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 16, color: TX }}><b>{base.length}</b> clientes para ligar, separados pelo tipo de conversa</span>
        <label style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 15, color: TX, cursor: 'pointer', background: CARD, border: `1px solid ${BD}`, borderRadius: 999, padding: '7px 14px' }}>
          <input type="checkbox" checked={soQuentes} onChange={(e) => setSoQuentes(e.target.checked)} /> Só mornos e quentes
        </label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(270px, 1fr))', gap: 16, overflowX: 'auto', paddingBottom: 8 }}>
        {QUADRANTES.map((q, qi) => {
          const lista = base.filter((c) => quadranteDe(c) === q.id).sort((a, b) => b.score - a.score || valorCliente(b) - valorCliente(a));
          return (
            <section key={q.id} className="op-entra" style={{ animationDelay: `${qi * 80}ms`, display: 'flex', flexDirection: 'column', minWidth: 0, background: CARD, borderRadius: 18, border: `1px solid ${BD}`, overflow: 'hidden' }}>
              <header style={{ padding: '16px 18px 14px', borderTop: `5px solid ${q.cor}` }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <h3 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: TX }}>{q.nome}</h3>
                  <span style={{ fontSize: 15, fontWeight: 800, color: q.cor, background: `${q.cor}14`, borderRadius: 999, padding: '1px 10px' }}>{lista.length}</span>
                </div>
                <p style={{ margin: '6px 0 0', fontSize: 14, color: MU, lineHeight: 1.45 }}>{q.frase}</p>
              </header>
              <div style={{ padding: '0 12px 12px', display: 'grid', gap: 10, overflowY: 'auto', maxHeight: 'calc(100vh - 330px)' }}>
                {lista.slice(0, 40).map((c, i) => {
                  const o = c.oportunidades[0];
                  return (
                    <article key={c.chave} onClick={() => onFicha(c)} className="op-entra op-item"
                      style={{ animationDelay: `${qi * 80 + Math.min(i, 8) * 35}ms`, background: CARD, border: `1px solid ${BD}`, borderRadius: 14, padding: 14, cursor: 'pointer' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 15.5, fontWeight: 700, color: TX, lineHeight: 1.3 }}>{c.nome}</div>
                          <div style={{ fontSize: 13, color: MU }}>{c.cidade.replace(/\s*\(..\)$/, '')}</div>
                        </div>
                        <Temperatura score={c.score} />
                      </div>
                      <div style={{ fontSize: 14.5, color: TX, marginTop: 10, lineHeight: 1.4 }}>{o?.titulo}</div>
                      <div style={{ fontSize: 14, color: q.cor, fontWeight: 700, marginTop: 4, lineHeight: 1.35 }}>→ {o?.oferecer}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 8 }}>
                        <span style={{ fontSize: 13.5, color: MU }}>{reais(valorCliente(c))}{c.vendedor ? ` · ${c.vendedor.split(' ')[0]}` : ''}</span>
                        <Acoes c={c} onFicha={() => onFicha(c)} compacto />
                      </div>
                    </article>
                  );
                })}
                {lista.length > 40 && <div style={{ textAlign: 'center', fontSize: 13.5, color: MU, padding: 6 }}>+{lista.length - 40} na lista completa</div>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
