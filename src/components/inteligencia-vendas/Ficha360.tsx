'use client';
// =============================================================================
// Ficha 360 do cliente (José, 19/10/2026): tudo o que os radares cruzam, num bloco
// só — por que ligar, dinheiro, localização no mapa, mercado da cidade (IBGE + CAR
// + crédito rural), máquinas compradas, oficina e comercial. Tudo animado.
// =============================================================================
import { useEffect, useRef, useState } from 'react';
import type { ClienteIV } from '@/lib/inteligencia-vendas/tipos';
import type { MunicipioIV } from '@/lib/inteligencia-vendas/municipios';
import { REGRAS } from '@/lib/inteligencia-vendas/regras';
import { textoNorm } from '@/lib/inteligencia-vendas/normalizar';
import { apiGet } from './ui';

const TX = 'var(--portal-text, #0f172a)', MU = 'var(--portal-text-muted, #64748b)', BD = 'var(--portal-border, #e2e8f0)';
const CARD = 'var(--portal-bg-card, #fefefe)', SUAVE = 'var(--portal-bg-secondary, #f1f5f9)';

const ICONE: Record<string, string> = {
  renovacao: 'fa-rotate', cruzada: 'fa-puzzle-piece', outra_marca: 'fa-flag', reabordar: 'fa-reply', proposta_parada: 'fa-hourglass-half',
  sumiu: 'fa-user-slash', sem_visita: 'fa-route', perfil: 'fa-seedling', prestador: 'fa-briefcase',
};

// municípios: uma leitura por sessão da página
let cacheMun: Promise<MunicipioIV[]> | null = null;
const municipios = () => (cacheMun ??= apiGet('/api/inteligencia-vendas/municipios').then((j) => j.municipios as MunicipioIV[]).catch(() => []));

const reais = (n: number) => (n >= 1e6 ? `R$ ${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : `R$ ${Math.round(n).toLocaleString('pt-BR')}`);
const dataBR = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const fone = (t: string) => { let d = t.replace(/\D/g, ''); if (d.startsWith('55') && d.length > 11) d = d.slice(2); return d.length >= 10 ? d : ''; };
const foneBonito = (d: string) => (d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`);

