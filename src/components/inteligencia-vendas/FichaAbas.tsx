'use client';
// =============================================================================
// Ficha do cliente em ABAS (Opção 3, escolhida pelo José em 19/10/2026). Pedidos:
// abas mais interativas e muito mais sobre o mercado da cidade.
//   • abas com número ao vivo, marcador que desliza, ← → do teclado, conteúdo entra de lado
//   • Mercado da cidade = /api/inteligencia-vendas/cidade (IBGE, Censo Agro, tempo, concorrentes)
//   • tudo que falta aparece escrito, nunca traço
// =============================================================================
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { ClienteIV } from '@/lib/inteligencia-vendas/tipos';
import type { MunicipioIV } from '@/lib/inteligencia-vendas/municipios';
import type { CidadeIV } from '@/lib/inteligencia-vendas/cidade';
import { hojeBR } from '@/lib/inteligencia-vendas/normalizar';
import { apiGet, Dica } from './ui';
import { faixaScore, reaisCurto } from './colunasExecutivas';
import {
  Acoes, Dados, ESTILO, Falta, Identidade, linhasCadastro, linhasComercial, linhasOficina, Mapa, Maquinas, Motivos, Score, Secao,
} from './FichaExecutiva';

const TX = 'var(--portal-text, #0f172a)', MU = 'var(--portal-text-muted, #64748b)';

export type Aba = 'resumo' | 'compras' | 'oficina' | 'mercado' | 'local';

const cacheCidade = new Map<number, Promise<CidadeIV | null>>();
function raioX(m: MunicipioIV): Promise<CidadeIV | null> {
  if (!cacheCidade.has(m.ibge)) {
    const q = new URLSearchParams({ ibge: String(m.ibge), nome: m.nome });
    if (m.centro) { q.set('lat', String(m.centro[0])); q.set('lng', String(m.centro[1])); }
    cacheCidade.set(m.ibge, apiGet(`/api/inteligencia-vendas/cidade?${q}`).then((j) => j as CidadeIV).catch(() => { cacheCidade.delete(m.ibge); return null; }));
  }
  return cacheCidade.get(m.ibge)!;
}

const mil = (n: number) => Math.round(n).toLocaleString('pt-BR');
/** mil reais (IBGE) → texto curto */
const milReais = (n: number) => reaisCurto(n * 1000);
const DIA_SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

