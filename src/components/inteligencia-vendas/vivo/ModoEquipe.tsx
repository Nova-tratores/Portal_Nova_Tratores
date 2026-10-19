'use client';
// =============================================================================
// Modo "Equipe" = Painel dos vendedores (molde do Painel dos técnicos da Janela
// Mecânicos), só com os vendedores ATIVOS:
//   1. escolhe o período (semana · mês · trimestre · ano, com setas)
//   2. a conta do período: máquinas e peças faturadas, propostas, ganhas/perdidas,
//      visitas — cada uma comparada com o período anterior
//   3. um cartão por vendedor, do que mais vendeu ao que menos vendeu
//   4. evolução em um gráfico (clicar na barra vai para aquele período)
//   5. ficha do vendedor com tudo que ele fez no período + o CRM
// =============================================================================
import { useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid } from 'recharts';
import type { LinhaEquipe, Situacao } from '@/lib/inteligencia-vendas/equipe';
import { andar, anteriorComparavel, conversao, periodo, serie, somar, variacao, type Escala, type Evento, type Soma } from '@/lib/inteligencia-vendas/painel-vendedores';
import { hojeBR } from '@/lib/inteligencia-vendas/normalizar';
import { DetalheVendedor } from '../Equipe';
import { BORDA, CARD, Cartao, ComoLer, Conta, FUNDO2, MUDO, TXT, compacto, iniciais } from './kit';

export interface DadosEquipe { linhas: LinhaEquipe[]; eventos: Evento[]; vendedores: { id: number; nome: string }[] }

const SIT: Record<Situacao, { rotulo: string; cor: string }> = {
  parado: { rotulo: 'parado no CRM', cor: '#ef4444' }, atencao: { rotulo: 'atenção no CRM', cor: '#f59e0b' },
  ativo: { rotulo: 'em dia no CRM', cor: '#16a34a' }, sem_crm: { rotulo: 'não usa o CRM', cor: '#94a3b8' },
};
const ESCALAS: [Escala, string][] = [['semana', 'Semana'], ['mes', 'Mês'], ['trimestre', 'Trimestre'], ['ano', 'Ano']];
type Metrica = 'valorMaquinas' | 'valorPecas' | 'propostas' | 'visitas';
const METRICAS: { id: Metrica; nome: string; cor: string; fmt: (v: number) => string }[] = [
  { id: 'valorMaquinas', nome: 'Máquinas faturadas', cor: '#dc2626', fmt: (v) => `R$ ${compacto(v)}` },
  { id: 'valorPecas', nome: 'Peças faturadas', cor: '#ea580c', fmt: (v) => `R$ ${compacto(v)}` },
  { id: 'propostas', nome: 'Propostas criadas', cor: '#ca8a04', fmt: (v) => String(Math.round(v)) },
  { id: 'visitas', nome: 'Visitas no CRM', cor: '#2563eb', fmt: (v) => String(Math.round(v)) },
];
const brl = (v: number) => `R$ ${compacto(v)}`;

