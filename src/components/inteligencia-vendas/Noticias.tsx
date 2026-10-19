'use client';
// =============================================================================
// Boletim do agro — notícias diárias (José, 19/10/2026: "uma aba de notícias diárias,
// onde vamos verificar diariamente com um robô taxas, mercados da região, mudanças boas
// e mudanças ruins, previsões, como se fosse um G1 ou um UOL, e entregar o link da fonte").
// O robô (noticias-server.ts) roda 1x por dia às 06:30; aqui só lemos o boletim do dia.
// =============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FocusItem, Indicador, NoticiaBoletim, ClimaCidade, Manchete } from '@/lib/inteligencia-vendas/noticias';
import { apiEnviar, apiGet, Dica } from './ui';

export interface Boletim {
  dia: string; dias: string[]; geradoEm: string | null; manchete: Manchete | null; indicadores: Indicador[];
  noticias: (NoticiaBoletim & { id: number })[]; previsoes: { focus: FocusItem[]; clima: ClimaCidade[] };
  fontes: Record<string, 'ok' | 'erro'>; podeAtualizar: boolean;
}

const TX = 'var(--portal-text, #0f172a)', MU = 'var(--portal-text-muted, #64748b)';

export const CATEGORIAS: Record<string, { nome: string; cor: string; icone: string }> = {
  taxas: { nome: 'Juros e câmbio', cor: '#2563eb', icone: 'fa-percent' },
  mercado: { nome: 'Mercado', cor: '#ea580c', icone: 'fa-chart-line' },
  regiao: { nome: 'Região', cor: '#dc2626', icone: 'fa-location-dot' },
  clima: { nome: 'Clima', cor: '#0891b2', icone: 'fa-cloud-sun-rain' },
  credito: { nome: 'Crédito rural', cor: '#16a34a', icone: 'fa-building-columns' },
  maquinas: { nome: 'Máquinas', cor: '#7c3aed', icone: 'fa-tractor' },
  politica: { nome: 'Governo', cor: '#475569', icone: 'fa-landmark' },
};
export const cat = (c: string) => CATEGORIAS[c] || { nome: c, cor: '#475569', icone: 'fa-newspaper' };
export const TEND = {
  boa: { nome: 'Boa notícia', cor: '#15803d', fundo: '#dcfce7', icone: 'fa-arrow-trend-up' },
  ruim: { nome: 'Atenção', cor: '#b91c1c', fundo: '#fee2e2', icone: 'fa-arrow-trend-down' },
  neutra: { nome: 'Fique de olho', cor: '#475569', fundo: '#e2e8f0', icone: 'fa-eye' },
} as const;

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export const dataLonga = (iso: string) => { const d = new Date(`${iso}T12:00:00`); return `${SEMANA[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`; };
export const rotuloDia = (iso: string, hoje: string) => {
  const dif = Math.round((Date.parse(`${hoje}T12:00:00`) - Date.parse(`${iso}T12:00:00`)) / 86_400_000);
  return dif === 0 ? 'Hoje' : dif === 1 ? 'Ontem' : `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
};
export function haQuanto(iso: string | null): string {
  if (!iso) return '';
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(min) || min < 0) return '';
  if (min < 60) return `há ${Math.max(1, min)} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `há ${h} h` : `há ${Math.round(h / 24)} dia(s)`;
}
export const hojeISO = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);