// ── abas ─────────────────────────────────────────────────────────────────────
function BarraAbas({ abas, ativa, onTrocar }: { abas: { id: Aba; nome: string; icone: string; info: ReactNode }[]; ativa: Aba; onTrocar: (a: Aba) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [marca, setMarca] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const medir = () => {
      const el = ref.current?.querySelector<HTMLElement>(`[data-aba="${ativa}"]`);
      if (el) setMarca({ x: el.offsetLeft, w: el.offsetWidth });
    };
    medir();
    const ro = new ResizeObserver(medir);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ativa]);
  return (
    <div ref={ref} className="fa-abas" role="tablist">
      {marca && <span className="fa-marca" style={{ transform: `translateX(${marca.x}px)`, width: marca.w }} />}
      {abas.map((a, i) => (
        <button key={a.id} type="button" role="tab" data-aba={a.id} aria-selected={ativa === a.id} className={`fa-aba ${ativa === a.id ? 'on' : ''}`}
          onClick={() => onTrocar(a.id)} style={{ animationDelay: `${i * 50}ms` }}>
          <span className="fa-aba-ic"><i className={`fas ${a.icone}`} /></span>
          <span style={{ display: 'grid', textAlign: 'left', lineHeight: 1.2, minWidth: 0 }}>
            <span className="fa-aba-nome">{a.nome}</span>
            <span className="fa-aba-info">{a.info}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

// ── pedaços das abas ─────────────────────────────────────────────────────────
function Cartao({ titulo, valor, sub, cor, onClick, dica }: { titulo: string; valor: ReactNode; sub?: ReactNode; cor?: string; onClick?: () => void; dica?: string }) {
  const corpo = (
    <div className={`fa-cartao ${onClick ? 'fa-clica' : ''}`} onClick={onClick} style={{ ['--k' as string]: cor || '#64748b' }}>
      <div className="fa-cartao-t">{titulo}{onClick && <i className="fas fa-arrow-right fa-seta" />}</div>
      <div className="fa-cartao-v">{valor}</div>
      {sub && <div className="fa-cartao-s">{sub}</div>}
    </div>
  );
  return dica ? <Dica conteudo={dica} largura={280}><span style={{ display: 'block', width: '100%' }}>{corpo}</span></Dica> : corpo;
}

function Barras({ itens, cor, formato }: { itens: { nome: string; valor: number; extra?: string }[]; cor: string; formato: (n: number) => string }) {
  const max = Math.max(1, ...itens.map((x) => x.valor));
  const [sobre, setSobre] = useState(-1);
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {itens.map((x, i) => (
        <div key={x.nome} className={`fa-barra-linha ${sobre === i ? 'on' : ''}`} onMouseEnter={() => setSobre(i)} onMouseLeave={() => setSobre(-1)}>
          <span className="fa-barra-nome" title={x.nome}>{x.nome}</span>
          <span className="fa-barra-trilho"><span className="fa-barra" style={{ width: `${(x.valor / max) * 100}%`, background: cor, animationDelay: `${120 + i * 60}ms` }} /></span>
          <span className="fa-barra-v">{formato(x.valor)}{x.extra && <small>{x.extra}</small>}</span>
        </div>
      ))}
    </div>
  );
}

/** Linha do tempo de 6 anos (valor da produção) com pontos que mostram o número. */
function Evolucao({ serie }: { serie: CidadeIV['serie'] }) {
  const pts = serie.filter((s) => s.valorMil != null);
  const [i, setI] = useState(pts.length - 1);
  if (pts.length < 2) return <Falta>Série histórica indisponível.</Falta>;
  const W = 520, H = 120, P = 18;
  const vs = pts.map((p) => p.valorMil!);
  const min = Math.min(...vs) * 0.9, max = Math.max(...vs) * 1.05;
  const x = (k: number) => P + (k * (W - 2 * P)) / (pts.length - 1);
  const y = (v: number) => H - P - ((v - min) / (max - min || 1)) * (H - 2 * P);
  const linha = pts.map((p, k) => `${k ? 'L' : 'M'}${x(k)},${y(p.valorMil!)}`).join(' ');
  const sel = pts[Math.max(0, Math.min(pts.length - 1, i))];
  const prim = pts[0].valorMil!, ult = pts[pts.length - 1].valorMil!;
  const cresc = Math.round(((ult - prim) / prim) * 100);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <b style={{ fontSize: 20, color: TX }}>{milReais(sel.valorMil!)}</b>
        <span style={{ fontSize: 13, color: MU }}>em {sel.ano}{sel.areaHa ? ` · ${mil(sel.areaHa)} ha plantados` : ''}</span>
        <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: cresc >= 0 ? '#15803d' : '#dc2626' }}>{cresc >= 0 ? '▲' : '▼'} {Math.abs(cresc)}% desde {pts[0].ano}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 130, overflow: 'visible' }}>
        <defs><linearGradient id="faGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#16a34a" stopOpacity=".28" /><stop offset="1" stopColor="#16a34a" stopOpacity="0" /></linearGradient></defs>
        <path d={`${linha} L${x(pts.length - 1)},${H - P} L${x(0)},${H - P} Z`} fill="url(#faGrad)" className="fa-area" />
        <path d={linha} fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="fa-linha" pathLength={1} />
        {pts.map((p, k) => (
          <g key={p.ano} onMouseEnter={() => setI(k)} onClick={() => setI(k)} style={{ cursor: 'pointer' }}>
            <rect x={x(k) - 30} y={0} width={60} height={H} fill="transparent" />
            <circle cx={x(k)} cy={y(p.valorMil!)} r={k === i ? 7 : 4.5} fill={k === i ? '#16a34a' : 'var(--portal-bg-card, #fefefe)'} stroke="#16a34a" strokeWidth="2.5" style={{ transition: 'r .2s' }} />
            <text x={x(k)} y={H + 2} textAnchor="middle" fontSize="12" fill="currentColor" style={{ color: k === i ? '#15803d' : '#94a3b8', fontWeight: k === i ? 800 : 500 }}>{p.ano}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function Rosca({ pct, cor, rotulo }: { pct: number; cor: string; rotulo: string }) {
  const r = 34, c = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: 92, height: 92, flexShrink: 0 }}>
      <svg width="92" height="92" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="46" cy="46" r={r} fill="none" stroke="rgba(148,163,184,.25)" strokeWidth="10" />
        <circle cx="46" cy="46" r={r} fill="none" stroke={cor} strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} className="fa-rosca" style={{ ['--t' as string]: c }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', lineHeight: 1.05 }}>
        <span><b style={{ fontSize: 19, color: TX }}>{Math.round(pct)}%</b><br /><span style={{ fontSize: 11, color: MU }}>{rotulo}</span></span>
      </div>
    </div>
  );
}

