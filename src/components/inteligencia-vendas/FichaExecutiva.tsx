'use client';
// =============================================================================
// Ficha do cliente — versão "executiva" (página de teste, 19/10/2026). O José achou a
// Ficha 360 feia: aqui o visual é neutro e limpo, com os mesmos dados, em dois formatos:
//   'lateral' = painel que desliza da direita (a lista continua visível atrás)
//   'abas'    = janela central: identidade à esquerda, assunto em abas à direita
// Informação que falta aparece escrita ("Nunca visitado"), nunca como traço.
// =============================================================================
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ClienteIV } from '@/lib/inteligencia-vendas/tipos';
import type { MunicipioIV } from '@/lib/inteligencia-vendas/municipios';
import { REGRAS } from '@/lib/inteligencia-vendas/regras';
import { diasEntre, hojeBR, textoNorm } from '@/lib/inteligencia-vendas/normalizar';
import { apiGet, Dica } from './ui';
import { faixaScore, LEGENDA_SCORE, reaisCurto } from './colunasExecutivas';
import FichaAbas from './FichaAbas';

export type ModoFicha = 'lateral' | 'abas';

const TX = 'var(--portal-text, #0f172a)', MU = 'var(--portal-text-muted, #64748b)', BD = 'var(--portal-border, #e2e8f0)';
const CARD = 'var(--portal-bg-card, #fefefe)', SUAVE = 'var(--portal-bg-secondary, #f1f5f9)';

export { municipios };
let cacheMun: Promise<MunicipioIV[]> | null = null;
const municipios = () => (cacheMun ??= apiGet('/api/inteligencia-vendas/municipios').then((j) => j.municipios as MunicipioIV[]).catch(() => []));

const reais = (n: number) => `R$ ${Math.round(n).toLocaleString('pt-BR')}`;
const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const fone = (t: string) => { let d = t.replace(/\D/g, ''); if (d.startsWith('55') && d.length > 11) d = d.slice(2); return d.length >= 10 ? d : ''; };
const foneBonito = (d: string) => (d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`);

function useConta(alvo: number, ms = 900) {
  const [v, setV] = useState(0);
  const de = useRef(0);
  useEffect(() => {
    const ini = performance.now(), o = de.current;
    let raf = 0;
    const p = (t: number) => { const k = Math.min(1, (t - ini) / ms); setV(o + (alvo - o) * (1 - Math.pow(1 - k, 3))); if (k < 1) raf = requestAnimationFrame(p); else de.current = alvo; };
    raf = requestAnimationFrame(p);
    return () => cancelAnimationFrame(raf);
  }, [alvo, ms]);
  return v;
}
function Conta({ v, f = (x: number) => Math.round(x).toLocaleString('pt-BR') }: { v: number; f?: (x: number) => string }) { return <>{f(useConta(v))}</>; }

/** "Não tem" escrito, apagado. */
export const Falta = ({ children }: { children: ReactNode }) => <span className="fe-falta">{children}</span>;

// ── pedaços ──────────────────────────────────────────────────────────────────
export function Secao({ titulo, icone, children, atraso = 0, extra }: { titulo: string; icone: string; children: ReactNode; atraso?: number; extra?: ReactNode }) {
  return (
    <section className="fe-secao" style={{ animationDelay: `${atraso}ms` }}>
      <h3><i className={`fas ${icone}`} />{titulo}{extra && <span style={{ marginLeft: 'auto' }}>{extra}</span>}</h3>
      {children}
    </section>
  );
}

export function Acoes({ c }: { c: ClienteIV }) {
  const f = fone(c.telefone);
  const cod = c.codigos.find((x) => x.empresa === 'NOVA') || c.codigos[0];
  return (
    <div className="fe-acoes">
      {f ? <a className="fe-bt fe-bt-pri" href={`tel:${f}`}><i className="fas fa-phone" /> Ligar</a> : <span className="fe-bt fe-bt-off" title="Sem telefone no cadastro"><i className="fas fa-phone-slash" /> Sem telefone</span>}
      {f && <a className="fe-bt fe-bt-whats" href={`https://wa.me/55${f}`} target="_blank" rel="noreferrer"><i className="fab fa-whatsapp" /> WhatsApp</a>}
      {cod && <a className="fe-bt" href={`/clientes?cod=${cod.cod}&doc=${c.doc}&empresa=${cod.empresa === 'NOVA' ? 'Nova Tratores' : 'Castro Pecas'}`}><i className="fas fa-folder-open" /> Pasta</a>}
      <a className="fe-bt" href="/propostas"><i className="fas fa-file-signature" /> Proposta</a>
      <a className="fe-bt" href={`/inteligencia-vendas/calculadora?cliente=${encodeURIComponent(c.nome)}${c.areaHa ? `&area=${Math.round(c.areaHa)}` : ''}`}><i className="fas fa-calculator" /> Retorno</a>
    </div>
  );
}

