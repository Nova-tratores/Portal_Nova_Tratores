'use client';
// Opção 4 · Um cliente por vez — o vendedor vê UM cliente grande, com tudo o que
// precisa para ligar, e marca "Liguei" ou "Pular"; o próximo entra deslizando.
// A fila fica ao lado. O que já foi feito hoje fica lembrado neste aparelho.
import { useEffect, useMemo, useState } from 'react';
import type { ClienteIV } from '@/lib/inteligencia-vendas/tipos';
import { hojeBR } from '@/lib/inteligencia-vendas/normalizar';
import { REGRAS } from '@/lib/inteligencia-vendas/regras';
import { QUADRANTES, quadranteDe, type Quadrante } from '../vivo/kit';
import { Acoes, Avatar, BD, CARD, EstilosOport, MU, SUAVE, SeloTipo, Temperatura, TX, foneBonito, reais, tipo, valorCliente } from './comum';

const dataBR = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');

export default function UmPorVez({ clientes, onFicha }: { clientes: ClienteIV[]; onFicha: (c: ClienteIV) => void }) {
  const chave = `iv-feitos-${hojeBR()}`;
  const [feitos, setFeitos] = useState<Record<string, 'liguei' | 'pulei'>>({});
  const [filtro, setFiltro] = useState<Quadrante | ''>('');
  const [atual, setAtual] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lembra o que já foi feito hoje neste aparelho
    try { setFeitos(JSON.parse(localStorage.getItem(chave) || '{}')); } catch { /* sem storage */ }
  }, [chave]);
  const marcar = (c: ClienteIV, v: 'liguei' | 'pulei') => {
    const n = { ...feitos, [c.chave]: v };
    setFeitos(n); setAtual(null);
    try { localStorage.setItem(chave, JSON.stringify(n)); } catch { /* ok */ }
  };

  const fila = useMemo(() => clientes.filter((c) => !filtro || quadranteDe(c) === filtro).sort((a, b) => b.score - a.score || valorCliente(b) - valorCliente(a)), [clientes, filtro]);
  const pendentes = fila.filter((c) => !feitos[c.chave]);
  const c = (atual && fila.find((x) => x.chave === atual)) || pendentes[0];
  const ligados = Object.values(feitos).filter((v) => v === 'liguei').length;
  const meta = 20;

  return (
    <div style={{ padding: '20px clamp(12px, 2vw, 28px)', background: SUAVE, minHeight: 'calc(100vh - 160px)' }}>
      <EstilosOport />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        {[{ id: '' as const, nome: 'Todos', cor: '#0f172a' }, ...QUADRANTES].map((q) => {
          const on = filtro === q.id;
          return (
            <button key={q.id || 'todos'} type="button" onClick={() => { setFiltro(q.id as Quadrante | ''); setAtual(null); }}
              style={{ border: `1px solid ${on ? q.cor : BD}`, background: on ? q.cor : CARD, color: on ? '#fefefe' : TX, borderRadius: 999, padding: '8px 16px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{q.nome}</button>
          );
        })}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, minWidth: 260 }}>
          <span style={{ fontSize: 15, color: TX, whiteSpace: 'nowrap' }}><b>{ligados}</b> de {meta} ligações hoje</span>
          <span style={{ flex: 1, height: 10, borderRadius: 10, background: '#e2e8f0', overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${Math.min(100, (ligados / meta) * 100)}%`, background: 'linear-gradient(90deg, #22c55e, #16a34a)', transition: 'width .6s cubic-bezier(.2,.8,.2,1)' }} />
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 360px)', gap: 18, alignItems: 'start' }} className="upv-grade">
        <style>{`@media (max-width: 980px) { .upv-grade { grid-template-columns: 1fr !important } }`}</style>
        {c ? (
          <article key={c.chave} className="op-troca" style={{ background: CARD, borderRadius: 22, border: `1px solid ${BD}`, boxShadow: '0 10px 30px rgba(15,23,42,.08)', overflow: 'hidden' }}>
            <div style={{ height: 6, background: tipo(c).cor }} />
            <div style={{ padding: 'clamp(18px, 2.4vw, 32px)' }}>
              <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
                <Avatar nome={c.nome} cor={tipo(c).cor} tam={68} />
                <div style={{ flex: 1, minWidth: 220 }}>
                  <h2 style={{ margin: 0, fontSize: 'clamp(22px, 2.2vw, 30px)', fontWeight: 800, color: TX, lineHeight: 1.2 }}>{c.nome}</h2>
                  <div style={{ fontSize: 16, color: MU, marginTop: 4 }}>{c.cidade}{c.vendedor ? ` · vendedor ${c.vendedor}` : ''}</div>
                  {c.telefone && <div style={{ fontSize: 20, fontWeight: 700, color: TX, marginTop: 6, letterSpacing: .3 }}>{foneBonito(c.telefone)}</div>}
                </div>
                <div style={{ display: 'grid', gap: 8, justifyItems: 'end' }}>
                  <SeloTipo c={c} grande />
                  <Temperatura score={c.score} />
                </div>
              </div>

              <div style={{ marginTop: 24, padding: '18px 20px', borderRadius: 16, background: `${tipo(c).cor}0f`, border: `1px solid ${tipo(c).cor}33` }}>
                <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: .8, textTransform: 'uppercase', color: tipo(c).cor }}>O que oferecer</div>
                <div style={{ fontSize: 'clamp(19px, 1.8vw, 24px)', fontWeight: 800, color: TX, marginTop: 4, lineHeight: 1.3 }}>{c.oportunidades[0]?.oferecer}</div>
              </div>

              <div style={{ marginTop: 22 }}>
                <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: .8, textTransform: 'uppercase', color: MU, marginBottom: 10 }}>Por que ligar</div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {c.oportunidades.map((o) => (
                    <div key={o.regra} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <span style={{ width: 10, height: 10, borderRadius: 10, marginTop: 7, flexShrink: 0, background: REGRAS[o.regra].cor }} />
                      <div><div style={{ fontSize: 17, fontWeight: 700, color: TX }}>{o.titulo}</div><div style={{ fontSize: 15, color: MU }}>{o.porque}</div></div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 22 }}>
                {[
                  { t: 'Último trator', v: c.ultimoTrator ? `${c.ultimoTrator.modelo} · ${c.anosUltimoTrator ? `${c.anosUltimoTrator} ${c.anosUltimoTrator === 1 ? 'ano' : 'anos'}` : 'comprado este ano'}` : 'nenhum conosco' },
                  { t: 'Peças em 12 meses', v: reais(c.pecas12m) },
                  { t: 'Propostas abertas', v: c.propostasAbertas ? `${c.propostasAbertas} · ${reais(c.valorPropostasAbertas)}` : 'nenhuma' },
                  { t: 'Última visita', v: dataBR(c.ultimaVisita) },
                ].map((x) => (
                  <div key={x.t} style={{ background: SUAVE, borderRadius: 12, padding: '10px 12px' }}>
                    <div style={{ fontSize: 12.5, color: MU, fontWeight: 700 }}>{x.t}</div>
                    <div style={{ fontSize: 16, color: TX, fontWeight: 700, marginTop: 2 }}>{x.v}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 26, flexWrap: 'wrap', alignItems: 'center' }}>
                <Acoes c={c} onFicha={() => onFicha(c)} />
                <span style={{ flex: 1 }} />
                <button type="button" onClick={() => marcar(c, 'pulei')} style={{ height: 46, padding: '0 20px', borderRadius: 12, border: `1px solid ${BD}`, background: CARD, color: TX, fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Pular</button>
                <button type="button" onClick={() => marcar(c, 'liguei')} style={{ height: 46, padding: '0 24px', borderRadius: 12, border: 0, background: '#16a34a', color: '#fefefe', fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 8px 20px rgba(22,163,74,.3)' }}><i className="fas fa-check" /> Liguei, próximo</button>
              </div>
            </div>
          </article>
        ) : (
          <div style={{ background: CARD, borderRadius: 22, border: `1px solid ${BD}`, padding: 60, textAlign: 'center', fontSize: 18, color: TX }}>
            <i className="fas fa-circle-check" style={{ fontSize: 44, color: '#16a34a' }} /><div style={{ marginTop: 12 }}>Fila vazia. Bom trabalho!</div>
          </div>
        )}

        <aside style={{ background: CARD, borderRadius: 22, border: `1px solid ${BD}`, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: .8, textTransform: 'uppercase', color: MU, margin: '2px 4px 10px' }}>Próximos · {pendentes.length}</div>
          <div style={{ display: 'grid', gap: 6, maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' }}>
            {pendentes.filter((x) => x.chave !== c?.chave).slice(0, 25).map((x) => (
              <button key={x.chave} type="button" onClick={() => setAtual(x.chave)} className="op-item"
                style={{ display: 'flex', gap: 10, alignItems: 'center', textAlign: 'left', border: 0, background: 'transparent', borderRadius: 12, padding: '8px 8px', cursor: 'pointer', fontFamily: 'inherit', color: TX }}>
                <Avatar nome={x.nome} cor={tipo(x).cor} tam={36} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <b style={{ display: 'block', fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.nome}</b>
                  <span style={{ fontSize: 13, color: tipo(x).cor, fontWeight: 600 }}>{tipo(x).nome}</span>
                </span>
                <Temperatura score={x.score} />
              </button>
            ))}
          </div>
          {Object.keys(feitos).length > 0 && (
            <button type="button" onClick={() => { setFeitos({}); try { localStorage.removeItem(chave); } catch { /* ok */ } }}
              style={{ marginTop: 10, width: '100%', border: 0, background: 'none', color: MU, fontSize: 13.5, cursor: 'pointer', textDecoration: 'underline' }}>recomeçar a fila de hoje</button>
          )}
        </aside>
      </div>
    </div>
  );
}
