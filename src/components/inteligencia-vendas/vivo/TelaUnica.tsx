'use client';
// =============================================================================
// Tela única da Inteligência de Vendas (José, 19/10/2026: "oportunidades,
// municípios, tudo na mesma tela, interativo, com animações, preenchendo a tela").
//
// Tudo ligado por FILTROS CRUZADOS — clicar em qualquer coisa filtra o resto:
//   • lado do radar ......... tipo de conversa (Renovar · Vender mais · Conquistar · Recuperar)
//   • bolha do mapa ......... município
//   • cartão do vendedor .... carteira daquele vendedor
// Os números do topo, o radar, a lista "Ligue primeiro", o mapa e a fila
// "Esperando retorno" mudam juntos.
// =============================================================================
import { useEffect, useMemo, useState } from 'react';
import type { ClienteIV } from '@/lib/inteligencia-vendas/tipos';
import type { ItemRetorno } from '@/lib/inteligencia-vendas/retorno';
import { ROTULO_MOTIVO } from '@/lib/inteligencia-vendas/retorno';
import type { MunicipioIV } from '@/lib/inteligencia-vendas/municipios';
import { mesmoVendedor } from '@/lib/inteligencia-vendas/equipe';
import { periodo, somar } from '@/lib/inteligencia-vendas/painel-vendedores';
import { chaveCidade, hojeBR, textoNorm } from '@/lib/inteligencia-vendas/normalizar';
import { apiGet } from '../ui';
import FichaCliente from '../FichaCliente';
import RadarClientes from './RadarClientes';
import MapaBolhas, { corFoco } from './MapaBolhas';
import type { DadosEquipe } from './ModoEquipe';
import { BORDA, CARD, Cartao, ComoLer, Conta, EstilosIV, FUNDO2, MUDO, QUADRANTES, TXT, compacto, corQ, iniciais, quadranteDe, type Quadrante } from './kit';

const chaveMun = (m: MunicipioIV) => `${textoNorm(m.nome)}|${m.uf}`;

