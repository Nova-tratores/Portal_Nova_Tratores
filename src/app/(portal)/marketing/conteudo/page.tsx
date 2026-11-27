'use client';
// Conteúdo e publicar → Calendário (José, 12/11/2026): "um calendário de conteúdo, pronto para no mínimo 1 mês
// adiantado" e "publicar do portal para essas redes, escolhendo onde a publicação sai, se é só em uma ou em todas".
// Tudo pelo endereço: ?mes=AAAA-MM · ?post=<id> · ?novo=AAAA-MM-DD · ?da_promocao=<id>.
// Etapa 1: o post fica pronto (artes, texto, dia, redes) e sai "pelo celular em 1 clique" (compartilhar o arquivo para
// o app + texto copiado + "Já postei"). Etapa 2: Instagram e Facebook saem sozinhos pela conta ligada (robô).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchAuth } from '@/lib/auth/client';
import { Aviso, tela } from '@/components/marketing/redes/ui';
import SubAbas from '@/components/marketing/redes/SubAbas';
import { ABAS_CONTEUDO } from '@/components/marketing/redes/abasConteudo';
import { ArtesDasRedes, EscolherRedes, IconeRede, LegendaRedes } from '@/components/marketing/redes/Artes';
import { REDE, STATUS_POST, faltas, type Arte, type Midia, type RedeId, type StatusPost } from '@/lib/marketing/redes/redes';
import { COR_PRIOR, NOME_PRIOR, DATAS_AGRO, datasDoDia, guiaDe, temporadasDoMes, type DataAgro } from '@/lib/marketing/redes/datasAgro';
import { AZUL, Campo, Secao, T1, T2, T3, Voltar, bt, campoNP, cartaoNP, grade, ic } from '@/components/marketing/redes/np';
import { TIPOS_POST, FORMATOS_POST, GANCHOS, linkWhatsDoPost, linkSiteDoPost } from '@/lib/marketing/redes/etiquetas';
import { LogoRede } from '@/components/marketing/redes/LogoRede';
import EditarArte from '@/components/marketing/redes/EditarArte';
import type { Camadas } from '@/lib/marketing/robo/paletas';

// 25/11/2026 (José: "quero que fique tudo o mais dinâmico, moderno, prático, fácil de entender"):
// dia vazio mostra "+ criar post" no mouse, o dia que recebe o post arrastado acende, "hoje" pulsa.
const ESTILO_CAL = `
.cal-dia { transition: background .15s ease, box-shadow .15s ease; }
.cal-dia.cal-pode:hover { background: color-mix(in srgb, #d97706 6%, var(--portal-bg-secondary, #ffffff)) !important; }
.cal-dia .cal-mais { opacity: 0; transition: opacity .15s ease; }
.cal-dia:hover .cal-mais { opacity: 1; }
@media (hover: none) { .cal-dia .cal-mais { opacity: .8; } }
.cal-alvo { background: color-mix(in srgb, #16a34a 12%, var(--portal-bg-secondary, #ffffff)) !important; box-shadow: inset 0 0 0 2px #16a34a !important; }
@keyframes calPulsa { 0%, 100% { box-shadow: 0 0 0 0 rgba(217,119,6,.45); } 50% { box-shadow: 0 0 0 6px rgba(217,119,6,0); } }
.cal-hoje { animation: calPulsa 2s ease-in-out infinite; }
.cal-chip[draggable="true"] { cursor: grab; }
.cal-chip[draggable="true"]:active { cursor: grabbing; }
@media (prefers-reduced-motion: reduce) { .cal-hoje { animation: none; } }
`;
const ehVideo = (u: string) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u);
const NOME_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

type Resultado = Partial<Record<RedeId, { ok: boolean; link?: string | null; em?: string; manual?: boolean; erro?: string | null }>>;
type Post = {
  id: string; titulo: string; legenda: string | null; redes: RedeId[]; formato: string; midia: Midia; quando: string | null
  status: StatusPost; promocao_id: string | null; resultado: Resultado; notas: string | null; criado_por: string | null; atualizado_por: string | null
} & Etq & { codigo?: string | null; contatos?: number };
/** Fase 4 (23/11/2026): etiquetas de seleção rápida (lib/marketing/redes/etiquetas.ts) */
type Etq = { etiqueta_tipo?: string | null; gente_real?: boolean | null; maquina?: string | null; gancho?: string | null;
  /** Fase 3.2: texto por rede (vazio = o texto único), primeiro comentário, hashtags, título do YouTube */
  textos?: Partial<Record<RedeId, string>>; primeiro_comentario?: string | null; hashtags?: string | null; titulo_youtube?: string | null;
  /** Fase 3.5: aprovação de post de preço */
  aprovado_por?: string | null; aprovado_em?: string | null; arte?: Camadas | null };
type Rascunho = { id?: string; titulo: string; legenda: string; redes: RedeId[]; formato: string; midia: Midia; data: string; hora: string; notas: string; promocao_id: string | null; status: StatusPost; resultado: Resultado; chave: string } & Etq & { codigo?: string | null; contatos?: number; arte?: Camadas | null };
type Conta = { rede: RedeId; nome: string | null };

