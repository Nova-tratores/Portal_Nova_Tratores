'use client';
// Prévia "como fica no site" (José, 12/11/2026: "dentro já mostra como fica no site em celular e no PC, para o usuário
// ter uma ideia"). Reproduz o visual do site (fontes Quantum Rise/Georama, cores, raios) em duas molduras — computador
// (1280 px) e celular (390 px) — reduzidas para caber na tela. É uma imitação fiel, não o site de verdade.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

export const SITE = {
  vermelho: '#E31837', preto: '#231F20', aco: '#4D4D4F', claro: '#E6E7E8', branco: '#FFFFFF', borda: '#CFD0D2', raio: 14,
  titulo: '"Quantum Rise", "Georama SemiExpanded", system-ui, sans-serif',
  texto: '"Georama SemiExpanded", system-ui, sans-serif',
};

/** Fontes do site (copiadas em public/fonts/site). */
export function FontesSite() {
  return (
    <style>{`
      @font-face { font-family: "Quantum Rise"; src: url(/fonts/site/quantum-rise-medium.woff2) format("woff2"); font-weight: 500; font-display: swap; }
      @font-face { font-family: "Georama SemiExpanded"; src: url(/fonts/site/georama-semiexpanded-regular.woff2) format("woff2"); font-weight: 400; font-display: swap; }
      @font-face { font-family: "Georama SemiExpanded"; src: url(/fonts/site/georama-semiexpanded-semibold.woff2) format("woff2"); font-weight: 600; font-display: swap; }
      @font-face { font-family: "Georama SemiExpanded"; src: url(/fonts/site/georama-semiexpanded-bold.woff2) format("woff2"); font-weight: 700; font-display: swap; }
    `}</style>
  );
}

/** Desenha `children` na largura real (1280 ou 390) e reduz para caber no espaço da tela. */
export function Escala({ largura, children }: { largura: number; children: ReactNode }) {
  const caixa = useRef<HTMLDivElement>(null);
  const dentro = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(0.3);
  const [alt, setAlt] = useState(200);
  useEffect(() => {
    const medir = () => {
      const w = caixa.current?.clientWidth || largura;
      const kk = Math.min(1, w / largura);
      setK(kk);
      setAlt((dentro.current?.scrollHeight || 0) * kk);
    };
    medir();
    const ro = new ResizeObserver(medir);
    if (caixa.current) ro.observe(caixa.current);
    if (dentro.current) ro.observe(dentro.current);
    return () => ro.disconnect();
  }, [largura]);
  return (
    <div ref={caixa} style={{ width: '100%', height: alt, overflow: 'hidden', position: 'relative' }}>
      <div ref={dentro} style={{ width: largura, transform: `scale(${k})`, transformOrigin: '0 0', position: 'absolute', left: 0, top: 0, background: SITE.branco, fontFamily: SITE.texto, color: SITE.aco }}>
        {children}
      </div>
    </div>
  );
}

/** As duas molduras lado a lado (computador maior, celular menor); no celular do portal, uma embaixo da outra. */
export function Previa({ titulo = 'Como fica no site', pc, celular }: { titulo?: string; pc: ReactNode; celular: ReactNode }) {
  const rotulo: CSSProperties = { fontSize: 12, color: 'var(--portal-text-muted, #6b7280)', display: 'flex', alignItems: 'center', gap: 6 };
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <FontesSite />
      <b style={{ fontWeight: 500, fontSize: 14 }}><i className="fa-solid fa-eye" style={{ fontWeight: 900, color: '#dc2626', marginRight: 6 }} />{titulo}</b>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ display: 'grid', gap: 6, flex: '3 1 380px', minWidth: 0 }}>
          <span style={rotulo}><i className="fa-solid fa-desktop" style={{ fontWeight: 900 }} />Computador</span>
          <div style={{ border: '6px solid #2b2b2e', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
            <Escala largura={1280}>{pc}</Escala>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 6, justifyItems: 'center', flex: '1 1 200px', maxWidth: 260, margin: '0 auto' }}>
          <span style={{ ...rotulo, justifySelf: 'start' }}><i className="fa-solid fa-mobile-screen" style={{ fontWeight: 900 }} />Celular</span>
          <div style={{ width: 'min(240px, 100%)', border: '8px solid #2b2b2e', borderRadius: 26, overflow: 'hidden', background: '#fff' }}>
            <Escala largura={390}>{celular}</Escala>
          </div>
        </div>
      </div>
    </div>
  );
}