export default function TelaUnica() {
  const [clientes, setClientes] = useState<ClienteIV[] | null>(null);
  const [retorno, setRetorno] = useState<ItemRetorno[] | null>(null);
  const [municipios, setMunicipios] = useState<MunicipioIV[] | null>(null);
  const [equipe, setEquipe] = useState<DadosEquipe | null>(null);
  const [erro, setErro] = useState('');
  const [quad, setQuad] = useState<Quadrante | ''>('');
  const [mun, setMun] = useState<MunicipioIV | null>(null);
  const [vend, setVend] = useState<string>('');
  const [ficha, setFicha] = useState<ClienteIV | null>(null);
  const hoje = hojeBR();

  useEffect(() => {
    const t = setTimeout(() => {
      apiGet('/api/inteligencia-vendas/base').then((j) => setClientes(j.clientes)).catch((e) => setErro(e.message));
      apiGet('/api/inteligencia-vendas/retorno').then((j) => setRetorno(j.itens)).catch(() => setRetorno([]));
      apiGet('/api/inteligencia-vendas/municipios').then((j) => setMunicipios(j.municipios)).catch(() => setMunicipios([]));
      apiGet('/api/inteligencia-vendas/equipe').then(setEquipe).catch(() => setEquipe({ linhas: [], eventos: [], vendedores: [] }));
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // ── filtros cruzados ──────────────────────────────────────────────────────
  const passaMunVend = (c: ClienteIV) => (!mun || c.chaveCidade === chaveMun(mun)) && (!vend || mesmoVendedor(c.vendedor, vend));
  const base = useMemo(() => (clientes ?? []).filter((c) => c.oportunidades.length > 0), [clientes]);
  const noFiltro = base.filter(passaMunVend);
  const lista = noFiltro.filter((c) => !quad || quadranteDe(c) === quad).sort((a, b) => b.score - a.score);
  const fila = (retorno ?? []).filter((r) => (!mun || chaveCidade(r.cidade) === chaveMun(mun)) && (!vend || mesmoVendedor(r.vendedor, vend)));
  const urgentes = fila.filter((r) => r.gravidade === 3);
  const contaMun = (m: MunicipioIV) => base.filter((c) => c.chaveCidade === chaveMun(m) && (!quad || quadranteDe(c) === quad) && (!vend || mesmoVendedor(c.vendedor, vend))).length;

  const mes = periodo('mes', hoje);
  const vendedores = (equipe?.vendedores ?? []).map((v) => ({
    v, s: somar(equipe!.eventos, mes.de, mes.ate, v.id), linha: equipe!.linhas.find((l) => l.id === v.id),
    carteira: base.filter((c) => mesmoVendedor(c.vendedor, v.nome)).length,
  })).filter((x) => x.s.valorMaquinas + x.s.propostas + x.s.visitas + x.carteira > 0)
    .sort((a, b) => b.s.valorMaquinas - a.s.valorMaquinas || b.carteira - a.carteira);
  const totalMes = equipe ? somar(equipe.eventos, mes.de, mes.ate) : null;

  const filtros = [
    quad && { k: 'q', t: QUADRANTES.find((q) => q.id === quad)!.nome, cor: corQ(quad), limpa: () => setQuad('') },
    mun && { k: 'm', t: mun.nome, cor: corFoco(mun.foco), limpa: () => setMun(null) },
    vend && { k: 'v', t: vend, cor: '#1d4ed8', limpa: () => setVend('') },
  ].filter(Boolean) as { k: string; t: string; cor: string; limpa: () => void }[];

  return (
    <div style={{ padding: 'clamp(12px, 1.6vw, 24px) clamp(12px, 2vw, 28px) 40px', width: '100%', boxSizing: 'border-box', minWidth: 0, background: 'var(--portal-bg, #f8fafc)' }}>
      <EstilosIV />
      <ComoLer chave="tela-unica" titulo="Como usar esta tela" itens={[
        <><b>Tudo está ligado.</b> Clique num <b>lado do radar</b>, numa <b>bolha do mapa</b> ou num <b>vendedor</b> e a tela inteira passa a mostrar só aquilo. Os filtros aparecem em cima; o ✕ tira.</>,
        <><b>Radar:</b> cada ponto é um cliente com motivo para ligar. Perto do centro = mais quente; o lado diz o tipo de conversa. Passe o mouse para ver o motivo, clique para abrir a ficha.</>,
        <><b>Mapa:</b> os 45 municípios da loja no lugar de verdade. Bolha maior = mais área plantada; cor = foco (vermelho = mercado grande e pouca presença nossa); anel verde = nossa presença. As linhas saem da loja até os 5 de maior foco.</>,
        <><b>Embaixo:</b> os vendedores no mês (máquinas faturadas, propostas, visitas e carteira) e as propostas em que o cliente espera a gente voltar.</>,
      ]} />

      <Resumo clientes={noFiltro} urgentes={urgentes} municipios={municipios} vendedores={vendedores} mes={mes.rotulo} filtros={filtros.map((x) => x.t)} />

      {/* números do topo (mudam com os filtros) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(170px, 100%), 1fr))', gap: 12, marginBottom: 12 }}>
        <Numero t="Clientes para ligar" v={noFiltro.length} cor="#ef4444" destaque icone="fa-satellite-dish" sub={filtros.length ? 'no filtro escolhido' : 'clientes com algum motivo para receber uma ligação'} />
        <Numero t="Quentes (score 50+)" v={noFiltro.filter((c) => c.score >= 50).length} cor="#ef4444" icone="fa-fire" a={60} sub="os mais urgentes: ligar esta semana" />
        <Numero t="Em propostas abertas" v={noFiltro.reduce((s, c) => s + c.valorPropostasAbertas, 0)} fmt={(x) => `R$ ${compacto(x)}`} cor="#16a34a" icone="fa-file-signature" a={120} sub="valor das propostas que ainda não fecharam" />
        <Numero t="Esperando retorno" v={urgentes.length} cor="#f59e0b" icone="fa-hourglass-half" a={180} sub={`propostas e visitas paradas, de ${fila.length} na fila`} />
        <Numero t={`Máquinas faturadas · ${mes.rotulo}`} v={totalMes?.valorMaquinas ?? 0} fmt={(x) => `R$ ${compacto(x)}`} cor="#1d4ed8" icone="fa-tractor" a={240} sub={totalMes ? `${totalMes.maquinas} pedidos` : ''} />
        <Numero t="Área plantada (IBGE)" v={(mun ? [mun] : municipios ?? []).reduce((s, m) => s + m.areaPlantadaHa, 0)} fmt={(x) => `${compacto(x)} ha`} cor="#15803d" icone="fa-seedling" a={300} sub={mun ? mun.nome : '45 municípios da loja'} />
      </div>

      {/* filtros ativos */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', minHeight: 34, marginBottom: 10 }}>
        <span style={{ fontSize: 14, color: MUDO, fontWeight: 700 }}><i className="fas fa-filter" /> {filtros.length ? 'Mostrando:' : 'Sem filtro — clique em qualquer coisa para filtrar'}</span>
        {filtros.map((f) => (
          <button key={f.k} type="button" onClick={f.limpa} className="iv-entra" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 0, borderRadius: 999, padding: '6px 12px', background: f.cor, color: '#fefefe', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', boxShadow: `0 4px 12px ${f.cor}55` }}>
            {f.t} <i className="fas fa-xmark" />
          </button>
        ))}
        {filtros.length > 1 && <button type="button" onClick={() => { setQuad(''); setMun(null); setVend(''); }} style={{ border: 0, background: 'none', color: '#ef4444', fontWeight: 800, cursor: 'pointer', fontSize: 14 }}>limpar tudo</button>}
      </div>
      {erro && <div style={{ padding: 12, borderRadius: 12, background: 'rgba(239,68,68,.1)', color: '#b91c1c', marginBottom: 12, fontSize: 14.5 }}>{erro}</div>}

      {/* radar · mapa · ligue primeiro */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', gap: 14, alignItems: 'stretch', marginBottom: 14 }}>
        <Cartao titulo={<span><i className="fas fa-satellite-dish" style={{ color: '#ef4444', marginRight: 8 }} />Radar de clientes</span>}
          extra={<span style={{ fontSize: 13.5, color: MUDO }}>clique num lado</span>}
          sub="Cada ponto é um cliente. Quanto mais perto do centro, mais urgente ligar. O lado mostra o tipo de conversa.">
          {clientes && <LegendaRadar />}
          {clientes ? <RadarClientes clientes={noFiltro} filtro={quad} onFiltro={setQuad} onAbrir={setFicha} /> : <Girando texto="Ligando o radar…" />}
        </Cartao>
        <Cartao titulo={<span><i className="fas fa-map-location-dot" style={{ color: '#15803d', marginRight: 8 }} />Onde está o mercado</span>} atraso={80}
          extra={<span style={{ fontSize: 13.5, color: MUDO }}>clique numa bolha</span>}
          sub="Os 45 municípios da loja no lugar de verdade. Vermelho = muito mercado e pouca presença nossa: é onde focar.">
          {municipios ? (
            <>
              <MapaBolhas municipios={municipios} selecionado={mun?.ibge ?? null} onSelecionar={setMun} contagem={contaMun} />
              {mun && <DetalheMun m={mun} />}
            </>
          ) : <Girando texto="Buscando IBGE e CAR…" />}
        </Cartao>
        <Cartao titulo={<span><i className="fas fa-phone-volume" style={{ color: '#ef4444', marginRight: 8 }} />Ligue primeiro</span>} atraso={160}
          extra={<span style={{ fontSize: 13.5, color: MUDO }}>{lista.length} clientes</span>} style={{ display: 'flex', flexDirection: 'column' }}
          sub="Os clientes mais quentes primeiro. O número no círculo é o score (0 a 100); a linha colorida diz o que oferecer.">
          <div style={{ display: 'grid', gap: 8, maxHeight: 620, overflowY: 'auto', paddingRight: 4 }}>
            {lista.slice(0, 40).map((c, i) => <LinhaCliente key={c.chave} c={c} i={i} onAbrir={setFicha} />)}
            {clientes && lista.length === 0 && <div style={{ color: MUDO, fontSize: 14.5, padding: 20, textAlign: 'center' }}>Ninguém com esse filtro.</div>}
          </div>
        </Cartao>
      </div>

      {/* vendedores · esperando retorno */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(520px, 100%), 1fr))', gap: 14 }}>
        <Cartao titulo={<span><i className="fas fa-users" style={{ color: '#1d4ed8', marginRight: 8 }} />Vendedores · {mes.rotulo}</span>} atraso={200}
          extra={<span style={{ fontSize: 13.5, color: MUDO }}>clique para ver a carteira</span>}
          sub="Quanto cada vendedor faturou em máquinas no mês (Omie). A bolinha mostra se ele lança visitas no CRM: verde em dia, amarela atenção, vermelha parado, cinza não usa.">
          {!equipe && <Girando texto="Carregando vendedores…" />}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))', gap: 10 }}>
            {vendedores.map(({ v, s, linha, carteira }, i) => {
              const sel = vend === v.nome;
              const luz = { parado: '#ef4444', atencao: '#f59e0b', ativo: '#16a34a', sem_crm: '#94a3b8' }[linha?.situacao ?? 'sem_crm'];
              return (
                <button key={v.id} type="button" onClick={() => setVend(sel ? '' : v.nome)} className="iv-entra iv-kpi"
                  style={{ animationDelay: `${i * 50}ms`, textAlign: 'left', border: sel ? '2px solid #1d4ed8' : `1px solid ${BORDA}`, background: sel ? 'rgba(29,78,216,.07)' : CARD, borderRadius: 14, padding: 12, cursor: 'pointer', color: TXT, fontFamily: 'inherit', opacity: vend && !sel ? .5 : 1 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ position: 'relative', width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #60a5fa, #1d4ed8)', color: '#fefefe', display: 'grid', placeItems: 'center', fontWeight: 900, flexShrink: 0 }}>
                      {iniciais(v.nome)}
                      <span className="iv-pulso" style={{ ['--c' as string]: `${luz}99`, position: 'absolute', right: -2, bottom: -2, width: 12, height: 12, borderRadius: '50%', background: luz, border: '2px solid #fefefe' }} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 900, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.nome}</div>
                      <div style={{ fontSize: 13.5, color: '#dc2626', fontWeight: 900 }}>R$ <Conta valor={s.valorMaquinas} formato={compacto} /> <span style={{ color: MUDO, fontWeight: 600 }}>em máquinas</span></div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 8, fontSize: 13, color: MUDO }}>
                    <span><b style={{ color: TXT }}>{s.propostas}</b> propostas</span>
                    <span><b style={{ color: TXT }}>{s.visitas}</b> visitas</span>
                    <span><b style={{ color: TXT }}>{carteira}</b> na carteira</span>
                  </div>
                </button>
              );
            })}
          </div>
        </Cartao>
        <Cartao titulo={<span><i className="fas fa-hourglass-half" style={{ color: '#f59e0b', marginRight: 8 }} />Esperando retorno nosso</span>} atraso={240}
          extra={<span style={{ fontSize: 13.5, color: MUDO }}>{urgentes.length} urgentes</span>}
          sub="Clientes esperando a gente voltar: proposta parada há mais de 15 dias, contato combinado que venceu ou retorno de visita não feito.">
          <div style={{ display: 'grid', gap: 7, maxHeight: 420, overflowY: 'auto', paddingRight: 4 }}>
            {urgentes.slice(0, 30).map((r, i) => (
              <div key={`${r.origem}-${r.id}`} className="iv-entra iv-linha" style={{ animationDelay: `${Math.min(i, 12) * 40}ms`, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, border: `1px solid ${BORDA}`, borderLeft: '4px solid #f59e0b', borderRadius: 12, padding: '8px 12px', background: CARD }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14.5, color: TXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.cliente || '—'} <span style={{ color: MUDO, fontWeight: 500 }}>· {r.oque}</span></div>
                  <div style={{ fontSize: 13.5, color: TXT }}><span style={{ color: '#d97706', fontWeight: 800 }}>{ROTULO_MOTIVO[r.motivo]}</span> · {r.detalhe}</div>
                  <div style={{ fontSize: 13, color: r.vendedor ? MUDO : '#ef4444', fontWeight: r.vendedor ? 400 : 800 }}>{r.vendedor || 'Sem vendedor'} · {r.cidade}</div>
                </div>
                <b style={{ fontSize: 14.5, color: '#16a34a', whiteSpace: 'nowrap' }}>{r.valor ? `R$ ${compacto(r.valor)}` : ''}</b>
              </div>
            ))}
            {retorno && urgentes.length === 0 && <div style={{ color: MUDO, fontSize: 14.5, padding: 20, textAlign: 'center' }}>Nada esperando retorno com esse filtro.</div>}
          </div>
        </Cartao>
      </div>
      {ficha && <FichaCliente c={ficha} onFechar={() => setFicha(null)} />}
    </div>
  );
}

function Numero({ t, v, fmt, cor, sub, icone, a = 0, destaque }: { t: string; v: number; fmt?: (x: number) => string; cor: string; sub?: string; icone: string; a?: number; destaque?: boolean }) {
  return (
    <div className="iv-entra iv-kpi" style={{ animationDelay: `${a}ms`, position: 'relative', overflow: 'hidden', borderRadius: 16, padding: '13px 15px', minWidth: 0, background: destaque ? `linear-gradient(135deg, ${cor}, ${cor}bb)` : CARD, color: destaque ? '#fefefe' : TXT, border: destaque ? 'none' : `1px solid ${BORDA}`, boxShadow: destaque ? `0 10px 24px ${cor}45` : '0 1px 3px rgba(15,23,42,.05)' }}>
      <i className={`fas ${icone}`} style={{ position: 'absolute', right: 12, top: 12, fontSize: 20, opacity: destaque ? .35 : .2, color: destaque ? '#fefefe' : cor }} />
      <div style={{ fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .4, opacity: destaque ? .92 : .65, paddingRight: 26 }}>{t}</div>
      <div style={{ fontSize: 30, fontWeight: 900, color: destaque ? '#fefefe' : cor, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}><Conta valor={v} formato={fmt} /></div>
      {sub && <div style={{ fontSize: 13, opacity: destaque ? .92 : .7 }}>{sub}</div>}
    </div>
  );
}

function LinhaCliente({ c, i, onAbrir }: { c: ClienteIV; i: number; onAbrir: (c: ClienteIV) => void }) {
  const q = quadranteDe(c)!;
  const o = c.oportunidades[0];
  return (
    <button type="button" onClick={() => onAbrir(c)} className="iv-entra iv-linha"
      style={{ animationDelay: `${Math.min(i, 12) * 40}ms`, display: 'flex', gap: 10, alignItems: 'center', textAlign: 'left', width: '100%', border: `1px solid ${BORDA}`, borderLeft: `4px solid ${corQ(q)}`, borderRadius: 12, padding: '8px 10px', background: CARD, cursor: 'pointer', color: TXT, fontFamily: 'inherit' }}>
      <span style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: 14.5, color: corQ(q), background: `conic-gradient(${corQ(q)} ${c.score * 3.6}deg, ${FUNDO2} 0)` }}>
        <span style={{ width: 30, height: 30, borderRadius: '50%', background: CARD, display: 'grid', placeItems: 'center' }}>{c.score}</span>
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 800, fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nome}</div>
        <div style={{ fontSize: 13, color: MUDO, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.cidade}{c.vendedor ? ` · ${c.vendedor}` : ''}</div>
        <div style={{ fontSize: 13.5, color: corQ(q), fontWeight: 700 }}>→ {o?.oferecer}</div>
      </div>
    </button>
  );
}

function DetalheMun({ m }: { m: MunicipioIV }) {
  const max = Math.max(1, ...m.culturas.map((c) => c.ha));
  return (
    <div className="iv-troca" style={{ marginTop: 10, padding: 12, borderRadius: 12, background: FUNDO2, fontSize: 14, color: TXT }}>
      <div style={{ fontWeight: 900, fontSize: 15.5 }}>{m.nome} · foco {m.foco}</div>
      <div style={{ color: MUDO, marginBottom: 6 }}>{m.imoveis ?? '—'} imóveis · R$ {compacto(m.invest36m || 0)} de investimento em 3 anos · {m.clientesComTrator} com trator nosso</div>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>O que vender lá: {m.linhas.join(' · ')}</div>
      {m.culturas.slice(0, 5).map((c, i) => (
        <div key={c.nome} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
          <span style={{ width: 110, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nome}</span>
          <span style={{ flex: 1, height: 8, background: CARD, borderRadius: 8, overflow: 'hidden' }}>
            <span className="iv-barra" style={{ display: 'block', height: '100%', width: `${(c.ha / max) * 100}%`, background: 'linear-gradient(90deg, #22c55e, #15803d)', animationDelay: `${i * 60}ms` }} />
          </span>
          <span style={{ width: 70, textAlign: 'right' }}>{compacto(c.ha)} ha</span>
        </div>
      ))}
    </div>
  );
}

function Girando({ texto }: { texto: string }) {
  return (
    <div style={{ display: 'grid', placeItems: 'center', padding: 40, color: MUDO, gap: 12, textAlign: 'center' }}>
      <div style={{ position: 'relative', width: 70, height: 70, borderRadius: '50%', border: '2px solid rgba(239,68,68,.35)' }}>
        <div className="iv-varre" style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'conic-gradient(from 0deg, rgba(239,68,68,.55), transparent 30%)', animationDuration: '1.6s' }} />
      </div>
      <div style={{ fontSize: 14.5 }}>{texto}</div>
    </div>
  );
}

