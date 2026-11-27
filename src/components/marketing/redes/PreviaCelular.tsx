'use client';
// =============================================================================
// Prévia real do post (27/11/2026). José: "antes de agendar, a pessoa vê o post no formato de feed do celular, não
// num formulário". Moldura de celular com o post como sai no Instagram (feed), no Facebook e no story/Reels em pé.
// Só desenho: usa a arte e o texto do rascunho, atualiza enquanto a pessoa digita.
// =============================================================================
import { useState } from 'react';
import type { Midia, RedeId } from '@/lib/marketing/redes/redes';

type Vista = 'instagram' | 'facebook' | 'story';
const ehVideo = (u: string) => /\.(mp4|mov|webm)(\?|$)/i.test(u);

/** Hashtag e @ em azul, como no app. */
function Texto({ t }: { t: string }) {
  return <>{t.split(/(\s+)/).map((p, i) => /^[#@]\w/.test(p) ? <span key={i} style={{ color: '#00376b' }}>{p}</span> : p)}</>;
}

export default function PreviaCelular({ midia, texto, redes, nome, quando }: { midia: Midia; texto: string; redes: RedeId[]; nome: string; quando: string }) {
  const temStory = !!(midia.vertical || midia.video);
  const opcoes = ([['instagram', 'Feed do Instagram'], ['facebook', 'Facebook'], ['story', 'Story / Reels']] as [Vista, string][])
    .filter(([v]) => v === 'story' ? temStory : redes.includes(v));
  const [vista, setVista] = useState<Vista>(opcoes[0]?.[0] || 'instagram');
  const [mais, setMais] = useState(false);
  const v = opcoes.some(([x]) => x === vista) ? vista : opcoes[0]?.[0] || 'instagram';
  const arte = v === 'story' ? midia.video || midia.vertical : midia.feed || midia.vertical || midia.video;
  const usuario = nome.toLowerCase().replace(/[^a-z0-9._]/g, '') || 'novatratores';
  const corte = 125;
  const curto = texto.length > corte && !mais;

  const avatar = (tam: number) => (
    <span style={{ width: tam, height: tam, borderRadius: 99, flex: 'none', background: '#d0102b', display: 'grid', placeItems: 'center', overflow: 'hidden',
      boxShadow: v === 'instagram' ? '0 0 0 2px #fff, 0 0 0 4px #e1306c' : 'none' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/Logo_Nova_Branca.png" alt="" style={{ width: '78%', objectFit: 'contain' }} />
    </span>
  );
  const midiaEl = (estilo: React.CSSProperties) => arte
    ? ehVideo(arte)
      ? <video src={arte} autoPlay muted loop playsInline style={{ width: '100%', display: 'block', objectFit: 'cover', ...estilo }} />
      // eslint-disable-next-line @next/next/no-img-element
      : <img src={arte} alt="" style={{ width: '100%', display: 'block', objectFit: 'cover', ...estilo }} />
    : <span style={{ display: 'grid', placeItems: 'center', background: '#efefef', color: '#8e8e8e', fontSize: 13, ...estilo }}>Sem arte ainda</span>;

  return (
    <div style={{ display: 'grid', gap: 10, justifyItems: 'center' }}>
      {opcoes.length > 1 && (
        <span style={{ display: 'inline-flex', padding: 3, gap: 3, borderRadius: 10, border: '1px solid var(--border)' }}>
          {opcoes.map(([k, t]) => (
            <button key={k} type="button" onClick={() => setVista(k)} style={{ font: 'inherit', fontSize: 13, padding: '5px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: v === k ? 'var(--nt-texto, #2B1D17)' : 'transparent', color: v === k ? 'var(--nt-superficie, #FFFFFF)' : 'inherit' }}>{t}</button>
          ))}
        </span>
      )}

      {/* o celular */}
      <div style={{ width: 300, maxWidth: '100%', borderRadius: 38, padding: 9, background: '#111', boxShadow: '0 18px 40px rgba(15,23,42,.22)' }}>
        <div style={{ borderRadius: 30, overflow: 'hidden', background: v === 'story' ? '#000' : '#fff', color: '#000', fontFamily: '-apple-system, "Segoe UI", Roboto, sans-serif', position: 'relative', height: 560, display: 'flex', flexDirection: 'column' }}>
          {v === 'story' ? (
            <>
              {midiaEl({ position: 'absolute', inset: 0, height: '100%' })}
              <span style={{ position: 'absolute', top: 10, left: 10, right: 10, height: 3, borderRadius: 3, background: 'rgba(255,255,255,.45)' }}><span style={{ display: 'block', width: '35%', height: '100%', background: '#fff', borderRadius: 3 }} /></span>
              <span style={{ position: 'absolute', top: 22, left: 12, display: 'flex', gap: 8, alignItems: 'center', color: '#fff', fontSize: 13, fontWeight: 600, textShadow: '0 1px 3px rgba(0,0,0,.5)' }}>{avatar(28)}{usuario} <span style={{ fontWeight: 400, opacity: .85 }}>{quando}</span></span>
              <span style={{ position: 'absolute', bottom: 14, left: 12, right: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ flex: 1, border: '1px solid rgba(255,255,255,.7)', borderRadius: 99, padding: '8px 14px', color: '#fff', fontSize: 13 }}>Enviar mensagem</span>
                <i className="fa-regular fa-heart" style={{ color: '#fff', fontSize: 20 }} /><i className="fa-regular fa-paper-plane" style={{ color: '#fff', fontSize: 19 }} />
              </span>
            </>
          ) : (
            <>
              {/* barra do app */}
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px 8px', borderBottom: '1px solid #efefef' }}>
                {v === 'instagram'
                  ? <span style={{ fontFamily: '"Billabong", "Brush Script MT", cursive', fontSize: 25 }}>Instagram</span>
                  : <span style={{ color: '#1877f2', fontWeight: 700, fontSize: 24, letterSpacing: -1 }}>facebook</span>}
                <span style={{ display: 'flex', gap: 14, fontSize: 18 }}><i className="fa-regular fa-heart" /><i className="fa-regular fa-paper-plane" /></span>
              </span>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                <span style={{ display: 'flex', gap: 9, alignItems: 'center', padding: '9px 12px' }}>
                  {avatar(32)}
                  <span style={{ display: 'grid', lineHeight: 1.2 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{v === 'facebook' ? 'Nova Tratores' : usuario}</span>
                    <span style={{ fontSize: 11.5, color: '#737373' }}>{v === 'facebook' ? `${quando} · 🌎` : 'Piraju, SP'}</span>
                  </span>
                  <i className="fa-solid fa-ellipsis" style={{ marginLeft: 'auto', color: '#262626' }} />
                </span>
                {/* no Facebook o texto vem antes da imagem */}
                {v === 'facebook' && texto && (
                  <p style={{ margin: '0 12px 8px', fontSize: 13.5, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
                    <Texto t={curto ? texto.slice(0, corte) : texto} />{curto && <button type="button" onClick={() => setMais(true)} style={{ border: 'none', background: 'none', padding: 0, color: '#65676b', font: 'inherit', fontWeight: 600, cursor: 'pointer' }}>… Ver mais</button>}
                  </p>
                )}
                {midiaEl({ aspectRatio: '4 / 5' })}
                {v === 'instagram' ? (
                  <div style={{ padding: '8px 12px 14px', display: 'grid', gap: 6 }}>
                    <span style={{ display: 'flex', gap: 15, fontSize: 21 }}><i className="fa-regular fa-heart" /><i className="fa-regular fa-comment" /><i className="fa-regular fa-paper-plane" /><i className="fa-regular fa-bookmark" style={{ marginLeft: 'auto' }} /></span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Curtido por clientes e outras pessoas</span>
                    {texto
                      ? <span style={{ fontSize: 13, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
                          <b style={{ fontWeight: 600 }}>{usuario}</b> <Texto t={curto ? texto.slice(0, corte) : texto} />
                          {curto && <button type="button" onClick={() => setMais(true)} style={{ border: 'none', background: 'none', padding: 0, color: '#737373', font: 'inherit', cursor: 'pointer' }}>… mais</button>}
                        </span>
                      : <span style={{ fontSize: 13, color: '#c00' }}>Sem texto: escreva o texto do post.</span>}
                    <span style={{ fontSize: 11, color: '#737373', textTransform: 'uppercase' }}>{quando}</span>
                  </div>
                ) : (
                  <span style={{ display: 'flex', justifyContent: 'space-around', padding: '10px 8px', borderTop: '1px solid #e4e6eb', margin: '6px 10px 10px', color: '#65676b', fontSize: 13, fontWeight: 600 }}>
                    <span><i className="fa-regular fa-thumbs-up" /> Curtir</span><span><i className="fa-regular fa-comment" /> Comentar</span><span><i className="fa-solid fa-share" /> Compartilhar</span>
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      {mais && <button type="button" onClick={() => setMais(false)} style={{ border: 'none', background: 'none', font: 'inherit', fontSize: 12.5, color: 'inherit', opacity: .7, cursor: 'pointer' }}>mostrar o texto cortado, como aparece no app</button>}
    </div>
  );
}