export function Score({ c }: { c: ClienteIV }) {
  const fx = faixaScore(c.score);
  const soma = c.oportunidades.reduce((s, o) => s + o.peso, 0);
  return (
    <div className="fe-score" style={{ ['--k' as string]: fx.cor, ['--f' as string]: fx.fundo }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <b className="fe-score-n"><Conta v={c.score} /></b>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: fx.cor }}>{fx.nome}</span>
        <Dica conteudo={LEGENDA_SCORE}><span style={{ marginLeft: 'auto', fontSize: 12.5, color: MU, fontWeight: 600 }}><i className="fas fa-circle-info" /> o que é</span></Dica>
      </div>
      <div className="fe-score-trilho"><span style={{ width: `${c.score}%` }} /></div>
      <div style={{ display: 'grid', gap: 3, marginTop: 10 }}>
        {c.oportunidades.map((o) => (
          <div key={o.regra} style={{ display: 'flex', fontSize: 13, color: TX, gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: 3, background: REGRAS[o.regra].cor, marginTop: 5, flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{REGRAS[o.regra].rotulo}</span><b>+{o.peso}</b>
          </div>
        ))}
        {c.oportunidades.length === 0 && <Falta>Nenhum motivo para ligar agora</Falta>}
        {soma > 100 && <div style={{ fontSize: 12, color: MU }}>Soma {soma}, limitada a 100.</div>}
      </div>
    </div>
  );
}

export function Motivos({ c }: { c: ClienteIV }) {
  if (!c.oportunidades.length) return <Falta>Nenhum motivo para ligar agora.</Falta>;
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {c.oportunidades.map((o, i) => (
        <div key={o.regra} className="fe-motivo" style={{ ['--k' as string]: REGRAS[o.regra].cor, animationDelay: `${120 + i * 70}ms` }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="fe-tag">{REGRAS[o.regra].rotulo}</span>
            <span style={{ marginLeft: 'auto', fontSize: 12.5, color: MU, fontWeight: 700 }}>+{o.peso} no score</span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: TX, marginTop: 6 }}>{o.titulo}</div>
          <div style={{ fontSize: 13.5, color: MU, marginTop: 2 }}>{o.porque}</div>
          <div className="fe-oferecer"><i className="fas fa-arrow-right" /> {o.oferecer}</div>
        </div>
      ))}
    </div>
  );
}