const pilula = (fundo: string, cor: string): CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 48, padding: '12px 22px', borderRadius: 999, background: fundo, color: cor, fontWeight: 700, fontSize: 16,
});

/* ---------------------------------------------------------------- Promoção (bloco da página inicial) */
export type PromoPrevia = {
  titulo: string; texto?: string | null; botao?: string | null; imagem?: string | null; imagem_celular?: string | null
  fim?: string | null; maquina?: { nome: string; foto: string | null } | null; whats: boolean
};

export function PromoSlide({ p, celular }: { p: PromoPrevia; celular: boolean }) {
  const faixa = !!(p.imagem && p.imagem_celular);
  const botao = p.botao || (p.whats ? 'Quero essa condição' : p.maquina ? 'Ver condições' : 'Saiba mais');
  const validade = p.fim ? ` · Válida até ${p.fim.split('-').reverse().slice(0, 2).join('/')}` : '';
  if (faixa) {
    return (
      <div style={{ position: 'relative', borderRadius: SITE.raio, overflow: 'hidden' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={celular ? p.imagem_celular! : p.imagem!} alt="" style={{ display: 'block', width: '100%', aspectRatio: celular ? '1' : '3', objectFit: 'cover' }} />
        <span style={{ ...pilula(SITE.preto, SITE.branco), position: 'absolute', right: 16, bottom: 16, minHeight: 44, padding: '10px 19px' }}>{botao} →</span>
      </div>
    );
  }
  const produto = !p.imagem;
  const arteAlt = celular ? (produto ? 288 : 384) : 448;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: celular ? '1fr' : '1.25fr 1fr', borderRadius: SITE.raio, overflow: 'hidden', background: produto ? SITE.claro : SITE.preto, color: produto ? SITE.aco : SITE.branco }}>
      <div style={{ position: 'relative', height: arteAlt, overflow: 'hidden', background: produto ? `radial-gradient(ellipse at 50% 55%, #fff 0, #fff 35%, ${SITE.claro} 80%)` : SITE.preto }}>
        {p.imagem && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.imagem} alt="" style={{ position: 'absolute', inset: '-10%', width: '120%', height: '120%', objectFit: 'cover', filter: 'blur(28px) brightness(0.45)' }} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.imagem} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
          </>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {!p.imagem && p.maquina?.foto && <img src={p.maquina.foto} alt="" style={{ position: 'absolute', inset: 16, width: 'calc(100% - 32px)', height: 'calc(100% - 32px)', objectFit: 'contain' }} />}
      </div>
      <div style={{ display: 'grid', alignContent: celular ? 'start' : 'center', gap: 8, padding: celular ? 24 : 48 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: SITE.vermelho }}>Promoção<span style={{ textTransform: 'none', letterSpacing: 0, color: produto ? SITE.aco : SITE.branco }}>{validade}</span></span>
        <span style={{ fontFamily: SITE.titulo, fontWeight: 500, fontSize: celular ? 26 : 40, lineHeight: 1.1 }}>{p.titulo || 'Título da promoção'}</span>
        {p.texto && <span style={{ fontSize: 17, lineHeight: 1.5, opacity: 0.9 }}>{p.texto}</span>}
        <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, marginTop: 8 }}>
          <span style={pilula(SITE.vermelho, SITE.branco)}>{botao} →</span>
          {!p.whats && <span style={{ fontWeight: 600, textDecoration: 'underline' }}>Perguntar no WhatsApp</span>}
        </span>
      </div>
    </div>
  );
}