const SOCIAIS: RedeId[] = ['instagram', 'facebook', 'tiktok', 'youtube'];
/** Anotações iniciais de um post criado a partir de uma data do agro: a ideia, as sugestões e o que preparar. */
const notasDe = (t: DataAgro) => {
  const g = guiaDe(t);
  return [`Ideia: ${t.ideia}`, ...(g ? g.ideias.map((i) => `- ${i}`) : []), g?.preparar ? `Preparar: ${g.preparar}` : ''].filter(Boolean).join(String.fromCharCode(10)).slice(0, 1000);
};
const FUSO = 'America/Sao_Paulo';
const diaDe = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: FUSO });
const horaDe = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' });
const hoje = () => new Date().toLocaleDateString('en-CA', { timeZone: FUSO });
const somaDias = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const nomeDia = (d: string, op: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC', ...op });
const nomeMes = (m: string) => nomeDia(`${m}-01`, { month: 'long', year: 'numeric' });

function useLargo(min: number) {
  const [l, setL] = useState(true);
  useEffect(() => {
    const q = window.matchMedia(`(min-width: ${min}px)`);
    const f = () => setL(q.matches);
    f(); q.addEventListener('change', f);
    return () => q.removeEventListener('change', f);
  }, [min]);
  return l;
}

/** Situação calculada: sem data = ideia; com data e arte para tudo = pronto; o que já saiu manda. */
/** Fase 3.2: o texto que vai para a rede — o ajustado dela, senão o texto único — com as hashtags no fim. */
function textoDaRede(r: Pick<Rascunho, 'legenda' | 'textos' | 'hashtags'>, rede: RedeId): string {
  const base = (r.textos?.[rede] || r.legenda || '').trim();
  return r.hashtags ? base + String.fromCharCode(10, 10) + r.hashtags : base;
}

function statusDe(r: Pick<Rascunho, 'data' | 'redes' | 'midia' | 'resultado'>): StatusPost {
  const saiu = r.redes.filter((x) => r.resultado[x]?.ok).length;
  if (saiu && saiu === r.redes.length) return 'publicado';
  if (saiu) return 'parcial';
  if (!r.data || !r.redes.length || faltas(r.redes, r.midia).length) return 'ideia';
  return 'pronto';
}

export default function CalendarioRedes() {
  const largo = useLargo(760);
  const duasColunas = useLargo(1100);   // 27/11/2026: editor do post em 2 colunas (artes | texto e postar)
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [ideias, setIdeias] = useState<Post[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [podeEditar, setPodeEditar] = useState(false);
  const [erro, setErro] = useState('');
  const [r, setR] = useState<Rascunho | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState('');
  const [copiado, setCopiado] = useState('');

  // ---- endereço
  const [rota, setRota] = useState<{ mes: string; post: string | null; novo: string | null; promo: string | null; ano: boolean }>({ mes: hoje().slice(0, 7), post: null, novo: null, promo: null, ano: false });
  const abriuAqui = useRef(false);
  useEffect(() => {
    const ler = () => {
      const q = new URLSearchParams(window.location.search);
      const mes = q.get('mes');
      setRota({ mes: mes && /^\d{4}-\d{2}$/.test(mes) ? mes : hoje().slice(0, 7), post: q.get('post'), novo: q.get('novo'), promo: q.get('da_promocao'), ano: q.get('ver') === 'ano' });
    };
    ler();
    const voltou = () => { abriuAqui.current = false; ler(); };
    window.addEventListener('popstate', voltou);
    return () => window.removeEventListener('popstate', voltou);
  }, []);
  const ir = useCallback((novo: Partial<typeof rota>, trocar = false) => {
    setRota((a) => {
      const u = { ...a, ...novo };
      const q = new URLSearchParams();
      if (u.ano) q.set('ver', 'ano');
      if (u.mes !== hoje().slice(0, 7)) q.set('mes', u.mes);
      if (u.post) q.set('post', u.post); else if (u.novo) q.set('novo', u.novo); else if (u.promo) q.set('da_promocao', u.promo);
      const destino = `${window.location.pathname}${q.toString() ? `?${q}` : ''}`;
      if (destino !== `${window.location.pathname}${window.location.search}`) window.history[trocar ? 'replaceState' : 'pushState'](null, '', destino);
      return u;
    });
  }, []);
  // 19/11/2026 (José): a tela abre na SEMANA; o mês inteiro abre num modal, se a pessoa quiser.
  const segundaDe = (d: string) => somaDias(d, -((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7));
  const [semana, setSemana] = useState(() => segundaDe(hoje()));
  const [mesAberto, setMesAberto] = useState(false);
  const [podeAprovar, setPodeAprovar] = useState(false);   // Fase 3.5
  const [ajustar, setAjustar] = useState<RedeId | null>(null);   // Fase 3.2: rede com texto próprio aberta
  const [whats, setWhats] = useState<string | null>(null);   // WhatsApp da empresa (link do post)
  const [siteUrl, setSiteUrl] = useState('');
  const [linkPara, setLinkPara] = useState<RedeId | null>(null);   // 'Já postei' pedindo o link do post
  const [linkPost, setLinkPost] = useState('');
  // o mês da tela acompanha a semana (pela quinta-feira, que decide de que mês a semana "é") —
  // é ele que define o que o carregar() busca e as temporadas mostradas
  const irSemana = (seg: string) => { setSemana(seg); ir({ mes: somaDias(seg, 3).slice(0, 7) }, true); };
  const fecharMes = () => { setMesAberto(false); ir({ mes: somaDias(semana, 3).slice(0, 7) }, true); };
  const abrirPost = (p: Post) => { setMesAberto(false); abriuAqui.current = true; ir({ post: p.id, novo: null, promo: null }); window.scrollTo({ top: 0 }); };
  const tema = useRef<DataAgro | null>(null);
  const novoPost = (dia: string, t: DataAgro | null = null) => { setMesAberto(false); tema.current = t; abriuAqui.current = true; ir({ post: null, novo: dia || 'sem-data', promo: null }); window.scrollTo({ top: 0 }); };
  const fechar = () => { if (abriuAqui.current) { abriuAqui.current = false; window.history.back(); } else ir({ post: null, novo: null, promo: null }, true); };

  // ---- dados: o mês da tela + os próximos 31 dias (para a conta do "1 mês adiantado")
  const inicioGrade = useMemo(() => { const p = `${rota.mes}-01`; const dow = (new Date(`${p}T12:00:00Z`).getUTCDay() + 6) % 7; return somaDias(p, -dow); }, [rota.mes]);
  const carregar = useCallback(async () => {
    const de = [inicioGrade, hoje()].sort()[0];
    const ate = [somaDias(inicioGrade, 41), somaDias(hoje(), rota.ano ? 400 : 62)].sort()[1];
    const res = await fetchAuth(`/api/marketing/posts?de=${de}&ate=${ate}`);
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.ok) { setErro(j.erro || 'Não consegui carregar o calendário.'); setPosts([]); return; }
    setErro(''); setPosts(j.posts); setIdeias(j.ideias); setContas(j.contas || []); setPodeEditar(!!j.podeEditar);
    setWhats(j.whatsapp || null); setSiteUrl(j.siteUrl || ''); setPodeAprovar(!!j.podeAprovar);
  }, [inicioGrade, rota.ano]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar(); }, [carregar]);

  // Melhor dia da semana para postar: média de pessoas alcançadas por dia da semana (todas as redes, robô da Meta).
  // Quem não tem acesso à aba Acessos simplesmente não vê esse cartão.
  const [melhorDia, setMelhorDia] = useState<{ nome: string; media: number } | null>(null);
  useEffect(() => {
    fetchAuth('/api/marketing/redes?rede=todas').then(async (res) => {
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) return;
      const porDia = new Map<string, number>();
      for (const m of (j.metricas || []) as { dia: string; alcance: number | null }[]) porDia.set(m.dia, (porDia.get(m.dia) || 0) + (Number(m.alcance) || 0));
      const s = Array.from({ length: 7 }, () => ({ soma: 0, n: 0 }));
      for (const [d, v] of porDia) { const w = new Date(`${d}T12:00:00Z`).getUTCDay(); s[w].soma += v; s[w].n++; }
      const medias = s.map((x, w) => ({ w, media: x.n ? x.soma / x.n : 0 }));
      const top = medias.reduce((a, b) => (b.media > a.media ? b : a), medias[0]);
      if (top.media > 0) setMelhorDia({ nome: NOME_SEMANA[top.w], media: Math.round(top.media) });
    }).catch(() => {});
  }, []);

  // Arrastar um post para outro dia (mantém a hora). Post que já saiu não se arrasta.
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  async function mover(id: string, dia: string) {
    const p = (posts || []).find((x) => x.id === id);
    if (!p?.quando || diaDe(p.quando) === dia || dia < hoje()) return;
    const quando = `${dia}T${horaDe(p.quando)}:00-03:00`;
    setPosts((l) => (l || []).map((x) => (x.id === id ? { ...x, quando: new Date(quando).toISOString() } : x)));   // já mostra no dia novo
    const res = await fetchAuth('/api/marketing/posts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, quando }) });
    const j = await res.json().catch(() => ({}));
    await carregar();   // volta o post para onde ele está de verdade (o carregar limpa o aviso; por isso o aviso vem depois)
    if (!res.ok || !j.ok) setErro(`Não consegui mudar o dia de "${p.titulo}": ${j.erro || 'erro ao gravar'}. Abra o post e mude a data por lá.`);
  }

  // ---- editor segue o endereço
  const chave = rota.post || (rota.novo ? `novo:${rota.novo}` : rota.promo ? `promo:${rota.promo}` : null);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!chave) { setR(null); return; }
    if (r?.chave === chave) return;
    setErroForm('');
    if (rota.post) {
      if (!posts) return;
      const p = [...posts, ...ideias].find((x) => x.id === rota.post);
      if (!p) {
        // post fora do mês carregado: busca direto
        fetchAuth(`/api/marketing/posts?de=2000-01-01&ate=2100-01-01`).then((x) => x.json()).then((j) => {
          const q = (j.posts || []).find((x: Post) => x.id === rota.post);
          if (q) setR(rascunhoDe(q, chave)); else ir({ post: null }, true);
        });
        return;
      }
      setR(rascunhoDe(p, chave));
    } else if (rota.promo) {
      fetchAuth('/api/marketing/promocoes').then((x) => x.json()).then((j) => {
        const p = (j.promocoes || []).find((x: { id: string }) => x.id === rota.promo);
        if (!p) { ir({ promo: null }, true); return; }
        setR({ chave, titulo: p.titulo, legenda: p.legenda || [p.titulo, p.texto].filter(Boolean).join('\n'), redes: (p.redes || []).filter((x: RedeId) => x !== 'site'),
          formato: p.video ? 'reels' : 'feed', midia: { feed: p.arte_feed, vertical: p.arte_vertical, video: p.video }, data: somaDias(hoje(), 1), hora: '09:00', notas: '',
          promocao_id: p.id, status: 'ideia', resultado: {} });
      });
    } else {
      // veio de uma data do agro: já entra com o tema, a ideia e o formato sugeridos
      const t = tema.current; tema.current = null;
      setR({ chave, titulo: t ? t.nome : '', legenda: '', redes: [...SOCIAIS], formato: t?.formato || 'feed', midia: {}, data: rota.novo === 'sem-data' ? '' : rota.novo || '', hora: '09:00',
        notas: t ? notasDe(t) : '', promocao_id: null, status: 'ideia', resultado: {} });
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, posts, ideias]);

  function rascunhoDe(p: Post, k: string): Rascunho {
    return { id: p.id, chave: k, titulo: p.titulo, legenda: p.legenda || '', redes: p.redes || [], formato: p.formato, midia: p.midia || {}, data: p.quando ? diaDe(p.quando) : '',
      hora: p.quando ? horaDe(p.quando) : '09:00', notas: p.notas || '', promocao_id: p.promocao_id, status: p.status, resultado: p.resultado || {},
      etiqueta_tipo: p.etiqueta_tipo ?? null, gente_real: p.gente_real ?? null, maquina: p.maquina ?? null, gancho: p.gancho ?? null, codigo: p.codigo ?? null, contatos: p.contatos,
      textos: p.textos || {}, primeiro_comentario: p.primeiro_comentario ?? null, hashtags: p.hashtags ?? null, titulo_youtube: p.titulo_youtube ?? null,
      aprovado_por: p.aprovado_por ?? null, aprovado_em: p.aprovado_em ?? null, arte: p.arte ?? null };
  }

  async function chamar(metodo: string, corpo?: unknown, q = '') {
    setSalvando(true); setErroForm('');
    const res = await fetchAuth(`/api/marketing/posts${q}`, { method: metodo, headers: corpo ? { 'Content-Type': 'application/json' } : undefined, body: corpo ? JSON.stringify(corpo) : undefined });
    const j = await res.json().catch(() => ({}));
    setSalvando(false);
    if (!res.ok || !j.ok) { setErroForm(j.erro || 'Não consegui gravar.'); return null; }
    return j;
  }
  function corpoDe(x: Rascunho) {
    return { id: x.id, titulo: x.titulo, legenda: x.legenda, redes: x.redes, formato: x.formato, midia: x.midia, notas: x.notas, promocao_id: x.promocao_id,
      quando: x.data ? `${x.data}T${x.hora || '09:00'}:00-03:00` : null, status: statusDe(x), resultado: x.resultado,
      etiqueta_tipo: x.etiqueta_tipo ?? null, gente_real: x.gente_real ?? null, maquina: x.maquina ?? null, gancho: x.gancho ?? null,
      textos: x.textos || {}, primeiro_comentario: x.primeiro_comentario ?? null, hashtags: x.hashtags ?? null, titulo_youtube: x.titulo_youtube ?? null };
  }
  async function salvar(fecharDepois = true) {
    if (!r) return null;
    if (!r.titulo.trim()) { setErroForm('Escreva do que é o post.'); return null; }
    const j = await chamar(r.id ? 'PATCH' : 'POST', corpoDe(r));
    if (!j) return null;
    carregar();
    if (fecharDepois) fechar();
    else { setR({ ...r, id: j.post.id }); }
    return j.post as Post;
  }
  async function apagar() {
    if (!r?.id || !confirm('Apagar este post do calendário? (O que já saiu nas redes continua lá.)')) return;
    if (await chamar('DELETE', undefined, `?id=${r.id}`)) { carregar(); fechar(); }
  }
  /** Fase 3.5: aprovar (ou desfazer) post de preço/condição. */
  async function aprovar(sim: boolean) {
    if (!r?.id) return;
    const j = await chamar('PATCH', { id: r.id, aprovar: sim });
    if (j?.post) { setR({ ...r, aprovado_por: j.post.aprovado_por ?? null, aprovado_em: j.post.aprovado_em ?? null }); carregar(); }
  }

  async function marcar(rede: RedeId, ok: boolean, link?: string) {
    if (!r) return;
    const resultado = { ...r.resultado };
    // Fase 3.1: guarda o link do post (com ele dá para puxar as métricas quando a Meta for ligada)
    if (ok) resultado[rede] = { ok: true, manual: true, em: new Date().toISOString(), link: (link || '').startsWith('https://') ? link : null }; else delete resultado[rede];
    setLinkPara(null); setLinkPost('');
    const novo = { ...r, resultado };
    setR(novo);
    if (novo.id) { await chamar('PATCH', corpoDe(novo)); carregar(); }
  }

  /** Abre o "compartilhar" do celular com o arquivo do post (o app do TikTok/YouTube/Insta aparece na lista). */
  async function compartilhar(rede: RedeId) {
    if (!r) return;
    const url = REDE[rede].artes.map((a) => r.midia[a]).find(Boolean);
    if (!url) return;
    const texto = textoDaRede(r, rede);   // Fase 3.2: o texto daquela rede + hashtags
    try { await navigator.clipboard.writeText(texto); setCopiado(rede); } catch { /* sem permissão de copiar */ }
    try {
      const blob = await (await fetch(url)).blob();
      const nome = `nova-tratores-${rede}.${blob.type.includes('mp4') ? 'mp4' : blob.type.includes('quicktime') ? 'mov' : blob.type.includes('png') ? 'png' : 'jpg'}`;
      const arq = new File([blob], nome, { type: blob.type });
      if (navigator.canShare?.({ files: [arq] })) { await navigator.share({ files: [arq], text: texto }); return; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; a.click();
    } catch { /* cancelou */ }
  }

  // ---- contas e números
  const todos = useMemo(() => [...(posts || [])], [posts]);
  const porDia = useMemo(() => {
    const m = new Map<string, Post[]>();
    for (const p of todos) if (p.quando) { const d = diaDe(p.quando); m.set(d, [...(m.get(d) || []), p]); }
    return m;
  }, [todos]);
  const prox30 = useMemo(() => Array.from({ length: 30 }, (_, i) => somaDias(hoje(), i)), []);
  const vazios = prox30.filter((d) => !porDia.get(d)?.length);

  // datas do agro importantes (obrigatória e boa) dos próximos 60 dias (as sem post viram o cartão "Próxima data do agro")
  const proximasAgro = DATAS_AGRO.filter((x) => x.prior >= 2 && (x.ate || x.d) >= hoje() && x.d <= somaDias(hoje(), 60));

  // ---------------------------------------------------------------- peças
  /** Ideias da data (arquivo do José, seção 8): o que fazer, o que as marcas fizeram e o que preparar antes. */
  const guia = (x: DataAgro) => {
    const g = guiaDe(x);
    if (!g) return null;
    const lista = (titulo: string, itens: string[], icone: string) => itens.length > 0 && (
      <div style={{ display: 'grid', gap: 3 }}>
        <span style={{ fontSize: 12.5, color: T3 }}>{titulo}</span>
        {itens.map((t, i) => <span key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: T1, lineHeight: 1.4 }}><span style={{ color: T3, flexShrink: 0 }}>{ic(icone)}</span>{t}</span>)}
      </div>
    );
    return (
      <div style={{ display: 'grid', gap: 8, paddingTop: 4 }}>
        {lista('Ideias para a Nova Tratores', g.ideias, 'fa-lightbulb')}
        {lista('O que as marcas fizeram', g.fizeram, 'fa-eye')}
        {g.preparar && <span style={{ fontSize: 13, color: '#b45309' }}>{ic('fa-clipboard-list')} Preparar: {g.preparar}</span>}
      </div>
    );
  };
  const chipAgro = (x: DataAgro, d: string, compacto: boolean) => {
    const cor = COR_PRIOR[x.prior];
    const pode = podeEditar && d >= hoje();
    return (
      <button key={x.nome} type="button" disabled={!pode} title={`${x.nome} (${NOME_PRIOR[x.prior]}): ${x.ideia}`}
        onClick={(e) => { e.stopPropagation(); if (pode) novoPost(d, x); }}
        style={{ display: 'flex', gap: 6, alignItems: 'flex-start', width: '100%', textAlign: 'left', font: 'inherit', cursor: pode ? 'pointer' : 'default', minWidth: 0,
          padding: compacto ? '4px 7px' : '6px 10px', border: `1px solid color-mix(in srgb, ${cor} ${x.prior === 1 ? 20 : 30}%, transparent)`, borderRadius: 8,
          background: `color-mix(in srgb, ${cor} ${x.prior === 1 ? 5 : 9}%, var(--surface))`, color: x.prior === 1 ? T2 : cor, fontSize: compacto ? 12.5 : 13, lineHeight: 1.3 }}>
        <span style={{ flexShrink: 0 }}>{ic('fa-wheat-awn')}</span>
        <span style={{ minWidth: 0, color: x.prior === 1 ? T2 : T1 }}>{x.nome}{x.confirmar ? ' (confirmar)' : ''}</span>
        {!compacto && pode && <span style={{ marginLeft: 'auto', fontSize: 12, whiteSpace: 'nowrap' }}>{ic('fa-plus')} criar post</span>}
      </button>
    );
  };
  // 25/11/2026: o post mostra a miniatura da arte e as logos das redes; dá para arrastar para outro dia
  const chipPost = (p: Post, compacto: boolean) => {
    const s = STATUS_POST[p.status] || STATUS_POST.ideia;
    const falta = faltas(p.redes, p.midia).length > 0;
    const arte = [p.midia?.feed, p.midia?.vertical, p.midia?.site, p.midia?.video].find(Boolean) || null;
    const arrasta = podeEditar && !!p.quando && !['publicado', 'parcial'].includes(p.status);
    const lado = 44;
    const miniatura = (estilo: React.CSSProperties) => (
      <span style={{ overflow: 'hidden', display: 'grid', placeItems: 'center', background: `color-mix(in srgb, ${s.cor} 14%, transparent)`, color: s.cor, ...estilo }}>
        {arte && !ehVideo(arte)
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={arte} alt="" loading="lazy" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', display: 'block' }} />
          : <span style={{ display: 'grid', gap: 4, placeItems: 'center', fontSize: 12 }}>{ic(arte ? 'fa-film' : 'fa-image')}{!compacto && !arte && 'sem arte'}</span>}
      </span>
    );
    // etiqueta da situação: o que falta manda (falta arte), senão a situação do post
    const etiqueta = falta && !['publicado', 'parcial'].includes(p.status)
      ? { cor: '#b45309', icone: 'fa-triangle-exclamation', nome: 'Falta arte' }
      : { cor: s.cor, icone: s.icone, nome: s.nome };
    const pilula = (
      <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', fontSize: 11.5, fontWeight: 500, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap',
        color: etiqueta.cor, background: `color-mix(in srgb, ${etiqueta.cor} 12%, transparent)` }}>{ic(etiqueta.icone)}{etiqueta.nome}</span>
    );
    const comum = {
      type: 'button' as const, className: 'cal-chip np-sobe', draggable: arrasta,
      onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData('text/plain', p.id); e.dataTransfer.effectAllowed = 'move'; setArrastando(p.id); },
      onDragEnd: () => { setArrastando(null); setAlvo(null); },
      onClick: (e: React.MouseEvent) => { e.stopPropagation(); abrirPost(p); },
      title: `${p.titulo} · ${etiqueta.nome}${arrasta ? ' · arraste para mudar o dia' : ''}`,
    };
    const base: React.CSSProperties = { width: '100%', textAlign: 'left', font: 'inherit', cursor: 'pointer', minWidth: 0, color: T1, opacity: arrastando === p.id ? 0.4 : 1,
      border: `1px solid color-mix(in srgb, ${etiqueta.cor} 30%, var(--border))`, background: 'var(--surface)', boxShadow: '0 1px 3px rgba(15, 23, 42, .06)' };
    // mês (compacto): uma linha com a miniatura ao lado
    if (compacto) return (
      <button key={p.id} {...comum} style={{ ...base, display: 'grid', gridTemplateColumns: `${lado}px minmax(0, 1fr)`, gap: 8, alignItems: 'center', padding: 4, paddingRight: 8, borderRadius: 10, borderLeft: `3px solid ${etiqueta.cor}` }}>
        {miniatura({ width: lado, height: lado, borderRadius: 7 })}
        <span style={{ display: 'grid', gap: 3, minWidth: 0 }}>
          <span style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 11.5, color: etiqueta.cor, minWidth: 0 }}>
            {ic(etiqueta.icone)}<span style={{ color: T2 }}>{p.quando ? horaDe(p.quando) : 'sem data'}</span>
            <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 2 }}>{p.redes.map((id) => <LogoRede key={id} id={id} tam={14} />)}</span>
          </span>
          <span style={{ fontSize: 12.5, lineHeight: 1.25, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.titulo}</span>
        </span>
      </button>
    );
    // semana: cartão em pé, arte grande em cima
    return (
      <button key={p.id} {...comum} style={{ ...base, display: 'grid', gap: 0, padding: 0, borderRadius: 12, overflow: 'hidden' }}>
        {miniatura({ width: '100%', height: 130 })}
        <span style={{ display: 'grid', gap: 6, padding: '8px 10px 10px', minWidth: 0 }}>
          <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {pilula}
            <span style={{ fontSize: 12.5, color: T2, marginLeft: 'auto' }}>{ic('fa-clock')} {p.quando ? horaDe(p.quando) : 'sem data'}</span>
          </span>
          <span style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.titulo}</span>
          <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>{p.redes.map((id) => <LogoRede key={id} id={id} tam={18} />)}</span>
        </span>
      </button>
    );
  };

  /** Sem argumento: o mês da tela. Com a segunda-feira: só aquela semana, com os dias mais altos. */
  function grade7(seg?: string) {
    const dias = seg
      ? Array.from({ length: 7 }, (_, i) => somaDias(seg, i))
      : Array.from({ length: 42 }, (_, i) => somaDias(inicioGrade, i));
    const h = hoje();
    // só o mês da tela: dias de outro mês viram espaço vazio e a última semana sem dia do mês sai
    const ultimo = dias.map((d) => d.startsWith(rota.mes)).lastIndexOf(true);
    const visiveis = seg ? dias : dias.slice(0, Math.ceil((ultimo + 1) / 7) * 7);
    // grade de calendário de parede: linhas finas entre os dias (o fundo do quadro aparece no vão de 1px)
    const LINHA = 'color-mix(in srgb, var(--portal-text, #0f172a) 16%, transparent)';
    const FUNDO = 'var(--portal-bg-secondary, #ffffff)';
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 1, background: LINHA, border: `1px solid ${LINHA}`, borderRadius: 14, overflow: 'hidden' }}>
        {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => <span key={d} style={{ fontSize: 13, color: T2, padding: '8px 10px', background: 'color-mix(in srgb, var(--portal-text, #0f172a) 5%, var(--portal-bg, #f8fafc))' }}>{d}</span>)}
        {visiveis.map((d) => {
          if (!seg && !d.startsWith(rota.mes)) return <div key={d} style={{ background: 'color-mix(in srgb, var(--portal-text, #0f172a) 3%, var(--portal-bg, #f8fafc))' }} />;
          const lista = porDia.get(d) || [];
          const passado = d < h;
          const vazioFuturo = !lista.length && !passado && d <= prox30[29];
          const fimDeSemana = [5, 6].includes(visiveis.indexOf(d) % 7);
          const pode = podeEditar && !passado;
          return (
            <div key={d} onClick={() => pode && novoPost(d)}
              className={`cal-dia${pode ? ' cal-pode' : ''}${alvo === d ? ' cal-alvo' : ''}`}
              onDragOver={(e) => { if (!pode || !arrastando) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (alvo !== d) setAlvo(d); }}
              onDragLeave={() => { if (alvo === d) setAlvo(null); }}
              onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); setAlvo(null); setArrastando(null); if (pode && id) mover(id, d); }}
              style={{ minHeight: seg ? 260 : 118, padding: '8px 10px', display: 'grid', alignContent: 'start', gap: 6, cursor: pode ? 'pointer' : 'default', minWidth: 0,
                boxShadow: d === h ? 'inset 0 0 0 2px #d97706' : 'none',
                background: passado ? 'color-mix(in srgb, var(--portal-text, #0f172a) 3%, var(--portal-bg, #f8fafc))' : fimDeSemana ? 'color-mix(in srgb, var(--portal-text, #0f172a) 1.5%, ' + FUNDO + ')' : FUNDO }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {d === h
                  ? <span className="cal-hoje" style={{ minWidth: 28, height: 28, padding: '0 6px', borderRadius: 999, display: 'grid', placeItems: 'center', background: '#d97706', color: '#fefefe', fontSize: 14, fontWeight: 500 }}>{Number(d.slice(8))}</span>
                  : <span style={{ fontSize: 15, fontWeight: 500, color: passado ? T3 : T1 }}>{Number(d.slice(8))}{seg && d.slice(8) === '01' ? ` ${nomeDia(d, { month: 'short' })}` : ''}</span>}
                {d === h && <span style={{ fontSize: 12.5, color: '#d97706', fontWeight: 500 }}>hoje</span>}
                {vazioFuturo && <span style={{ marginLeft: 'auto', width: 7, height: 7, borderRadius: 99, background: 'color-mix(in srgb, #d97706 55%, transparent)' }} title="Dia sem post" />}
              </span>
              <div style={{ display: 'grid', gap: 6, opacity: passado ? 0.75 : 1 }}>
                {datasDoDia(d).map((x) => chipAgro(x, d, true))}
                {lista.map((p) => chipPost(p, true))}
              </div>
              {pode && (
                <span className="cal-mais" style={{ fontSize: 12.5, color: '#d97706', display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center', padding: '6px 0', borderRadius: 8, border: '1px dashed color-mix(in srgb, #d97706 50%, transparent)' }}>
                  {ic('fa-plus')}criar post
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  /** Os próximos 12 meses lado a lado: dia com post fica verde, data do agro ganha anel colorido. Tocar no mês abre ele. */
  function anoTodo() {
    const h = hoje();
    const meses = Array.from({ length: 12 }, (_, i) => { const x = new Date(`${h.slice(0, 7)}-15T12:00:00Z`); x.setUTCMonth(x.getUTCMonth() + i); return x.toISOString().slice(0, 7); });
    return (
      <div style={grade(260)}>
        {meses.map((m) => {
          const ini = `${m}-01`;
          const dow = (new Date(`${ini}T12:00:00Z`).getUTCDay() + 6) % 7;
          const dias = Array.from({ length: 31 }, (_, i) => somaDias(ini, i)).filter((d) => d.startsWith(m));
          const nPosts = dias.reduce((s, d) => s + (porDia.get(d)?.length || 0), 0);
          const datas = DATAS_AGRO.filter((x) => x.prior >= 2 && x.d.startsWith(m));
          const temp = temporadasDoMes(m);
          return (
            <section key={m} onClick={() => { ir({ mes: m, ano: false }); setMesAberto(true); }} style={{ ...cartaoNP, display: 'grid', gap: 10, alignContent: 'start', cursor: 'pointer' }}>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 16, textTransform: 'capitalize', color: m === h.slice(0, 7) ? '#d97706' : T1 }}>{nomeMes(m)}</span>
                <span style={{ marginLeft: 'auto', fontSize: 12.5, color: nPosts ? '#16a34a' : T3 }}>{nPosts ? `${nPosts} post${nPosts > 1 ? 's' : ''}` : 'sem posts'}</span>
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
                {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((x, i) => <span key={i} style={{ fontSize: 10.5, color: T3, textAlign: 'center' }}>{x}</span>)}
                {Array.from({ length: dow }, (_, i) => <span key={`v${i}`} />)}
                {dias.map((d) => {
                  const tem = !!porDia.get(d)?.length;
                  const ag = datasDoDia(d).filter((x) => x.prior >= 2).sort((a, b) => b.prior - a.prior)[0];
                  return (
                    <span key={d} title={[ag?.nome, tem ? 'tem post' : ''].filter(Boolean).join(' · ') || undefined}
                      style={{ fontSize: 11.5, textAlign: 'center', lineHeight: '22px', borderRadius: 999,
                        background: tem ? '#16a34a' : 'transparent', color: tem ? '#fefefe' : d < h ? T3 : T1,
                        boxShadow: ag ? `inset 0 0 0 2px ${COR_PRIOR[ag.prior]}` : d === h ? 'inset 0 0 0 1px #d97706' : 'none' }}>
                      {Number(d.slice(8))}
                    </span>
                  );
                })}
              </div>
              {(datas.length > 0 || temp.length > 0) && (
                <div style={{ display: 'grid', gap: 4, fontSize: 12.5 }}>
                  {datas.map((x) => (
                    <span key={x.d + x.nome} style={{ display: 'flex', gap: 6, color: T2 }}>
                      <span style={{ color: COR_PRIOR[x.prior], minWidth: 22 }}>{x.d.slice(8)}</span>
                      <span>{x.nome}{porDia.get(x.d)?.length ? <span style={{ color: '#16a34a' }}> {ic('fa-check')}</span> : ''}</span>
                    </span>
                  ))}
                  {temp.map((t) => <span key={t.nome} style={{ color: COR_PRIOR[t.prior] }}>{ic('fa-seedling')} {t.nome}</span>)}
                </div>
              )}
            </section>
          );
        })}
      </div>
    );
  }

  function agenda() {
    const dias = Array.from({ length: 31 }, (_, i) => somaDias(`${rota.mes}-01`, i)).filter((d) => d.startsWith(rota.mes));
    const h = hoje();
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        {dias.map((d) => {
          const lista = porDia.get(d) || [];
          const vazioFuturo = !lista.length && d >= h && d <= prox30[29];
          const agro = datasDoDia(d);
          if (!lista.length && !vazioFuturo && !agro.length) return null;
          return (
            <div key={d} style={{ display: 'grid', gridTemplateColumns: '54px 1fr', gap: 10, alignItems: 'start' }}>
              <span style={{ display: 'grid', justifyItems: 'center', padding: '6px 0', borderRadius: 10, background: d === h ? '#d97706' : 'var(--surface)', color: d === h ? '#fefefe' : T1, border: '1px solid var(--border)' }}>
                <span style={{ fontSize: 18 }}>{Number(d.slice(8))}</span>
                <span style={{ fontSize: 11, opacity: 0.8 }}>{nomeDia(d, { weekday: 'short' }).replace('.', '')}</span>
              </span>
              <span style={{ display: 'grid', gap: 6 }}>
                {agro.map((x) => chipAgro(x, d, false))}
                {lista.map((p) => chipPost(p, false))}
                {vazioFuturo && !agro.length && (
                  <button type="button" disabled={!podeEditar} onClick={() => novoPost(d)}
                    style={{ ...bt('#d97706'), borderStyle: 'dashed', justifyContent: 'flex-start' }}>{ic('fa-plus')}Dia sem post: criar</button>
                )}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  function editor() {
    if (!r) return null;
    const s = STATUS_POST[statusDe(r)];
    const f = faltas(r.redes, r.midia);
    const conta = (id: RedeId) => contas.find((c) => c.rede === id);
    return (
      <div style={{ display: 'grid', gap: 14 }}>
        <Voltar para="Calendário" atual={r.id ? r.titulo || 'Post' : 'Novo post'} onClick={fechar}
          direita={<span style={{ fontSize: 12.5, padding: '4px 10px', borderRadius: 999, color: s.cor, background: `color-mix(in srgb, ${s.cor} 11%, transparent)` }}>{ic(s.icone)} {s.nome}</span>} />

        {/* 27/11/2026 (José: "deixa as legendas do lado direito"): esquerda = arte; direita = texto, dia e postar */}
        <div style={{ display: 'grid', gap: 14, alignItems: 'start', gridTemplateColumns: duasColunas ? 'minmax(0, 1.15fr) minmax(0, 1fr)' : 'minmax(0, 1fr)' }}>
        <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
        <Secao icone="fa-share-nodes" cor="#c13584" titulo="Onde vai sair" sub="Toque para ligar ou desligar cada rede. Pode ser uma só ou todas">
          <EscolherRedes so={SOCIAIS} valor={r.redes} onChange={(v) => setR({ ...r, redes: v })} />
        </Secao>

        {/* 26/11/2026: post do robô vem em camadas (cena + texto + cor) e dá para editar aqui */}
        {r.id && r.arte?.cena && (
          <Secao icone="fa-layer-group" cor="#d0102b" titulo="Editar arte" sub="Mude o texto, as cores ou a posição. A prévia aparece em 1 segundo, sem custo">
            <EditarArte key={r.id} postId={r.id} arte={r.arte} atual={r.midia.feed || undefined} podeEditar={podeEditar}
              onSalvo={(pecas, arte) => { setR((x) => (x ? { ...x, midia: { ...x.midia, feed: pecas.feed, vertical: pecas.vertical, ...(pecas.video ? { video: pecas.video } : {}) }, arte } : x)); carregar(); }} />
          </Secao>
        )}

        <Secao icone="fa-images" cor="#7c3aed" titulo="Artes" sub="Cada rede usa um tamanho. Os ícones mostram quem usa cada arte">
          <ArtesDasRedes semSite redes={r.redes} midia={r.midia} pasta="posts" onTroca={(a: Arte, u) => setR({ ...r, midia: { ...r.midia, [a]: u } })} />
        </Secao>

        {/* Fase 4 (23/11/2026): etiquetas de seleção rápida — obrigatórias para o post sair; é com elas que
            depois dá para ver "que tipo de post traz contato" */}
        <Secao icone="fa-tags" cor="#0891b2" titulo="Etiquetas" sub="Obrigatórias para o post sair. Servem para descobrir que tipo de post traz cliente">
          {([
            ['Tipo do post', TIPOS_POST, r.etiqueta_tipo, (v: string) => setR({ ...r, etiqueta_tipo: v })],
            ['Formato', FORMATOS_POST, r.formato, (v: string) => setR({ ...r, formato: v })],
            ['Gancho (o começo do post)', GANCHOS, r.gancho, (v: string) => setR({ ...r, gancho: v })],
          ] as const).map(([rot, ops, val, muda]) => (
            <Campo key={rot} rotulo={rot}>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ops.map((o) => (
                  <button key={o.id} type="button" onClick={() => muda(o.id)}
                    style={{ ...bt(val === o.id ? '#0891b2' : '#64748b', val === o.id), minHeight: 36, fontSize: 13 }}>{o.label}</button>
                ))}
              </span>
            </Campo>
          ))}
          <div style={grade(220)}>
            <Campo rotulo="Tem gente real? (cliente, técnico, operador)">
              <span style={{ display: 'flex', gap: 6 }}>
                {([[true, 'Sim'], [false, 'Não']] as const).map(([v, t]) => (
                  <button key={t} type="button" onClick={() => setR({ ...r, gente_real: v })} style={{ ...bt(r.gente_real === v ? '#0891b2' : '#64748b', r.gente_real === v), minHeight: 36 }}>{t}</button>
                ))}
              </span>
            </Campo>
            <Campo rotulo="Máquina (opcional)" ajuda="Ex.: Mahindra 6075. Também vira o começo do código do post.">
              <input style={campoNP} maxLength={120} value={r.maquina || ''} onChange={(e) => setR({ ...r, maquina: e.target.value })} />
            </Campo>
          </div>
        </Secao>

        {/* Fase 4.3: código do post + links que contam quem veio dele */}
        {r.codigo && (
          <Secao icone="fa-link" cor="#16a34a" titulo={`Código do post: ${r.codigo}${typeof r.contatos === "number" ? ` · ${r.contatos} ${r.contatos === 1 ? "contato" : "contatos"} pelo WhatsApp` : ""}`} sub="Use estes links no post: quem chamar por eles conta como contato deste post">
            {(() => {
              const zap = whats ? linkWhatsDoPost(whats, r.codigo!, r.titulo) : null;
              const site = siteUrl ? linkSiteDoPost(siteUrl, r.redes[0] || 'instagram', r.codigo!) : null;
              const linha = (rot: string, url: string | null, falta: string) => (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: T2, minWidth: 120 }}>{rot}</span>
                  {url ? <>
                    <code style={{ flex: '1 1 240px', fontSize: 12, padding: '6px 8px', borderRadius: 8, background: 'var(--surface-2, rgba(100,116,139,.08))', overflowWrap: 'anywhere' }}>{url}</code>
                    <button type="button" style={bt('#16a34a')} onClick={() => navigator.clipboard.writeText(url).catch(() => {})}>{ic('fa-copy')}Copiar</button>
                  </> : <span style={{ fontSize: 12.5, color: T3 }}>{falta}</span>}
                </div>
              );
              return <div style={{ display: 'grid', gap: 8 }}>
                {linha('WhatsApp', zap, 'Falta o WhatsApp da empresa em Textos do site.')}
                {linha(`Site (${r.redes[0] ? REDE[r.redes[0]].nome : 'Instagram'})`, site, 'Endereço do site não configurado.')}
                <span style={{ fontSize: 12, color: T3 }}>No texto do post: “Chama no WhatsApp e fala o código {r.codigo}”. O link do site leva a etiqueta do post para a tela Acessos.</span>
              </div>;
            })()}
          </Secao>
        )}

        </div>

        <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
        <Secao icone="fa-pen-to-square" titulo="Texto" sub="Do que é o post e o texto que vai junto da arte">
          <Campo rotulo="Do que é (aparece no calendário)" ajuda="Ex.: “Komander K60 pronta entrega”, “Dica de manutenção do 6075”.">
            <input style={campoNP} maxLength={120} value={r.titulo} onChange={(e) => setR({ ...r, titulo: e.target.value })} />
          </Campo>
          <Campo rotulo="Texto do post" ajuda="O mesmo texto vai para todas as redes escolhidas. O contador fica vermelho quando passa do limite da rede.">
            <LegendaRedes valor={r.legenda} onChange={(v) => setR({ ...r, legenda: v })} redes={r.redes} />
          </Campo>
          {/* Fase 3.2 (23/11/2026): texto único é o padrão; cada rede pode ter o seu */}
          {r.redes.length > 1 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 12.5, color: T3 }}>Ajustar o texto para uma rede:</span>
              {r.redes.map((id) => (
                <button key={id} type="button" onClick={() => setAjustar(ajustar === id ? null : id)}
                  style={{ ...bt(r.textos?.[id] ? REDE[id].cor : '#64748b', ajustar === id), minHeight: 32, fontSize: 12.5 }}>
                  <IconeRede id={id} tam={13} /> {REDE[id].nome}{r.textos?.[id] ? ' · ajustado' : ''}
                </button>
              ))}
            </div>
          )}
          {ajustar && r.redes.includes(ajustar) && (
            <Campo rotulo={`Texto só para o ${REDE[ajustar].nome}`} ajuda="Vazio = usa o texto de cima.">
              <textarea style={{ ...campoNP, minHeight: 90, resize: 'vertical' }} maxLength={5000} value={r.textos?.[ajustar] || ''}
                placeholder={r.legenda} onChange={(e) => setR({ ...r, textos: { ...(r.textos || {}), [ajustar]: e.target.value } })} />
            </Campo>
          )}
          <div style={grade(260)}>
            <Campo rotulo="Hashtags" ajuda="Vão no fim do texto, em todas as redes. Ex.: #mahindra #agro #piraju">
              <input style={campoNP} maxLength={500} value={r.hashtags || ''} onChange={(e) => setR({ ...r, hashtags: e.target.value })} />
            </Campo>
            {r.redes.includes('youtube') && (
              <Campo rotulo="Título no YouTube" ajuda="Até 100 letras. Sem ele, o YouTube usa o começo do texto.">
                <input style={campoNP} maxLength={100} value={r.titulo_youtube || ''} onChange={(e) => setR({ ...r, titulo_youtube: e.target.value })} />
              </Campo>
            )}
          </div>
          <Campo rotulo="Primeiro comentário (opcional)" ajuda="Postar logo depois, como comentário: link, mais hashtags ou o WhatsApp.">
            <textarea style={{ ...campoNP, minHeight: 54, resize: 'vertical' }} maxLength={2200} value={r.primeiro_comentario || ''} onChange={(e) => setR({ ...r, primeiro_comentario: e.target.value })} />
          </Campo>
          <Campo rotulo="Anotações (não vai para as redes)" ajuda="Ideia do post, quem gravar, material que falta.">
            <textarea style={{ ...campoNP, minHeight: 64, resize: 'vertical' }} maxLength={1000} value={r.notas} onChange={(e) => setR({ ...r, notas: e.target.value })} />
          </Campo>
          {r.data && datasDoDia(r.data).map((x) => (
            <div key={x.d + x.nome} style={{ display: 'grid', gap: 2, padding: '10px 12px', borderRadius: 12, background: `color-mix(in srgb, ${COR_PRIOR[x.prior]} 8%, var(--surface))`, border: `1px solid color-mix(in srgb, ${COR_PRIOR[x.prior]} 25%, transparent)` }}>
              <span style={{ fontSize: 13, color: COR_PRIOR[x.prior] }}>{ic('fa-wheat-awn')} {x.nome} · {NOME_PRIOR[x.prior]}{x.confirmar ? ' · confirmar a data' : ''}</span>
              <span style={{ fontSize: 13, color: T2 }}>{x.ideia}</span>
              {guia(x)}
            </div>
          ))}
          <span style={{ fontSize: 12, color: T3 }}>Regra de ouro: mostrar gente real da região (cliente, técnico, operador). Sem material próprio, melhor não postar card genérico. Post de venda termina com o WhatsApp.</span>
        </Secao>

        <Secao icone="fa-calendar-days" cor="#0284c7" titulo="Quando sai" sub="Sem data, fica guardado em Ideias">
          <div style={grade(180)}>
            <Campo rotulo="Dia"><input type="date" style={campoNP} value={r.data} onChange={(e) => setR({ ...r, data: e.target.value })} /></Campo>
            <Campo rotulo="Hora" ajuda="Melhores horários no agro: 7h, 12h e 19h."><input type="time" style={campoNP} value={r.hora} onChange={(e) => setR({ ...r, hora: e.target.value })} /></Campo>
          </div>
        </Secao>

        {r.redes.length > 0 && (
          <Secao icone="fa-paper-plane" cor="#16a34a" titulo="Postar" sub="Por enquanto pelo celular em 1 toque. Instagram e Facebook vão sair sozinhos quando a conta for ligada">
            <div style={{ display: 'grid', gap: 8 }}>
              {/* Fase 3.5: post de preço/condição só sai depois de aprovado */}
              {r.etiqueta_tipo === 'promocao' && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', borderRadius: 12,
                  background: r.aprovado_em ? 'color-mix(in srgb, #16a34a 8%, var(--surface))' : 'color-mix(in srgb, #d97706 10%, var(--surface))' }}>
                  <span style={{ flex: '1 1 240px', fontSize: 13.5 }}>
                    {r.aprovado_em
                      ? <>{ic('fa-circle-check')} Aprovado por {r.aprovado_por} em {new Date(r.aprovado_em).toLocaleString('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</>
                      : <>{ic('fa-hourglass-half')} <b style={{ fontWeight: 500 }}>Aguardando aprovação</b>: post de preço ou condição só sai depois de alguém aprovar.{!r.id && ' Grave o post primeiro.'}</>}
                  </span>
                  {podeAprovar && r.id && (r.aprovado_em
                    ? <button type="button" style={bt('#64748b')} onClick={() => aprovar(false)}>Desfazer aprovação</button>
                    : <button type="button" style={bt('#16a34a', true)} onClick={() => aprovar(true)}>{ic('fa-check')}Aprovar</button>)}
                </div>
              )}
              {r.primeiro_comentario && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
                  <span style={{ color: T2 }}>Depois de postar, cole o primeiro comentário:</span>
                  <button type="button" style={bt('#0891b2')} onClick={() => navigator.clipboard.writeText(r.primeiro_comentario || '').catch(() => {})}>{ic('fa-copy')}Copiar comentário</button>
                </div>
              )}
              {/* 27/11/2026 (José: "melhora os botões de postar"): um cartão por rede, com 1 botão grande e o passo a passo */}
              {r.redes.map((id) => {
                const rs = r.resultado[id];
                const espera = r.etiqueta_tipo === 'promocao' && !r.aprovado_em;
                // sem arte, ou post de preço ainda não aprovado: não dá para marcar que saiu
                const semArte = f.some((x) => x.rede === id) || espera;
                const sozinho = REDE[id].envio === 'automatico' && !!conta(id);
                const cor = REDE[id].cor;
                const quando = (iso?: string) => new Date(iso || '').toLocaleString('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                const [rotulo, corRot] = rs?.ok ? ['Postado', '#16a34a'] : semArte ? [espera ? 'Espera aprovação' : 'Falta a arte', '#b45309'] : sozinho ? ['Sai sozinho', '#0284c7'] : ['Pronto para postar', cor];
                return (
                  <div key={id} style={{ display: 'grid', gap: 10, padding: '12px 14px', borderRadius: 14,
                    border: `1px solid ${rs?.ok ? 'color-mix(in srgb, #16a34a 35%, var(--border))' : 'var(--border)'}`,
                    background: rs?.ok ? 'color-mix(in srgb, #16a34a 6%, var(--surface))' : 'var(--surface)' }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <IconeRede id={id} tam={22} />
                      <span style={{ fontSize: 15, fontWeight: 500, flex: 1, minWidth: 0 }}>{REDE[id].nome}</span>
                      <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 999, color: corRot, background: `color-mix(in srgb, ${corRot} 11%, transparent)`, whiteSpace: 'nowrap' }}>{rotulo}</span>
                    </div>
                    {rs?.ok ? (
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, color: '#16a34a', flex: '1 1 180px' }}>{ic('fa-circle-check')} Saiu {rs.manual ? 'pelo celular' : 'sozinho'} em {quando(rs.em)}</span>
                        {rs.link
                          ? <a href={rs.link} target="_blank" rel="noreferrer" style={{ ...bt('#16a34a'), minHeight: 36 }}>{ic('fa-arrow-up-right-from-square')}Ver o post</a>
                          : <span style={{ fontSize: 12, color: '#b45309' }}>sem link</span>}
                        {podeEditar && <button type="button" style={{ ...bt('#64748b'), minHeight: 36 }} onClick={() => marcar(id, false)}>{ic('fa-rotate-left')}Desmarcar</button>}
                      </div>
                    ) : semArte ? (
                      <span style={{ fontSize: 13, color: '#b45309' }}>
                        {ic('fa-circle-exclamation')} {espera ? 'Post de preço: alguém precisa aprovar (logo acima) antes de postar.' : 'Falta a arte desta rede. Coloque na parte Artes.'}
                      </span>
                    ) : (
                      <>
                        <button type="button" onClick={() => compartilhar(id)} title="Copia o texto e abre o compartilhar do celular com a arte"
                          style={{ ...bt(cor, true), minHeight: 48, fontSize: 15, width: '100%', justifyContent: 'center' }}>
                          {ic(copiado === id ? 'fa-rotate-right' : 'fa-paper-plane')}{copiado === id ? `Abrir o ${REDE[id].nome} de novo` : `Postar no ${REDE[id].nome}`}
                        </button>
                        <span style={{ fontSize: 12.5, color: copiado === id ? '#16a34a' : T3, lineHeight: 1.45 }}>
                          {copiado === id
                            ? <>{ic('fa-check')} Texto copiado. No app, é só colar. Quando terminar, toque em <b style={{ fontWeight: 500 }}>Já postei</b>.</>
                            : sozinho ? 'Sai sozinho no dia e hora marcados. Se quiser postar antes, use o botão.'
                            : <>1. Toque no botão: o texto é copiado e o app abre com a arte. 2. Cole o texto e publique. 3. Volte e toque em <b style={{ fontWeight: 500 }}>Já postei</b>.</>}
                        </span>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button type="button" style={{ ...bt('#64748b'), minHeight: 36 }} onClick={() => { navigator.clipboard.writeText(textoDaRede(r, id)).then(() => setCopiado(id)).catch(() => {}); }}>{ic('fa-copy')}Copiar só o texto</button>
                          {podeEditar && <button type="button" style={{ ...bt('#16a34a', linkPara === id), minHeight: 36 }} onClick={() => { setLinkPara(id); setLinkPost(''); }}>{ic('fa-check')}Já postei</button>}
                        </div>
                      </>
                    )}
                    {/* Fase 3.1: pede o link do post (opcional, mas destacado) — sem ele o histórico manual vira dado morto */}
                    {linkPara === id && !rs?.ok && (
                      <div style={{ display: 'grid', gap: 6, padding: '10px 12px', borderRadius: 10, background: 'color-mix(in srgb, #16a34a 7%, var(--surface))' }}>
                        <span style={{ fontSize: 13 }}>Cole o <b style={{ fontWeight: 500 }}>link do post</b> no {REDE[id].nome}. Com ele, o portal puxa os números do post quando a conta for ligada.</span>
                        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <input autoFocus style={{ ...campoNP, flex: '1 1 220px' }} placeholder="https://www.instagram.com/p/…" value={linkPost} onChange={(e) => setLinkPost(e.target.value.trim())}
                            onKeyDown={(e) => { if (e.key === 'Enter') marcar(id, true, linkPost); }} />
                          <button type="button" style={bt('#16a34a', true)} disabled={!linkPost.startsWith('https://')} onClick={() => marcar(id, true, linkPost)}>Gravar com o link</button>
                          <button type="button" style={bt('#64748b')} onClick={() => marcar(id, true)}>Sem link</button>
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Secao>
        )}
        </div>
        </div>

        {/* barra de baixo grudada no fim da tela: Gravar sempre à mão */}
        <section style={{ ...cartaoNP, position: 'sticky', bottom: 10, zIndex: 5, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
          boxShadow: '0 8px 28px rgba(15, 23, 42, .12)' }}>
          {erroForm && <span style={{ flexBasis: '100%', color: '#dc2626', fontSize: 13 }}>{ic('fa-circle-exclamation')} {erroForm}</span>}
          {podeEditar && <button style={{ ...bt('#d97706', true), minHeight: 46, fontSize: 15, padding: '8px 22px' }} disabled={salvando} onClick={() => salvar()}>{ic('fa-floppy-disk')}{salvando ? 'Gravando…' : r.id ? 'Gravar' : 'Pôr no calendário'}</button>}
          <button style={{ ...bt('#64748b'), minHeight: 46 }} onClick={fechar}>{ic('fa-arrow-left')}Voltar sem gravar</button>
          {podeEditar && r.id && <button style={{ ...bt('#dc2626'), minHeight: 46, marginLeft: 'auto' }} onClick={apagar}>{ic('fa-trash')}Apagar</button>}
        </section>
      </div>
    );
  }

  // ---------------------------------------------------------------- tela
  const mesAnt = () => { const d = new Date(`${rota.mes}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); ir({ mes: d.toISOString().slice(0, 7) }); };
  const mesProx = () => { const d = new Date(`${rota.mes}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); ir({ mes: d.toISOString().slice(0, 7) }); };

  // ---- resumo do topo (semana da tela)
  const diasSemana = Array.from({ length: 7 }, (_, i) => somaDias(semana, i));
  const postsSemana = diasSemana.flatMap((d) => porDia.get(d) || []);
  const prontosSemana = postsSemana.filter((p) => p.status !== 'ideia').length;
  const vaziosSemana = diasSemana.filter((d) => d >= hoje() && !porDia.get(d)?.length);
  const faltamDias = (d: string) => Math.round((new Date(`${d}T12:00:00Z`).getTime() - new Date(`${hoje()}T12:00:00Z`).getTime()) / 864e5);
  const quandoFalta = (d: string) => { const f = faltamDias(d); return f <= 0 ? 'é hoje' : f === 1 ? 'amanhã' : `em ${f} dias`; };
  const proxAgro = proximasAgro.find((x) => !porDia.get(x.d)?.length) || null;
  const resumoCartao = (i: number, icone: string, cor: string, rotulo: string, valor: React.ReactNode, sub: React.ReactNode, acao?: () => void, dica?: string) => {
    const Tag = acao ? 'button' : 'div';
    return (
      <Tag type={acao ? 'button' : undefined} onClick={acao} title={dica} className={`np-entra${acao ? ' np-sobe' : ''}`}
        style={{ ...cartaoNP, display: 'grid', gap: 6, alignContent: 'start', textAlign: 'left', font: 'inherit', color: T1, cursor: acao ? 'pointer' : 'default', animationDelay: `${i * 80}ms`,
          background: `linear-gradient(135deg, color-mix(in srgb, ${cor} 9%, var(--surface)), var(--surface) 65%)` }}>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: T2 }}>
          <span style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center', color: cor, background: `color-mix(in srgb, ${cor} 15%, transparent)` }}>{ic(icone)}</span>
          {rotulo}
          {acao && <span style={{ marginLeft: 'auto', color: cor, fontSize: 12 }}>{ic('fa-arrow-right')}</span>}
        </span>
        <span style={{ fontSize: 24, fontWeight: 500, lineHeight: 1.15 }}>{valor}</span>
        <span style={{ fontSize: 13, color: T2, lineHeight: 1.35 }}>{sub}</span>
      </Tag>
    );
  };

  return (
    <div style={{ ...tela, color: T1 }}>
      <style>{ESTILO_CAL}</style>
      <SubAbas abas={ABAS_CONTEUDO} />
      {erro && <Aviso>{erro}</Aviso>}
      {r ? editor() : (
        <>
          {/* resumo da semana em cartões (25/11/2026) */}
          {!rota.ano && posts && (
            <div style={grade(220)}>
              {resumoCartao(0, 'fa-calendar-week', '#d97706', largo ? 'Esta semana' : 'Semana de hoje',
                <>{postsSemana.length} post{postsSemana.length === 1 ? '' : 's'}</>,
                postsSemana.length ? `${prontosSemana} pronto${prontosSemana === 1 ? '' : 's'} · ${postsSemana.length - prontosSemana} ainda em ideia` : 'Nenhum post marcado nesta semana')}
              {resumoCartao(1, 'fa-calendar-xmark', vaziosSemana.length ? '#dc2626' : '#16a34a', 'Dias sem post',
                vaziosSemana.length ? <>{vaziosSemana.length} dia{vaziosSemana.length === 1 ? '' : 's'}</> : <>Nenhum {ic('fa-circle-check')}</>,
                vaziosSemana.length ? `Próximo vazio: ${nomeDia(vaziosSemana[0], { weekday: 'long', day: '2-digit', month: '2-digit' })}` : 'Semana toda coberta',
                podeEditar && vaziosSemana.length ? () => novoPost(vaziosSemana[0]) : undefined, 'Criar um post no próximo dia vazio')}
              {proxAgro && resumoCartao(2, 'fa-wheat-awn', COR_PRIOR[proxAgro.prior], 'Próxima data do agro',
                <>{proxAgro.nome}</>,
                <><b style={{ fontWeight: 500, color: COR_PRIOR[proxAgro.prior] }}>{quandoFalta(proxAgro.d)}</b> ({nomeDia(proxAgro.d, { day: '2-digit', month: '2-digit' })}) · ainda sem post</>,
                podeEditar ? () => novoPost(proxAgro.d, proxAgro) : undefined, 'Criar o post já com a ideia da data')}
              {melhorDia && resumoCartao(3, 'fa-chart-line', '#7c3aed', 'Melhor dia para postar',
                <>{melhorDia.nome}</>,
                <>Em média {melhorDia.media.toLocaleString('pt-BR')} pessoas alcançadas nesse dia (números reais das redes)</>,
                () => { window.location.href = '/marketing/acessos/todas'; }, 'Ver os números em Acessos')}
            </div>
          )}

          <section style={{ ...cartaoNP, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', padding: 4, borderRadius: 12, border: '1px solid var(--border)', gap: 4, background: 'var(--surface)' }}>
                {([[false, largo ? 'Semana' : 'Mês', largo ? 'fa-calendar-week' : 'fa-calendar'], [true, 'Ano todo', 'fa-calendar-days']] as const).map(([v, nome, icone]) => (
                  <button key={nome} type="button" onClick={() => ir({ ano: v })}
                    style={{ font: 'inherit', fontSize: 14, fontWeight: 500, minHeight: 38, padding: '6px 16px', borderRadius: 9, border: 'none', cursor: 'pointer', display: 'inline-flex', gap: 7, alignItems: 'center',
                      background: rota.ano === v ? '#d97706' : 'transparent', color: rota.ano === v ? '#fefefe' : T2 }}>{ic(icone)}{nome}</button>
                ))}
              </span>
              {rota.ano ? <span style={{ fontSize: 17 }}>Próximos 12 meses</span> : largo ? (
                <>
                  <button style={bt('#64748b')} onClick={() => irSemana(somaDias(semana, -7))} title="Semana anterior">{ic('fa-chevron-left')}Anterior</button>
                  <span style={{ fontSize: 17, minWidth: 210, textAlign: 'center' }}>
                    {nomeDia(semana, { day: 'numeric', month: 'short' })} a {nomeDia(somaDias(semana, 6), { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  <button style={bt('#64748b')} onClick={() => irSemana(somaDias(semana, 7))} title="Próxima semana">Próxima{ic('fa-chevron-right')}</button>
                  {semana !== segundaDe(hoje()) && <button style={bt(AZUL, true)} onClick={() => irSemana(segundaDe(hoje()))}>{ic('fa-location-crosshairs')}Voltar para hoje</button>}
                  <button style={bt('#d97706')} onClick={() => setMesAberto(true)}>{ic('fa-calendar')}Ver o mês inteiro</button>
                </>
              ) : (
                <>
                  <button style={bt('#64748b')} onClick={mesAnt} title="Mês anterior">{ic('fa-chevron-left')}Anterior</button>
                  <span style={{ fontSize: 17, minWidth: 170, textAlign: 'center', textTransform: 'capitalize' }}>{nomeMes(rota.mes)}</span>
                  <button style={bt('#64748b')} onClick={mesProx} title="Próximo mês">Próximo{ic('fa-chevron-right')}</button>
                  {rota.mes !== hoje().slice(0, 7) && <button style={bt(AZUL, true)} onClick={() => ir({ mes: hoje().slice(0, 7) })}>{ic('fa-location-crosshairs')}Voltar para hoje</button>}
                </>
              )}
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 13, color: T3, alignItems: 'center' }}>
                {(['ideia', 'pronto', 'publicado'] as StatusPost[]).map((k) => <span key={k} style={{ color: STATUS_POST[k].cor, padding: '4px 10px', borderRadius: 999, background: `color-mix(in srgb, ${STATUS_POST[k].cor} 10%, transparent)` }}>{ic(STATUS_POST[k].icone)} {STATUS_POST[k].nome}</span>)}
              </span>
              {podeEditar && <button style={{ ...bt('#d97706', true), minHeight: 46, fontSize: 15, padding: '8px 20px' }} onClick={() => novoPost(vazios[0] || '')}>{ic('fa-plus')}Novo post</button>}
            </div>
            {!rota.ano && temporadasDoMes(rota.mes).length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {temporadasDoMes(rota.mes).map((t) => (
                  <span key={t.nome} title={t.ideia} style={{ fontSize: 12.5, padding: '4px 10px', borderRadius: 999, color: COR_PRIOR[t.prior], background: `color-mix(in srgb, ${COR_PRIOR[t.prior]} 9%, transparent)` }}>
                    {ic('fa-seedling')} No mês: {t.nome}
                  </span>
                ))}
              </div>
            )}
            {posts === null ? <p>Carregando…</p> : rota.ano ? anoTodo() : largo ? grade7(semana) : agenda()}
            {rota.ano && <span style={{ fontSize: 12, color: T3 }}><span style={{ color: '#16a34a' }}>●</span> dia com post · <span style={{ color: '#dc2626' }}>○</span> data obrigatória · <span style={{ color: '#2563eb' }}>○</span> data boa. Toque num mês para abrir.</span>}
            {!rota.ano && largo && podeEditar && (
              <span style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12.5, color: T2 }}>
                <span>{ic('fa-hand-pointer')} Toque num dia para criar um post</span>
                <span>{ic('fa-up-down-left-right')} Arraste um post para mudar o dia</span>
                <span style={{ color: '#dc2626' }}>{ic('fa-wheat-awn')} Data do agro: tocar cria o post já com a ideia</span>
              </span>
            )}
          </section>

          {/* O mês inteiro, num modal por cima da semana */}
          {mesAberto && largo && !rota.ano && (
            <div onClick={fecharMes} onKeyDown={(e) => e.key === 'Escape' && fecharMes()} tabIndex={-1}
              style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15, 23, 42, .45)', display: 'grid', placeItems: 'center', padding: 16 }}>
              <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Calendário do mês"
                style={{ ...cartaoNP, width: 'min(1200px, 100%)', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button style={bt('#64748b')} onClick={mesAnt} title="Mês anterior">{ic('fa-chevron-left')}Anterior</button>
                  <span style={{ fontSize: 17, minWidth: 170, textAlign: 'center', textTransform: 'capitalize' }}>{nomeMes(rota.mes)}</span>
                  <button style={bt('#64748b')} onClick={mesProx} aria-label="Próximo mês">{ic('fa-chevron-right')}</button>
                  <button style={{ ...bt('#64748b'), marginLeft: 'auto' }} onClick={fecharMes} aria-label="Fechar">{ic('fa-xmark')}Fechar</button>
                </div>
                {grade7()}
              </div>
            </div>
          )}

          <Secao icone="fa-wheat-awn" cor="#dc2626" titulo={proximasAgro.length ? `${proximasAgro.filter((x) => !porDia.get(x.d)?.length).length} das ${proximasAgro.length} datas do agro dos próximos 60 dias ainda sem post` : 'Nenhuma data importante nos próximos 60 dias'}
            sub="Obrigatórias: planejar 2 a 3 semanas antes, de preferência com vídeo ou foto própria">
            {/* 25/11/2026: cada data vira um cartão com contagem regressiva, lado a lado */}
            <div style={grade(260)}>
              {proximasAgro.map((x, i) => {
                const tem = porDia.get(x.d) || [];
                const faltam = faltamDias(x.d);
                const cor = COR_PRIOR[x.prior];
                return (
                  <div key={x.d + x.nome} className="np-entra np-sobe"
                    style={{ ...cartaoNP, display: 'grid', gap: 10, alignContent: 'start', animationDelay: `${Math.min(i, 8) * 60}ms`,
                      borderColor: `color-mix(in srgb, ${cor} ${tem.length ? 20 : 40}%, transparent)`, borderTop: `4px solid ${tem.length ? '#16a34a' : cor}` }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <span style={{ width: 62, height: 62, flex: 'none', borderRadius: 16, display: 'grid', placeItems: 'center', alignContent: 'center', color: '#fefefe',
                        background: tem.length ? '#16a34a' : `linear-gradient(145deg, ${cor}, color-mix(in srgb, ${cor} 70%, #000))` }}>
                        <span style={{ fontSize: faltam > 0 ? 22 : 15, fontWeight: 600, lineHeight: 1 }}>{faltam > 0 ? faltam : 'hoje'}</span>
                        {faltam > 0 && <span style={{ fontSize: 10.5, opacity: 0.9 }}>{faltam === 1 ? 'dia' : 'dias'}</span>}
                      </span>
                      <span style={{ display: 'grid', gap: 3, minWidth: 0 }}>
                        <span style={{ fontSize: 15.5, fontWeight: 500, lineHeight: 1.25 }}>{x.nome}</span>
                        <span style={{ fontSize: 12.5, color: T2 }}>
                          {nomeDia(x.d, { weekday: 'short', day: '2-digit', month: '2-digit' })}{x.ate ? ` até ${nomeDia(x.ate, { day: '2-digit', month: '2-digit' })}` : ''}
                        </span>
                        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11.5, padding: '2px 8px', borderRadius: 999, color: cor, background: `color-mix(in srgb, ${cor} 12%, transparent)` }}>{NOME_PRIOR[x.prior]}</span>
                          {x.confirmar && <span style={{ fontSize: 11.5, padding: '2px 8px', borderRadius: 999, color: '#b45309', background: 'color-mix(in srgb, #b45309 12%, transparent)' }}>confirmar a data</span>}
                          {tem.length > 0 && <span style={{ fontSize: 11.5, padding: '2px 8px', borderRadius: 999, color: '#16a34a', background: 'color-mix(in srgb, #16a34a 12%, transparent)' }}>{ic('fa-check')} tem post</span>}
                        </span>
                      </span>
                    </div>
                    <span style={{ fontSize: 13.5, color: T1, lineHeight: 1.45 }}>{x.ideia}</span>
                    {guiaDe(x) && (
                      <details>
                        <summary style={{ fontSize: 13, color: AZUL, cursor: 'pointer', width: 'fit-content' }}>{ic('fa-lightbulb')} Ideias de post e o que preparar</summary>
                        <div style={{ paddingTop: 6 }}>{guia(x)}</div>
                      </details>
                    )}
                    {tem.length ? tem.map((p) => chipPost(p, false))
                      : podeEditar && <button type="button" style={{ ...bt(cor, true), justifyContent: 'center' }} onClick={() => novoPost(x.d, x)}>{ic('fa-plus')}Criar o post</button>}
                  </div>
                );
              })}
            </div>
          </Secao>

          <Secao icone="fa-lightbulb" cor="#64748b" titulo={`Ideias sem data (${ideias.length})`} sub="Posts guardados para quando faltar assunto. Abra e escolha o dia">
            {ideias.length ? (
              <div style={grade(240)}>{ideias.map((p) => chipPost(p, false))}</div>
            ) : <span style={{ fontSize: 13, color: T3 }}>Nenhuma ideia guardada. Em “Novo post”, deixe o dia em branco para guardar aqui.</span>}
            {podeEditar && <button style={{ ...bt('#64748b'), width: 'fit-content' }} onClick={() => novoPost('')}>{ic('fa-plus')}Guardar uma ideia</button>}
          </Secao>
        </>
      )}
    </div>
  );
}