function Tempo({ cid }: { cid: CidadeIV | null | undefined }) {
  if (cid === undefined) return <Falta>Carregando a previsão…</Falta>;
  if (!cid?.clima.length) return <Falta>Previsão do tempo indisponível para esta cidade.</Falta>;
  const max = Math.max(10, ...cid.clima.map((d) => d.chuvaMm));
  return (
    <>
      <div className="fa-tempo">
        {cid.clima.map((d, i) => {
          const dt = new Date(`${d.data}T12:00:00`);
          return (
            <Dica key={d.data} largura={220} conteudo={<><b>{DIA_SEM[dt.getDay()]} {d.data.slice(8, 10)}/{d.data.slice(5, 7)}</b><div>Chuva: {d.chuvaMm.toLocaleString('pt-BR')} mm{d.prob != null ? ` (${d.prob}% de chance)` : ''}</div><div>Temperatura: {Math.round(d.tmin)}° a {Math.round(d.tmax)}°</div></>}>
              <div className="fa-dia" style={{ animationDelay: `${i * 60}ms` }}>
                <span className="fa-dia-n">{i === 0 ? 'hoje' : DIA_SEM[dt.getDay()]}</span>
                <i className={`fas ${d.chuvaMm >= 10 ? 'fa-cloud-showers-heavy' : d.chuvaMm >= 1 ? 'fa-cloud-rain' : d.tmin <= 3 ? 'fa-snowflake' : 'fa-sun'}`} style={{ color: d.chuvaMm >= 1 ? '#2563eb' : d.tmin <= 3 ? '#0891b2' : '#f59e0b' }} />
                <span className="fa-chuva-trilho"><span style={{ height: `${(d.chuvaMm / max) * 100}%` }} /></span>
                <b style={{ fontSize: 12.5, color: TX }}>{d.chuvaMm >= 0.5 ? `${Math.round(d.chuvaMm)} mm` : 'seco'}</b>
                <span style={{ fontSize: 12, color: MU }}>{Math.round(d.tmin)}°/{Math.round(d.tmax)}°</span>
              </div>
            </Dica>
          );
        })}
      </div>
      {cid.alertasClima.map((a) => /bom para/i.test(a)
        ? <div key={a} className="fa-alerta fa-bom"><i className="fas fa-circle-check" /> {a}</div>
        : <div key={a} className="fa-alerta"><i className="fas fa-triangle-exclamation" /> {a}</div>)}
      <div style={{ fontSize: 12, color: MU, marginTop: 8 }}>Fonte: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>Open-Meteo</a> · atualiza a cada 3 h</div>
    </>
  );
}