export function Numeros({ c }: { c: ClienteIV }) {
  const v = c.pecas12a24m > 0 ? Math.round(((c.pecas12m - c.pecas12a24m) / c.pecas12a24m) * 100) : null;
  const itens = [
    { t: 'Máquinas compradas', v: c.valorMaquinas, din: true, s: c.qtdTratores + c.qtdImplementos ? `${c.qtdTratores} trator(es) · ${c.qtdImplementos} implemento(s)` : 'nenhuma conosco' },
    { t: 'Peças em 12 meses', v: c.pecas12m, din: true, s: !c.pecas12m && !c.pecas12a24m ? 'não comprou' : v == null ? `${c.pedidosPecas12m} pedidos` : `${v >= 0 ? '▲' : '▼'} ${Math.abs(v)}% vs 12 meses antes`, cor: v != null && v < 0 ? '#dc2626' : v != null ? '#15803d' : undefined },
    { t: 'Propostas abertas', v: c.valorPropostasAbertas, din: true, s: c.propostasAbertas ? `${c.propostasAbertas} aberta(s)` : 'nenhuma aberta' },
    { t: 'OS em 12 meses', v: c.os12m, din: false, s: c.ultimaOS ? `última em ${dataBR(c.ultimaOS)}` : 'sem OS' },
  ];
  return (
    <div className="fe-nums">
      {itens.map((x, i) => (
        <div key={x.t} className="fe-num" style={{ animationDelay: `${80 + i * 60}ms` }}>
          <div className="fe-rot">{x.t}</div>
          <div className="fe-val" style={{ color: x.v ? TX : MU }}>{x.v ? <Conta v={x.v} f={x.din ? reaisCurto : undefined} /> : x.din ? 'R$ 0' : '0'}</div>
          <div style={{ fontSize: 12.5, color: x.cor || MU, fontWeight: x.cor ? 700 : 500 }}>{x.s}</div>
        </div>
      ))}
    </div>
  );
}

