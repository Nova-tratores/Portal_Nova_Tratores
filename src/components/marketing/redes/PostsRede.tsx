'use client';
// Posts de uma rede (Instagram ou Facebook), 25/11/2026. José: "tá horrível ver os dados embaixo dos posts;
// quero clicar no post e ver as estatísticas dele, e ver o post também".
// Cartão: 3 números grandes COM nome (antes eram 6 ícones soltos). Toque abre a janela: o post (vídeo toca ali)
// + texto inteiro + todas as estatísticas, buscadas na hora em /api/marketing/redes/post.
import { useEffect, useState } from 'react';
import { fetchAuth } from '@/lib/auth/client';
import type { PostAberto } from '@/lib/marketing/redes/meta-post';
import { LogoRede } from './LogoRede';
import { T1, T2, T3, bt, cartaoNP, ic } from './np';

export type PostVis = {
  id: string; tipo: string; quando: string; link: string | null; miniatura: string | null; legenda: string
  numeros: { rotulo: string; valor: number | null }[]   // os 3 do cartão
}
type Rede = 'instagram' | 'facebook';

const n = (x: number | null | undefined) => (x == null ? '—' : x.toLocaleString('pt-BR'));
const curto = (x: number | null | undefined) => (x == null ? '—' : x >= 10_000 ? `${(x / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : n(x));
const NOME: Record<Rede, string> = { instagram: 'Instagram', facebook: 'Facebook' };

export function CartaoPost({ p, cor, onAbrir, atraso = 0 }: { p: PostVis; cor: string; onAbrir: () => void; atraso?: number }) {
  return (
    <button type="button" onClick={onAbrir} className="np-sobe np-entra"
      style={{ ...cartaoNP, padding: 0, overflow: 'hidden', display: 'grid', gridTemplateRows: 'auto 1fr', textAlign: 'left', font: 'inherit', color: T1, cursor: 'pointer', animationDelay: `${atraso}ms` }}>
      <div style={{ position: 'relative', aspectRatio: '4 / 5', background: 'var(--portal-bg)' }}>
        {p.miniatura
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={p.miniatura} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: T3, fontSize: 22 }}>{ic('fa-align-left')}</span>}
        <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 12, padding: '3px 9px', borderRadius: 999, background: 'rgba(0,0,0,.68)', color: '#fff' }}>
          {p.tipo} · {new Date(p.quando).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit' })}
        </span>
        {/vídeo|reels/i.test(p.tipo) && (
          <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
            <span style={{ width: 44, height: 44, borderRadius: 999, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.5)', color: '#fff', fontSize: 16 }}>{ic('fa-play')}</span>
          </span>
        )}
      </div>
      <div style={{ display: 'grid', gap: 10, padding: '10px 12px 12px', alignContent: 'start' }}>
        <span style={{ fontSize: 13.5, color: T1, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.legenda || 'Sem texto'}</span>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${p.numeros.length}, minmax(0, 1fr))`, gap: 4, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          {p.numeros.map((x, i) => (
            <span key={x.rotulo} style={{ display: 'grid', gap: 1, minWidth: 0 }}>
              <span style={{ fontSize: 17, fontWeight: 500, color: i === 0 ? cor : T1, fontVariantNumeric: 'tabular-nums' }}>{curto(x.valor)}</span>
              <span style={{ fontSize: 11.5, color: T2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.rotulo}</span>
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}

export function JanelaPost({ rede, cor, p, onFechar }: { rede: Rede; cor: string; p: PostVis; onFechar: () => void }) {
  const [d, setD] = useState<PostAberto | null>(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    let vivo = true;
    fetchAuth(`/api/marketing/redes/post?rede=${rede}&id=${encodeURIComponent(p.id)}`).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!vivo) return;
      if (!r.ok || !j.ok) { setErro(j.erro || 'Não consegui buscar as estatísticas.'); return; }
      setD(j);
    });
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', esc);
    return () => { vivo = false; window.removeEventListener('keydown', esc); };
  }, [rede, p.id, onFechar]);

  return (
    <div role="dialog" aria-modal="true" onClick={onFechar}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '4vh 12px', overflowY: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} className="np-entra"
        style={{ width: '100%', maxWidth: 980, background: 'var(--portal-bg-card, #fff)', borderRadius: 18, overflow: 'hidden', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', color: T1, boxShadow: '0 30px 60px -20px rgba(0,0,0,.45)' }}>
        {/* o post */}
        <div style={{ background: '#0b0b0b', display: 'grid', placeItems: 'center', minHeight: 320, maxHeight: '86vh' }}>
          {d?.video
            ? <video src={d.video} poster={p.miniatura || undefined} controls autoPlay muted playsInline style={{ width: '100%', maxHeight: '86vh', display: 'block' }} />
            : p.miniatura
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={p.miniatura} alt="" style={{ width: '100%', maxHeight: '86vh', objectFit: 'contain', display: 'block' }} />
              : <span style={{ color: '#ddd', padding: 24, fontSize: 15, whiteSpace: 'pre-wrap' }}>{p.legenda}</span>}
        </div>

        {/* as estatísticas */}
        <div style={{ display: 'grid', gap: 14, padding: 20, alignContent: 'start', maxHeight: '86vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <LogoRede id={rede} tam={32} />
            <span style={{ display: 'grid', flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 16 }}>{p.tipo} no {NOME[rede]}</span>
              <span style={{ fontSize: 13, color: T2 }}>{new Date(p.quando).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </span>
            <button type="button" aria-label="Fechar" onClick={onFechar} style={{ ...bt('#64748b'), minHeight: 36, padding: '4px 11px' }}>{ic('fa-xmark')}</button>
          </div>

          {p.legenda && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: T1, whiteSpace: 'pre-wrap', maxHeight: 160, overflowY: 'auto', padding: '10px 12px', borderRadius: 12, background: 'var(--portal-bg)' }}>{p.legenda}</p>}

          {erro && <span style={{ fontSize: 13.5, color: '#dc2626' }}>{erro}</span>}
          {!d && !erro && <span style={{ fontSize: 13.5, color: T2 }}>{ic('fa-spinner fa-spin')} Buscando as estatísticas…</span>}
          {d && (
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(min(150px, 100%), 1fr))' }}>
              {d.estatisticas.map((e, i) => (
                <span key={e.rotulo} className="np-entra" title={e.explica}
                  style={{ display: 'grid', gap: 2, padding: '10px 12px', borderRadius: 12, border: '1px solid var(--border)', animationDelay: `${i * 35}ms`,
                    background: i === 0 ? `color-mix(in srgb, ${cor} 8%, transparent)` : 'transparent' }}>
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, color: T2 }}><span style={{ color: cor }}>{ic(e.icone)}</span>{e.rotulo}</span>
                  <span style={{ fontSize: 22, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{e.valor}</span>
                  <span style={{ fontSize: 11.5, color: T3, lineHeight: 1.3 }}>{e.explica}</span>
                </span>
              ))}
            </div>
          )}
          {d && d.reacoes.length > 0 && (
            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 13 }}>
              {d.reacoes.map((r) => <span key={r.nome} style={{ padding: '4px 10px', borderRadius: 999, border: '1px solid var(--border)' }}>{r.nome} <b style={{ fontWeight: 500 }}>{n(r.valor)}</b></span>)}
            </span>
          )}
          {p.link && <a href={p.link} target="_blank" rel="noreferrer" style={{ ...bt(cor, true), textDecoration: 'none', justifySelf: 'start' }}>{ic('fa-arrow-up-right-from-square')}Abrir no {NOME[rede]}</a>}
          <span style={{ fontSize: 12, color: T3 }}>Números desde que o post saiu. Passe o mouse num número para ver o que ele quer dizer.</span>
        </div>
      </div>
    </div>
  );
}