export default function ModoEquipe({ dados }: { dados: DadosEquipe | null }) {
  const hoje = hojeBR();
  const [escala, setEscala] = useState<Escala>('mes');
  const [ref, setRef] = useState(hoje);
  const [metrica, setMetrica] = useState<Metrica>('valorMaquinas');
  const [todos, setTodos] = useState(false);
  const [ficha, setFicha] = useState<number | null>(null);
  const [crm, setCrm] = useState<LinhaEquipe | null>(null);

  const p = periodo(escala, ref);
  const pAnt = anteriorComparavel(escala, ref, hoje);
  const atual = periodo(escala, hoje).de === p.de;
  const ev = useMemo(() => dados?.eventos ?? [], [dados]);
  const total = somar(ev, p.de, p.ate);
  const totalAnt = somar(ev, pAnt.de, pAnt.ate);
  const semVendedor = somar(ev, p.de, p.ate, null);
  const hist = serie(ev, escala, ref, 8);

  const cartoes = (dados?.vendedores ?? []).map((v) => ({
    v, s: somar(ev, p.de, p.ate, v.id), ant: somar(ev, pAnt.de, pAnt.ate, v.id),
    hist: serie(ev, escala, ref, 8, v.id).map((x) => x.soma.valorMaquinas),
    linha: dados?.linhas.find((l) => l.id === v.id),
  })).filter((c) => todos || c.s.valorMaquinas + c.s.valorPecas + c.s.propostas + c.s.visitas + c.s.ganhas + c.s.perdidas > 0)
    .sort((a, b) => b.s.valorMaquinas - a.s.valorMaquinas || b.s.propostas - a.s.propostas || b.s.visitas - a.s.visitas);
  const escondidos = (dados?.vendedores.length ?? 0) - cartoes.length;
  const m = METRICAS.find((x) => x.id === metrica)!;

  return (
    <>
      <ComoLer chave="equipe-painel" titulo="Como ler o Painel dos vendedores" itens={[
        <><b>Escolha o período</b> em cima (semana, mês, trimestre ou ano) e ande com as setas. Tudo na tela muda junto. Só aparecem vendedores <b>ativos</b>.</>,
        <><b>A conta do período</b>: máquinas e peças faturadas no Omie, propostas criadas no portal, propostas ganhas e perdidas e visitas no CRM. A setinha compara com o período anterior.</>,
        <><b>Um cartão por vendedor</b>, do que mais vendeu máquina ao que menos vendeu. As barrinhas são as vendas de máquina dos últimos 8 períodos. A bolinha colorida mostra como ele está no CRM.</>,
        <><b>Clique no cartão</b> para ver tudo o que ele fez no período (cada venda, proposta e visita). <b>Clique numa barra</b> do gráfico de evolução para ir até aquele período.</>,
      ]} />
      {!dados && <div style={{ color: MUDO, padding: 30, textAlign: 'center' }}>Carregando os vendedores…</div>}
      {dados && <>
        <div className="iv-entra" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 14, background: CARD, border: `1px solid ${BORDA}` }}>
            {ESCALAS.map(([e, n]) => (
              <button key={e} type="button" onClick={() => setEscala(e)} style={{ border: 0, borderRadius: 10, padding: '7px 14px', fontWeight: 800, fontSize: 14.5, cursor: 'pointer', fontFamily: 'inherit', background: escala === e ? '#1d4ed8' : 'transparent', color: escala === e ? '#fefefe' : TXT, transition: 'all .2s' }}>{n}</button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 4, borderRadius: 14, background: CARD, border: `1px solid ${BORDA}` }}>
            <button type="button" onClick={() => setRef(andar(escala, ref, -1))} style={seta} aria-label="Período anterior"><i className="fas fa-chevron-left" /></button>
            <b key={p.de} className="iv-troca" style={{ fontSize: 17, color: TXT, minWidth: 170, textAlign: 'center' }}>{p.rotulo}</b>
            <button type="button" onClick={() => setRef(andar(escala, ref, 1))} disabled={atual} style={{ ...seta, opacity: atual ? .3 : 1 }} aria-label="Próximo período"><i className="fas fa-chevron-right" /></button>
          </div>
          {!atual && <button type="button" onClick={() => setRef(hoje)} style={{ ...seta, width: 'auto', padding: '0 12px', fontWeight: 800, fontSize: 14.5 }}>Hoje</button>}
          {atual && <span style={{ fontSize: 13.5, color: '#16a34a', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6 }}><span className="iv-pulso" style={{ ['--c' as string]: 'rgba(22,163,74,.6)', width: 8, height: 8, borderRadius: 8, background: '#16a34a' }} />período em andamento · setinhas comparam até o mesmo dia do anterior</span>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(190px, 100%), 1fr))', gap: 12, marginBottom: 14 }}>
          <Indicador titulo="Máquinas faturadas" valor={total.valorMaquinas} antes={totalAnt.valorMaquinas} fmt={brl} cor="#dc2626" destaque sub={`${total.maquinas} pedidos`} icone="fa-tractor" />
          <Indicador titulo="Peças faturadas" valor={total.valorPecas} antes={totalAnt.valorPecas} fmt={brl} cor="#ea580c" icone="fa-gears" atraso={60} sub={semVendedor.valorPecas ? `${brl(semVendedor.valorPecas)} sem vendedor no Omie` : undefined} />
          <Indicador titulo="Propostas criadas" valor={total.propostas} antes={totalAnt.propostas} cor="#ca8a04" icone="fa-file-signature" atraso={120} sub={brl(total.valorPropostas)} />
          <Indicador titulo="Ganhas · perdidas" valor={total.ganhas} antes={totalAnt.ganhas} cor="#16a34a" icone="fa-trophy" atraso={180}
            sub={`${total.perdidas} perdidas · conversão ${conversao(total) == null ? '—' : `${Math.round(conversao(total)! * 100)}%`}`} />
          <Indicador titulo="Visitas no CRM" valor={total.visitas} antes={totalAnt.visitas} cor="#2563eb" icone="fa-route" atraso={240} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 2px 10px', gap: 10, flexWrap: 'wrap' }}>
          <b style={{ fontSize: 17, color: TXT }}><i className="fas fa-ranking-star" style={{ color: '#1d4ed8', marginRight: 8 }} />Vendedores no período</b>
          {(escondidos > 0 || todos) && (
            <label style={{ fontSize: 14, color: MUDO, display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} />
              mostrar quem não teve movimento {escondidos > 0 && !todos ? `(${escondidos})` : ''}
            </label>
          )}
        </div>
        <div key={`${escala}-${p.de}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))', gap: 14, marginBottom: 14 }}>
          {cartoes.map((c, i) => <CartaVendedor key={c.v.id} {...c} pos={i} maxV={Math.max(1, cartoes[0]?.s.valorMaquinas || 0)} onAbrir={() => setFicha(c.v.id)} />)}
          {cartoes.length === 0 && <div style={{ color: MUDO, fontSize: 14.5, padding: 20 }}>Nenhum vendedor teve movimento neste período.</div>}
        </div>

        <Cartao titulo={<span><i className="fas fa-chart-column" style={{ color: '#1d4ed8', marginRight: 8 }} />Evolução — últimos 8 períodos</span>} atraso={120}
          extra={<div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {METRICAS.map((x) => (
              <button key={x.id} type="button" onClick={() => setMetrica(x.id)} style={{ border: `1px solid ${metrica === x.id ? x.cor : BORDA}`, background: metrica === x.id ? x.cor : 'transparent', color: metrica === x.id ? '#fefefe' : TXT, borderRadius: 999, padding: '4px 10px', fontSize: 13.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>{x.nome}</button>
            ))}
          </div>}>
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hist.map((h) => ({ nome: h.curto, v: h.soma[metrica], ref: h.ref, atual: h.de === p.de }))} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#94a3b833" />
                <XAxis dataKey="nome" tick={{ fontSize: 13.5, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => (metrica.startsWith('valor') ? compacto(v) : String(v))} tick={{ fontSize: 12.5, fill: '#64748b' }} axisLine={false} tickLine={false} width={56} />
                <Tooltip formatter={(v) => [m.fmt(Number(v)), m.nome]} cursor={{ fill: '#94a3b822' }} />
                <Bar dataKey="v" radius={[8, 8, 0, 0]} onClick={(d: { payload?: { ref?: string } }) => d?.payload?.ref && setRef(d.payload.ref)} style={{ cursor: 'pointer' }} animationDuration={900}>
                  {hist.map((h) => <Cell key={h.de} fill={m.cor} fillOpacity={h.de === p.de ? 1 : .45} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Cartao>
      </>}

      {ficha != null && dados && (
        <FichaPeriodo nome={dados.vendedores.find((v) => v.id === ficha)?.nome || ''} rotulo={p.rotulo}
          eventos={ev.filter((e) => e.v === ficha && e.d >= p.de && e.d <= p.ate)} s={somar(ev, p.de, p.ate, ficha)}
          linha={dados.linhas.find((l) => l.id === ficha)} onCrm={(l) => { setFicha(null); setCrm(l); }} onFechar={() => setFicha(null)} />
      )}
      {crm && <DetalheVendedor l={crm} onFechar={() => setCrm(null)} />}
    </>
  );
}

const seta: React.CSSProperties = { width: 34, height: 34, borderRadius: 10, border: 0, background: FUNDO2, color: TXT, cursor: 'pointer', fontFamily: 'inherit' };

function Delta({ agora, antes, claro }: { agora: number; antes: number; claro?: boolean }) {
  const d = variacao(agora, antes);
  if (d == null) return agora ? <span style={{ fontSize: 13, fontWeight: 800, opacity: .8 }}>novo</span> : null;
  const sobe = d >= 0;
  return (
    <span style={{ fontSize: 13, fontWeight: 900, color: claro ? '#fefefe' : sobe ? '#16a34a' : '#dc2626', whiteSpace: 'nowrap' }}>
      <i className={`fas fa-caret-${sobe ? 'up' : 'down'}`} /> {Math.abs(Math.round(d * 100))}%
    </span>
  );
}

function Indicador({ titulo, valor, antes, fmt = (v) => String(Math.round(v)), cor, sub, icone, atraso = 0, destaque }: {
  titulo: string; valor: number; antes: number; fmt?: (v: number) => string; cor: string; sub?: string; icone: string; atraso?: number; destaque?: boolean;
}) {
  return (
    <div className="iv-entra iv-kpi" style={{
      animationDelay: `${atraso}ms`, position: 'relative', overflow: 'hidden', borderRadius: 16, padding: '14px 16px', minWidth: 0,
      background: destaque ? `linear-gradient(135deg, ${cor}, ${cor}bb)` : CARD, color: destaque ? '#fefefe' : TXT,
      border: destaque ? 'none' : `1px solid ${BORDA}`, boxShadow: destaque ? `0 10px 24px ${cor}45` : '0 1px 3px rgba(15,23,42,.05)',
    }}>
      <i className={`fas ${icone}`} style={{ position: 'absolute', right: 14, top: 14, fontSize: 22, opacity: destaque ? .35 : .2, color: destaque ? '#fefefe' : cor }} />
      <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5, opacity: destaque ? .92 : .65 }}>{titulo}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 32, fontWeight: 900, color: destaque ? '#fefefe' : cor, fontVariantNumeric: 'tabular-nums' }}><Conta valor={valor} formato={fmt} /></span>
        <Delta agora={valor} antes={antes} claro={destaque} />
      </div>
      <div style={{ fontSize: 13.5, opacity: destaque ? .92 : .72 }}>{sub || `antes: ${fmt(antes)}`}</div>
    </div>
  );
}

function CartaVendedor({ v, s, ant, hist, linha, pos, maxV, onAbrir }: {
  v: { id: number; nome: string }; s: Soma; ant: Soma; hist: number[]; linha?: LinhaEquipe; pos: number; maxV: number; onAbrir: () => void;
}) {
  const sit = SIT[linha?.situacao ?? 'sem_crm'];
  const maxH = Math.max(1, ...hist);
  const medalha = s.valorMaquinas > 0 ? ['#eab308', '#94a3b8', '#b45309'][pos] : undefined;
  const conv = conversao(s);
  return (
    <button type="button" onClick={onAbrir} className="iv-entra iv-kpi" style={{ animationDelay: `${pos * 60}ms`, textAlign: 'left', background: CARD, border: `1px solid ${BORDA}`, borderRadius: 18, padding: 16, cursor: 'pointer', color: TXT, fontFamily: 'inherit', minWidth: 0, position: 'relative' }}>
      {medalha && <span title={`${pos + 1}º em máquinas no período`} style={{ position: 'absolute', right: 14, top: 12, width: 28, height: 28, borderRadius: '50%', background: medalha, color: '#fefefe', display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: 14.5, boxShadow: `0 4px 10px ${medalha}88` }}>{pos + 1}</span>}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ position: 'relative', width: 52, height: 52, flexShrink: 0, borderRadius: '50%', background: 'linear-gradient(135deg, #60a5fa, #1d4ed8)', color: '#fefefe', display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: 19 }}>
          {iniciais(v.nome)}
          <span className="iv-pulso" title={sit.rotulo} style={{ ['--c' as string]: `${sit.cor}99`, position: 'absolute', right: -1, bottom: -1, width: 15, height: 15, borderRadius: '50%', background: sit.cor, border: '2px solid #fefefe' }} />
        </div>
        <div style={{ minWidth: 0, paddingRight: 30 }}>
          <div style={{ fontWeight: 900, fontSize: 17, lineHeight: 1.2 }}>{v.nome}</div>
          <div style={{ fontSize: 13, color: sit.cor, fontWeight: 800 }}>{sit.rotulo}</div>
        </div>
      </div>
      <div style={{ marginTop: 12, fontSize: 12.5, color: MUDO, fontWeight: 800, textTransform: 'uppercase' }}>Máquinas faturadas</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 24, fontWeight: 900, color: '#dc2626' }}><Conta valor={s.valorMaquinas} formato={brl} /></span>
        <span style={{ fontSize: 13.5, color: MUDO }}>{s.maquinas} ped.</span>
        <Delta agora={s.valorMaquinas} antes={ant.valorMaquinas} />
      </div>
      <div style={{ height: 6, background: FUNDO2, borderRadius: 6, overflow: 'hidden', marginTop: 4 }}>
        <div className="iv-barra" style={{ height: '100%', width: `${(s.valorMaquinas / maxV) * 100}%`, background: 'linear-gradient(90deg, #f87171, #b91c1c)', borderRadius: 6 }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 30, marginTop: 10 }} title="Máquinas faturadas nos últimos 8 períodos">
        {hist.map((x, i) => <div key={i} className="iv-barrav" style={{ animationDelay: `${pos * 60 + i * 35}ms`, flex: 1, height: `${Math.max(6, (x / maxH) * 100)}%`, borderRadius: 3, background: x ? (i === 7 ? '#dc2626' : '#fca5a5') : FUNDO2 }} />)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5, marginTop: 10 }}>
        {[
          { t: 'Peças', v: s.valorPecas ? compacto(s.valorPecas) : '—' },
          { t: 'Propostas', v: String(s.propostas) },
          { t: 'Ganha/perd.', v: `${s.ganhas}/${s.perdidas}`, title: conv == null ? '' : `conversão ${Math.round(conv * 100)}%` },
          { t: 'Visitas', v: String(s.visitas) },
        ].map((x) => (
          <div key={x.t} title={x.title} style={{ background: FUNDO2, borderRadius: 9, padding: '5px 6px', minWidth: 0 }}>
            <div style={{ fontSize: 11.5, color: MUDO, fontWeight: 800, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.t}</div>
            <div style={{ fontSize: 15.5, fontWeight: 900 }}>{x.v}</div>
          </div>
        ))}
      </div>
    </button>
  );
}

const ROT: Record<Evento['t'], { nome: string; cor: string; icone: string }> = {
  maquina: { nome: 'Máquina faturada', cor: '#dc2626', icone: 'fa-tractor' },
  pecas: { nome: 'Peças faturadas', cor: '#ea580c', icone: 'fa-gears' },
  proposta: { nome: 'Proposta criada', cor: '#ca8a04', icone: 'fa-file-signature' },
  ganha: { nome: 'Proposta ganha', cor: '#16a34a', icone: 'fa-trophy' },
  perdida: { nome: 'Proposta perdida', cor: '#64748b', icone: 'fa-circle-xmark' },
  visita: { nome: 'Visita', cor: '#2563eb', icone: 'fa-location-dot' },
};

function FichaPeriodo({ nome, rotulo, eventos, s, linha, onCrm, onFechar }: {
  nome: string; rotulo: string; eventos: Evento[]; s: Soma; linha?: LinhaEquipe; onCrm: (l: LinhaEquipe) => void; onFechar: () => void;
}) {
  const [tipo, setTipo] = useState<Evento['t'] | ''>('');
  const lista = [...eventos].filter((e) => !tipo || e.t === tipo).sort((a, b) => b.d.localeCompare(a.d));
  return (
    <div onClick={onFechar} className="iv-entra" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 9000, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(720px, 100%)', height: '100%', overflowY: 'auto', background: 'var(--portal-bg, #f8fafc)' }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 2, background: 'linear-gradient(135deg, #60a5fa, #1d4ed8)', padding: '16px 18px', color: '#fefefe', display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'rgba(255,255,255,.22)', display: 'grid', placeItems: 'center', fontWeight: 900 }}>{iniciais(nome)}</div>
          <div style={{ flex: 1 }}><div style={{ fontSize: 20, fontWeight: 900 }}>{nome}</div><div style={{ fontSize: 14.5, opacity: .9 }}>{rotulo}</div></div>
          {linha && <button type="button" onClick={() => onCrm(linha)} style={{ border: 0, borderRadius: 10, padding: '8px 12px', background: 'rgba(255,255,255,.22)', color: '#fefefe', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>Ver CRM e alertas</button>}
          <button onClick={onFechar} aria-label="Fechar" style={{ border: 0, borderRadius: 10, width: 36, height: 36, background: 'rgba(255,255,255,.22)', color: '#fefefe', cursor: 'pointer' }}><i className="fas fa-xmark" /></button>
        </div>
        <div style={{ padding: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(130px, 100%), 1fr))', gap: 8, marginBottom: 14 }}>
            {[
              { t: 'Máquinas', v: brl(s.valorMaquinas), c: '#dc2626' }, { t: 'Peças', v: brl(s.valorPecas), c: '#ea580c' },
              { t: 'Propostas', v: String(s.propostas), c: '#ca8a04' }, { t: 'Ganhas / perdidas', v: `${s.ganhas} / ${s.perdidas}`, c: '#16a34a' },
              { t: 'Visitas', v: String(s.visitas), c: '#2563eb' },
            ].map((x) => (
              <div key={x.t} style={{ background: CARD, border: `1px solid ${BORDA}`, borderTop: `3px solid ${x.c}`, borderRadius: 12, padding: '8px 10px' }}>
                <div style={{ fontSize: 12.5, color: MUDO, fontWeight: 800, textTransform: 'uppercase' }}>{x.t}</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: x.c }}>{x.v}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            <button type="button" onClick={() => setTipo('')} style={chip(!tipo, '#1d4ed8')}>Tudo ({eventos.length})</button>
            {(Object.keys(ROT) as Evento['t'][]).filter((t) => eventos.some((e) => e.t === t)).map((t) => (
              <button key={t} type="button" onClick={() => setTipo(t)} style={chip(tipo === t, ROT[t].cor)}>{ROT[t].nome} ({eventos.filter((e) => e.t === t).length})</button>
            ))}
          </div>
          {lista.length === 0 && <div style={{ color: MUDO, fontSize: 14.5, padding: 20, textAlign: 'center' }}>Nada neste período.</div>}
          <div style={{ display: 'grid', gap: 6 }}>
            {lista.slice(0, 300).map((e, i) => (
              <div key={i} className="iv-entra iv-linha" style={{ animationDelay: `${Math.min(i, 15) * 25}ms`, display: 'flex', gap: 10, alignItems: 'center', background: CARD, border: `1px solid ${BORDA}`, borderRadius: 12, padding: '8px 12px' }}>
                <span style={{ width: 32, height: 32, borderRadius: 10, background: `${ROT[e.t].cor}1a`, color: ROT[e.t].cor, display: 'grid', placeItems: 'center', flexShrink: 0 }}><i className={`fas ${ROT[e.t].icone}`} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 800, color: TXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.desc || '—'}</div>
                  <div style={{ fontSize: 13, color: ROT[e.t].cor, fontWeight: 700 }}>{ROT[e.t].nome}</div>
                </div>
                {e.valor > 0 && <b style={{ fontSize: 14.5, color: TXT, whiteSpace: 'nowrap' }}>{e.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}</b>}
                <span style={{ fontSize: 13.5, color: MUDO, width: 44, textAlign: 'right' }}>{e.d.slice(8, 10)}/{e.d.slice(5, 7)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function chip(ativo: boolean, cor: string): React.CSSProperties {
  return { border: `1px solid ${ativo ? cor : BORDA}`, background: ativo ? cor : 'transparent', color: ativo ? '#fefefe' : TXT, borderRadius: 999, padding: '5px 11px', fontSize: 13.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' };
}