export function PreviaPromocao({ p, total = 1, atual = 0, onIr, titulo = 'Como fica na página inicial do site' }: { p: PromoPrevia; total?: number; atual?: number; onIr?: (i: number) => void; titulo?: string }) {
  const bloco = (celular: boolean) => (
    <div style={{ padding: celular ? '32px 16px' : '48px 64px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontFamily: SITE.titulo, fontWeight: 500, fontSize: celular ? 28 : 40, color: SITE.aco }}>Promoções</span>
        {!celular && total > 1 && <span style={{ display: 'flex', gap: 8 }}>{['‹', '›'].map((s, k) => <span key={s} onClick={onIr ? () => onIr((atual + (k ? 1 : total - 1)) % total) : undefined} style={{ cursor: onIr ? 'pointer' : undefined, width: 44, height: 44, borderRadius: 999, border: `1px solid ${SITE.borda}`, display: 'grid', placeItems: 'center', fontSize: 28, color: SITE.preto }}>{s}</span>)}</span>}
      </div>
      <PromoSlide p={p} celular={celular} />
      {total > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 14 }}>
          {Array.from({ length: total }, (_, i) => <span key={i} onClick={onIr ? () => onIr(i) : undefined} style={{ cursor: onIr ? 'pointer' : undefined, width: i === atual ? 26 : 10, height: 10, borderRadius: 999, background: i === atual ? SITE.vermelho : SITE.borda }} />)}
        </div>
      )}
    </div>
  );
  return <Previa titulo={titulo} pc={bloco(false)} celular={bloco(true)} />;
}

/* ---------------------------------------------------------------- Cartão de máquina */
export type CardPrevia = { nome: string; marca: string; cv?: number | string | null; foto?: string | null; ideal?: string[]; selo?: string | null; trator: boolean }