/** Resumo em palavras: as frases entram uma a uma, como se alguém estivesse contando. */
function Resumo({ clientes, urgentes, municipios, vendedores, mes, filtros }: {
  clientes: ClienteIV[]; urgentes: ItemRetorno[]; municipios: MunicipioIV[] | null;
  vendedores: { v: { nome: string }; s: { valorMaquinas: number } }[]; mes: string; filtros: string[];
}) {
  const porQ = QUADRANTES.map((q) => ({ q, n: clientes.filter((c) => quadranteDe(c) === q.id).length })).sort((a, b) => b.n - a.n);
  const quentes = clientes.filter((c) => c.score >= 50).length;
  // com município escolhido, a frase fala DELE (não do maior foco geral)
  const escolhido = (municipios ?? []).find((m) => filtros.includes(m.nome));
  const topMun = escolhido ?? (municipios ?? []).slice().sort((a, b) => b.foco - a.foco)[0];
  const lider = vendedores.find((x) => x.s.valorMaquinas > 0);
  const valorEspera = urgentes.reduce((s, r) => s + r.valor, 0);
  const frases: { icone: string; cor: string; texto: React.ReactNode }[] = [];
  if (clientes.length) frases.push({ icone: 'fa-satellite-dish', cor: '#ef4444', texto: <>{filtros.length ? <>No filtro <b>{filtros.join(' + ')}</b> há </> : 'Hoje há '}<b>{clientes.length} clientes</b> com motivo para receber uma ligação; <b style={{ color: '#ef4444' }}>{quentes} estão quentes</b>.</> });
  if (porQ[0]?.n) frases.push({ icone: 'fa-layer-group', cor: porQ[0].q.cor, texto: <>O maior grupo é <b style={{ color: porQ[0].q.cor }}>{porQ[0].q.nome} ({porQ[0].n})</b>: {porQ[0].q.frase.toLowerCase()}</> });
  if (urgentes.length) frases.push({ icone: 'fa-hourglass-half', cor: '#d97706', texto: <><b>{urgentes.length} propostas e visitas</b> esperam a gente voltar{valorEspera ? <>, somando <b>R$ {compacto(valorEspera)}</b></> : null}.</> });
  if (topMun) frases.push({ icone: 'fa-map-location-dot', cor: '#15803d', texto: escolhido
    ? <><b>{topMun.nome}</b> tem foco {topMun.foco}: {compacto(topMun.areaPlantadaHa)} ha plantados, {topMun.imoveis ?? '—'} imóveis rurais e {topMun.clientesComTrator} clientes com trator nosso. Vender lá: {topMun.linhas[0]?.toLowerCase()}.</>
    : <>O município com mais espaço para crescer é <b>{topMun.nome}</b> (foco {topMun.foco}): {compacto(topMun.areaPlantadaHa)} ha plantados e só {topMun.clientesComTrator} clientes com trator nosso.</> });
  if (lider) frases.push({ icone: 'fa-trophy', cor: '#1d4ed8', texto: <>Em {mes}, quem mais faturou máquina foi <b>{lider.v.nome}</b> (R$ {compacto(lider.s.valorMaquinas)}).</> });
  if (!frases.length) return null;
  return (
    <div key={filtros.join('|')} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 10, marginBottom: 14 }}>
      {frases.map((f, i) => (
        <div key={i} className="iv-frase" style={{ animationDelay: `${300 + i * 450}ms`, display: 'flex', gap: 12, alignItems: 'flex-start', background: CARD, border: `1px solid ${BORDA}`, borderLeft: `5px solid ${f.cor}`, borderRadius: 14, padding: '12px 14px', fontSize: 15.5, lineHeight: 1.45, color: TXT }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'grid', placeItems: 'center', background: `${f.cor}18`, color: f.cor, fontSize: 16 }}><i className={`fas ${f.icone}`} /></span>
          <span>{f.texto}</span>
        </div>
      ))}
    </div>
  );
}

/** Legenda do radar feita com os próprios elementos animados. */
function LegendaRadar() {
  const item = (el: React.ReactNode, t: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: TXT, background: FUNDO2, borderRadius: 999, padding: '5px 12px 5px 6px' }}>{el}{t}</span>
  );
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
      {item(<span style={{ width: 22, height: 22, display: 'grid', placeItems: 'center' }}><span className="iv-pulso" style={{ ['--c' as string]: 'rgba(239,68,68,.7)', width: 12, height: 12, borderRadius: 12, background: '#ef4444' }} /></span>, 'pisca = ligar já (score 50+)')}
      {item(<span style={{ position: 'relative', width: 22, height: 22, borderRadius: '50%', border: '2px solid #ef444477' }}><span style={{ position: 'absolute', inset: 6, borderRadius: '50%', background: '#ef4444' }} /></span>, 'centro = mais urgente')}
      {item(<span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><span style={{ width: 6, height: 6, borderRadius: 6, background: '#8b5cf6' }} /><span style={{ width: 12, height: 12, borderRadius: 12, background: '#8b5cf6' }} /></span>, 'maior = movimenta mais')}
    </div>
  );
}