function useConta(alvo: number, ms = 1000) {
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

export default function Ficha360({ c, onFechar }: { c: ClienteIV; onFechar: () => void }) {
  const [mun, setMun] = useState<MunicipioIV | null>(null);
  const [saindo, setSaindo] = useState(false);
  useEffect(() => {
    let vivo = true;
    municipios().then((ms) => { if (vivo) setMun(ms.find((m) => `${textoNorm(m.nome)}|${m.uf}` === c.chaveCidade) ?? null); });
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar(); };
    window.addEventListener('keydown', esc);
    return () => { vivo = false; window.removeEventListener('keydown', esc); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.chave]);
  const fechar = () => { setSaindo(true); setTimeout(onFechar, 220); };

  const cor = REGRAS[c.oportunidades[0]?.regra ?? 'sem_visita'].cor;
  const f = fone(c.telefone);
  const cod = c.codigos.find((x) => x.empresa === 'NOVA') || c.codigos[0];
  const ponto: [number, number] | null = c.local ?? mun?.centro ?? null;
  const aproximado = !c.local && !!mun?.centro;
  const variacaoPecas = c.pecas12a24m > 0 ? (c.pecas12m - c.pecas12a24m) / c.pecas12a24m : null;
  const ini = c.nome.split(/\s+/).filter((p) => p.length > 2).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  const r = 34, circ = 2 * Math.PI * r;

  return (
    <div onClick={fechar} className={`f3-fundo ${saindo ? 'f3-sai' : ''}`}>
      <style>{ESTILO}</style>
      <div onClick={(e) => e.stopPropagation()} className={`f3-caixa ${saindo ? 'f3-sai' : ''}`} style={{ ['--c' as string]: cor }}>
        {/* cabeçalho */}
        <header className="f3-topo">
          <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', position: 'relative' }}>
            <span className="f3-avatar">{ini}</span>
            <div style={{ flex: 1, minWidth: 240 }}>
              <h2 style={{ margin: 0, fontSize: 'clamp(22px, 2.2vw, 30px)', fontWeight: 800, lineHeight: 1.15 }}>{c.nome}</h2>
              <div style={{ fontSize: 16, opacity: .92, marginTop: 4 }}>
                <i className="fas fa-location-dot" /> {c.cidade || '—'} · {c.lojas.join(' + ')}{c.vendedor ? <> · <i className="fas fa-user-tie" /> {c.vendedor}</> : null}
              </div>
              {f && <div style={{ fontSize: 20, fontWeight: 700, marginTop: 6, letterSpacing: .3 }}>{foneBonito(f)}</div>}
            </div>
            <div style={{ position: 'relative', width: 84, height: 84 }} title="Score: soma dos motivos para ligar (0 a 100)">
              <svg width="84" height="84" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="42" cy="42" r={r} fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="8" />
                <circle cx="42" cy="42" r={r} fill="none" stroke="#fefefe" strokeWidth="8" strokeLinecap="round" className="f3-anel"
                  strokeDasharray={circ} strokeDashoffset={circ * (1 - c.score / 100)} style={{ ['--t' as string]: circ }} />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', lineHeight: 1 }}>
                <span><b style={{ fontSize: 26 }}><Conta v={c.score} /></b><br /><span style={{ fontSize: 11, opacity: .85 }}>score</span></span>
              </div>
            </div>
            <button type="button" onClick={fechar} aria-label="Fechar" className="f3-fechar"><i className="fas fa-xmark" /></button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16, position: 'relative' }}>
            {f && <a className="f3-acao" href={`tel:${f}`}><i className="fas fa-phone" /> Ligar</a>}
            {f && <a className="f3-acao f3-whats" href={`https://wa.me/55${f}`} target="_blank" rel="noreferrer"><i className="fab fa-whatsapp" /> WhatsApp</a>}
            {cod && <a className="f3-acao" href={`/clientes?cod=${cod.cod}&doc=${c.doc}&empresa=${cod.empresa === 'NOVA' ? 'Nova Tratores' : 'Castro Pecas'}`}><i className="fas fa-folder-open" /> Pasta do cliente</a>}
            <a className="f3-acao" href="/propostas"><i className="fas fa-file-signature" /> Nova proposta</a>
            <a className="f3-acao" href={`/inteligencia-vendas/calculadora?cliente=${encodeURIComponent(c.nome)}${c.areaHa ? `&area=${Math.round(c.areaHa)}` : ''}`}><i className="fas fa-calculator" /> Calcular retorno</a>
          </div>
        </header>

        <div className="f3-corpo">
          {/* dinheiro */}
          <div className="f3-grade4">
            {[
              { t: 'Máquinas compradas', v: c.valorMaquinas, s: `${c.qtdTratores} trator(es) · ${c.qtdImplementos} implemento(s)`, i: 'fa-tractor', k: '#2563eb' },
              { t: 'Peças em 12 meses', v: c.pecas12m, s: variacaoPecas == null ? `${c.pedidosPecas12m} pedidos` : `${variacaoPecas >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(variacaoPecas * 100))}% vs ano anterior`, i: 'fa-gears', k: '#ea580c', alerta: variacaoPecas != null && variacaoPecas < 0 },
              { t: 'Propostas em aberto', v: c.valorPropostasAbertas, s: `${c.propostasAbertas} aberta(s) · ${c.propostasGanhas} ganha(s) · ${c.propostasPerdidas} perdida(s)`, i: 'fa-file-signature', k: '#16a34a' },
              { t: 'Oficina em 12 meses', v: c.os12m, s: c.ultimaOS ? `última OS ${dataBR(c.ultimaOS)}` : 'sem OS', i: 'fa-screwdriver-wrench', k: '#7c3aed', n: true },
            ].map((x, i) => (
              <div key={x.t} className="f3-num" style={{ animationDelay: `${120 + i * 70}ms`, ['--k' as string]: x.k }}>
                <i className={`fas ${x.i}`} />
                <div style={{ fontSize: 13.5, color: MU, fontWeight: 700 }}>{x.t}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: x.k, letterSpacing: '-.02em' }}><Conta v={x.v} f={x.n ? undefined : reais} /></div>
                <div style={{ fontSize: 13.5, color: x.alerta ? '#dc2626' : MU, fontWeight: x.alerta ? 700 : 500 }}>{x.s}</div>
              </div>
            ))}
          </div>

          <div className="f3-duas">
            {/* por que ligar */}
            <section className="f3-bloco" style={{ animationDelay: '260ms' }}>
              <h3><i className="fas fa-bullseye" style={{ color: cor }} /> Por que ligar e o que oferecer</h3>
              {c.oportunidades.length === 0 && <div style={{ color: MU }}>Nenhum motivo agora.</div>}
              <div style={{ display: 'grid', gap: 10 }}>
                {c.oportunidades.map((o, i) => (
                  <div key={o.regra} className="f3-motivo" style={{ animationDelay: `${320 + i * 90}ms`, ['--k' as string]: REGRAS[o.regra].cor }}>
                    <span className="f3-mic"><i className={`fas ${ICONE[o.regra]}`} /></span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: TX }}>{o.titulo}</div>
                      <div style={{ fontSize: 14.5, color: MU, marginTop: 2 }}>{o.porque}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: REGRAS[o.regra].cor, marginTop: 4 }}>→ {o.oferecer}</div>
                    </div>
                    <span style={{ fontSize: 13, color: MU, fontWeight: 700 }}>+{o.peso}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* localização */}
            <section className="f3-bloco" style={{ animationDelay: '320ms' }}>
              <h3><i className="fas fa-map-location-dot" style={{ color: '#2563eb' }} /> Localização</h3>
              {ponto ? (
                <>
                  <div className="f3-mapa">
                    <iframe title="Mapa" loading="lazy" style={{ border: 0, width: '100%', height: '100%' }}
                      src={`https://www.openstreetmap.org/export/embed.html?bbox=${ponto[1] - (aproximado ? .12 : .03)},${ponto[0] - (aproximado ? .08 : .02)},${ponto[1] + (aproximado ? .12 : .03)},${ponto[0] + (aproximado ? .08 : .02)}&layer=mapnik`} />
                    <span className="f3-pino"><i className="fas fa-location-dot" /></span>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, flexWrap: 'wrap', fontSize: 14, color: MU }}>
                    <span>{aproximado ? `Posição aproximada: centro de ${mun?.nome}` : 'Posição da propriedade (GPS da visita do vendedor)'}</span>
                    <a href={`https://www.google.com/maps?q=${ponto[0]},${ponto[1]}`} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', color: '#2563eb', fontWeight: 700 }}>Abrir no Google Maps →</a>
                  </div>
                </>
              ) : (
                <div style={{ display: 'grid', placeItems: 'center', height: 200, background: SUAVE, borderRadius: 14, color: MU, textAlign: 'center', padding: 16 }}>
                  <div><i className="fas fa-map" style={{ fontSize: 30, opacity: .5 }} /><div style={{ marginTop: 8 }}>Sem posição no CRM e cidade fora da área do mapa.</div>
                    <a href={`https://www.google.com/maps/search/${encodeURIComponent(c.cidade)}`} target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontWeight: 700 }}>Ver {c.cidade} no Google Maps</a></div>
                </div>
              )}
            </section>
          </div>

          <div className="f3-duas">
            {/* mercado da cidade */}
            <section className="f3-bloco" style={{ animationDelay: '380ms' }}>
              <h3><i className="fas fa-seedling" style={{ color: '#16a34a' }} /> Mercado de {mun?.nome || c.cidade.replace(/\s*\(..\)$/, '')}</h3>
              {!mun ? <div style={{ color: MU, fontSize: 14.5 }}>Cidade fora dos 45 municípios da loja (sem dados de IBGE e CAR aqui).</div> : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 12 }}>
                    {[
                      { t: 'Foco', v: String(mun.foco), s: 'mercado × presença nossa' },
                      { t: 'Área plantada', v: `${Math.round(mun.areaPlantadaHa / 1000).toLocaleString('pt-BR')} mil ha`, s: 'IBGE' },
                      { t: 'Crédito investimento', v: reais(mun.invest36m || 0), s: 'últimos 3 anos' },
                      { t: 'Clientes c/ trator nosso', v: `${mun.clientesComTrator}`, s: `de ${mun.imoveis ?? '—'} imóveis` },
                    ].map((x) => (
                      <div key={x.t} style={{ background: SUAVE, borderRadius: 12, padding: '9px 11px' }}>
                        <div style={{ fontSize: 12.5, color: MU, fontWeight: 700 }}>{x.t}</div>
                        <div style={{ fontSize: 19, fontWeight: 800, color: TX }}>{x.v}</div>
                        <div style={{ fontSize: 12, color: MU }}>{x.s}</div>
                      </div>
                    ))}
                  </div>
                  {mun.culturas.slice(0, 5).map((cu, i) => (
                    <div key={cu.nome} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, fontSize: 14.5, color: TX }}>
                      <span style={{ width: 120, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cu.nome}</span>
                      <span style={{ flex: 1, height: 10, borderRadius: 10, background: SUAVE, overflow: 'hidden' }}>
                        <span className="f3-barra" style={{ display: 'block', height: '100%', width: `${(cu.ha / (mun.culturas[0]?.ha || 1)) * 100}%`, animationDelay: `${450 + i * 80}ms` }} />
                      </span>
                      <span style={{ width: 80, textAlign: 'right', color: MU }}>{Math.round(cu.ha).toLocaleString('pt-BR')} ha</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 12, fontSize: 15, fontWeight: 700, color: '#15803d' }}><i className="fas fa-lightbulb" /> Vender lá: {mun.linhas.join(' · ')}</div>
                </>
              )}
              {(c.areaHa || c.culturas.length > 0) && (
                <div style={{ marginTop: 12, fontSize: 14.5, color: TX, background: SUAVE, borderRadius: 12, padding: '9px 12px' }}>
                  <b>Propriedade (CRM):</b> {c.areaHa ? `${Math.round(c.areaHa)} ha` : ''}{c.culturas.length ? ` · ${c.culturas.join(', ')}` : ''}
                </div>
              )}
            </section>

            {/* máquinas */}
            <section className="f3-bloco" style={{ animationDelay: '440ms' }}>
              <h3><i className="fas fa-tractor" style={{ color: '#2563eb' }} /> Máquinas compradas conosco</h3>
              {c.maquinas.length === 0 && <div style={{ color: MU, fontSize: 14.5 }}>Nenhuma na nossa base (Omie desde 11/2022 e revisões desde 2019).</div>}
              <div className="f3-linha-tempo">
                {c.maquinas.map((m, i) => (
                  <div key={i} className="f3-maq" style={{ animationDelay: `${500 + i * 70}ms` }}>
                    <span className="f3-ponto" style={{ background: m.tipo === 'trator' ? '#dc2626' : m.tipo === 'implemento' ? '#ea580c' : '#64748b' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15.5, fontWeight: 800, color: TX }}>{m.modelo}</div>
                      <div style={{ fontSize: 13.5, color: MU }}>{m.familia} · {dataBR(m.data)}</div>
                    </div>
                    {m.valor ? <b style={{ fontSize: 15, color: TX }}>{reais(m.valor)}</b> : null}
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* oficina e comercial */}
          <section className="f3-bloco" style={{ animationDelay: '500ms' }}>
            <h3><i className="fas fa-clipboard-list" style={{ color: MU }} /> Oficina e comercial</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
              {[
                ['Maior horímetro visto', c.maiorHorimetro ? `${c.maiorHorimetro.toLocaleString('pt-BR')} h` : '—'],
                ['Outras marcas na oficina', c.marcasNaOficina.join(', ') || '—'],
                ['Última compra de peças', dataBR(c.ultimaCompraPecas)],
                ['Peças 12 a 24 meses atrás', reais(c.pecas12a24m)],
                ['Última proposta', dataBR(c.ultimaProposta)],
                ['Última perdida', c.ultimaPerdida ? `${[c.ultimaPerdida.marca, c.ultimaPerdida.modelo].filter(Boolean).join(' ')} · ${dataBR(c.ultimaPerdida.data)}` : '—'],
                ['Visitas no CRM', `${c.visitas}${c.ultimaVisita ? ` · última ${dataBR(c.ultimaVisita)}` : ''}`],
                ['Atividade (CNAE)', c.cnae ? c.cnaeDescricao : 'não consultado'],
              ].map(([t, v]) => (
                <div key={t} style={{ background: SUAVE, borderRadius: 12, padding: '9px 12px' }}>
                  <div style={{ fontSize: 12.5, color: MU, fontWeight: 700 }}>{t}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: TX }}>{v}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

const ESTILO = `
  .f3-fundo { position: fixed; inset: 0; z-index: 9000; background: rgba(15,23,42,.55); backdrop-filter: blur(4px); display: grid; place-items: center; padding: 16px; animation: f3Fundo .25s ease both }
  @keyframes f3Fundo { from { opacity: 0 } }
  .f3-caixa { width: min(1180px, 100%); max-height: calc(100vh - 32px); overflow-y: auto; background: var(--portal-bg, #f8fafc); border-radius: 26px; box-shadow: 0 30px 80px rgba(15,23,42,.35);
    animation: f3Entra .5s cubic-bezier(.2,1.2,.3,1) both }
  @keyframes f3Entra { from { opacity: 0; transform: translateY(30px) scale(.96) } to { opacity: 1; transform: none } }
  .f3-sai.f3-fundo { animation: f3Sai .22s ease both } .f3-sai.f3-caixa { animation: f3SaiC .22s ease both }
  @keyframes f3Sai { to { opacity: 0 } } @keyframes f3SaiC { to { opacity: 0; transform: translateY(20px) scale(.97) } }
  .f3-topo { position: relative; overflow: hidden; color: #fefefe; padding: 24px 26px 20px; background: linear-gradient(135deg, var(--c), color-mix(in srgb, var(--c) 60%, #0f172a)) }
  .f3-topo::after { content: ''; position: absolute; inset: 0; background: linear-gradient(115deg, transparent 35%, rgba(255,255,255,.18) 50%, transparent 65%); background-size: 250% 100%; animation: f3Brilho 6s ease-in-out infinite; pointer-events: none }
  @keyframes f3Brilho { 0%, 65% { background-position: 160% 0 } 100% { background-position: -60% 0 } }
  .f3-avatar { width: 72px; height: 72px; border-radius: 22px; background: rgba(255,255,255,.2); display: grid; place-items: center; font-size: 26px; font-weight: 800; animation: f3Pop .6s .1s cubic-bezier(.2,1.5,.3,1) both }
  @keyframes f3Pop { from { transform: scale(0) rotate(-20deg) } }
  .f3-anel { animation: f3Anel 1.3s .2s cubic-bezier(.2,.8,.2,1) both } @keyframes f3Anel { from { stroke-dashoffset: var(--t) } }
  .f3-fechar { width: 42px; height: 42px; border-radius: 14px; border: 0; background: rgba(255,255,255,.2); color: #fefefe; font-size: 18px; cursor: pointer; transition: transform .25s, background .2s; align-self: flex-start }
  .f3-fechar:hover { transform: rotate(90deg); background: rgba(255,255,255,.32) }
  .f3-acao { display: inline-flex; align-items: center; gap: 8px; height: 42px; padding: 0 16px; border-radius: 13px; background: rgba(255,255,255,.18); color: #fefefe; font-weight: 700; font-size: 15px; text-decoration: none; transition: transform .2s, background .2s }
  .f3-acao:hover { transform: translateY(-2px); background: rgba(255,255,255,.3) } .f3-whats { background: #16a34a } .f3-whats:hover { background: #15803d }
  .f3-corpo { padding: 20px 22px 24px; display: grid; gap: 16px }
  .f3-grade4 { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr)); gap: 12px }
  .f3-num { position: relative; overflow: hidden; background: ${CARD}; border: 1px solid ${BD}; border-radius: 18px; padding: 14px 16px; animation: f3Sobe .5s cubic-bezier(.2,.8,.2,1) both; transition: transform .2s, box-shadow .2s }
  .f3-num:hover { transform: translateY(-3px); box-shadow: 0 12px 26px rgba(15,23,42,.10) }
  .f3-num > i { position: absolute; right: 14px; top: 14px; font-size: 26px; color: var(--k); opacity: .18; animation: f3Flutua 4s ease-in-out infinite }
  @keyframes f3Flutua { 50% { transform: translateY(-5px) rotate(-8deg) } }
  @keyframes f3Sobe { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
  .f3-duas { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(440px, 100%), 1fr)); gap: 16px }
  .f3-bloco { background: ${CARD}; border: 1px solid ${BD}; border-radius: 20px; padding: 18px; animation: f3Sobe .55s cubic-bezier(.2,.8,.2,1) both; min-width: 0 }
  .f3-bloco h3 { margin: 0 0 14px; font-size: 17px; font-weight: 800; color: ${TX}; display: flex; gap: 10px; align-items: center }
  .f3-motivo { display: flex; gap: 12px; align-items: flex-start; padding: 12px; border-radius: 14px; background: color-mix(in srgb, var(--k) 7%, transparent); border-left: 4px solid var(--k); animation: f3Lado .5s cubic-bezier(.2,.8,.2,1) both; transition: transform .2s }
  .f3-motivo:hover { transform: translateX(4px) }
  @keyframes f3Lado { from { opacity: 0; transform: translateX(-16px) } to { opacity: 1; transform: none } }
  .f3-mic { width: 38px; height: 38px; border-radius: 12px; flex-shrink: 0; display: grid; place-items: center; background: var(--k); color: #fefefe; font-size: 16px }
  .f3-mapa { position: relative; height: 260px; border-radius: 16px; overflow: hidden; border: 1px solid ${BD} }
  .f3-pino { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -100%); color: #dc2626; font-size: 30px; pointer-events: none; animation: f3Pino 1.6s ease-in-out infinite; filter: drop-shadow(0 4px 4px rgba(0,0,0,.3)) }
  @keyframes f3Pino { 0%, 100% { transform: translate(-50%, -100%) } 50% { transform: translate(-50%, -125%) } }
  .f3-barra { background: linear-gradient(90deg, #4ade80, #15803d); border-radius: 10px; transform-origin: left; animation: f3Barra .9s cubic-bezier(.2,.8,.2,1) both }
  @keyframes f3Barra { from { transform: scaleX(0) } }
  .f3-linha-tempo { position: relative; display: grid; gap: 8px; padding-left: 14px; border-left: 2px dashed ${BD}; margin-left: 6px }
  .f3-maq { position: relative; display: flex; gap: 12px; align-items: center; padding: 8px 10px; border-radius: 12px; background: ${SUAVE}; animation: f3Lado .45s cubic-bezier(.2,.8,.2,1) both }
  .f3-ponto { position: absolute; left: -22px; width: 12px; height: 12px; border-radius: 50%; border: 2px solid ${CARD} }
  @media (prefers-reduced-motion: reduce) { .f3-caixa, .f3-fundo, .f3-num, .f3-bloco, .f3-motivo, .f3-maq, .f3-barra, .f3-anel, .f3-pino, .f3-topo::after, .f3-num > i, .f3-avatar { animation: none !important } }
`;
