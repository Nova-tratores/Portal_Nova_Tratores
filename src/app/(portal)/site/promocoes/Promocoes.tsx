'use client';
// Site → Promoções (José, 12/11/2026): "coloca a foto da promoção, ou seleciona uma máquina do site, para aparecer como
// nos outros sites". Carrossel na página inicial; só aparece quando houver promoção ligada e dentro da data.
// 12/11 tarde: estilo NewPortal, guia de tamanho, prévia computador/celular.
// 12/11 noite: "tá ruim de entender ainda, faz algo mais completo, não me refiro a texto" → a lista mostra cada promoção
// DO JEITO QUE APARECE NO SITE (não a foto crua), em 3 visuais para escolher em /site/promocoes/teste:
//   vitrine = o site passando o carrossel + a fila em ordem; tempo = linha do tempo das datas; cartoes = cada uma com
//   computador e celular lado a lado. O editor abre pelo endereço (?editar=id, ?nova=1) e tem Voltar.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fetchAuth } from '@/lib/auth/client';
import { Aviso, tela } from '@/components/site/ui';
import PublicarBarra from '@/components/site/PublicarBarra';
import EnviarFoto from '@/components/site/EnviarFoto';
import { Escala, FontesSite, PreviaPromocao, PromoSlide, type PromoPrevia } from '@/components/site/Previa';
import { AZUL, Campo, Quadradinho, Secao, T1, T2, T3, bt, campoNP, cartaoNP, grade, ic } from '@/components/site/np';

type Promo = {
  id: string; titulo: string; texto: string | null; imagem: string | null; imagem_celular?: string | null; produto_slug: string | null; link: string | null
  botao: string | null; inicio: string | null; fim: string | null; ativo: boolean; ordem: number; atualizado_por: string | null
};
type Maquina = { slug: string; titulo: string; marca: string; foto: string | null; categoria: string };
type Rascunho = Omit<Promo, 'id' | 'ordem' | 'atualizado_por'> & { id?: string };
export type Visual = 'atual' | 'vitrine' | 'tempo' | 'cartoes';

/** Tamanho real da imagem (para avisar quando a arte não tem o formato certo). */
function useTamanho(url: string | null | undefined) {
  const [t, setT] = useState<{ url: string; w: number; h: number } | null>(null);
  useEffect(() => {
    if (!url) return;
    const img = new Image();
    img.onload = () => setT({ url, w: img.naturalWidth, h: img.naturalHeight });
    img.src = url;
  }, [url]);
  return url && t?.url === url ? t : null;
}

function SeloTamanho({ url, ideal }: { url: string | null | undefined; ideal: { w: number; h: number; nome: string } }) {
  const t = useTamanho(url);
  if (!url) return <span style={{ fontSize: 12, color: T3 }}>Ideal: {ideal.w}×{ideal.h} px ({ideal.nome})</span>;
  if (!t) return <span style={{ fontSize: 12, color: T3 }}>Medindo…</span>;
  const ok = Math.abs(t.w / t.h - ideal.w / ideal.h) < 0.08;
  const pequena = t.w < ideal.w * 0.6;
  const cor = ok && !pequena ? '#16a34a' : '#b45309';
  return (
    <span style={{ fontSize: 12, color: cor, display: 'flex', gap: 6, alignItems: 'flex-start', lineHeight: 1.45 }}>
      {ic(ok && !pequena ? 'fa-circle-check' : 'fa-triangle-exclamation')}
      <span>
        Esta tem {t.w}×{t.h} px.{' '}
        {ok && !pequena ? 'Tamanho certo.' : !ok ? `O ideal é ${ideal.w}×${ideal.h} px (${ideal.nome}): no site ela fica com faixas ou cortada.` : `Pequena: no computador pode ficar borrada (ideal ${ideal.w}×${ideal.h}).`}
      </span>
    </span>
  );
}

const hoje = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const dataBR = (d: string) => d.split('-').reverse().join('/');
const VAZIA: Rascunho = { titulo: '', texto: '', imagem: null, imagem_celular: null, produto_slug: null, link: '', botao: '', inicio: null, fim: null, ativo: true };
const IDEAL_PC = { w: 1920, h: 640, nome: 'deitada, 3 por 1' };
const IDEAL_CEL = { w: 1080, h: 1080, nome: 'quadrada' };
const VERDE = '#16a34a', CINZA = '#64748b', AZUL_CLARO = '#0284c7';

type Sit = { txt: string; cor: string; noAr: boolean; icone: string };
function situacao(p: Promo): Sit {
  const h = hoje();
  if (!p.ativo) return { txt: 'Desligada', cor: CINZA, noAr: false, icone: 'fa-eye-slash' };
  if (p.fim && p.fim < h) return { txt: `Venceu em ${dataBR(p.fim)}`, cor: CINZA, noAr: false, icone: 'fa-calendar-xmark' };
  if (p.inicio && p.inicio > h) return { txt: `Começa em ${dataBR(p.inicio)}`, cor: AZUL_CLARO, noAr: false, icone: 'fa-hourglass-half' };
  return { txt: p.fim ? `No ar até ${dataBR(p.fim)}` : 'No ar', cor: VERDE, noAr: true, icone: 'fa-circle-play' };
}
const faixa = (p: Pick<Promo, 'imagem' | 'imagem_celular'>) => !!(p.imagem && p.imagem_celular);