function AbaMercado({ c, mun, cid }: { c: ClienteIV; mun: MunicipioIV | null | undefined; cid: CidadeIV | null | undefined }) {
  if (mun === undefined) return <Falta>Carregando a cidade…</Falta>;
  if (!mun) return <Secao titulo="Mercado da cidade" icone="fa-seedling"><Falta>{c.cidade || 'A cidade do cliente'} está fora dos 45 municípios da loja: sem dados do IBGE, do CAR e do crédito rural aqui.</Falta></Secao>;
  const ce = cid?.censo;
  const nossaFrota = ce?.tratores ? (mun.tratoresVendidos / ce.tratores) * 100 : null;
  const areaPorCult = new Map(mun.culturas.map((x) => [x.nome.replace(/\s*\(.*$/, '').toLowerCase(), x.ha]));
  return (
    <>
      <div className="fa-grade4">
        <Cartao titulo="Foco da cidade" valor={mun.foco} cor="#dc2626" sub="mercado grande × pouca presença nossa"
          dica="Nota de 0 a 100: 65% vem do tamanho do mercado (área, valor da produção, crédito rural) e 35% do espaço que ainda temos (poucos clientes com trator nosso)." />
        <Cartao titulo="População" valor={cid?.populacao ? mil(cid.populacao.valor) : cid === undefined ? '…' : <Falta>sem dado</Falta>} sub={cid?.populacao ? `estimativa IBGE ${cid.populacao.ano}` : undefined} cor="#2563eb" />
        <Cartao titulo="Peso do agro no PIB" valor={cid?.pib?.agroPct != null ? `${cid.pib.agroPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : cid === undefined ? '…' : <Falta>sem dado</Falta>}
          sub={cid?.pib ? `${milReais(cid.pib.agroMil ?? 0)} de ${milReais(cid.pib.totalMil)} · ${cid.pib.ano}` : undefined} cor="#16a34a" />
        <Cartao titulo="Valor da produção agrícola" valor={mun.valorProducaoMil ? milReais(mun.valorProducaoMil) : <Falta>sem dado</Falta>} sub={`${mil(mun.areaPlantadaHa)} ha plantados`} cor="#ea580c" />
      </div>

      <Secao titulo="Frota de tratores da cidade (Censo Agro 2017)" icone="fa-tractor">
        {cid === undefined ? <Falta>Carregando o Censo Agro…</Falta> : !ce ? <Falta>Censo Agro indisponível para esta cidade.</Falta> : (
          <div className="fa-frota">
            {ce.semTratorPct != null && <Rosca pct={ce.semTratorPct} cor="#dc2626" rotulo="sem trator" />}
            <div style={{ display: 'grid', gap: 10, flex: 1, minWidth: 220 }}>
              <div className="fa-linha-dado"><span>Propriedades rurais</span><b>{ce.propriedades != null ? mil(ce.propriedades) : <Falta>sem dado</Falta>}</b></div>
              <div className="fa-linha-dado"><span>Propriedades com trator</span><b>{ce.comTrator != null ? mil(ce.comTrator) : <Falta>sem dado</Falta>}</b></div>
              <div className="fa-linha-dado"><span>Tratores na cidade</span><b>{ce.tratores != null ? mil(ce.tratores) : <Falta>sem dado</Falta>}</b></div>
              {ce.menos100cv != null && ce.mais100cv != null && (
                <div>
                  <div className="fa-pilha">
                    <span style={{ flex: ce.menos100cv, background: '#f59e0b' }} title={`${ce.menos100cv} abaixo de 100 cv`} />
                    <span style={{ flex: ce.mais100cv, background: '#7c3aed' }} title={`${ce.mais100cv} de 100 cv ou mais`} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: MU, marginTop: 4 }}>
                    <span><b style={{ color: '#b45309' }}>{mil(ce.menos100cv)}</b> abaixo de 100 cv</span><span><b style={{ color: '#7c3aed' }}>{mil(ce.mais100cv)}</b> de 100 cv ou mais</span>
                  </div>
                </div>
              )}
            </div>
            <div className="fa-nossa">
              <div style={{ fontSize: 12.5, fontWeight: 700, color: MU }}>Nós na cidade</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#dc2626' }}>{mun.tratoresVendidos}</div>
              <div style={{ fontSize: 12.5, color: MU }}>tratores vendidos{nossaFrota != null ? ` ≈ ${nossaFrota.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% da frota do Censo` : ''}</div>
              <div style={{ fontSize: 12.5, color: TX, marginTop: 6 }}>{mun.clientesComTrator} clientes com trator nosso · {mun.clientes} clientes</div>
            </div>
          </div>
        )}
      </Secao>

      <div className="fa-duas">
        <Secao titulo={`O que a cidade produz${cid?.anoAgro ? ` (${cid.anoAgro})` : ''}`} icone="fa-wheat-awn">
          {cid === undefined ? <Falta>Carregando…</Falta> : cid?.valorCulturas.length ? (
            <Barras cor="#16a34a" formato={milReais} itens={cid.valorCulturas.map((x) => {
              const ha = areaPorCult.get(x.nome.replace(/\s*\(.*$/, '').toLowerCase());
              return { nome: x.nome.replace(/\s*\(em grão\)/i, ''), valor: x.valorMil, extra: ha ? `${mil(ha)} ha` : undefined };
            })} />
          ) : <Falta>Sem dados de lavoura.</Falta>}
        </Secao>
        <Secao titulo="Evolução do valor da produção" icone="fa-chart-line">
          {cid === undefined ? <Falta>Carregando…</Falta> : <Evolucao serie={cid?.serie || []} />}
        </Secao>
      </div>

      <div className="fa-duas">
        <Secao titulo="Pecuária" icone="fa-cow">
          {cid === undefined ? <Falta>Carregando…</Falta> : cid?.rebanhos.length ? (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {cid.rebanhos.map((r, i) => <span key={r.nome} className="fa-chip" style={{ animationDelay: `${i * 60}ms` }}><b>{mil(r.cabecas)}</b> {r.nome.toLowerCase()}</span>)}
              </div>
              <div style={{ marginTop: 10, fontSize: 14, color: TX }}>Leite: {cid.leiteMilLitros ? <b>{mil(cid.leiteMilLitros)} mil litros/ano</b> : <Falta>não produz ou sem dado</Falta>}</div>
            </>
          ) : <Falta>Sem dados de rebanho.</Falta>}
        </Secao>
        <Secao titulo="Crédito rural na cidade (SICOR)" icone="fa-building-columns">
          <div className="fa-grade2">
            <Cartao titulo="Crédito em 12 meses" valor={mun.credito12m ? reaisCurto(mun.credito12m) : <Falta>nenhum registrado</Falta>} cor="#0891b2" />
            <Cartao titulo="Investimento em 3 anos" valor={mun.invest36m ? reaisCurto(mun.invest36m) : <Falta>nenhum registrado</Falta>} sub="o que mais vira máquina" cor="#0891b2" />
          </div>
          <div style={{ fontSize: 13, color: MU, marginTop: 8 }}>{mun.imoveisComCredito != null && mun.imoveis ? `${mil(mun.imoveisComCredito)} de ${mil(mun.imoveis)} imóveis do CAR pegaram crédito.` : 'Imóveis do CAR sem crédito ligado.'}</div>
        </Secao>
      </div>

      <div className="fa-duas">
        <Secao titulo="Concorrência na cidade" icone="fa-flag">
          {cid === undefined ? <Falta>Carregando…</Falta> : !cid?.perdasTotal ? <Falta>Nenhuma proposta perdida nesta cidade.</Falta> : (
            <>
              <div style={{ fontSize: 14, color: TX, marginBottom: 8 }}><b>{cid.perdasTotal}</b> proposta(s) perdida(s) aqui.</div>
              {cid.concorrentes.length ? cid.concorrentes.map((x) => (
                <div key={x.nome} className="fa-linha-dado"><span>{x.nome}</span><b>{x.perdas} perda(s){x.valor ? ` · ${reaisCurto(x.valor)}` : ''}</b></div>
              )) : <Falta>O vendedor não informou para quem perdeu.</Falta>}
            </>
          )}
        </Secao>
        <Secao titulo="O que vender lá" icone="fa-lightbulb">
          <div style={{ display: 'grid', gap: 8 }}>
            {mun.linhas.map((l, i) => <div key={l} className="fa-sugestao" style={{ animationDelay: `${i * 70}ms` }}><i className="fas fa-check" /> {l}</div>)}
          </div>
          <div style={{ fontSize: 13, color: MU, marginTop: 10 }}>{mun.propostasAbertas} proposta(s) em aberto e {mun.oportunidades} cliente(s) com oportunidade na cidade.</div>
        </Secao>
      </div>

      <div className="fa-fontes">
        Fontes: <a href="https://sidra.ibge.gov.br/tabela/5457" target="_blank" rel="noreferrer">IBGE PAM</a> · <a href="https://sidra.ibge.gov.br/tabela/3939" target="_blank" rel="noreferrer">IBGE PPM</a> · <a href="https://sidra.ibge.gov.br/tabela/6869" target="_blank" rel="noreferrer">Censo Agro 2017</a> · <a href="https://sidra.ibge.gov.br/tabela/5938" target="_blank" rel="noreferrer">PIB dos municípios</a> · <a href="https://sidra.ibge.gov.br/tabela/6579" target="_blank" rel="noreferrer">População</a> · CAR/SICOR (Dashboard Agro) · propostas do portal
        {cid && Object.entries(cid.fontes).some(([, v]) => v === 'erro') && <span style={{ color: '#dc2626' }}> · fora do ar agora: {Object.entries(cid.fontes).filter(([, v]) => v === 'erro').map(([k]) => k).join(', ')}</span>}
      </div>
    </>
  );
}

// ── ficha ────────────────────────────────────────────────────────────────────
export default function FichaAbas({ c, mun, fechar, abaInicial = 'resumo' }: { c: ClienteIV; mun: MunicipioIV | null | undefined; fechar: () => void; abaInicial?: Aba }) {
  const [aba, setAba] = useState<Aba>(abaInicial);
  const [dir, setDir] = useState(1);
  const [cid, setCid] = useState<CidadeIV | null | undefined>(undefined);
  const hoje = hojeBR();
  useEffect(() => {
    if (mun === undefined) return;
    let vivo = true;
    if (!mun) { setTimeout(() => vivo && setCid(null), 0); return () => { vivo = false; }; }
    raioX(mun).then((r) => { if (vivo) setCid(r); });
    return () => { vivo = false; };
  }, [mun]);

  const fx = faixaScore(c.score);
  const abas: { id: Aba; nome: string; icone: string; info: ReactNode }[] = [
    { id: 'resumo', nome: 'Resumo', icone: 'fa-bullseye', info: <span style={{ color: fx.cor }}>score {c.score}</span> },
    { id: 'compras', nome: 'Compras', icone: 'fa-tractor', info: c.valorMaquinas ? reaisCurto(c.valorMaquinas) : 'nenhuma' },
    { id: 'oficina', nome: 'Oficina', icone: 'fa-clipboard-list', info: `${c.os12m} OS · ${c.propostasAbertas} prop.` },
    { id: 'mercado', nome: 'Mercado', icone: 'fa-seedling', info: mun ? `foco ${mun.foco}` : mun === null ? 'fora da área' : '…' },
    { id: 'local', nome: 'Local e tempo', icone: 'fa-map-location-dot', info: c.local ? 'GPS da visita' : mun?.centro ? 'aproximado' : 'sem posição' },
  ];
  const ordem = abas.map((a) => a.id);
  const trocar = (a: Aba) => { setDir(ordem.indexOf(a) >= ordem.indexOf(aba) ? 1 : -1); setAba(a); };
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const i = ordem.indexOf(aba);
      if (e.key === 'ArrowRight' && i < ordem.length - 1) trocar(ordem[i + 1]);
      if (e.key === 'ArrowLeft' && i > 0) trocar(ordem[i - 1]);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  });

  const v = c.pecas12a24m > 0 ? Math.round(((c.pecas12m - c.pecas12a24m) / c.pecas12a24m) * 100) : null;

  return (
    <>
      <style>{ESTILO}{ESTILO_ABAS}</style>
      <aside className="fe-lado">
        <Identidade c={c} onFechar={fechar} compacto />
        <Acoes c={c} />
        <Score c={c} />
        <Dados c={c} linhas={linhasCadastro(c)} />
      </aside>
      <div className="fe-principal">
        <BarraAbas abas={abas} ativa={aba} onTrocar={trocar} />
        <div className="fa-dica-teclado"><i className="fas fa-keyboard" /> use ← → para trocar de aba</div>
        <div key={aba} className="fe-aba-corpo fa-entra" style={{ ['--d' as string]: `${dir * 36}px` }}>
          {aba === 'resumo' && <>
            <div className="fa-grade4">
              <Cartao titulo="Máquinas compradas" valor={c.valorMaquinas ? reaisCurto(c.valorMaquinas) : 'R$ 0'} sub={`${c.qtdTratores} trator(es) · ${c.qtdImplementos} implemento(s)`} cor="#2563eb" onClick={() => trocar('compras')} />
              <Cartao titulo="Peças em 12 meses" valor={c.pecas12m ? reaisCurto(c.pecas12m) : 'R$ 0'} sub={v == null ? (c.pecas12m ? 'cliente novo em peças' : 'não comprou') : <span style={{ color: v >= 0 ? '#15803d' : '#dc2626', fontWeight: 700 }}>{v >= 0 ? '▲' : '▼'} {Math.abs(v)}% no ano</span>} cor="#ea580c" onClick={() => trocar('compras')} />
              <Cartao titulo="Propostas abertas" valor={c.valorPropostasAbertas ? reaisCurto(c.valorPropostasAbertas) : 'R$ 0'} sub={c.propostasAbertas ? `${c.propostasAbertas} aberta(s)` : 'nenhuma aberta'} cor="#16a34a" onClick={() => trocar('oficina')} />
              <Cartao titulo="Mercado da cidade" valor={mun ? `foco ${mun.foco}` : mun === null ? <Falta>fora da área</Falta> : '…'} sub={mun ? mun.culturaPrincipal || 'cultura principal' : undefined} cor="#dc2626" onClick={() => trocar('mercado')} />
            </div>
            <Secao titulo="Por que ligar e o que oferecer" icone="fa-bullseye" atraso={80}><Motivos c={c} /></Secao>
          </>}
          {aba === 'compras' && <>
            <Secao titulo="Máquinas compradas conosco" icone="fa-tractor"><Maquinas c={c} /></Secao>
            <Secao titulo="Peças: este ano × ano anterior" icone="fa-gears" atraso={80}>
              {!c.pecas12m && !c.pecas12a24m ? <Falta>Não comprou peças conosco nos últimos 2 anos.</Falta> : (
                <Barras cor="#ea580c" formato={(n) => (n ? reaisCurto(n) : 'R$ 0')} itens={[
                  { nome: 'Últimos 12 meses', valor: c.pecas12m, extra: `${c.pedidosPecas12m} pedido(s)` },
                  { nome: '12 a 24 meses atrás', valor: c.pecas12a24m, extra: `${c.pedidosPecas12a24m} pedido(s)` },
                ]} />
              )}
              <div style={{ marginTop: 10, fontSize: 13, color: MU }}>Última compra: {c.ultimaCompraPecas ? `${c.ultimaCompraPecas.slice(8, 10)}/${c.ultimaCompraPecas.slice(5, 7)}/${c.ultimaCompraPecas.slice(0, 4)}` : 'nunca comprou'}</div>
            </Secao>
          </>}
          {aba === 'oficina' && <div className="fa-duas">
            <Secao titulo="Oficina" icone="fa-screwdriver-wrench"><Dados c={c} linhas={linhasOficina(c)} /></Secao>
            <Secao titulo="Comercial" icone="fa-handshake" atraso={80}>
              {c.propostasAbertas + c.propostasGanhas + c.propostasPerdidas > 0 && (
                <div className="fa-funil">
                  {[['Abertas', c.propostasAbertas, '#ca8a04'], ['Ganhas', c.propostasGanhas, '#16a34a'], ['Perdidas', c.propostasPerdidas, '#94a3b8']].map(([n, q, cor]) => (
                    <div key={n as string} style={{ flex: Math.max(1, q as number) }} className="fa-funil-p">
                      <span style={{ background: cor as string }} /><b>{q as number}</b> {(n as string).toLowerCase()}
                    </div>
                  ))}
                </div>
              )}
              <Dados c={c} linhas={linhasComercial(c, hoje)} />
            </Secao>
          </div>}
          {aba === 'mercado' && <AbaMercado c={c} mun={mun} cid={cid} />}
          {aba === 'local' && <>
            <Secao titulo="Localização" icone="fa-map-location-dot"><Mapa c={c} mun={mun} altura={300} /></Secao>
            <Secao titulo={`Previsão do tempo · ${mun?.nome || c.cidade || 'cidade'}`} icone="fa-cloud-sun" atraso={80}><Tempo cid={mun === null ? null : cid} /></Secao>
          </>}
        </div>
      </div>
    </>
  );
}

const ESTILO_ABAS = `
  .fa-abas { position: relative; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; padding: 10px 12px; background: var(--portal-bg-card, #fefefe); border-bottom: 1px solid var(--portal-border, #e2e8f0); overflow-x: auto; scrollbar-width: none }
  .fa-marca { position: absolute; left: 0; top: 10px; bottom: 10px; border-radius: 12px; background: #fef2f2; border: 1px solid #fecaca; transition: transform .35s cubic-bezier(.2,.9,.25,1), width .35s cubic-bezier(.2,.9,.25,1); pointer-events: none }
  .fa-aba { position: relative; z-index: 1; min-width: 0; display: flex; align-items: center; gap: 9px; padding: 8px 10px 8px 8px; border: 0; background: none; border-radius: 12px; font: inherit; cursor: pointer; white-space: nowrap; animation: faSobe .35s ease both; transition: transform .2s }
  .fa-aba:hover { transform: translateY(-1px) } .fa-aba:hover .fa-aba-ic { transform: rotate(-8deg) scale(1.08) }
  .fa-aba-ic { flex-shrink: 0; width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; background: var(--portal-bg-secondary, #f1f5f9); color: var(--portal-text-muted, #64748b); font-size: 14px; transition: transform .25s, background .25s, color .25s }
  .fa-aba.on .fa-aba-ic { background: #dc2626; color: #fefefe; box-shadow: 0 6px 14px rgba(220,38,38,.3) }
  .fa-aba-nome, .fa-aba-info { overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
  .fa-aba-nome { font-size: 14px; font-weight: 700; color: var(--portal-text-muted, #64748b) } .fa-aba.on .fa-aba-nome { color: var(--portal-text, #0f172a) }
  .fa-aba-info { font-size: 12px; color: var(--portal-text-muted, #94a3b8); font-weight: 600 }
  .fa-dica-teclado { font-size: 11.5px; color: var(--portal-text-muted, #94a3b8); padding: 6px 20px 0; text-align: right }
  .fa-entra { animation: faEntra .38s cubic-bezier(.2,.9,.25,1) both } @keyframes faEntra { from { opacity: 0; transform: translateX(var(--d)) } }
  @keyframes faSobe { from { opacity: 0; transform: translateY(8px) } }
  .fa-grade4 { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(170px, 100%), 1fr)); gap: 10px }
  .fa-grade2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(160px, 100%), 1fr)); gap: 10px }
  .fa-duas { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(330px, 100%), 1fr)); gap: 14px }
  .fa-cartao { position: relative; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); border-top: 3px solid var(--k); border-radius: 12px; padding: 11px 13px; animation: faSobe .4s ease both; transition: transform .2s, box-shadow .2s; height: 100%; box-sizing: border-box }
  .fa-clica { cursor: pointer } .fa-clica:hover { transform: translateY(-3px); box-shadow: 0 10px 22px rgba(15,23,42,.10) }
  .fa-cartao-t { font-size: 12.5px; color: var(--portal-text-muted, #64748b); font-weight: 600; display: flex; align-items: center }
  .fa-seta { margin-left: auto; font-size: 11px; opacity: 0; transform: translateX(-4px); transition: opacity .2s, transform .2s; color: var(--k) }
  .fa-clica:hover .fa-seta { opacity: 1; transform: none }
  .fa-cartao-v { font-size: 21px; font-weight: 800; color: var(--portal-text, #0f172a); margin: 3px 0 1px; font-variant-numeric: tabular-nums }
  .fa-cartao-s { font-size: 12.5px; color: var(--portal-text-muted, #64748b) }
  .fa-barra-linha { display: grid; grid-template-columns: minmax(90px, 30%) 1fr auto; gap: 10px; align-items: center; font-size: 13.5px; color: var(--portal-text, #0f172a); padding: 3px 6px; border-radius: 8px; transition: background .15s }
  .fa-barra-linha.on { background: var(--portal-bg-secondary, #f1f5f9) }
  .fa-barra-nome { overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
  .fa-barra-trilho { height: 10px; border-radius: 10px; background: var(--portal-bg-secondary, #f1f5f9); overflow: hidden }
  .fa-barra { display: block; height: 100%; border-radius: 10px; transform-origin: left; animation: faBarra .8s cubic-bezier(.2,.8,.2,1) both } @keyframes faBarra { from { transform: scaleX(0) } }
  .fa-barra-linha.on .fa-barra { filter: brightness(1.12) }
  .fa-barra-v { font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; min-width: 92px } .fa-barra-v small { display: block; font-weight: 500; color: var(--portal-text-muted, #64748b); font-size: 11.5px }
  .fa-linha { stroke-dasharray: 1; animation: faTraco 1.2s cubic-bezier(.2,.8,.2,1) both } @keyframes faTraco { from { stroke-dashoffset: 1 } to { stroke-dashoffset: 0 } }
  .fa-area { animation: faSobe .8s .3s ease both }
  .fa-rosca { animation: faRosca 1.2s cubic-bezier(.2,.8,.2,1) both } @keyframes faRosca { from { stroke-dashoffset: var(--t) } }
  .fa-frota { display: flex; gap: 22px; align-items: center; flex-wrap: wrap }
  .fa-linha-dado { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; color: var(--portal-text, #0f172a); padding: 5px 0; border-bottom: 1px dashed var(--portal-border, #e2e8f0) }
  .fa-linha-dado span { color: var(--portal-text-muted, #64748b) }
  .fa-pilha { display: flex; height: 12px; border-radius: 12px; overflow: hidden; gap: 2px; animation: faBarra .9s cubic-bezier(.2,.8,.2,1) both; transform-origin: left }
  .fa-nossa { background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 12px 14px; min-width: 180px }
  .fa-chip { font-size: 13.5px; color: var(--portal-text, #0f172a); background: var(--portal-bg-secondary, #f1f5f9); border-radius: 999px; padding: 5px 12px; animation: faSobe .35s ease both }
  .fa-sugestao { font-size: 14px; font-weight: 600; color: #15803d; background: #f0fdf4; border-radius: 10px; padding: 9px 12px; animation: faSobe .35s ease both } .fa-sugestao i { margin-right: 6px }
  .fa-fontes { font-size: 12px; color: var(--portal-text-muted, #64748b); line-height: 1.6 } .fa-fontes a { color: #2563eb }
  .fa-tempo { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px }
  .fa-dia { display: grid; justify-items: center; gap: 5px; padding: 10px 4px; border-radius: 12px; border: 1px solid var(--portal-border, #e2e8f0); animation: faSobe .4s ease both; transition: transform .2s, box-shadow .2s; width: 100% }
  .fa-dia:hover { transform: translateY(-3px); box-shadow: 0 8px 18px rgba(15,23,42,.10) }
  .fa-dia-n { font-size: 12px; font-weight: 700; color: var(--portal-text-muted, #64748b); text-transform: uppercase }
  .fa-dia > i { font-size: 20px }
  .fa-chuva-trilho { width: 10px; height: 46px; border-radius: 10px; background: var(--portal-bg-secondary, #f1f5f9); display: flex; align-items: flex-end; overflow: hidden }
  .fa-chuva-trilho span { width: 100%; background: #3b82f6; border-radius: 10px; animation: faChuva .9s cubic-bezier(.2,.8,.2,1) both; transform-origin: bottom } @keyframes faChuva { from { transform: scaleY(0) } }
  .fa-bom.fa-alerta { color: #166534; background: #f0fdf4; border-color: #bbf7d0 }
  .fa-alerta { margin-top: 10px; font-size: 14px; font-weight: 600; color: #92400e; background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 9px 12px }
  .fa-funil { display: flex; gap: 4px; margin-bottom: 12px }
  .fa-funil-p { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--portal-text, #0f172a); background: var(--portal-bg-secondary, #f1f5f9); border-radius: 8px; padding: 7px 10px; white-space: nowrap; animation: faSobe .4s ease both }
  .fa-funil-p span { width: 9px; height: 9px; border-radius: 3px }
  @media (max-width: 1100px) { .fa-abas { display: flex } .fa-aba { flex-shrink: 0 } }
  @media (max-width: 700px) { .fa-tempo { grid-template-columns: repeat(4, minmax(0, 1fr)) } }
  @media (prefers-reduced-motion: reduce) { .fa-entra, .fa-aba, .fa-cartao, .fa-barra, .fa-linha, .fa-area, .fa-rosca, .fa-pilha, .fa-chip, .fa-sugestao, .fa-dia, .fa-chuva-trilho span, .fa-funil-p { animation: none !important } .fa-marca { transition: none } }
`;
