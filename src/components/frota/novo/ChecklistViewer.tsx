'use client';
// Checklist mensal do carro em tela cheia (José, 22/10/2026): resumo, filtros
// (tudo · só pendências · sem foto · por categoria), grade ou lista, comparar com
// o mês anterior e cada foto em tela cheia (setas, teclado, zoom, arrastar no celular).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { authHeaders } from '@/lib/auth/client';
import { formatarPlaca } from '@/lib/frota/placa';
import type { ChecklistVeiculo } from '@/lib/frota/tipos';
import {
  categorias, categoriaDe, ehPendencia, filtrarItens, itemAnterior, lerAlertas, resumoChecklist,
  textoIA, tituloDe, type FiltroChecklist, type ItemVisao,
} from '@/lib/frota/checklist-visao';
import { ESTILO_FROTA_NOVO } from './estilo';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const nomeMes = (ym: string) => { const [a, m] = ym.split('-'); return `${MESES[Number(m) - 1] || m}/${a}`; };
const dataHora = (s: string | null) => (s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
export const corScore = (s: number | null) => (s == null ? '#64748b' : s < 50 ? '#dc2626' : s < 75 ? '#d97706' : '#16a34a');

async function lerItens(id: string): Promise<ItemVisao[]> {
  const r = await fetch(`/api/frota/checklist-itens?id=${encodeURIComponent(id)}`, { headers: await authHeaders() });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Falha ao carregar o checklist.');
  return d.itens || [];
}

function Resposta({ i }: { i: ItemVisao }) {
  if (i.resposta === 'problema') return <span className="fn-pilula" style={{ ['--fn-cor' as string]: '#dc2626' }}><i className="fa-solid fa-triangle-exclamation" /> Problema</span>;
  if (i.ia_analise?.comprova === false) return <span className="fn-pilula" style={{ ['--fn-cor' as string]: '#d97706' }}><i className="fa-solid fa-robot" /> Foto não comprova</span>;
  if (i.resposta === 'ok') return <span className="fn-pilula" style={{ ['--fn-cor' as string]: '#16a34a' }}><i className="fa-solid fa-check" /> OK</span>;
  return <span className="fn-pilula">Sem resposta</span>;
}

interface Props {
  checklist: ChecklistVeiculo;
  anterior?: ChecklistVeiculo | null;
  onClose: () => void;
}

export default function ChecklistViewer({ checklist, anterior, onClose }: Props) {
  const [itens, setItens] = useState<ItemVisao[] | null>(null);
  const [itensAnt, setItensAnt] = useState<ItemVisao[]>([]);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState<FiltroChecklist>('tudo');
  const [vista, setVista] = useState<'grade' | 'lista'>('grade');
  const [comparar, setComparar] = useState(false);
  const [aberta, setAberta] = useState<number | null>(null);
  const [verAlertas, setVerAlertas] = useState(false);

  useEffect(() => {
    let vivo = true;
    lerItens(checklist.id).then((l) => {
      if (!vivo) return;
      setItens(l);
      // abre direto nas pendências quando há alguma (é o que importa ver primeiro)
      if (l.some(ehPendencia)) setFiltro('pendencias');
    }).catch((e) => vivo && setErro(String(e.message || e)));
    if (anterior) lerItens(anterior.id).then((l) => vivo && setItensAnt(l)).catch(() => {});
    return () => { vivo = false; };
  }, [checklist.id, anterior]);

  const lista = useMemo(() => filtrarItens(itens || [], filtro), [itens, filtro]);
  const comFoto = useMemo(() => lista.filter((i) => i.foto_url), [lista]);
  const resumo = useMemo(() => resumoChecklist(itens || []), [itens]);
  const cats = useMemo(() => categorias(itens || []), [itens]);
  const alertas = lerAlertas(checklist.alertas);
  const duracao = checklist.inicio_em && checklist.fim_em
    ? Math.round((new Date(checklist.fim_em).getTime() - new Date(checklist.inicio_em).getTime()) / 60000) : null;
  const imprimir = checklist.share_token ? `/frota/checklist/ver?token=${encodeURIComponent(checklist.share_token)}` : null;

  // Esc fecha (o visualizador de foto trata o seu próprio Esc)
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && aberta == null) onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [aberta, onClose]);

  const abrirFoto = (i: ItemVisao) => { const idx = comFoto.findIndex((x) => x.id === i.id); if (idx >= 0) setAberta(idx); };

  const tiles: { f: FiltroChecklist; rot: string; n: number; cor: string; ico: string }[] = [
    { f: 'tudo', rot: 'Itens respondidos', n: resumo.respondidos, cor: '#2563eb', ico: 'fa-list-check' },
    { f: 'pendencias', rot: 'Pendências', n: resumo.pendencias, cor: '#dc2626', ico: 'fa-triangle-exclamation' },
    { f: 'sem_foto', rot: 'Sem foto', n: resumo.semFoto, cor: '#d97706', ico: 'fa-camera' },
  ];

  return (
    <div className="fn" role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 9600, background: 'var(--fn-soft)', overflowY: 'auto' }}>
      <style>{ESTILO_FROTA_NOVO}</style>
      {/* topo fixo */}
      <div style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--fn-surface)', borderBottom: '1px solid var(--fn-border)', padding: '12px clamp(12px, 2vw, 28px)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button className="fn-btn" onClick={onClose} aria-label="Fechar"><i className="fa-solid fa-arrow-left" /> Voltar</button>
        <span className="fn-ico" style={{ ['--fn-cor' as string]: '#2563eb' }}><i className="fa-solid fa-clipboard-check" /></span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 500 }}>Checklist de {nomeMes(checklist.mes_referencia)}</div>
          <div className="fn-sub" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {checklist.placa && <span>{formatarPlaca(checklist.placa)}</span>}
            <span><i className="fa-regular fa-user" /> {checklist.tecnico_nome || '—'}</span>
            <span><i className="fa-regular fa-clock" /> {dataHora(checklist.fim_em || checklist.inicio_em)}{duracao != null ? ` · ${duracao} min` : ''}</span>
            {checklist.km != null && <span><i className="fa-solid fa-gauge" /> {checklist.km.toLocaleString('pt-BR')} km</span>}
          </div>
        </div>
        {checklist.score_confianca != null && (
          <button className="fn-pilula" onClick={() => setVerAlertas((v) => !v)} style={{ ['--fn-cor' as string]: corScore(checklist.score_confianca), cursor: alertas.length ? 'pointer' : 'default', height: 30, fontSize: 13 }}
            title="Confiança: começa em 100 e perde pontos com sinais de checklist feito às pressas">
            <i className="fa-solid fa-shield-halved" /> Confiança {checklist.score_confianca}%{alertas.length ? ` · ${alertas.length} alerta(s)` : ''}
          </button>
        )}
        {imprimir && <a className="fn-btn" href={imprimir} target="_blank" rel="noopener noreferrer"><i className="fa-solid fa-print" /> Imprimir</a>}
      </div>

      <div style={{ padding: '16px clamp(12px, 2vw, 28px) 40px', display: 'grid', gap: 14 }}>
        {verAlertas && alertas.length > 0 && (
          <div className="fn-card fn-entra" style={{ ['--fn-cor' as string]: corScore(checklist.score_confianca) }}>
            <div className="fn-titulo" style={{ fontSize: 14.5 }}>Por que a confiança caiu</div>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13.5, color: 'var(--fn-text2)', display: 'grid', gap: 3 }}>
              {alertas.map((a) => <li key={a}>{a}</li>)}
            </ul>
          </div>
        )}

        {erro && <div className="fn-card" style={{ color: '#b91c1c' }}>{erro}</div>}
        {!itens && !erro && <div className="fn-sub">Carregando o checklist…</div>}

        {itens && (
          <>
            {/* resumo = filtros */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 10 }}>
              {tiles.map((t) => (
                <button key={t.f} className="fn-card fn-click" onClick={() => setFiltro(t.f)}
                  style={{ ['--fn-cor' as string]: t.cor, display: 'flex', alignItems: 'center', gap: 12, outline: filtro === t.f ? `2px solid color-mix(in srgb, ${t.cor} 55%, transparent)` : 'none' }}>
                  <span className="fn-ico"><i className={`fa-solid ${t.ico}`} /></span>
                  <span style={{ display: 'grid' }}>
                    <span className="fn-num" style={{ color: t.n && t.f !== 'tudo' ? t.cor : undefined }}>{t.n}{t.f === 'tudo' ? <span className="fn-sub"> de {resumo.total}</span> : null}</span>
                    <span className="fn-rot">{t.rot}</span>
                  </span>
                </button>
              ))}
              <div className="fn-card" style={{ ['--fn-cor' as string]: '#16a34a', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="fn-ico"><i className="fa-solid fa-circle-check" /></span>
                <span style={{ display: 'grid' }}>
                  <span className="fn-num">{resumo.ok}</span>
                  <span className="fn-rot">Itens OK</span>
                </span>
              </div>
            </div>

            {resumo.faltando.length > 0 && (
              <div className="fn-sub" style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <i className="fa-solid fa-circle-info" style={{ color: '#d97706' }} />
                <span>Faltou responder {resumo.faltando.length} item(ns): {resumo.faltando.join(', ')}.</span>
              </div>
            )}

            {/* filtros por categoria + vista */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className={`fn-chip ${filtro === 'tudo' ? 'on' : ''}`} onClick={() => setFiltro('tudo')}>Tudo <span className="n">{itens.length}</span></button>
              <button className={`fn-chip ${filtro === 'pendencias' ? 'on' : ''}`} style={{ ['--fn-cor' as string]: '#dc2626' }} onClick={() => setFiltro('pendencias')}>
                Só pendências <span className="n">{resumo.pendencias}</span>
              </button>
              {cats.map((c) => (
                <button key={c.nome} className={`fn-chip ${filtro === `cat:${c.nome}` ? 'on' : ''}`} onClick={() => setFiltro(`cat:${c.nome}`)}>
                  {c.nome} <span className="n" style={c.pendencias ? { background: '#fee2e2', color: '#b91c1c' } : undefined}>{c.pendencias ? `${c.pendencias}!` : c.qtd}</span>
                </button>
              ))}
              <span style={{ flex: 1 }} />
              {anterior && (
                <button className={`fn-chip ${comparar ? 'on' : ''}`} onClick={() => setComparar((v) => !v)} title={`Mostra a foto do mesmo item em ${nomeMes(anterior.mes_referencia)}`}>
                  <i className="fa-solid fa-code-compare" /> Comparar com {nomeMes(anterior.mes_referencia)}
                </button>
              )}
              <button className={`fn-chip ${vista === 'grade' ? 'on' : ''}`} onClick={() => setVista('grade')} aria-label="Grade"><i className="fa-solid fa-table-cells-large" /></button>
              <button className={`fn-chip ${vista === 'lista' ? 'on' : ''}`} onClick={() => setVista('lista')} aria-label="Lista"><i className="fa-solid fa-list" /></button>
            </div>

            {lista.length === 0 && (
              <div className="fn-card fn-sub" style={{ textAlign: 'center', padding: 28 }}>
                {filtro === 'pendencias' ? <><i className="fa-solid fa-circle-check" style={{ color: '#16a34a' }} /> Nenhuma pendência neste checklist.</> : 'Nada neste filtro.'}
              </div>
            )}

            <div style={vista === 'grade'
              ? { display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(min(${comparar ? 380 : 250}px, 100%), 1fr))`, gap: 12 }
              : { display: 'grid', gap: 8 }}>
              {lista.map((i) => {
                const ant = comparar ? itemAnterior(i, itensAnt) : null;
                const ia = textoIA(i);
                return (
                  <div key={i.id} className="fn-card fn-entra" style={{ padding: 12, display: vista === 'lista' ? 'grid' : 'flex', gridTemplateColumns: vista === 'lista' ? 'minmax(90px, 120px) minmax(0, 1fr)' : undefined, flexDirection: 'column', gap: 10, alignItems: vista === 'lista' ? 'center' : undefined, borderColor: ehPendencia(i) ? 'color-mix(in srgb, #dc2626 40%, var(--fn-border))' : undefined }}>
                    <div style={{ display: 'grid', gridTemplateColumns: comparar && vista === 'grade' ? '1fr 1fr' : '1fr', gap: 6 }}>
                      {i.foto_url
                        ? <img src={i.foto_url} alt={tituloDe(i)} className="fn-foto" loading="lazy" onClick={() => abrirFoto(i)} />
                        : <div className="fn-foto" style={{ display: 'grid', placeItems: 'center', cursor: 'default', color: 'var(--fn-text3)' }}><i className="fa-solid fa-camera-slash" /></div>}
                      {comparar && vista === 'grade' && (
                        ant?.foto_url
                          ? <div style={{ position: 'relative' }}><img src={ant.foto_url} alt="mês anterior" className="fn-foto" loading="lazy" style={{ opacity: 0.92 }} />
                              <span className="fn-pilula" style={{ position: 'absolute', left: 6, bottom: 6, fontSize: 11 }}>{anterior ? nomeMes(anterior.mes_referencia) : 'antes'}</span></div>
                          : <div className="fn-foto fn-sub" style={{ display: 'grid', placeItems: 'center', cursor: 'default', fontSize: 12 }}>sem foto no mês anterior</div>
                      )}
                    </div>
                    <div style={{ display: 'grid', gap: 5, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ fontSize: 14.5, fontWeight: 500, display: 'block' }}>{tituloDe(i)}</span>
                          <span className="fn-rot">{categoriaDe(i)} · {dataHora(i.respondido_em)}</span>
                        </span>
                        <Resposta i={i} />
                      </div>
                      {i.observacao && <div style={{ fontSize: 13.5, color: 'var(--fn-text)', background: 'var(--fn-soft)', borderRadius: 10, padding: '6px 10px' }}><i className="fa-regular fa-comment" style={{ color: 'var(--fn-text3)' }} /> {i.observacao}</div>}
                      {ia && <div className="fn-sub" style={{ fontSize: 12.5 }}><i className="fa-solid fa-robot" style={{ color: i.ia_analise?.comprova === false ? '#d97706' : 'var(--fn-text3)' }} /> {ia.replace(/^IA: /, '')}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {aberta != null && comFoto[aberta] && (
        <TelaCheia
          itens={comFoto}
          indice={aberta}
          anteriores={itensAnt}
          mesAnterior={anterior ? nomeMes(anterior.mes_referencia) : null}
          onIndice={setAberta}
          onClose={() => setAberta(null)}
        />
      )}
    </div>
  );
}

/** Foto em tela cheia: setas e teclado (← → Esc), clique dá zoom 2,5× seguindo o mouse, arrastar troca no celular. */
function TelaCheia({ itens, indice, anteriores, mesAnterior, onIndice, onClose }: {
  itens: ItemVisao[]; indice: number; anteriores: ItemVisao[]; mesAnterior: string | null;
  onIndice: (n: number) => void; onClose: () => void;
}) {
  const [zoom, setZoom] = useState(false);
  const [origem, setOrigem] = useState('50% 50%');
  const [lado, setLado] = useState(false);
  const [toqueX, setToqueX] = useState<number | null>(null);
  const i = itens[indice];
  const ant = itemAnterior(i, anteriores);
  const ir = useCallback((d: number) => { setZoom(false); onIndice((indice + d + itens.length) % itens.length); }, [indice, itens.length, onIndice]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      else if (e.key === 'ArrowRight') ir(1);
      else if (e.key === 'ArrowLeft') ir(-1);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [ir, onClose]);

  const ia = textoIA(i);
  const seta = (d: number, lado: 'left' | 'right') => (
    <button onClick={(e) => { e.stopPropagation(); ir(d); }} aria-label={d > 0 ? 'Próxima' : 'Anterior'}
      style={{ position: 'absolute', top: '50%', [lado]: 12, transform: 'translateY(-50%)', width: 46, height: 46, borderRadius: 999, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,.14)', color: '#fefefe', fontSize: 18 }}>
      <i className={`fa-solid fa-chevron-${d > 0 ? 'right' : 'left'}`} />
    </button>
  );

  return (
    <div onClick={onClose}
      onTouchStart={(e) => setToqueX(e.touches[0].clientX)}
      onTouchEnd={(e) => { if (toqueX == null || zoom) return; const dx = e.changedTouches[0].clientX - toqueX; if (Math.abs(dx) > 50) ir(dx < 0 ? 1 : -1); setToqueX(null); }}
      style={{ position: 'fixed', inset: 0, zIndex: 9700, background: 'rgba(8,10,14,.96)', display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr) auto', color: '#fefefe' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
        <span style={{ fontSize: 13, opacity: 0.8, fontVariantNumeric: 'tabular-nums' }}>{indice + 1} / {itens.length}</span>
        <span style={{ flex: 1 }} />
        {mesAnterior && (
          <button onClick={() => setLado((v) => !v)} disabled={!ant?.foto_url}
            style={{ height: 34, padding: '0 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.25)', background: lado ? 'rgba(255,255,255,.18)' : 'transparent', color: '#fefefe', cursor: ant?.foto_url ? 'pointer' : 'default', opacity: ant?.foto_url ? 1 : 0.4, font: 'inherit', fontSize: 13 }}>
            <i className="fa-solid fa-code-compare" /> {ant?.foto_url ? `Lado a lado com ${mesAnterior}` : `Sem foto em ${mesAnterior}`}
          </button>
        )}
        {i.foto_url && <a href={i.foto_url} target="_blank" rel="noopener noreferrer" style={{ height: 34, padding: '0 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.25)', color: '#fefefe', display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', fontSize: 13 }}><i className="fa-solid fa-up-right-from-square" /> Original</a>}
        <button onClick={onClose} aria-label="Fechar" style={{ width: 36, height: 36, borderRadius: 999, border: 'none', background: 'rgba(255,255,255,.14)', color: '#fefefe', cursor: 'pointer', fontSize: 16 }}><i className="fa-solid fa-xmark" /></button>
      </div>

      <div style={{ position: 'relative', minHeight: 0, display: 'grid', gridTemplateColumns: lado && ant?.foto_url ? '1fr 1fr' : '1fr', gap: 8, padding: '0 64px' }}>
        {[i, ...(lado && ant?.foto_url ? [ant] : [])].map((x, n) => (
          <div key={x.id + n} onClick={(e) => e.stopPropagation()} style={{ position: 'relative', minHeight: 0, overflow: 'hidden', display: 'grid', placeItems: 'center' }}
            onMouseMove={(e) => { if (!zoom) return; const r = e.currentTarget.getBoundingClientRect(); setOrigem(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`); }}>
            <img src={x.foto_url || ''} alt={tituloDe(x)} onClick={() => setZoom((z) => !z)}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', cursor: zoom ? 'zoom-out' : 'zoom-in', transform: zoom ? 'scale(2.5)' : 'none', transformOrigin: origem, transition: 'transform .2s' }} />
            {n === 1 && <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 12, padding: '2px 10px', borderRadius: 999, background: 'rgba(0,0,0,.55)' }}>{mesAnterior}</span>}
          </div>
        ))}
        {itens.length > 1 && seta(-1, 'left')}
        {itens.length > 1 && seta(1, 'right')}
      </div>

      <div onClick={(e) => e.stopPropagation()} style={{ padding: '12px 18px 18px', display: 'grid', gap: 4, maxWidth: 900, margin: '0 auto', width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 500 }}>
          {tituloDe(i)}{' '}
          <span style={{ fontSize: 13, padding: '1px 9px', borderRadius: 999, marginLeft: 6, background: ehPendencia(i) ? 'rgba(220,38,38,.35)' : 'rgba(22,163,74,.3)' }}>
            {i.resposta === 'problema' ? 'Problema' : i.ia_analise?.comprova === false ? 'Foto não comprova' : 'OK'}
          </span>
        </div>
        {i.observacao && <div style={{ fontSize: 14, opacity: 0.9 }}>{i.observacao}</div>}
        {ia && <div style={{ fontSize: 12.5, opacity: 0.75 }}>{ia}</div>}
        <div style={{ fontSize: 12, opacity: 0.55 }}>← → troca de foto · clique na foto para aproximar · Esc fecha</div>
      </div>
    </div>
  );
}