function Chip({ s }: { s: Sit }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '3px 10px', borderRadius: 999, color: s.cor, background: `color-mix(in srgb, ${s.cor} 11%, transparent)`, whiteSpace: 'nowrap' }}>
      {ic(s.icone)}{s.txt}
    </span>
  );
}

/** O quadro da promoção desenhado como no site, em miniatura, dentro de uma moldura de computador ou de celular. */
function Mini({ p, celular = false, apagada = false }: { p: PromoPrevia; celular?: boolean; apagada?: boolean }) {
  return (
    <div style={{ border: `${celular ? 5 : 4}px solid #2b2b2e`, borderRadius: celular ? 16 : 10, overflow: 'hidden', background: '#fff', filter: apagada ? 'grayscale(1)' : undefined, opacity: apagada ? 0.6 : 1 }}>
      <Escala largura={celular ? 390 : 1280}>
        <div style={{ padding: celular ? '16px 12px' : '24px 32px' }}><PromoSlide p={p} celular={celular} /></div>
      </Escala>
    </div>
  );
}

export default function Promocoes({ teste = false }: { teste?: boolean }) {
  const [promos, setPromos] = useState<Promo[] | null>(null);
  const [maquinas, setMaquinas] = useState<Maquina[]>([]);
  const [podeEditar, setPodeEditar] = useState(false);
  const [erro, setErro] = useState('');
  const [r, setR] = useState<(Rascunho & { chave: string }) | null>(null);
  const [modo, setModo] = useState<'foto' | 'maquina'>('foto');
  const [buscaMaq, setBuscaMaq] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState('');
  const [versao, setVersao] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [passando, setPassando] = useState(true);

  // ---- endereço: ?editar=<id> | ?nova=1 (e ?visual= na página de teste). Voltar do navegador fecha o editor.
  const [rota, setRota] = useState<{ editar: string | null; nova: boolean; visual: Visual }>({ editar: null, nova: false, visual: teste ? 'vitrine' : 'atual' });
  const abriuAqui = useRef(false);
  useEffect(() => {
    const ler = () => {
      const q = new URLSearchParams(window.location.search);
      const v = q.get('visual') as Visual | null;
      setRota({ editar: q.get('editar'), nova: !!q.get('nova'), visual: teste && v && ['atual', 'vitrine', 'tempo', 'cartoes'].includes(v) ? v : teste ? 'vitrine' : 'atual' });
    };
    ler();
    const voltou = () => { abriuAqui.current = false; ler(); };
    window.addEventListener('popstate', voltou);
    return () => window.removeEventListener('popstate', voltou);
  }, [teste]);
  const ir = useCallback((novo: Partial<typeof rota>, trocar = false) => {
    setRota((atual) => {
      const u = { ...atual, ...novo };
      const q = new URLSearchParams();
      if (teste && u.visual !== 'vitrine') q.set('visual', u.visual);
      if (u.editar) q.set('editar', u.editar);
      else if (u.nova) q.set('nova', '1');
      const destino = `${window.location.pathname}${q.toString() ? `?${q}` : ''}`;
      if (destino !== `${window.location.pathname}${window.location.search}`) window.history[trocar ? 'replaceState' : 'pushState'](null, '', destino);
      return u;
    });
  }, [teste]);
  const visual = rota.visual;

  const carregar = useCallback(async () => {
    const [a, b] = await Promise.all([fetchAuth('/api/site/promocoes'), fetchAuth('/api/site/catalogo')]);
    const ja = await a.json().catch(() => ({}));
    const jb = await b.json().catch(() => ({}));
    if (!a.ok || !ja.ok) { setErro(ja.erro || 'Não consegui carregar as promoções.'); setPromos([]); }
    else { setErro(''); setPromos(ja.promocoes); setPodeEditar(!!ja.podeEditar); }
    if (jb.ok) setMaquinas((jb.itens || []).filter((i: Maquina & { publicar?: boolean; mudanca?: { oculto?: boolean } }) => i.publicar !== false && !i.mudanca?.oculto));
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar(); }, [carregar]);
  const mudou = () => { setVersao((n) => n + 1); carregar(); };

  // editor segue o endereço; não apaga o que está sendo digitado
  const chaveRota = rota.editar || (rota.nova ? 'nova' : null);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!chaveRota) { setR(null); return; }
    if (!promos) return;
    const p = promos.find((x) => x.id === chaveRota);
    if (chaveRota !== 'nova' && !p) { setR(null); return; }
    setR((x) => {
      if (x?.chave === chaveRota) return x;
      setErroForm(''); setBuscaMaq('');
      if (p) { setModo(p.imagem ? 'foto' : 'maquina'); return { ...p, texto: p.texto || '', link: p.link || '', botao: p.botao || '', chave: chaveRota }; }
      setModo('foto');
      return { ...VAZIA, chave: 'nova' };
    });
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [chaveRota, promos]);
  const abrir = (p?: Promo) => { abriuAqui.current = true; ir(p ? { editar: p.id, nova: false } : { editar: null, nova: true }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const fecharEditor = () => { if (abriuAqui.current) { abriuAqui.current = false; window.history.back(); } else ir({ editar: null, nova: false }, true); };

  const maq = useCallback((slug: string | null) => maquinas.find((m) => m.slug === slug), [maquinas]);
  const achadas = useMemo(() => {
    const q = buscaMaq.trim().toLowerCase();
    return maquinas.filter((m) => !q || `${m.titulo} ${m.marca}`.toLowerCase().includes(q)).slice(0, 40);
  }, [maquinas, buscaMaq]);

  const previaDe = useCallback((p: Promo): PromoPrevia => {
    const m = maq(p.produto_slug);
    const link = (p.link || '').trim();
    return {
      titulo: p.titulo || m?.titulo || '', texto: p.texto, botao: p.botao, fim: p.fim, whats: link ? /wa\.me|whatsapp/.test(link) : !m,
      imagem: p.imagem, imagem_celular: p.imagem_celular, maquina: m ? { nome: m.titulo, foto: m.foto } : null,
    };
  }, [maq]);

  const lista = useMemo(() => promos || [], [promos]);
  const noAr = useMemo(() => lista.filter((p) => situacao(p).noAr), [lista]);
  const fora = useMemo(() => lista.filter((p) => !situacao(p).noAr), [lista]);

  // vitrine: o carrossel passa sozinho a cada 6 s, como no site
  const idxNoAr = Math.max(0, noAr.findIndex((p) => p.id === sel));
  useEffect(() => {
    if (visual !== 'vitrine' || !passando || noAr.length < 2 || r) return;
    const t = setInterval(() => setSel((s) => { const i = noAr.findIndex((p) => p.id === s); return noAr[(Math.max(0, i) + 1) % noAr.length].id; }), 6000);
    return () => clearInterval(t);
  }, [visual, passando, noAr, r]);

  async function chamar(metodo: string, corpo?: unknown, q = '') {
    setSalvando(true); setErroForm('');
    const res = await fetchAuth(`/api/site/promocoes${q}`, { method: metodo, headers: corpo ? { 'Content-Type': 'application/json' } : undefined, body: corpo ? JSON.stringify(corpo) : undefined });
    const j = await res.json().catch(() => ({}));
    setSalvando(false);
    if (!res.ok || !j.ok) { setErroForm(j.erro || 'Não consegui gravar.'); if (!r) alert(j.erro || 'Não consegui gravar.'); return null; }
    return j;
  }
  async function salvar() {
    if (!r) return;
    const { chave: _chave, ...resto } = r; void _chave;
    const corpo = { ...resto, imagem: modo === 'foto' ? r.imagem : null, imagem_celular: modo === 'foto' ? r.imagem_celular ?? null : null };
    if (modo === 'foto' && !corpo.imagem) { setErroForm('Envie a arte do computador.'); return; }
    if (modo === 'maquina' && !corpo.produto_slug) { setErroForm('Escolha a máquina.'); return; }
    if (!corpo.titulo.trim()) { setErroForm('Escreva o título.'); return; }
    const j = await chamar(r.id ? 'PATCH' : 'POST', corpo);
    if (j) { fecharEditor(); mudou(); }
  }
  async function ligar(p: Promo) { if (await chamar('PATCH', { id: p.id, ativo: !p.ativo })) mudou(); }
  async function apagar(p: Promo) { if (confirm(`Apagar de vez a promoção "${p.titulo}"? (Para tirar do site só por um tempo, use Desligar.)`) && (await chamar('DELETE', undefined, `?id=${p.id}`))) mudou(); }
  async function mover(p: Promo, d: number) {
    const l = [...lista]; const i = l.findIndex((x) => x.id === p.id); const j = i + d;
    if (i < 0 || j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]];
    setPromos(l);
    if (await chamar('PATCH', { ordem: l.map((x) => x.id) })) mudou();
  }

  // ---------------------------------------------------------------- peças da lista
  /** O que a promoção é e para onde o botão leva, com ícones. */
  function info(p: Promo) {
    const m = maq(p.produto_slug);
    const linha = (icone: string, txt: ReactNode) => <span style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 13, color: T2 }}><span style={{ width: 16, color: T3, textAlign: 'center' }}>{ic(icone)}</span><span>{txt}</span></span>;
    return (
      <span style={{ display: 'grid', gap: 5 }}>
        {linha(p.imagem ? 'fa-image' : 'fa-tractor', p.imagem ? (faixa(p) ? 'Arte do computador e do celular' : 'Uma arte, com o texto ao lado') : `Foto da máquina ${m?.titulo || p.produto_slug}`)}
        {linha('fa-hand-pointer', <>Botão leva {p.link ? <>para {p.link}</> : p.produto_slug ? 'à página da máquina' : 'ao WhatsApp do vendedor'}</>)}
        {linha('fa-calendar-days', p.inicio || p.fim ? `${p.inicio ? `De ${dataBR(p.inicio)}` : 'Desde já'} ${p.fim ? `até ${dataBR(p.fim)}` : 'sem data para sair'}` : 'Sem datas: fica até alguém desligar')}
      </span>
    );
  }
  /** Botões com nome escrito (nada de só ícone). */
  function acoes(p: Promo, compacto = false) {
    if (!podeEditar) return null;
    const i = lista.findIndex((x) => x.id === p.id);
    const b = (cor: string) => ({ ...bt(cor), ...(compacto ? { minHeight: 36, padding: '6px 11px', fontSize: 13 } : {}) });
    return (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button style={b(AZUL)} onClick={() => abrir(p)} title="Trocar arte, textos e datas">{ic('fa-pen')}Mudar</button>
        <button style={b(p.ativo ? CINZA : VERDE)} disabled={salvando} onClick={() => ligar(p)} title={p.ativo ? 'Tira do site sem apagar' : 'Volta a aparecer no site'}>
          {ic(p.ativo ? 'fa-eye-slash' : 'fa-eye')}{p.ativo ? 'Tirar do site' : 'Pôr no site'}
        </button>
        <button style={b(CINZA)} disabled={i <= 0 || salvando} onClick={() => mover(p, -1)} title="Passa antes no carrossel">{ic('fa-arrow-left')}Antes</button>
        <button style={b(CINZA)} disabled={i < 0 || i >= lista.length - 1 || salvando} onClick={() => mover(p, 1)} title="Passa depois no carrossel">Depois{ic('fa-arrow-right')}</button>
        <button style={{ ...b('#dc2626'), marginLeft: 'auto' }} disabled={salvando} onClick={() => apagar(p)} title="Apaga de vez">{ic('fa-trash')}Apagar</button>
      </div>
    );
  }

  // ---------------------------------------------------------------- visual 1: vitrine (o site passando)
  function vitrine() {
    const atual = noAr[idxNoAr];
    return (
      <>
        <section style={{ ...cartaoNP, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Quadradinho icone="fa-display" cor={VERDE} />
            <span style={{ flex: '1 1 220px', display: 'grid' }}>
              <span style={{ fontSize: 16, fontWeight: 500 }}>{noAr.length ? 'Assim está a página inicial do site agora' : 'O site está sem bloco de promoções'}</span>
              <span style={{ fontSize: 13, color: T3 }}>{noAr.length ? `${noAr.length} passando, uma a cada 6 segundos` : 'Ligue ou crie uma promoção para o bloco aparecer'}</span>
            </span>
            {noAr.length > 1 && (
              <button style={bt(CINZA)} onClick={() => setPassando(!passando)}>{ic(passando ? 'fa-pause' : 'fa-play')}{passando ? 'Parar' : 'Passar sozinho'}</button>
            )}
          </div>
          {atual ? (
            <PreviaPromocao p={previaDe(atual)} total={noAr.length} atual={idxNoAr} titulo={`${idxNoAr + 1}ª de ${noAr.length}: ${atual.titulo}`}
              onIr={(i) => { setPassando(false); setSel(noAr[i].id); }} />
          ) : (
            <div style={{ border: '2px dashed var(--border)', borderRadius: 14, padding: 28, display: 'grid', placeItems: 'center', gap: 6, color: T3, textAlign: 'center' }}>
              <span style={{ fontSize: 28 }}>{ic('fa-eye-slash')}</span>
              <span>Sem promoção no ar, o site vai direto do vídeo para os tratores.</span>
            </div>
          )}
        </section>

        {noAr.length > 0 && (
          <Secao icone="fa-list-ol" cor={VERDE} titulo="Ordem em que passam" sub="Toque numa para ver no site acima">
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))' }}>
              {noAr.map((p, i) => {
                const ativa = i === idxNoAr;
                return (
                  <button key={p.id} type="button" onClick={() => { setPassando(false); setSel(p.id); }}
                    style={{ ...cartaoNP, padding: 10, display: 'grid', gap: 8, textAlign: 'left', font: 'inherit', color: T1, cursor: 'pointer',
                      borderColor: ativa ? '#dc2626' : 'var(--border)', boxShadow: ativa ? '0 0 0 1px #dc2626' : 'none' }}>
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ width: 24, height: 24, borderRadius: 999, display: 'grid', placeItems: 'center', fontSize: 12, background: ativa ? '#dc2626' : 'var(--portal-bg)', color: ativa ? '#fefefe' : T2 }}>{i + 1}</span>
                      <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.titulo}</span>
                    </span>
                    <Mini p={previaDe(p)} />
                  </button>
                );
              })}
            </div>
            {atual && (
              <div style={{ display: 'grid', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><Chip s={situacao(atual)} /><span style={{ fontSize: 15 }}>{atual.titulo}</span></span>
                {info(atual)}
                {acoes(atual)}
              </div>
            )}
          </Secao>
        )}
        {foraDoSite()}
      </>
    );
  }

  /** Promoções que não estão aparecendo (desligadas, vencidas, que ainda vão começar). */
  function foraDoSite() {
    if (!fora.length) return null;
    return (
      <Secao icone="fa-box-archive" cor={CINZA} titulo={`Fora do site agora (${fora.length})`} sub="Desligadas, vencidas ou que ainda vão começar">
        <div style={grade(280)}>
          {fora.map((p) => {
            const s = situacao(p);
            return (
              <div key={p.id} style={{ ...cartaoNP, padding: 12, display: 'grid', gap: 10, alignContent: 'start' }}>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><Chip s={s} /><span style={{ fontSize: 14 }}>{p.titulo}</span></span>
                <Mini p={previaDe(p)} apagada={s.cor === CINZA} />
                {acoes(p, true)}
              </div>
            );
          })}
        </div>
      </Secao>
    );
  }

  // ---------------------------------------------------------------- visual 2: linha do tempo
  function tempo() {
    const ms = (d: string) => new Date(`${d}T12:00:00`).getTime();
    const DIA = 86400000;
    const h = ms(hoje());
    const ini = h - 14 * DIA;
    const ultimo = Math.max(h + 60 * DIA, ...lista.flatMap((p) => [p.fim, p.inicio]).filter(Boolean).map((d) => ms(d!) + 10 * DIA));
    const fim = Math.min(ultimo, h + 240 * DIA);
    const pos = (t: number) => `${Math.min(100, Math.max(0, ((t - ini) / (fim - ini)) * 100))}%`;
    const meses: { t: number; nome: string }[] = [];
    for (let d = new Date(ini); d.getTime() <= fim; d.setMonth(d.getMonth() + 1, 1)) {
      const p = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      if (p >= ini) meses.push({ t: p, nome: new Date(p).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') });
    }
    const atual = lista.find((p) => p.id === sel) || noAr[0] || lista[0];
    return (
      <>
        <Secao icone="fa-timeline" cor={AZUL_CLARO} titulo="Quando cada promoção fica no site" sub="A linha vermelha é hoje. Toque numa barra para ver como ela fica no site">
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={{ position: 'relative', height: 18, marginLeft: 0 }}>
              {meses.map((m) => <span key={m.t} style={{ position: 'absolute', left: pos(m.t), fontSize: 11, color: T3, borderLeft: '1px solid var(--border)', paddingLeft: 4 }}>{m.nome}</span>)}
            </div>
            {lista.map((p, i) => {
              const s = situacao(p);
              const a = p.inicio ? ms(p.inicio) : ini;
              const b = p.fim ? ms(p.fim) + DIA : fim;
              const ativa = atual?.id === p.id;
              return (
                <button key={p.id} type="button" onClick={() => setSel(p.id)}
                  style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', alignItems: 'center', padding: '8px 6px', border: 0, borderRadius: 10, font: 'inherit', color: T1, textAlign: 'left', cursor: 'pointer',
                    background: ativa ? 'color-mix(in srgb, #dc2626 6%, var(--surface))' : 'transparent' }}>
                  <span style={{ flex: '0 1 230px', minWidth: 0, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ width: 84, flex: 'none' }}><Mini p={previaDe(p)} apagada={!s.noAr} /></span>
                    <span style={{ display: 'grid', minWidth: 0 }}>
                      <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i + 1}. {p.titulo}</span>
                      <span style={{ fontSize: 11.5, color: s.cor }}>{s.txt}</span>
                    </span>
                  </span>
                  <span style={{ flex: '1 1 240px', position: 'relative', height: 26, borderRadius: 8, background: 'var(--portal-bg)' }}>
                    <span style={{ position: 'absolute', top: 4, bottom: 4, left: pos(a), width: `calc(${pos(b)} - ${pos(a)})`, minWidth: 6, borderRadius: 6,
                      background: p.ativo ? `color-mix(in srgb, ${s.cor} 70%, transparent)` : `repeating-linear-gradient(45deg, ${CINZA}55 0 6px, transparent 6px 12px)`,
                      ...(p.fim ? {} : { maskImage: 'linear-gradient(90deg, #000 85%, transparent)' }) }} />
                    <span style={{ position: 'absolute', top: -2, bottom: -2, left: pos(h), width: 2, background: '#dc2626' }} />
                  </span>
                </button>
              );
            })}
          </div>
          <span style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: T3 }}>
            <span><span style={{ display: 'inline-block', width: 18, height: 8, borderRadius: 4, background: `${VERDE}b3` }} /> no ar</span>
            <span><span style={{ display: 'inline-block', width: 18, height: 8, borderRadius: 4, background: `${AZUL_CLARO}b3` }} /> vai começar</span>
            <span><span style={{ display: 'inline-block', width: 18, height: 8, borderRadius: 4, background: `repeating-linear-gradient(45deg, ${CINZA}55 0 4px, transparent 4px 8px)` }} /> desligada</span>
            <span>barra que some no fim = sem data para sair</span>
          </span>
        </Secao>
        {atual && (
          <section style={{ ...cartaoNP, display: 'grid', gap: 12 }}>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><Chip s={situacao(atual)} /><span style={{ fontSize: 15 }}>{atual.titulo}</span></span>
            {info(atual)}
            <PreviaPromocao p={previaDe(atual)} titulo="Como ela fica no site" />
            {acoes(atual)}
          </section>
        )}
      </>
    );
  }

  // ---------------------------------------------------------------- visual 3: cartões com computador e celular
  function cartoes() {
    return (
      <div style={grade(420)}>
        {lista.map((p) => {
          const s = situacao(p);
          const pos = noAr.findIndex((x) => x.id === p.id);
          return (
            <section key={p.id} style={{ ...cartaoNP, display: 'grid', gap: 12, alignContent: 'start' }}>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Chip s={s} />
                <span style={{ marginLeft: 'auto', fontSize: 12, color: T3 }}>{pos >= 0 ? `${pos + 1}ª a passar no site` : 'não está passando'}</span>
              </span>
              <span style={{ fontSize: 15.5, fontWeight: 500, lineHeight: 1.35 }}>{p.titulo}</span>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', padding: 12, borderRadius: 12, background: 'var(--portal-bg)' }}>
                <span style={{ flex: 3, minWidth: 0, display: 'grid', gap: 4 }}>
                  <span style={{ fontSize: 11.5, color: T3 }}>{ic('fa-desktop')} computador</span>
                  <Mini p={previaDe(p)} apagada={!s.noAr} />
                </span>
                <span style={{ flex: 1.1, minWidth: 0, maxWidth: 140, display: 'grid', gap: 4 }}>
                  <span style={{ fontSize: 11.5, color: T3 }}>{ic('fa-mobile-screen')} celular</span>
                  <Mini p={previaDe(p)} celular apagada={!s.noAr} />
                </span>
              </div>
              {info(p)}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>{acoes(p, true)}</div>
            </section>
          );
        })}
      </div>
    );
  }

  // ---------------------------------------------------------------- visual de hoje (antes da escolha)
  function atualHoje() {
    return (
      <>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: T3, padding: '0 4px' }}>
          <span>{ic('fa-pen')} Mudar: abre para trocar arte, textos e datas</span>
          <span>{ic('fa-eye-slash')} Tirar do site: sem apagar</span>
          <span>{ic('fa-arrow-left')}{ic('fa-arrow-right')} ordem em que passam no site</span>
          <span>{ic('fa-trash')} Apagar: some de vez</span>
        </div>
        <div style={grade(320)}>
          {lista.map((p, i) => {
            const s = situacao(p);
            const m = maq(p.produto_slug);
            const img = p.imagem || m?.foto || null;
            return (
              <section key={p.id} style={{ ...cartaoNP, display: 'grid', gap: 12, alignContent: 'start', opacity: s.cor === CINZA ? 0.65 : 1 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Chip s={s} />
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: T3 }}>{i + 1}ª no carrossel</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{ flex: 3, aspectRatio: '3', borderRadius: 10, background: p.imagem ? '#111111' : '#fefefe', display: 'grid', placeItems: 'center', overflow: 'hidden', border: '1px solid var(--border)' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {img ? <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} loading="lazy" /> : ic('fa-image')}
                  </span>
                  {p.imagem_celular && (
                    <span style={{ flex: 1, aspectRatio: '1', borderRadius: 10, background: '#111111', overflow: 'hidden', border: '1px solid var(--border)' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.imagem_celular} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} loading="lazy" />
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 15.5, fontWeight: 500, lineHeight: 1.35 }}>{p.titulo}</span>
                {info(p)}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>{acoes(p, true)}</div>
              </section>
            );
          })}
        </div>
      </>
    );
  }

  // ---------------------------------------------------------------- editor
  function editor() {
    if (!r) return null;
    return (
      <div style={{ display: 'grid', gap: 14 }}>
        <section style={{ ...cartaoNP, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" style={bt(CINZA)} onClick={fecharEditor}>{ic('fa-arrow-left')}Voltar para as promoções</button>
          <span style={{ fontSize: 16, fontWeight: 500 }}>{r.id ? `Mudar: ${r.titulo || 'promoção'}` : 'Nova promoção'}</span>
        </section>
        <Secao icone="fa-shapes" titulo="O que vai aparecer no quadro" sub="Escolha um dos dois">
          <div style={grade(260)}>
            {([
              ['foto', 'fa-image', 'Arte da promoção', 'Uma imagem pronta, feita no Canva ou pelo designer.'],
              ['maquina', 'fa-tractor', 'Máquina do site', 'Usa a foto da máquina que já está no site. O botão leva para a página dela.'],
            ] as const).map(([id, icone, t, d]) => (
              <button key={id} type="button" onClick={() => setModo(id)}
                style={{ ...cartaoNP, padding: 14, display: 'flex', gap: 12, alignItems: 'flex-start', textAlign: 'left', cursor: 'pointer', font: 'inherit', color: T1,
                  borderColor: modo === id ? '#dc2626' : 'var(--border)', background: modo === id ? 'color-mix(in srgb, #dc2626 6%, var(--surface))' : 'var(--surface)' }}>
                <Quadradinho icone={icone} cor={modo === id ? '#dc2626' : CINZA} />
                <span style={{ display: 'grid', gap: 2 }}>
                  <span style={{ fontSize: 15, fontWeight: 500 }}>{t}</span>
                  <span style={{ fontSize: 13, color: T3, lineHeight: 1.45 }}>{d}</span>
                </span>
              </button>
            ))}
          </div>
        </Secao>

        {modo === 'foto' ? (
          <Secao icone="fa-ruler-combined" cor="#7c3aed" titulo="Artes e tamanhos" sub="Computador 1920 × 640 px (deitada) · celular 1080 × 1080 px (quadrada)">
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ display: 'grid', gap: 8, flex: '3 1 320px', minWidth: 0 }}>
                <span style={{ fontSize: 13, color: T2 }}>{ic('fa-desktop')}&nbsp; Arte do computador <span style={{ color: T3 }}>(obrigatória)</span></span>
                <span style={{ aspectRatio: '3', borderRadius: 12, background: '#111111', display: 'grid', placeItems: 'center', overflow: 'hidden', border: '1px solid var(--border)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {r.imagem ? <img src={r.imagem} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ color: '#94a3b8', fontSize: 13 }}>1920 × 640</span>}
                </span>
                <SeloTamanho url={r.imagem} ideal={IDEAL_PC} />
                <EnviarFoto pasta="promocoes" rotulo={r.imagem ? 'Trocar a arte do computador' : 'Enviar a arte do computador'} onEnviada={([u]) => setR({ ...r, imagem: u })} />
              </div>
              <div style={{ display: 'grid', gap: 8, flex: '1 1 180px', maxWidth: 260, minWidth: 0 }}>
                <span style={{ fontSize: 13, color: T2 }}>{ic('fa-mobile-screen')}&nbsp; Arte do celular <span style={{ color: T3 }}>(recomendada)</span></span>
                <span style={{ aspectRatio: '1', borderRadius: 12, background: '#111111', display: 'grid', placeItems: 'center', overflow: 'hidden', border: '1px solid var(--border)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {r.imagem_celular ? <img src={r.imagem_celular} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ color: '#94a3b8', fontSize: 13 }}>1080 × 1080</span>}
                </span>
                <SeloTamanho url={r.imagem_celular} ideal={IDEAL_CEL} />
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <EnviarFoto pasta="promocoes" rotulo={r.imagem_celular ? 'Trocar' : 'Enviar a do celular'} onEnviada={([u]) => setR({ ...r, imagem_celular: u })} />
                  {r.imagem_celular && <button type="button" style={bt(CINZA)} onClick={() => setR({ ...r, imagem_celular: null })}>{ic('fa-xmark')}Tirar</button>}
                </span>
              </div>
            </div>
            <Campo rotulo="Máquina ligada a esta promoção (opcional)" ajuda="Com máquina, o botão leva para a página dela. Sem, abre o WhatsApp do vendedor.">
              <select style={campoNP} value={r.produto_slug || ''} onChange={(e) => setR({ ...r, produto_slug: e.target.value || null })}>
                <option value="">Nenhuma: o botão abre o WhatsApp</option>
                {maquinas.map((m) => <option key={m.slug} value={m.slug}>{m.titulo}</option>)}
              </select>
            </Campo>
          </Secao>
        ) : (
          <Secao icone="fa-tractor" cor="#dc2626" titulo="Qual máquina" sub="Toque na máquina">
            <input style={{ ...campoNP, maxWidth: 420 }} placeholder="Buscar máquina pelo nome ou marca" value={buscaMaq} onChange={(e) => setBuscaMaq(e.target.value)} />
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(min(150px, 100%), 1fr))', maxHeight: 380, overflowY: 'auto', padding: 2 }}>
              {achadas.map((m) => (
                <button key={m.slug} type="button" onClick={() => setR({ ...r, produto_slug: m.slug, titulo: r.titulo || m.titulo })}
                  style={{ ...cartaoNP, padding: 8, display: 'grid', gap: 6, cursor: 'pointer', font: 'inherit', color: T1, textAlign: 'left',
                    borderColor: r.produto_slug === m.slug ? '#dc2626' : 'var(--border)', boxShadow: r.produto_slug === m.slug ? '0 0 0 1px #dc2626' : 'none' }}>
                  <span style={{ aspectRatio: '4 / 3', borderRadius: 10, background: '#fefefe', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {m.foto ? <img src={m.foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} loading="lazy" /> : ic('fa-image')}
                  </span>
                  <span style={{ fontSize: 13 }}>{m.titulo}</span>
                </button>
              ))}
            </div>
          </Secao>
        )}

        <Secao icone="fa-pen-to-square" titulo="Textos e botão" sub={faixa(r) && modo === 'foto' ? 'Com as duas artes o texto não aparece no quadro (já está na arte): serve para o Google' : 'Aparecem ao lado da arte, no site'}>
          <div style={grade(260)}>
            <Campo rotulo="Título" ajuda="A frase principal, curta (até 80 letras).">
              <input style={campoNP} maxLength={80} value={r.titulo} placeholder="Ex.: Mahindra 6075 com taxa especial" onChange={(e) => setR({ ...r, titulo: e.target.value })} />
            </Campo>
            <Campo rotulo="Texto do botão (opcional)" ajuda="Vazio: “Quero essa condição” (WhatsApp) ou “Ver condições” (máquina).">
              <input style={campoNP} maxLength={30} value={r.botao || ''} placeholder="Ex.: Quero essa condição" onChange={(e) => setR({ ...r, botao: e.target.value })} />
            </Campo>
          </div>
          <Campo rotulo="Linha de apoio (opcional)" ajuda="Uma ou duas frases embaixo do título.">
            <textarea style={{ ...campoNP, minHeight: 70, resize: 'vertical' }} maxLength={240} value={r.texto || ''} onChange={(e) => setR({ ...r, texto: e.target.value })} />
          </Campo>
          <Campo rotulo="Para onde o botão leva (opcional)" ajuda="Deixe vazio na maioria das vezes. Use só para mandar a outra página, ex.: /credito/.">
            <input style={campoNP} value={r.link || ''} placeholder="Vazio = página da máquina ou WhatsApp" onChange={(e) => setR({ ...r, link: e.target.value })} />
          </Campo>
        </Secao>

        <Secao icone="fa-calendar-days" cor={AZUL_CLARO} titulo="Quando aparece" sub="Sem datas, fica no ar até alguém tirar">
          <div style={grade(200)}>
            <Campo rotulo="Começa em (opcional)" ajuda="Antes deste dia não aparece.">
              <input type="date" style={campoNP} value={r.inicio || ''} onChange={(e) => setR({ ...r, inicio: e.target.value || null })} />
            </Campo>
            <Campo rotulo="Termina em (opcional)" ajuda="Depois deste dia sai sozinha.">
              <input type="date" style={campoNP} value={r.fim || ''} onChange={(e) => setR({ ...r, fim: e.target.value || null })} />
            </Campo>
          </div>
        </Secao>

        <section style={cartaoNP}>
          <PreviaPromocao total={Math.max(1, noAr.length + (r.id ? 0 : 1))} p={previaDe({ ...(r as Promo), imagem: modo === 'foto' ? r.imagem : null, imagem_celular: modo === 'foto' ? r.imagem_celular : null })} />
        </section>

        <section style={{ ...cartaoNP, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {erroForm && <span style={{ flexBasis: '100%', color: '#dc2626', fontSize: 13 }}>{ic('fa-circle-exclamation')} {erroForm}</span>}
          <button style={bt('#dc2626', true)} disabled={salvando} onClick={salvar}>{ic('fa-floppy-disk')}{salvando ? 'Gravando…' : r.id ? 'Gravar mudanças' : 'Criar promoção'}</button>
          <button style={bt(CINZA)} onClick={fecharEditor}>Voltar sem gravar</button>
          <span style={{ fontSize: 12, color: T3, marginLeft: 'auto' }}>Depois de gravar, toque em Publicar site (no alto).</span>
        </section>
      </div>
    );
  }

  // ---------------------------------------------------------------- tela
  const OPCOES: [Visual, string, string][] = [
    ['vitrine', 'A · Vitrine do site', 'O site passando o carrossel, e a fila em ordem'],
    ['tempo', 'B · Linha do tempo', 'Quando cada uma entra e sai do site'],
    ['cartoes', 'C · Computador e celular', 'Cada uma desenhada como no site, nos dois'],
    ['atual', 'Como está hoje', 'A tela atual, para comparar'],
  ];
  return (
    <div style={{ ...tela, color: T1 }}>
      <FontesSite />
      {erro && <Aviso>{erro}</Aviso>}
      {teste && !r && (
        <section style={{ ...cartaoNP, display: 'grid', gap: 10, borderColor: '#7c3aed' }}>
          <span style={{ fontSize: 14, color: T2 }}>{ic('fa-flask')}&nbsp; Página de teste: escolha o jeito de ver as promoções. Os botões funcionam de verdade.</span>
          <div style={grade(200)}>
            {OPCOES.map(([id, t, d]) => (
              <button key={id} type="button" onClick={() => ir({ visual: id }, true)}
                style={{ ...cartaoNP, padding: 12, textAlign: 'left', font: 'inherit', color: T1, cursor: 'pointer', display: 'grid', gap: 2,
                  borderColor: visual === id ? '#7c3aed' : 'var(--border)', background: visual === id ? 'color-mix(in srgb, #7c3aed 7%, var(--surface))' : 'var(--surface)' }}>
                <span style={{ fontSize: 14.5, fontWeight: 500 }}>{t}</span>
                <span style={{ fontSize: 12.5, color: T3 }}>{d}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      <PublicarBarra versao={versao} />
      {r ? editor() : (
        <>
          <section style={{ ...cartaoNP, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <Quadradinho icone="fa-bullhorn" cor="#dc2626" tam={40} />
            <span style={{ flex: '1 1 240px', display: 'grid', gap: 2 }}>
              <span style={{ fontSize: 16, fontWeight: 500 }}>
                {noAr.length ? `${noAr.length} ${noAr.length === 1 ? 'promoção no ar' : 'promoções no ar'} na página inicial` : 'Nenhuma promoção no ar: o bloco não aparece no site'}
              </span>
              <span style={{ fontSize: 13, color: T3 }}>{fora.length ? `${fora.length} fora do site (desligada, vencida ou para depois)` : 'Todas as criadas estão no ar'}</span>
            </span>
            {podeEditar && <button style={bt('#dc2626', true)} onClick={() => abrir()}>{ic('fa-plus')}Nova promoção</button>}
          </section>
          {promos === null ? <p>Carregando…</p> : !lista.length ? <p style={{ color: T3 }}>Nenhuma promoção criada ainda.</p>
            : visual === 'vitrine' ? vitrine() : visual === 'tempo' ? tempo() : visual === 'cartoes' ? cartoes() : atualHoje()}
        </>
      )}
    </div>
  );
}

