'use client';
// Modo "Radar" (oportunidades + o que espera retorno nosso), em dois estilos:
//   estilo 'radar'   → radar animado + "Ligue primeiro" ao lado
//   estilo 'cartoes' → 4 colunas (uma por tipo de conversa) com cartões que giram
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { ClienteIV } from '@/lib/inteligencia-vendas/tipos';
import type { ItemRetorno } from '@/lib/inteligencia-vendas/retorno';
import { ROTULO_MOTIVO } from '@/lib/inteligencia-vendas/retorno';
import FichaCliente from '../FichaCliente';
import RadarClientes from './RadarClientes';
import { BORDA, CARD, Cartao, ComoLer, FUNDO2, KpiVivo, MUDO, QUADRANTES, TXT, compacto, corQ, quadranteDe, type Quadrante } from './kit';

export default function ModoRadar({ clientes, retorno, estilo }: { clientes: ClienteIV[]; retorno: ItemRetorno[] | null; estilo: 'radar' | 'cartoes' }) {
  const [filtro, setFiltro] = useState<Quadrante | ''>('');
  const [ficha, setFicha] = useState<ClienteIV | null>(null);
  const comOp = useMemo(() => clientes.filter((c) => c.oportunidades.length > 0), [clientes]);
  const quentes = comOp.filter((c) => c.score >= 50).length;
  const urgentes = (retorno ?? []).filter((i) => i.gravidade === 3);
  const valorAberto = clientes.reduce((s, c) => s + c.valorPropostasAbertas, 0);
  const lista = useMemo(() => comOp.filter((c) => !filtro || quadranteDe(c) === filtro).sort((a, b) => b.score - a.score), [comOp, filtro]);

  return (
    <>
      <ComoLer chave={`radar-${estilo}`} titulo="Como ler o Radar" itens={estilo === 'radar' ? [
        <><b>Cada ponto é um cliente</b> que tem um motivo para receber uma ligação. São {comOp.length.toLocaleString('pt-BR')} hoje, achados cruzando vendas, oficina, propostas e o CRM.</>,
        <><b>Quanto mais perto do centro, mais quente.</b> Pontos que pulsam têm score 50 ou mais: ligue primeiro.</>,
        <><b>O lado diz o tipo de conversa:</b> Renovar o trator, Vender mais (implemento), Conquistar (usa outra marca) ou Recuperar (sumiu, perdeu ou parou).</>,
        <><b>Ponto maior</b> = cliente que movimenta mais dinheiro com a gente. <b>Passe o mouse</b> para ver o motivo; <b>clique</b> para abrir a ficha.</>,
      ] : [
        <><b>Cada coluna é um tipo de conversa</b>: Renovar, Vender mais, Conquistar e Recuperar. O número grande é quantos clientes caem nela.</>,
        <><b>O cartão grande gira sozinho</b> mostrando os clientes mais quentes da coluna, com o motivo e o que oferecer. Clique para abrir a ficha.</>,
        <><b>Embaixo de cada coluna</b> estão os próximos da fila. O score (0 a 100) soma todos os motivos do cliente.</>,
        <><b>&quot;Esperando retorno nosso&quot;</b> são propostas e visitas em que o cliente está esperando a gente voltar.</>,
      ]} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(190px, 100%), 1fr))', gap: 12, marginBottom: 14 }}>
        <KpiVivo titulo="Clientes no radar" valor={comOp.length} cor="#ef4444" destaque icone="fa-satellite-dish" sub="com motivo para ligar" />
        <KpiVivo titulo="Quentes (score 50+)" valor={quentes} cor="#ef4444" icone="fa-fire" atraso={80} sub="ligar esta semana" />
        <KpiVivo titulo="Esperando retorno nosso" valor={urgentes.length} cor="#f59e0b" icone="fa-hourglass-half" atraso={160} sub={retorno ? `de ${retorno.length} na fila` : 'carregando…'} />
        <KpiVivo titulo="Em propostas abertas" valor={valorAberto} formato={(v) => `R$ ${compacto(v)}`} cor="#16a34a" icone="fa-file-signature" atraso={240} />
      </div>

      {estilo === 'radar' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(440px, 100%), 1fr))', gap: 14, alignItems: 'start' }}>
          <Cartao titulo={<span><i className="fas fa-satellite-dish" style={{ color: '#ef4444', marginRight: 8 }} />Radar de clientes</span>}
            extra={filtro ? <button onClick={() => setFiltro('')} style={pilula(corQ(filtro), true)}>{QUADRANTES.find((q) => q.id === filtro)!.nome} ✕</button> : <span style={{ fontSize: 12, color: MUDO }}>clique num lado para filtrar</span>}>
            <RadarClientes clientes={comOp} filtro={filtro} onFiltro={setFiltro} onAbrir={setFicha} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 8, marginTop: 10 }}>
              {QUADRANTES.map((q) => (
                <button key={q.id} onClick={() => setFiltro(filtro === q.id ? '' : q.id)} style={{ textAlign: 'left', border: `1px solid ${filtro === q.id ? q.cor : BORDA}`, background: filtro === q.id ? `${q.cor}14` : 'transparent', borderRadius: 12, padding: '8px 10px', cursor: 'pointer', color: TXT, fontFamily: 'inherit' }}>
                  <b style={{ color: q.cor, fontSize: 13 }}>● {q.nome}</b>
                  <div style={{ fontSize: 12, color: MUDO, marginTop: 2 }}>{q.frase}</div>
                </button>
              ))}
            </div>
          </Cartao>
          <Cartao titulo={<span><i className="fas fa-phone-volume" style={{ color: '#ef4444', marginRight: 8 }} />Ligue primeiro</span>} atraso={120}
            extra={<span style={{ fontSize: 12, color: MUDO }}>{lista.length} clientes</span>}>
            <div style={{ display: 'grid', gap: 8, maxHeight: 640, overflowY: 'auto', paddingRight: 4 }}>
              {lista.slice(0, 25).map((c, i) => <LinhaCliente key={c.chave} c={c} i={i} onAbrir={setFicha} />)}
            </div>
          </Cartao>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: 14 }}>
          {QUADRANTES.map((q, i) => (
            <ColunaGira key={q.id} q={q} clientes={comOp.filter((c) => quadranteDe(c) === q.id).sort((a, b) => b.score - a.score)} atraso={i * 90} onAbrir={setFicha} />
          ))}
        </div>
      )}

      <Cartao titulo={<span><i className="fas fa-hourglass-half" style={{ color: '#f59e0b', marginRight: 8 }} />Esperando retorno nosso</span>} atraso={200} style={{ marginTop: 14 }}
        extra={<Link href="/inteligencia-vendas/retorno" style={{ fontSize: 12.5, color: '#ef4444', fontWeight: 800, textDecoration: 'none' }}>ver a fila inteira →</Link>}>
        {!retorno && <div style={{ color: MUDO, fontSize: 13 }}>Carregando…</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))', gap: 10 }}>
          {urgentes.slice(0, 9).map((r, i) => (
            <div key={`${r.origem}-${r.id}`} className="iv-entra" style={{ animationDelay: `${i * 50}ms`, border: `1px solid ${BORDA}`, borderLeft: '4px solid #f59e0b', borderRadius: 12, padding: '9px 12px', background: CARD }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <b style={{ fontSize: 13.5, color: TXT }}>{r.cliente || '—'}</b>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#16a34a', whiteSpace: 'nowrap' }}>{r.valor ? `R$ ${compacto(r.valor)}` : ''}</span>
              </div>
              <div style={{ fontSize: 12.5, color: MUDO }}>{r.oque}</div>
              <div style={{ fontSize: 12, marginTop: 4, color: TXT }}><span style={{ color: '#d97706', fontWeight: 800 }}>{ROTULO_MOTIVO[r.motivo]}</span> · {r.detalhe}</div>
              <div style={{ fontSize: 11.5, color: r.vendedor ? MUDO : '#ef4444', marginTop: 2, fontWeight: r.vendedor ? 400 : 800 }}>{r.vendedor || 'Sem vendedor'}</div>
            </div>
          ))}
        </div>
      </Cartao>
      {ficha && <FichaCliente c={ficha} onFechar={() => setFicha(null)} />}
    </>
  );
}