export function CartaoSite({ c }: { c: CardPrevia }) {
  return (
    <div style={{ background: SITE.branco, border: `1px solid ${SITE.borda}`, borderRadius: SITE.raio, overflow: 'hidden', display: 'grid' }}>
      <div style={{ position: 'relative', aspectRatio: '4 / 3', background: c.trator ? 'linear-gradient(#fff, #ececee)' : '#fff', display: 'grid', placeItems: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {c.foto ? <img src={c.foto} alt="" style={{ width: '88%', height: '88%', objectFit: 'contain' }} /> : <span style={{ color: '#aaa', fontSize: 14 }}>sem foto</span>}
        {c.selo && <span style={{ position: 'absolute', left: 12, top: 12, background: SITE.vermelho, color: '#fff', fontWeight: 700, fontSize: 13, padding: '4px 10px', borderRadius: 6 }}>{c.selo}</span>}
      </div>
      <div style={{ padding: 16, display: 'grid', gap: 6 }}>
        <span style={{ fontSize: 13, color: SITE.aco, opacity: 0.8 }}>{c.marca}{c.cv ? ` · ${c.cv} cv` : ''}</span>
        <span style={{ fontFamily: SITE.titulo, fontWeight: 500, fontSize: 21, lineHeight: 1.2, color: SITE.aco }}>{c.nome || 'Nome da máquina'}</span>
        {!!c.ideal?.length && <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{c.ideal.slice(0, 2).map((u) => <span key={u} style={{ fontSize: 12, padding: '3px 9px', borderRadius: 999, background: '#F2F2F3', color: SITE.aco }}>{u}</span>)}</span>}
        <span style={{ color: SITE.vermelho, fontWeight: 700, fontSize: 15, marginTop: 4 }}>Ver detalhes →</span>
      </div>
    </div>
  );
}

export function PreviaCartao({ c }: { c: CardPrevia }) {
  const lista = (celular: boolean) => (
    <div style={{ padding: celular ? '24px 16px' : '40px 64px', background: SITE.branco }}>
      <div style={{ display: 'grid', gridTemplateColumns: celular ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: celular ? 12 : 24 }}>
        <CartaoSite c={c} />
        {Array.from({ length: celular ? 1 : 3 }, (_, i) => <div key={i} style={{ borderRadius: SITE.raio, background: '#F4F4F5', border: `1px dashed ${SITE.borda}` }} />)}
      </div>
    </div>
  );
  return <Previa titulo="Como o cartão aparece nas listas do site" pc={lista(false)} celular={lista(true)} />;
}

/* ---------------------------------------------------------------- Página da marca */
export type MarcaPrevia = { nome: string; logo?: string | null; banner?: string | null; sobre?: string | null; modelos: CardPrevia[]; sobConsulta: string[] }

function BannerMarca({ m, celular }: { m: MarcaPrevia; celular: boolean }) {
  const foto = !!m.banner;
  return (
    <div style={{ position: 'relative', minHeight: celular ? 300 : 420, display: 'grid', alignContent: 'end', overflow: 'hidden', background: foto ? SITE.preto : 'linear-gradient(#fff 0%, #f4f4f5 72%, #e2e3e5 100%)', color: foto ? '#fff' : SITE.aco }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {foto && <img src={m.banner!} alt="" style={{ position: 'absolute', inset: -12, width: 'calc(100% + 24px)', height: 'calc(100% + 24px)', objectFit: 'cover', filter: 'blur(3px) saturate(1.05)' }} />}
      {foto && <span style={{ position: 'absolute', inset: 0, background: celular ? 'linear-gradient(to top, rgb(0 0 0 / .8) 10%, rgb(0 0 0 / .35) 60%, rgb(0 0 0 / .1))' : 'linear-gradient(to right, rgb(0 0 0 / .78) 0, rgb(0 0 0 / .45) 38%, rgb(0 0 0 / 0) 68%)' }} />}
      <div style={{ position: 'relative', padding: celular ? '24px 16px' : '48px 64px', display: 'grid', gap: 12, maxWidth: celular ? undefined : 640 }}>
        <span style={{ fontSize: 13, opacity: 0.9 }}>Início › Implementos › {m.nome || 'Marca'}</span>
        {m.logo && (
          <span style={{ justifySelf: 'start', background: '#fff', borderRadius: 10, padding: '8px 12px', display: 'flex' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.logo} alt="" style={{ height: 36, width: 'auto', mixBlendMode: 'multiply' }} />
          </span>
        )}
        <span style={{ fontFamily: SITE.titulo, fontWeight: 500, fontSize: celular ? 36 : 56, lineHeight: 1.05, textShadow: foto ? '0 1px 12px rgb(0 0 0 / .5)' : undefined }}>{m.nome || 'Nome da marca'}</span>
        <span style={{ fontSize: 17, lineHeight: 1.5, textShadow: foto ? '0 1px 12px rgb(0 0 0 / .5)' : undefined }}>
          {m.modelos.length} {m.modelos.length === 1 ? 'implemento' : 'implementos'}. Pergunte pelas condições de pagamento e pelo prazo de entrega.
        </span>
      </div>
    </div>
  );
}

export function PreviaMarca({ m }: { m: MarcaPrevia }) {
  const pagina = (celular: boolean) => (
    <div>
      <BannerMarca m={m} celular={celular} />
      <div style={{ padding: celular ? '24px 16px' : '40px 64px', display: 'grid', gap: 20 }}>
        {m.sobre && <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6, maxWidth: 760 }}>{m.sobre}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: celular ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: celular ? 12 : 24 }}>
          {m.modelos.slice(0, celular ? 4 : 8).map((c, i) => <CartaoSite key={i} c={c} />)}
          {!m.modelos.length && <span style={{ gridColumn: '1 / -1', fontSize: 15, color: '#888' }}>Nenhum modelo nesta marca ainda: inclua pelo botão “Incluir modelo nesta marca”.</span>}
        </div>
        {!!m.sobConsulta.length && (
          <div style={{ display: 'grid', gap: 8 }}>
            <span style={{ fontFamily: SITE.titulo, fontWeight: 500, fontSize: 24 }}>Sob consulta</span>
            <span style={{ fontSize: 16 }}>{m.sobConsulta.join(', ')}.</span>
          </div>
        )}
      </div>
    </div>
  );
  return <Previa titulo="Como fica a página da marca no site" pc={pagina(false)} celular={pagina(true)} />;
}

/* ---------------------------------------------------------------- Conteúdo (Site → Conteúdo, 12/11) */
type V = Record<string, unknown>;
const s = (v: unknown) => String(v ?? '');

/** Topo do site (logo, menu, WhatsApp) — moldura comum das prévias de conteúdo. */
function Cabecalho({ celular, aviso }: { celular: boolean; aviso?: V }) {
  const ligado = aviso?.ligado === true && s(aviso?.texto).trim();
  return (
    <div>
      {ligado && (
        <div style={{ background: SITE.vermelho, color: '#fff', textAlign: 'center', fontSize: 14, fontWeight: 600, padding: '9px 16px' }}>
          {s(aviso!.texto)}{aviso!.link ? <span style={{ textDecoration: 'underline', marginLeft: 8 }}>Saiba mais →</span> : null}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: celular ? '12px 16px' : '14px 64px', borderBottom: `1px solid ${SITE.claro}`, background: '#fff' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/Logo_Nova.png" alt="" style={{ height: celular ? 28 : 34, width: 'auto' }} />
        {!celular && <span style={{ display: 'flex', gap: 22, fontSize: 15, color: SITE.aco }}>{['Tratores', 'Implementos', 'Crédito', 'Pós-venda', 'Peças', 'Contato'].map((m) => <span key={m}>{m}</span>)}</span>}
        <span style={{ marginLeft: 'auto', ...pilula(SITE.vermelho, '#fff'), minHeight: celular ? 38 : 42, padding: celular ? '8px 14px' : '10px 18px', fontSize: 14 }}>WhatsApp</span>
        {celular && <span style={{ fontSize: 22, color: SITE.preto }}>☰</span>}
      </div>
    </div>
  );
}

/** Topo da página inicial: texto por cima do vídeo da loja. */
function Topo({ celular, home }: { celular: boolean; home: V }) {
  return (
    <div style={{ position: 'relative', minHeight: celular ? 420 : 520, display: 'grid', alignContent: 'end', background: 'linear-gradient(135deg, #3b3f45 0%, #1d1f22 55%, #111 100%)', color: '#fff' }}>
      <span style={{ position: 'absolute', right: celular ? 16 : 64, top: celular ? 16 : 24, fontSize: 12, opacity: 0.6 }}>▶ vídeo da loja</span>
      <div style={{ padding: celular ? '0 16px 32px' : '0 64px 64px', display: 'grid', gap: 14, maxWidth: celular ? undefined : 760 }}>
        <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '.04em', opacity: 0.9 }}>{s(home.olho)}</span>
        <span style={{ fontFamily: SITE.titulo, fontWeight: 500, fontSize: celular ? 38 : 60, lineHeight: 1.05 }}>{s(home.titulo)}</span>
        <span style={{ fontSize: celular ? 17 : 20, opacity: 0.92 }}>{s(home.texto)}</span>
        <span style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <span style={pilula(SITE.vermelho, '#fff')}>Falar no WhatsApp</span>
          <span style={{ ...pilula('transparent', '#fff'), border: '1px solid rgba(255,255,255,.6)' }}>Ver tratores</span>
        </span>
      </div>
    </div>
  );
}

export function PreviaConteudo({ grupo, valores }: { grupo: string; valores: Record<string, V> }) {
  const aviso = valores.aviso || {}, home = valores.home || {}, contato = valores.contato || {}, horario = valores.horario || {}, banners = valores.banners || {};
  const periodo = (p: unknown) => s(p).replace('-', ' às ');
  const pagina = (celular: boolean): ReactNode => {
    if (grupo === 'aviso') return <><Cabecalho celular={celular} aviso={aviso} /><Topo celular={celular} home={home} /></>;
    if (grupo === 'home') return <><Cabecalho celular={celular} /><Topo celular={celular} home={home} /></>;
    if (grupo === 'contato' || grupo === 'horario') {
      return (
        <>
          <Cabecalho celular={celular} />
          <div style={{ background: SITE.preto, color: '#e6e7e8', padding: celular ? '28px 16px' : '48px 64px', display: 'grid', gridTemplateColumns: celular ? '1fr' : 'repeat(3, 1fr)', gap: 24, fontSize: 15, lineHeight: 1.7 }}>
            <div style={{ outline: grupo === 'contato' ? `2px dashed ${SITE.vermelho}` : 'none', outlineOffset: 8, borderRadius: 4 }}>
              <div style={{ fontFamily: SITE.titulo, fontSize: 20, color: '#fff', marginBottom: 6 }}>Fale com a gente</div>
              <div>Telefone {s(contato.telefone)}</div>
              <div>Celular {s(contato.celular)}</div>
              <div>WhatsApp Vendas {s(contato.whatsapp)}</div>
              <div>Pós-Vendas {s(contato.posVendas)}</div>
              <div>Peças {s(contato.pecas)}</div>
            </div>
            <div style={{ outline: grupo === 'contato' ? `2px dashed ${SITE.vermelho}` : 'none', outlineOffset: 8, borderRadius: 4 }}>
              <div style={{ fontFamily: SITE.titulo, fontSize: 20, color: '#fff', marginBottom: 6 }}>Onde estamos</div>
              <div>{s(contato.endereco)}</div>
              <div>{s(contato.cidade)}/{s(contato.uf)}</div>
              <div style={{ marginTop: 6, opacity: 0.85 }}>Instagram · Facebook · YouTube</div>
            </div>
            <div style={{ outline: grupo === 'horario' ? `2px dashed ${SITE.vermelho}` : 'none', outlineOffset: 8, borderRadius: 4 }}>
              <div style={{ fontFamily: SITE.titulo, fontSize: 20, color: '#fff', marginBottom: 6 }}>Horário</div>
              <div>Segunda a sexta</div>
              <div>{periodo(horario.manha)} · {periodo(horario.tarde)}</div>
              <div>Sábado: {s(horario.sabado) ? periodo(horario.sabado) : 'fechado'}</div>
              <div style={{ marginTop: 6, color: '#4ade80' }}>● Aberto agora</div>
            </div>
          </div>
        </>
      );
    }
    // banners: um banner por página, com o texto embaixo do título
    const lista: [string, string][] = [['Crédito', 'credito'], ['Pós-venda', 'posVenda'], ['Peças', 'pecas'], ['Contato', 'contato'], ['Implementos', 'implementos']];
    return (
      <div style={{ display: 'grid', gap: 12, padding: celular ? 12 : 24, background: '#f4f4f5' }}>
        {lista.map(([titulo, chave]) => (
          <div key={chave} style={{ borderRadius: SITE.raio, overflow: 'hidden', background: 'linear-gradient(to right, #1d1f22 0, #3b3f45 100%)', color: '#fff', padding: celular ? '22px 16px' : '32px 48px', display: 'grid', gap: 8 }}>
            <span style={{ fontSize: 12, opacity: 0.75 }}>Início › {titulo}</span>
            <span style={{ fontFamily: SITE.titulo, fontWeight: 500, fontSize: celular ? 28 : 40 }}>{titulo === 'Implementos' ? 'Implementos' : titulo}</span>
            <span style={{ fontSize: 16, opacity: 0.92, maxWidth: 720 }}>{chave === 'implementos' ? `92 implementos de 9 marcas. ${s(banners[chave])}` : s(banners[chave])}</span>
          </div>
        ))}
      </div>
    );
  };
  const titulos: Record<string, string> = {
    aviso: 'Como fica a faixa no topo do site',
    home: 'Como fica o topo da página inicial',
    contato: 'Onde telefones e endereço aparecem (rodapé de todas as páginas)',
    horario: 'Onde o horário aparece (rodapé e página Contato)',
    banners: 'Como fica o topo de cada página',
  };
  return <Previa titulo={titulos[grupo] || 'Como fica no site'} pc={pagina(false)} celular={pagina(true)} />;
}