export function Maquinas({ c }: { c: ClienteIV }) {
  if (!c.maquinas.length) return <Falta>Nenhuma máquina comprada conosco (Omie desde 11/2022 e revisões desde 2019).</Falta>;
  return (
    <table className="fe-tab">
      <thead><tr><th>Máquina</th><th>Tipo</th><th>Data</th><th style={{ textAlign: 'right' }}>Valor</th></tr></thead>
      <tbody>
        {c.maquinas.map((m, i) => (
          <tr key={i}>
            <td><b>{m.modelo}</b></td>
            <td style={{ color: MU }}>{m.tipo === 'trator' ? 'Trator' : m.tipo === 'implemento' ? 'Implemento' : m.familia}</td>
            <td style={{ color: MU }}>{m.data ? dataBR(m.data) : <Falta>sem data</Falta>}</td>
            <td style={{ textAlign: 'right' }}>{m.valor ? reais(m.valor) : <Falta>{m.origem === 'revisoes' ? 'sem valor (revisões)' : 'sem valor'}</Falta>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Dados({ c, linhas }: { c: ClienteIV; linhas: [string, ReactNode][] }) {
  void c;
  return (
    <dl className="fe-dl">
      {linhas.map(([t, v]) => <div key={t}><dt>{t}</dt><dd>{v}</dd></div>)}
    </dl>
  );
}

export function linhasOficina(c: ClienteIV): [string, ReactNode][] {
  return [
    ['OS nos últimos 12 meses', c.os12m ? `${c.os12m}` : <Falta>Nenhuma</Falta>],
    ['Última OS', c.ultimaOS ? dataBR(c.ultimaOS) : <Falta>Nunca veio à oficina</Falta>],
    ['Maior horímetro visto', c.maiorHorimetro ? `${c.maiorHorimetro.toLocaleString('pt-BR')} h` : <Falta>Não anotado nas OS</Falta>],
    ['Outras marcas na oficina', c.marcasNaOficina.length ? c.marcasNaOficina.join(', ') : <Falta>Nenhuma</Falta>],
  ];
}
export function linhasComercial(c: ClienteIV, hoje: string): [string, ReactNode][] {
  const dv = c.ultimaVisita ? diasEntre(c.ultimaVisita, hoje) : null;
  return [
    ['Propostas', c.propostasAbertas + c.propostasGanhas + c.propostasPerdidas ? `${c.propostasAbertas} aberta(s) · ${c.propostasGanhas} ganha(s) · ${c.propostasPerdidas} perdida(s)` : <Falta>Nenhuma proposta</Falta>],
    ['Última proposta', c.ultimaProposta ? dataBR(c.ultimaProposta) : <Falta>Nunca</Falta>],
    ['Última perdida', c.ultimaPerdida ? `${[c.ultimaPerdida.marca, c.ultimaPerdida.modelo].filter(Boolean).join(' ') || 'modelo não informado'} · ${dataBR(c.ultimaPerdida.data)}` : <Falta>Nenhuma</Falta>],
    ['Visitas no CRM', c.visitas ? `${c.visitas}${dv != null ? ` · última há ${dv} dias` : ''}` : <Falta>Nunca visitado</Falta>],
    ['Última compra de peças', c.ultimaCompraPecas ? dataBR(c.ultimaCompraPecas) : <Falta>Nunca comprou</Falta>],
    ['Peças 12 a 24 meses atrás', c.pecas12a24m ? reais(c.pecas12a24m) : <Falta>Nada</Falta>],
  ];
}
export function linhasCadastro(c: ClienteIV): [string, ReactNode][] {
  return [
    ['Lojas', c.lojas.join(' + ') || <Falta>—</Falta>],
    ['Vendedor', c.vendedor || <Falta>Sem vendedor no CRM</Falta>],
    ['Telefone', fone(c.telefone) ? foneBonito(fone(c.telefone)) : <Falta>Sem telefone no cadastro</Falta>],
    ['Atividade (CNAE)', c.cnae ? c.cnaeDescricao : <Falta>{c.doc.length === 14 ? 'Ainda não consultado' : 'Pessoa física'}</Falta>],
    ['Propriedade (CRM)', c.areaHa || c.culturas.length ? [c.areaHa ? `${Math.round(c.areaHa)} ha` : '', c.culturas.join(', ')].filter(Boolean).join(' · ') : <Falta>Área e culturas não registradas</Falta>],
  ];
}

export function Mercado({ c, mun }: { c: ClienteIV; mun: MunicipioIV | null | undefined }) {
  if (mun === undefined) return <Falta>Carregando dados da cidade…</Falta>;
  if (!mun) return <Falta>{c.cidade || 'A cidade'} está fora dos 45 municípios da loja: sem dados do IBGE e do CAR.</Falta>;
  return (
    <>
      <div className="fe-nums" style={{ marginBottom: 12 }}>
        {[
          { t: 'Foco da cidade', v: String(mun.foco), s: 'mercado × presença nossa' },
          { t: 'Área plantada', v: `${Math.round(mun.areaPlantadaHa / 1000).toLocaleString('pt-BR')} mil ha`, s: 'IBGE' },
          { t: 'Crédito rural p/ investir', v: mun.invest36m ? reaisCurto(mun.invest36m) : 'R$ 0', s: 'últimos 3 anos' },
          { t: 'Clientes com trator nosso', v: `${mun.clientesComTrator}`, s: mun.imoveis ? `de ${mun.imoveis.toLocaleString('pt-BR')} imóveis` : 'imóveis não contados' },
        ].map((x) => (
          <div key={x.t} className="fe-num"><div className="fe-rot">{x.t}</div><div className="fe-val" style={{ fontSize: 19 }}>{x.v}</div><div style={{ fontSize: 12.5, color: MU }}>{x.s}</div></div>
        ))}
      </div>
      {mun.culturas.slice(0, 5).map((cu, i) => (
        <div key={cu.nome} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 7, fontSize: 13.5, color: TX }}>
          <span style={{ width: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cu.nome}</span>
          <span style={{ flex: 1, height: 8, borderRadius: 8, background: SUAVE, overflow: 'hidden' }}>
            <span className="fe-barra" style={{ display: 'block', height: '100%', width: `${(cu.ha / (mun.culturas[0]?.ha || 1)) * 100}%`, animationDelay: `${200 + i * 70}ms` }} />
          </span>
          <span style={{ width: 86, textAlign: 'right', color: MU, fontVariantNumeric: 'tabular-nums' }}>{Math.round(cu.ha).toLocaleString('pt-BR')} ha</span>
        </div>
      ))}
      {mun.linhas.length > 0 && <div style={{ marginTop: 12, fontSize: 13.5, color: TX }}><b>Linhas que combinam:</b> {mun.linhas.join(' · ')}</div>}
    </>
  );
}

export function Mapa({ c, mun, altura = 230 }: { c: ClienteIV; mun: MunicipioIV | null | undefined; altura?: number }) {
  const ponto: [number, number] | null = c.local ?? mun?.centro ?? null;
  const aprox = !c.local && !!mun?.centro;
  if (!ponto) {
    return (
      <div className="fe-mapa-vazio" style={{ height: altura }}>
        <i className="fas fa-map-location-dot" />
        <div>Sem posição: o vendedor não marcou GPS na visita e a cidade está fora do mapa.</div>
        {c.cidade && <a href={`https://www.google.com/maps/search/${encodeURIComponent(c.cidade)}`} target="_blank" rel="noreferrer">Procurar {c.cidade} no Google Maps</a>}
      </div>
    );
  }
  const dx = aprox ? 0.12 : 0.03, dy = aprox ? 0.08 : 0.02;
  return (
    <>
      <div className="fe-mapa" style={{ height: altura }}>
        <iframe title="Mapa" loading="lazy" style={{ border: 0, width: '100%', height: '100%' }}
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${ponto[1] - dx},${ponto[0] - dy},${ponto[1] + dx},${ponto[0] + dy}&layer=mapnik`} />
        <span className="fe-pino"><i className="fas fa-location-dot" /></span>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 8, fontSize: 13, color: MU, flexWrap: 'wrap' }}>
        <span>{aprox ? `Aproximado: centro de ${mun?.nome}` : 'Propriedade (GPS da visita do vendedor)'}</span>
        <a href={`https://www.google.com/maps?q=${ponto[0]},${ponto[1]}`} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', color: '#2563eb', fontWeight: 700 }}>Abrir no Google Maps</a>
      </div>
    </>
  );
}

export function Identidade({ c, onFechar, compacto }: { c: ClienteIV; onFechar: () => void; compacto?: boolean }) {
  const cor = REGRAS[c.oportunidades[0]?.regra ?? 'sem_visita'].cor;
  return (
    <div className="fe-id" style={{ ['--k' as string]: cor }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: .6, textTransform: 'uppercase', color: MU }}>Cliente · {c.lojas.join(' + ')}</div>
          <h2 style={{ margin: '4px 0 0', fontSize: compacto ? 21 : 24, fontWeight: 800, color: TX, lineHeight: 1.2 }}>{c.nome}</h2>
          <div style={{ fontSize: 14, color: MU, marginTop: 6, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span><i className="fas fa-location-dot" style={{ marginRight: 5 }} />{c.cidade || 'Cidade não informada'}</span>
            <span><i className="fas fa-user-tie" style={{ marginRight: 5 }} />{c.vendedor || 'Sem vendedor'}</span>
            {fone(c.telefone) && <span><i className="fas fa-phone" style={{ marginRight: 5 }} />{foneBonito(fone(c.telefone))}</span>}
          </div>
        </div>
        <button type="button" onClick={onFechar} aria-label="Fechar" className="fe-x"><i className="fas fa-xmark" /></button>
      </div>
    </div>
  );
}

// ── ficha ────────────────────────────────────────────────────────────────────
export default function FichaExecutiva({ c, modo, onFechar }: { c: ClienteIV; modo: ModoFicha; onFechar: () => void }) {
  const [mun, setMun] = useState<MunicipioIV | null | undefined>(undefined);
  const [saindo, setSaindo] = useState(false);
  const hoje = hojeBR();
  const fechar = () => { setSaindo(true); setTimeout(onFechar, 220); };
  useEffect(() => {
    let vivo = true;
    municipios().then((ms) => { if (vivo) setMun(ms.find((m) => `${textoNorm(m.nome)}|${m.uf}` === c.chaveCidade) ?? null); });
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar(); };
    window.addEventListener('keydown', esc);
    return () => { vivo = false; window.removeEventListener('keydown', esc); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.chave]);

  if (modo === 'lateral') {
    return (
      <div className={`fe-fundo fe-fundo-lat ${saindo ? 'fe-sai' : ''}`} onClick={fechar}>
        <style>{ESTILO}</style>
        <aside className={`fe-gaveta ${saindo ? 'fe-sai' : ''}`} onClick={(e) => e.stopPropagation()}>
          <div className="fe-gaveta-topo">
            <Identidade c={c} onFechar={fechar} />
            <Acoes c={c} />
          </div>
          <div className="fe-gaveta-corpo">
            <Score c={c} />
            <Secao titulo="Por que ligar e o que oferecer" icone="fa-bullseye" atraso={60}><Motivos c={c} /></Secao>
            <Secao titulo="Dinheiro" icone="fa-sack-dollar" atraso={120}><Numeros c={c} /></Secao>
            <Secao titulo="Máquinas compradas conosco" icone="fa-tractor" atraso={180}><Maquinas c={c} /></Secao>
            <Secao titulo="Oficina" icone="fa-screwdriver-wrench" atraso={240}><Dados c={c} linhas={linhasOficina(c)} /></Secao>
            <Secao titulo="Comercial" icone="fa-handshake" atraso={280}><Dados c={c} linhas={linhasComercial(c, hoje)} /></Secao>
            <Secao titulo="Cadastro" icone="fa-id-card" atraso={320}><Dados c={c} linhas={linhasCadastro(c)} /></Secao>
            <Secao titulo="Localização" icone="fa-map-location-dot" atraso={360}><Mapa c={c} mun={mun} /></Secao>
            <Secao titulo={`Mercado de ${mun?.nome || c.cidade.replace(/\s*\(..\)$/, '') || 'cidade'}`} icone="fa-seedling" atraso={400}><Mercado c={c} mun={mun} /></Secao>
          </div>
        </aside>
      </div>
    );
  }

  return (
    <div className={`fe-fundo ${saindo ? 'fe-sai' : ''}`} onClick={fechar}>
      <style>{ESTILO}</style>
      <div className={`fe-janela ${saindo ? 'fe-sai' : ''}`} onClick={(e) => e.stopPropagation()}>
        <FichaAbas c={c} mun={mun} fechar={fechar} />
      </div>
    </div>
  );
}

export const ESTILO = `
  .fe-fundo { position: fixed; inset: 0; z-index: 9000; background: rgba(15,23,42,.45); backdrop-filter: blur(2px); display: grid; place-items: center; padding: 16px; animation: feFundo .2s ease both }
  .fe-fundo-lat { display: block; padding: 0 }
  @keyframes feFundo { from { opacity: 0 } }
  .fe-sai.fe-fundo { animation: feSai .22s ease both } @keyframes feSai { to { opacity: 0 } }
  .fe-gaveta { position: absolute; right: 0; top: 0; bottom: 0; width: min(660px, 100%); background: var(--portal-bg, #f8fafc); box-shadow: -20px 0 50px rgba(15,23,42,.22); display: flex; flex-direction: column; animation: feGaveta .38s cubic-bezier(.2,.9,.25,1) both }
  @keyframes feGaveta { from { transform: translateX(100%) } }
  .fe-sai.fe-gaveta { animation: feGavetaSai .22s ease both } @keyframes feGavetaSai { to { transform: translateX(100%) } }
  .fe-gaveta-topo { background: ${CARD}; border-bottom: 1px solid ${BD}; padding: 18px 20px 14px; display: grid; gap: 14px }
  .fe-gaveta-corpo { flex: 1; overflow-y: auto; padding: 16px 20px 28px; display: grid; gap: 14px; align-content: start }
  .fe-janela { width: min(1280px, 100%); height: min(860px, calc(100vh - 32px)); background: var(--portal-bg, #f8fafc); border-radius: 18px; overflow: hidden; display: grid; grid-template-columns: 340px 1fr; box-shadow: 0 30px 70px rgba(15,23,42,.3); animation: feJanela .35s cubic-bezier(.2,.9,.25,1) both }
  @keyframes feJanela { from { opacity: 0; transform: translateY(16px) scale(.98) } }
  .fe-sai.fe-janela { animation: feJanelaSai .22s ease both } @keyframes feJanelaSai { to { opacity: 0; transform: translateY(12px) scale(.98) } }
  .fe-lado { background: ${CARD}; border-right: 1px solid ${BD}; padding: 20px; overflow-y: auto; display: grid; gap: 16px; align-content: start }
  .fe-principal { display: flex; flex-direction: column; min-width: 0 }
  .fe-abas { display: flex; gap: 2px; padding: 12px 16px 0; background: ${CARD}; border-bottom: 1px solid ${BD}; overflow-x: auto }
  .fe-abas button { position: relative; border: 0; background: none; padding: 10px 14px 12px; font: inherit; font-size: 14px; font-weight: 600; color: ${MU}; cursor: pointer; white-space: nowrap; transition: color .2s }
  .fe-abas button i { margin-right: 6px; opacity: .7 }
  .fe-abas button::after { content: ''; position: absolute; left: 10px; right: 10px; bottom: -1px; height: 3px; border-radius: 3px 3px 0 0; background: #dc2626; transform: scaleX(0); transition: transform .25s cubic-bezier(.2,.9,.25,1) }
  .fe-abas button.on { color: ${TX} } .fe-abas button.on::after { transform: none } .fe-abas button:hover { color: ${TX} }
  .fe-aba-corpo { flex: 1; overflow-y: auto; padding: 18px 20px 28px; display: grid; gap: 14px; align-content: start; animation: feAba .3s ease both }
  @keyframes feAba { from { opacity: 0; transform: translateY(8px) } }
  @media (max-width: 860px) { .fe-janela { grid-template-columns: 1fr; height: calc(100vh - 32px); overflow-y: auto } .fe-lado { border-right: 0; border-bottom: 1px solid ${BD} } .fe-principal, .fe-aba-corpo { overflow: visible } }
  .fe-id { border-left: 4px solid var(--k); padding-left: 14px }
  .fe-x { width: 38px; height: 38px; border-radius: 10px; border: 1px solid ${BD}; background: ${CARD}; color: ${MU}; font-size: 16px; cursor: pointer; flex-shrink: 0; transition: transform .2s, color .2s }
  .fe-x:hover { transform: rotate(90deg); color: ${TX} }
  .fe-acoes { display: flex; gap: 8px; flex-wrap: wrap }
  .fe-bt { display: inline-flex; align-items: center; gap: 7px; height: 38px; padding: 0 14px; border-radius: 10px; border: 1px solid ${BD}; background: ${CARD}; color: ${TX}; font-size: 14px; font-weight: 600; text-decoration: none; transition: transform .15s, border-color .15s, background .15s }
  .fe-bt:hover { transform: translateY(-1px); border-color: #94a3b8 }
  .fe-bt-pri { background: #dc2626; border-color: #dc2626; color: #fefefe } .fe-bt-pri:hover { background: #b91c1c; border-color: #b91c1c }
  .fe-bt-whats { color: #15803d } .fe-bt-off { color: ${MU}; border-style: dashed; cursor: default } .fe-bt-off:hover { transform: none }
  .fe-score { background: var(--f); border-radius: 14px; padding: 14px 16px; animation: feSobe .4s ease both }
  .fe-score-n { font-size: 34px; line-height: 1; color: var(--k); font-variant-numeric: tabular-nums }
  .fe-score-trilho { height: 6px; border-radius: 6px; background: rgba(148,163,184,.35); margin-top: 10px; overflow: hidden }
  .fe-score-trilho span { display: block; height: 100%; background: var(--k); transform-origin: left; animation: feBarra 1s .1s cubic-bezier(.2,.8,.2,1) both }
  .fe-secao { background: ${CARD}; border: 1px solid ${BD}; border-radius: 14px; padding: 16px; animation: feSobe .4s ease both; min-width: 0 }
  .fe-secao h3 { margin: 0 0 12px; font-size: 13px; font-weight: 800; letter-spacing: .5px; text-transform: uppercase; color: ${MU}; display: flex; align-items: center; gap: 8px }
  @keyframes feSobe { from { opacity: 0; transform: translateY(10px) } }
  .fe-motivo { border: 1px solid ${BD}; border-left: 4px solid var(--k); border-radius: 10px; padding: 12px 14px; animation: feSobe .4s ease both }
  .fe-tag { font-size: 12px; font-weight: 800; color: var(--k); background: color-mix(in srgb, var(--k) 10%, transparent); border-radius: 6px; padding: 2px 8px }
  .fe-oferecer { margin-top: 8px; font-size: 14px; font-weight: 700; color: var(--k) } .fe-oferecer i { font-size: 12px; margin-right: 4px }
  .fe-nums { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(150px, 100%), 1fr)); gap: 10px }
  .fe-num { border: 1px solid ${BD}; border-radius: 12px; padding: 11px 13px; animation: feSobe .4s ease both }
  .fe-rot { font-size: 12.5px; color: ${MU}; font-weight: 600 }
  .fe-val { font-size: 22px; font-weight: 800; letter-spacing: -.02em; margin: 2px 0; font-variant-numeric: tabular-nums }
  .fe-tab { width: 100%; border-collapse: collapse; font-size: 14px; color: ${TX} }
  .fe-tab th { text-align: left; font-size: 12px; font-weight: 700; color: ${MU}; padding: 0 8px 8px; border-bottom: 1px solid ${BD} }
  .fe-tab td { padding: 9px 8px; border-bottom: 1px solid ${BD} } .fe-tab tr:last-child td { border-bottom: 0 }
  .fe-dl { margin: 0; display: grid }
  .fe-dl > div { display: grid; grid-template-columns: minmax(130px, 42%) 1fr; gap: 12px; padding: 8px 0; border-bottom: 1px solid ${BD}; font-size: 14px }
  .fe-dl > div:last-child { border-bottom: 0 }
  .fe-dl dt { color: ${MU} } .fe-dl dd { margin: 0; color: ${TX}; font-weight: 600 }
  .fe-falta { color: ${MU}; font-style: italic; font-weight: 400; opacity: .85 }
  .fe-mapa { position: relative; border-radius: 12px; overflow: hidden; border: 1px solid ${BD} }
  .fe-pino { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -100%); color: #dc2626; font-size: 28px; pointer-events: none; animation: fePino 1.6s ease-in-out infinite; filter: drop-shadow(0 3px 3px rgba(0,0,0,.3)) }
  @keyframes fePino { 50% { transform: translate(-50%, -122%) } }
  .fe-mapa-vazio { display: grid; place-content: center; justify-items: center; gap: 8px; text-align: center; background: ${SUAVE}; border-radius: 12px; color: ${MU}; font-size: 14px; padding: 16px }
  .fe-mapa-vazio i { font-size: 28px; opacity: .45 } .fe-mapa-vazio a { color: #2563eb; font-weight: 700 }
  .fe-barra { background: #16a34a; border-radius: 8px; transform-origin: left; animation: feBarra .8s cubic-bezier(.2,.8,.2,1) both }
  @keyframes feBarra { from { transform: scaleX(0) } }
  @media (prefers-reduced-motion: reduce) { .fe-fundo, .fe-gaveta, .fe-janela, .fe-secao, .fe-motivo, .fe-num, .fe-score, .fe-aba-corpo, .fe-barra, .fe-score-trilho span, .fe-pino { animation: none !important } }
`;