function pilula(cor: string, ativo: boolean): React.CSSProperties {
  return { border: `1px solid ${cor}`, background: ativo ? cor : 'transparent', color: ativo ? '#fefefe' : cor, borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 800, cursor: 'pointer' };
}

function Anel({ v, cor, tam = 44 }: { v: number; cor: string; tam?: number }) {
  const r = tam / 2 - 4, total = 2 * Math.PI * r;
  return (
    <svg width={tam} height={tam} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={tam / 2} cy={tam / 2} r={r} fill="none" stroke={FUNDO2} strokeWidth="5" />
      <circle cx={tam / 2} cy={tam / 2} r={r} fill="none" stroke={cor} strokeWidth="5" strokeLinecap="round" className="iv-anel"
        strokeDasharray={total} strokeDashoffset={total * (1 - Math.min(100, v) / 100)} style={{ ['--total' as string]: total }} />
      <text x={tam / 2} y={tam / 2} transform={`rotate(90 ${tam / 2} ${tam / 2})`} textAnchor="middle" dominantBaseline="central" fontSize="13" fontWeight="900" fill={cor}>{v}</text>
    </svg>
  );
}

function LinhaCliente({ c, i, onAbrir }: { c: ClienteIV; i: number; onAbrir: (c: ClienteIV) => void }) {
  const q = quadranteDe(c)!;
  const o = c.oportunidades[0];
  return (
    <button type="button" onClick={() => onAbrir(c)} className="iv-entra iv-linha"
      style={{ animationDelay: `${Math.min(i, 12) * 45}ms`, display: 'flex', gap: 12, alignItems: 'center', textAlign: 'left', width: '100%', border: `1px solid ${BORDA}`, borderLeft: `4px solid ${corQ(q)}`, borderRadius: 12, padding: '9px 12px', background: CARD, cursor: 'pointer', color: TXT, fontFamily: 'inherit' }}>
      <Anel v={c.score} cor={corQ(q)} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 800, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nome}</div>
        <div style={{ fontSize: 12, color: MUDO }}>{c.cidade}{c.vendedor ? ` · ${c.vendedor}` : ''}</div>
        <div style={{ fontSize: 12.5, marginTop: 3 }}>{o?.titulo}</div>
        <div style={{ fontSize: 12.5, color: corQ(q), fontWeight: 700 }}>→ {o?.oferecer}</div>
      </div>
    </button>
  );
}