// ── pedaços ──────────────────────────────────────────────────────────────────
export function Cotacoes({ ind, focus }: { ind: Indicador[]; focus: FocusItem[] }) {
  const itens = [
    ...ind.map((i) => ({ k: i.id, nome: i.nome, valor: i.texto, var: i.variacaoPct, tend: i.tendencia, ref: i.referencia, url: i.fonte_url })),
    ...focus.filter((f) => f.anterior != null).map((f) => ({
      k: `f-${f.indicador}-${f.ano}`, nome: `Focus ${f.indicador === 'Câmbio' ? 'dólar' : f.indicador} ${f.ano}`,
      valor: f.indicador === 'Câmbio' ? `R$ ${f.mediana.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `${f.mediana.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`,
      var: f.anterior ? ((f.mediana - f.anterior) / f.anterior) * 100 : null, tend: 'neutra' as const, ref: 'previsão do mercado', url: 'https://www.bcb.gov.br/publicacoes/focus',
    })),
  ];
  if (!itens.length) return null;
  const um = itens.map((i) => (
    <a key={i.k} className="nt-cot" href={i.url} target="_blank" rel="noreferrer" title={`${i.ref} · abrir a fonte`}>
      <span className="nt-cot-n">{i.nome}</span>
      <b>{i.valor}</b>
      {i.var != null && i.var !== 0 && <span style={{ color: i.var > 0 ? '#16a34a' : '#dc2626', fontWeight: 800 }}>{i.var > 0 ? '▲' : '▼'} {Math.abs(i.var).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span>}
    </a>
  ));
  return (
    <div className="nt-faixa">
      <span className="nt-ao-vivo"><i /> COTAÇÕES</span>
      <div className="nt-rolo"><div className="nt-trilho" style={{ animationDuration: `${Math.max(30, itens.length * 6)}s` }}>{um}{um}</div></div>
    </div>
  );
}

export function Selo({ t }: { t: keyof typeof TEND }) {
  const x = TEND[t] || TEND.neutra;
  return <span className="nt-selo" style={{ color: x.cor, background: x.fundo }}><i className={`fas ${x.icone}`} /> {x.nome}</span>;
}

function CartaoNoticia({ n, i, grande }: { n: NoticiaBoletim & { id: number }; i: number; grande?: boolean }) {
  const c = cat(n.categoria);
  return (
    <article className={`nt-card ${grande ? 'nt-card-g' : ''}`} style={{ ['--k' as string]: c.cor, animationDelay: `${Math.min(i, 12) * 55}ms` }}>
      <div className="nt-kicker"><i className={`fas ${c.icone}`} /> {c.nome}{n.cidades.length > 0 && <span style={{ color: MU, fontWeight: 600 }}> · {n.cidades.slice(0, 3).join(', ')}</span>}<span style={{ marginLeft: 'auto' }}><Selo t={n.tendencia} /></span></div>
      <a href={n.fonte_url} target="_blank" rel="noreferrer" className="nt-titulo">{n.titulo}</a>
      {n.resumo && <p className="nt-resumo">{n.resumo}</p>}
      {n.impacto && <div className="nt-impacto"><i className="fas fa-tractor" /> <span><b>Para quem vende:</b> {n.impacto}</span></div>}
      <div className="nt-rodape">
        <span><i className="fas fa-newspaper" /> {n.fonte_nome || 'fonte'}{n.publicado_em ? ` · ${haQuanto(n.publicado_em)}` : ''}</span>
        <a href={n.fonte_url} target="_blank" rel="noreferrer" className="nt-ler">Ler na fonte <i className="fas fa-arrow-up-right-from-square" /></a>
      </div>
    </article>
  );
}

export function Termometro({ ns }: { ns: NoticiaBoletim[] }) {
  const b = ns.filter((n) => n.tendencia === 'boa').length, r = ns.filter((n) => n.tendencia === 'ruim').length, t = Math.max(1, ns.length);
  const saldo = b - r;
  return (
    <section className="nt-lado-bloco">
      <h3><i className="fas fa-temperature-half" /> Termômetro do dia</h3>
      <div style={{ fontSize: 15, fontWeight: 800, color: saldo > 0 ? '#15803d' : saldo < 0 ? '#b91c1c' : TX, marginBottom: 8 }}>
        {saldo > 0 ? 'Dia mais de notícias boas' : saldo < 0 ? 'Dia pede atenção' : 'Dia equilibrado'}
      </div>
      <div className="nt-termo">
        <span style={{ width: `${(b / t) * 100}%`, background: '#16a34a' }} />
        <span style={{ width: `${((t - b - r) / t) * 100}%`, background: '#cbd5e1' }} />
        <span style={{ width: `${(r / t) * 100}%`, background: '#dc2626' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: MU, marginTop: 6 }}>
        <span><b style={{ color: '#15803d' }}>{b}</b> boas</span><span><b>{t - b - r}</b> neutras</span><span><b style={{ color: '#b91c1c' }}>{r}</b> de atenção</span>
      </div>
    </section>
  );
}

export function Previsoes({ focus }: { focus: FocusItem[] }) {
  if (!focus.length) return null;
  const val = (f: FocusItem, n: number) => (f.indicador === 'Câmbio' ? `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`);
  return (
    <section className="nt-lado-bloco">
      <h3><i className="fas fa-binoculars" /> O que o mercado prevê</h3>
      <div style={{ fontSize: 12.5, color: MU, marginBottom: 8 }}>Boletim Focus do Banco Central · mediana das previsões, comparada com 4 semanas antes</div>
      <div className="nt-focus">
        {focus.map((f) => {
          const sobe = f.anterior != null && f.mediana > f.anterior, cai = f.anterior != null && f.mediana < f.anterior;
          return (
            <Dica key={`${f.indicador}${f.ano}`} largura={260} conteudo={<>{f.indicador} {f.ano}: {val(f, f.mediana)}{f.anterior != null ? ` (era ${val(f, f.anterior)} há 4 semanas)` : ''}. Boletim de {f.data.slice(8, 10)}/{f.data.slice(5, 7)}.</>}>
              <div className="nt-focus-l">
                <span>{f.indicador === 'Câmbio' ? 'Dólar' : f.indicador} <small>{f.ano}</small></span>
                <b>{val(f, f.mediana)}</b>
                <span style={{ width: 22, textAlign: 'right', color: sobe ? '#ea580c' : cai ? '#2563eb' : MU }}>{sobe ? '▲' : cai ? '▼' : '='}</span>
              </div>
            </Dica>
          );
        })}
      </div>
      <a href="https://www.bcb.gov.br/publicacoes/focus" target="_blank" rel="noreferrer" className="nt-link-fonte">Ver o Boletim Focus <i className="fas fa-arrow-up-right-from-square" /></a>
    </section>
  );
}

export function TempoRegiao({ clima }: { clima: ClimaCidade[] }) {
  const [i, setI] = useState(0);
  if (!clima.length) return null;
  const c = clima[Math.min(i, clima.length - 1)];
  const max = Math.max(10, ...c.dias.map((d) => d.chuva_mm));
  return (
    <section className="nt-lado-bloco">
      <h3><i className="fas fa-cloud-sun-rain" /> Tempo na região · 7 dias</h3>
      <div className="nt-cidades">
        {clima.map((x, k) => <button key={x.cidade} type="button" className={k === i ? 'on' : ''} onClick={() => setI(k)}>{x.cidade}</button>)}
      </div>
      <div key={c.cidade} className="nt-dias">
        {c.dias.map((d, k) => {
          const dt = new Date(`${d.data}T12:00:00`);
          return (
            <Dica key={d.data} largura={200} conteudo={<>{SEMANA[dt.getDay()]} {d.data.slice(8, 10)}/{d.data.slice(5, 7)}: {Math.round(d.chuva_mm)} mm{d.prob != null ? ` (${d.prob}%)` : ''}, {Math.round(d.tmin)}° a {Math.round(d.tmax)}°</>}>
              <div className="nt-dia" style={{ animationDelay: `${k * 50}ms` }}>
                <small>{k === 0 ? 'hoje' : SEMANA[dt.getDay()].slice(0, 3)}</small>
                <i className={`fas ${d.chuva_mm >= 10 ? 'fa-cloud-showers-heavy' : d.chuva_mm >= 1 ? 'fa-cloud-rain' : d.tmin <= 3 ? 'fa-snowflake' : 'fa-sun'}`} style={{ color: d.chuva_mm >= 1 ? '#2563eb' : d.tmin <= 3 ? '#0891b2' : '#f59e0b' }} />
                <span className="nt-chuva"><span style={{ height: `${(d.chuva_mm / max) * 100}%` }} /></span>
                <small><b>{d.chuva_mm >= 0.5 ? Math.round(d.chuva_mm) : 0}</b> mm</small>
              </div>
            </Dica>
          );
        })}
      </div>
      {c.alertas.map((a) => <div key={a} className={`nt-alerta ${/bo[am] para|na medida/i.test(a) ? 'bom' : ''}`}>{a}</div>)}
      <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="nt-link-fonte">Fonte: Open-Meteo <i className="fas fa-arrow-up-right-from-square" /></a>
    </section>
  );
}

// ── tela ─────────────────────────────────────────────────────────────────────
export default function Noticias({ dadosIniciais }: { dadosIniciais?: Boletim } = {}) {
  const [b, setB] = useState<Boletim | null>(dadosIniciais ?? null);
  const [erro, setErro] = useState('');
  const [semTabela, setSemTabela] = useState(false);
  const [dia, setDia] = useState('');
  const [fCat, setFCat] = useState('');
  const [fTend, setFTend] = useState('');
  const [atualizando, setAtualizando] = useState(false);

  const carregar = useCallback(async (d = '') => {
    setErro('');
    try { setB(await apiGet(`/api/inteligencia-vendas/noticias${d ? `?dia=${d}` : ''}`)); }
    catch (e) {
      const m = (e as Error).message;
      if (/migration|migra/i.test(m)) setSemTabela(true); else setErro(m);
    }
  }, []);
  useEffect(() => { if (!dadosIniciais) carregar(dia); }, [carregar, dia, dadosIniciais]);

  const atualizar = async () => {
    setAtualizando(true); setErro('');
    try { await apiEnviar('/api/inteligencia-vendas/noticias', 'POST', { acao: 'atualizar' }); setDia(''); await carregar(''); }
    catch (e) { setErro((e as Error).message); }
    finally { setAtualizando(false); }
  };

  const ns = useMemo(() => b?.noticias ?? [], [b]);
  const destaques = ns.filter((n) => n.destaque).slice(0, 3);
  const filtradas = ns.filter((n) => (!fCat || n.categoria === fCat) && (!fTend || n.tendencia === fTend) && !(n.destaque && !fCat && !fTend));
  const contaCat = (c: string) => ns.filter((n) => n.categoria === c).length;
  const hoje = hojeISO();

  if (semTabela) {
    return (
      <div className="nt-tela"><style>{ESTILO_NOTICIAS}</style>
        <div className="nt-vazio"><i className="fas fa-database" /><b>Falta criar as tabelas do boletim</b>
          <span>Rode o arquivo <code>sql/inteligencia-vendas-noticias.sql</code> no SQL Editor do Supabase. Depois clique em Atualizar ou espere o robô das 06:30.</span></div>
      </div>
    );
  }

  return (
    <div className="nt-tela">
      <style>{ESTILO_NOTICIAS}</style>
      <header className="nt-cabeca">
        <div>
          <div className="nt-marca"><i className="fas fa-newspaper" /> Boletim do agro</div>
          <div style={{ fontSize: 14, color: MU, marginTop: 2 }}>
            {b ? dataLonga(b.dia) : 'Carregando…'}{b?.geradoEm ? ` · atualizado ${haQuanto(b.geradoEm)} pelo robô` : ''}
          </div>
        </div>
        <div className="nt-dias-nav">
          {(b?.dias.length ? b.dias.slice(0, 7) : []).map((d) => (
            <button key={d} type="button" className={d === b?.dia ? 'on' : ''} onClick={() => setDia(d)}>{rotuloDia(d, hoje)}</button>
          ))}
        </div>
        {b?.podeAtualizar && (
          <button type="button" className="nt-atualizar" onClick={atualizar} disabled={atualizando}>
            <i className={`fas fa-rotate ${atualizando ? 'fa-spin' : ''}`} /> {atualizando ? 'Lendo as fontes… (até 1 min)' : 'Atualizar agora'}
          </button>
        )}
      </header>
      {erro && <div className="nt-erro"><i className="fas fa-triangle-exclamation" /> {erro}</div>}

      {b && <Cotacoes ind={b.indicadores} focus={b.previsoes.focus} />}

      {b && !ns.length && (
        <div className="nt-vazio"><i className="fas fa-mug-hot" /><b>Ainda não tem boletim {b.dias.length ? 'neste dia' : ''}</b>
          <span>O robô monta o boletim todo dia às 06:30.{b.podeAtualizar ? ' Clique em "Atualizar agora" para gerar já.' : ''}</span></div>
      )}

      {b && ns.length > 0 && (
        <div className="nt-grade">
          <main style={{ minWidth: 0, display: 'grid', gap: 16, alignContent: 'start' }}>
            {b.manchete && (
              <section className="nt-manchete">
                <div className="nt-manchete-k"><i className="fas fa-bolt" /> Manchete do dia</div>
                <h1>{b.manchete.titulo}</h1>
                <p>{b.manchete.resumo}</p>
              </section>
            )}
            {destaques.length > 0 && !fCat && !fTend && (
              <div className="nt-destaques">{destaques.map((n, i) => <CartaoNoticia key={n.id} n={n} i={i} grande />)}</div>
            )}
            <div className="nt-filtros">
              <button type="button" className={!fCat ? 'on' : ''} onClick={() => setFCat('')}>Todas <b>{ns.length}</b></button>
              {Object.entries(CATEGORIAS).filter(([k]) => contaCat(k)).map(([k, c]) => (
                <button key={k} type="button" className={fCat === k ? 'on' : ''} style={{ ['--k' as string]: c.cor }} onClick={() => setFCat(fCat === k ? '' : k)}>
                  <i className={`fas ${c.icone}`} /> {c.nome} <b>{contaCat(k)}</b>
                </button>
              ))}
              <span className="nt-sep" />
              {(['boa', 'ruim'] as const).map((t) => (
                <button key={t} type="button" className={`nt-t ${fTend === t ? 'on' : ''}`} style={{ ['--k' as string]: TEND[t].cor }} onClick={() => setFTend(fTend === t ? '' : t)}>
                  <i className={`fas ${TEND[t].icone}`} /> {t === 'boa' ? 'Só as boas' : 'Só as de atenção'}
                </button>
              ))}
            </div>
            <div key={`${fCat}${fTend}${b.dia}`} className="nt-lista">
              {filtradas.map((n, i) => <CartaoNoticia key={n.id} n={n} i={i} />)}
              {!filtradas.length && <div style={{ color: MU, fontStyle: 'italic', padding: 20 }}>Nenhuma notícia com esse filtro.</div>}
            </div>
          </main>
          <aside className="nt-lado">
            <Termometro ns={ns} />
            <Previsoes focus={b.previsoes.focus} />
            <TempoRegiao clima={b.previsoes.clima} />
            <section className="nt-lado-bloco">
              <h3><i className="fas fa-satellite-dish" /> Fontes lidas pelo robô</h3>
              <div style={{ display: 'grid', gap: 4 }}>
                {Object.entries(b.fontes).sort(([, a], [, z]) => a.localeCompare(z)).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', gap: 8, fontSize: 13, color: v === 'ok' ? TX : '#b91c1c' }}>
                    <i className={`fas ${v === 'ok' ? 'fa-circle-check' : 'fa-circle-xmark'}`} style={{ color: v === 'ok' ? '#16a34a' : '#dc2626', marginTop: 3 }} />{k}{v === 'erro' && ' (fora do ar)'}
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}

export const ESTILO_NOTICIAS = `
  .nt-tela { padding: 18px clamp(12px, 2vw, 28px) 40px; display: grid; gap: 16px }
  .nt-cabeca { display: flex; align-items: center; gap: 16px; flex-wrap: wrap }
  .nt-marca { font-size: 26px; font-weight: 900; letter-spacing: -.02em; color: ${TX} } .nt-marca i { color: #dc2626; margin-right: 6px }
  .nt-dias-nav { display: flex; gap: 4px; margin-left: auto; flex-wrap: wrap }
  .nt-dias-nav button { border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); color: ${MU}; border-radius: 999px; padding: 6px 13px; font: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer; transition: all .2s }
  .nt-dias-nav button.on { background: #111111; color: #fefefe; border-color: #111111 }
  .nt-atualizar { border: 0; background: #dc2626; color: #fefefe; border-radius: 10px; padding: 9px 15px; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; transition: transform .2s, background .2s }
  .nt-atualizar:hover:not(:disabled) { transform: translateY(-1px); background: #b91c1c } .nt-atualizar:disabled { opacity: .75; cursor: wait }
  .nt-erro { background: #fee2e2; color: #991b1b; border-radius: 10px; padding: 10px 14px; font-size: 14px }
  .nt-faixa { display: flex; align-items: stretch; border-radius: 12px; overflow: hidden; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0) }
  .nt-ao-vivo { display: flex; align-items: center; gap: 8px; padding: 0 14px; background: #111111; color: #fefefe; font-size: 12px; font-weight: 900; letter-spacing: .08em; flex-shrink: 0 }
  .nt-ao-vivo i { width: 8px; height: 8px; border-radius: 50%; background: #ef4444; animation: ntPisca 1.4s ease-in-out infinite } @keyframes ntPisca { 50% { opacity: .25 } }
  .nt-rolo { overflow: hidden; flex: 1; mask-image: linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent) }
  .nt-trilho { display: flex; width: max-content; animation: ntRola linear infinite } .nt-faixa:hover .nt-trilho { animation-play-state: paused }
  @keyframes ntRola { to { transform: translateX(-50%) } }
  .nt-cot { display: flex; align-items: baseline; gap: 8px; padding: 11px 20px; border-right: 1px solid var(--portal-border, #e2e8f0); text-decoration: none; color: ${TX}; font-size: 14px; white-space: nowrap; transition: background .2s }
  .nt-cot:hover { background: var(--portal-bg-secondary, #f1f5f9) } .nt-cot-n { color: ${MU}; font-size: 12.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em }
  .nt-grade { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 20px; align-items: start }
  @media (max-width: 1100px) { .nt-grade { grid-template-columns: 1fr } }
  .nt-manchete { position: relative; overflow: hidden; border-radius: 18px; padding: 26px 28px; color: #fefefe; background: linear-gradient(135deg, #111111, #3f1d1d 60%, #7f1d1d); animation: ntSobe .5s ease both }
  .nt-manchete::after { content: ''; position: absolute; inset: 0; background: linear-gradient(115deg, transparent 35%, rgba(255,255,255,.12) 50%, transparent 65%); background-size: 250% 100%; animation: ntBrilho 7s ease-in-out infinite; pointer-events: none }
  @keyframes ntBrilho { 0%, 70% { background-position: 160% 0 } 100% { background-position: -60% 0 } }
  .nt-manchete-k { font-size: 12.5px; font-weight: 900; letter-spacing: .1em; text-transform: uppercase; color: #fca5a5 }
  .nt-manchete h1 { margin: 8px 0 10px; font-size: clamp(24px, 2.6vw, 34px); line-height: 1.15; font-weight: 900; letter-spacing: -.02em }
  .nt-manchete p { margin: 0; font-size: 16.5px; line-height: 1.55; opacity: .9; max-width: 900px }
  .nt-destaques { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); gap: 14px }
  .nt-card { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); border-radius: 14px; padding: 15px 17px; display: flex; flex-direction: column; gap: 8px; animation: ntSobe .45s ease both; transition: transform .2s, box-shadow .2s, border-color .2s }
  .nt-card:hover { transform: translateY(-3px); box-shadow: 0 14px 30px rgba(15,23,42,.10); border-color: var(--k) }
  .nt-card-g { border-top: 4px solid var(--k) }
  @keyframes ntSobe { from { opacity: 0; transform: translateY(12px) } }
  .nt-kicker { display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; color: var(--k) }
  .nt-selo { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 800; border-radius: 999px; padding: 3px 9px; text-transform: none; letter-spacing: 0 }
  .nt-titulo { font-size: 18px; font-weight: 800; line-height: 1.3; color: ${TX}; text-decoration: none } .nt-card-g .nt-titulo { font-size: 19.5px }
  .nt-titulo:hover { color: var(--k); text-decoration: underline }
  .nt-resumo { margin: 0; font-size: 14.5px; line-height: 1.55; color: var(--portal-text-secondary, #334155) }
  .nt-impacto { display: flex; gap: 9px; font-size: 13.5px; line-height: 1.45; color: ${TX}; background: color-mix(in srgb, var(--k) 8%, transparent); border-left: 3px solid var(--k); border-radius: 0 10px 10px 0; padding: 8px 11px }
  .nt-impacto i { color: var(--k); margin-top: 3px }
  .nt-rodape { display: flex; align-items: center; gap: 10px; font-size: 12.5px; color: ${MU}; margin-top: auto; padding-top: 4px; flex-wrap: wrap }
  .nt-ler { margin-left: auto; color: var(--k); font-weight: 800; text-decoration: none; white-space: nowrap } .nt-ler:hover { text-decoration: underline }
  .nt-filtros { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; position: sticky; top: 0; z-index: 2; padding: 8px 0; background: var(--portal-bg, #f8fafc) }
  .nt-filtros button { --k: #111111; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); color: ${TX}; border-radius: 999px; padding: 6px 12px; font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; transition: all .2s }
  .nt-filtros button i { color: var(--k); margin-right: 3px } .nt-filtros button b { margin-left: 4px; opacity: .6 }
  .nt-filtros button:hover { border-color: var(--k) }
  .nt-filtros button.on { background: var(--k); border-color: var(--k); color: #fefefe } .nt-filtros button.on i { color: #fefefe }
  .nt-sep { width: 1px; height: 22px; background: var(--portal-border, #e2e8f0); margin: 0 4px }
  .nt-lista { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(360px, 100%), 1fr)); gap: 14px }
  .nt-lado { display: grid; gap: 14px; position: sticky; top: 12px }
  .nt-lado-bloco { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); border-radius: 14px; padding: 15px 16px; animation: ntSobe .5s ease both }
  .nt-lado-bloco h3 { margin: 0 0 10px; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; color: ${MU}; display: flex; gap: 8px; align-items: center }
  .nt-termo { display: flex; height: 12px; border-radius: 12px; overflow: hidden; gap: 2px; animation: ntCresce 1s cubic-bezier(.2,.8,.2,1) both; transform-origin: left }
  @keyframes ntCresce { from { transform: scaleX(0) } }
  .nt-focus { display: grid }
  .nt-focus-l { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; padding: 7px 0; border-bottom: 1px dashed var(--portal-border, #e2e8f0); font-size: 14px; color: ${TX}; width: 100% }
  .nt-focus-l small { color: ${MU} }
  .nt-link-fonte { display: inline-block; margin-top: 10px; font-size: 12.5px; color: #2563eb; font-weight: 700; text-decoration: none }
  .nt-cidades { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 10px }
  .nt-cidades button { border: 0; background: var(--portal-bg-secondary, #f1f5f9); color: ${MU}; border-radius: 8px; padding: 5px 9px; font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer }
  .nt-cidades button.on { background: #0891b2; color: #fefefe }
  .nt-dias { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px }
  .nt-dia { display: grid; justify-items: center; gap: 4px; padding: 6px 0; border-radius: 10px; animation: ntSobe .4s ease both; transition: background .2s; width: 100% }
  .nt-dia:hover { background: var(--portal-bg-secondary, #f1f5f9) } .nt-dia small { font-size: 11px; color: ${MU}; text-transform: uppercase }
  .nt-chuva { width: 8px; height: 36px; border-radius: 8px; background: var(--portal-bg-secondary, #f1f5f9); display: flex; align-items: flex-end; overflow: hidden }
  .nt-chuva span { width: 100%; background: #3b82f6; border-radius: 8px; animation: ntChuva .8s ease both; transform-origin: bottom } @keyframes ntChuva { from { transform: scaleY(0) } }
  .nt-alerta { margin-top: 8px; font-size: 13px; font-weight: 600; color: #92400e; background: #fffbeb; border-radius: 8px; padding: 7px 10px }
  .nt-alerta.bom { color: #166534; background: #f0fdf4 }
  .nt-vazio { display: grid; justify-items: center; gap: 8px; text-align: center; padding: 50px 20px; color: ${MU}; background: var(--portal-bg-card, #fefefe); border: 1px dashed var(--portal-border, #cbd5e1); border-radius: 16px }
  .nt-vazio i { font-size: 34px; opacity: .5 } .nt-vazio b { font-size: 18px; color: ${TX} }
  @media (prefers-reduced-motion: reduce) { .nt-trilho, .nt-manchete, .nt-manchete::after, .nt-card, .nt-lado-bloco, .nt-termo, .nt-dia, .nt-chuva span, .nt-ao-vivo i { animation: none !important } }
`;