function ColunaGira({ q, clientes, atraso, onAbrir }: { q: (typeof QUADRANTES)[number]; clientes: ClienteIV[]; atraso: number; onAbrir: (c: ClienteIV) => void }) {
  const [idx, setIdx] = useState(0);
  const [pausa, setPausa] = useState(false);
  const top = clientes.slice(0, 8);
  useEffect(() => {
    if (pausa || top.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % top.length), 4500);
    return () => clearInterval(t);
  }, [pausa, top.length]);
  const c = top[idx % Math.max(1, top.length)];
  return (
    <section className="iv-entra" style={{ animationDelay: `${atraso}ms`, background: CARD, border: `1px solid ${BORDA}`, borderRadius: 18, overflow: 'hidden', minWidth: 0 }}
      onMouseEnter={() => setPausa(true)} onMouseLeave={() => setPausa(false)}>
      <div style={{ background: `linear-gradient(135deg, ${q.cor}, ${q.cor}aa)`, color: '#fefefe', padding: '14px 16px' }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: .6, textTransform: 'uppercase', opacity: .9 }}>{q.nome}</div>
        <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 1.1 }}>{clientes.length}<span style={{ fontSize: 14, fontWeight: 700, opacity: .85 }}> clientes</span></div>
        <div style={{ fontSize: 12.5, opacity: .92 }}>{q.frase}</div>
      </div>
      <div style={{ padding: 14 }}>
        {c ? (
          <button key={c.chave} type="button" onClick={() => onAbrir(c)} className="iv-troca"
            style={{ width: '100%', textAlign: 'left', border: `1px solid ${q.cor}55`, background: `${q.cor}0f`, borderRadius: 14, padding: 12, cursor: 'pointer', color: TXT, fontFamily: 'inherit', minHeight: 150 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Anel v={c.score} cor={q.cor} tam={50} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 900, fontSize: 14.5 }}>{c.nome}</div>
                <div style={{ fontSize: 12, color: MUDO }}>{c.cidade}</div>
              </div>
            </div>
            <div style={{ fontSize: 13, marginTop: 8 }}>{c.oportunidades[0]?.porque}</div>
            <div style={{ fontSize: 13, marginTop: 4, color: q.cor, fontWeight: 800 }}>→ {c.oportunidades[0]?.oferecer}</div>
          </button>
        ) : <div style={{ color: MUDO, fontSize: 13 }}>Nenhum cliente aqui.</div>}
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center', margin: '8px 0' }}>
          {top.map((_, i) => <span key={i} onClick={() => setIdx(i)} style={{ width: i === idx ? 18 : 6, height: 6, borderRadius: 6, background: i === idx ? q.cor : FUNDO2, transition: 'width .3s', cursor: 'pointer' }} />)}
        </div>
        <div style={{ display: 'grid', gap: 4 }}>
          {clientes.slice(8, 14).map((x) => (
            <button key={x.chave} type="button" onClick={() => onAbrir(x)} className="iv-linha" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, border: 0, background: 'none', padding: '5px 6px', borderRadius: 8, cursor: 'pointer', color: TXT, fontSize: 12.5, fontFamily: 'inherit', textAlign: 'left' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>{x.nome}</span><b style={{ color: q.cor, flexShrink: 0 }}>{x.score}</b>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
