'use client';
// Conteúdo e publicar → Calendário (José, 12/11/2026): "um calendário de conteúdo, pronto para no mínimo 1 mês
// adiantado" e "publicar do portal para essas redes, escolhendo onde a publicação sai, se é só em uma ou em todas".
// Tudo pelo endereço: ?mes=AAAA-MM · ?post=<id> · ?novo=AAAA-MM-DD · ?da_promocao=<id>.
// Etapa 1: o post fica pronto (artes, texto, dia, redes) e sai "pelo celular em 1 clique" (compartilhar o arquivo para
// o app + texto copiado + "Já postei"). Etapa 2: Instagram e Facebook saem sozinhos pela conta ligada (robô).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchAuth } from '@/lib/auth/client';
import { Aviso, tela } from '@/components/site/ui';
import SubAbas from '@/components/site/SubAbas';
import { ABAS_CONTEUDO } from '@/components/site/abasConteudo';
import { ArtesDasRedes, EscolherRedes, IconeRede, LegendaRedes } from '@/components/site/Artes';
import { REDE, STATUS_POST, faltas, type Arte, type Midia, type RedeId, type StatusPost } from '@/lib/site/redes';
import { COR_PRIOR, NOME_PRIOR, DATAS_AGRO, datasDoDia, temporadasDoMes, type DataAgro } from '@/lib/site/datasAgro';
import { AZUL, Campo, Quadradinho, Secao, T1, T2, T3, bt, campoNP, cartaoNP, grade, ic } from '@/components/site/np';

type Resultado = Partial<Record<RedeId, { ok: boolean; link?: string | null; em?: string; manual?: boolean; erro?: string | null }>>;
type Post = {
  id: string; titulo: string; legenda: string | null; redes: RedeId[]; formato: string; midia: Midia; quando: string | null
  status: StatusPost; promocao_id: string | null; resultado: Resultado; notas: string | null; criado_por: string | null; atualizado_por: string | null
};
type Rascunho = { id?: string; titulo: string; legenda: string; redes: RedeId[]; formato: string; midia: Midia; data: string; hora: string; notas: string; promocao_id: string | null; status: StatusPost; resultado: Resultado; chave: string };
type Conta = { rede: RedeId; nome: string | null };

const SOCIAIS: RedeId[] = ['instagram', 'facebook', 'tiktok', 'youtube'];
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
function statusDe(r: Pick<Rascunho, 'data' | 'redes' | 'midia' | 'resultado'>): StatusPost {
  const saiu = r.redes.filter((x) => r.resultado[x]?.ok).length;
  if (saiu && saiu === r.redes.length) return 'publicado';
  if (saiu) return 'parcial';
  if (!r.data || !r.redes.length || faltas(r.redes, r.midia).length) return 'ideia';
  return 'pronto';
}

export default function CalendarioRedes() {
  const largo = useLargo(760);
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
  const abrirPost = (p: Post) => { abriuAqui.current = true; ir({ post: p.id, novo: null, promo: null }); window.scrollTo({ top: 0 }); };
  const tema = useRef<DataAgro | null>(null);
  const novoPost = (dia: string, t: DataAgro | null = null) => { tema.current = t; abriuAqui.current = true; ir({ post: null, novo: dia || 'sem-data', promo: null }); window.scrollTo({ top: 0 }); };
  const fechar = () => { if (abriuAqui.current) { abriuAqui.current = false; window.history.back(); } else ir({ post: null, novo: null, promo: null }, true); };

  // ---- dados: o mês da tela + os próximos 31 dias (para a conta do "1 mês adiantado")
  const inicioGrade = useMemo(() => { const p = `${rota.mes}-01`; const dow = (new Date(`${p}T12:00:00Z`).getUTCDay() + 6) % 7; return somaDias(p, -dow); }, [rota.mes]);
  const carregar = useCallback(async () => {
    const de = [inicioGrade, hoje()].sort()[0];
    const ate = [somaDias(inicioGrade, 41), somaDias(hoje(), rota.ano ? 400 : 62)].sort()[1];
    const res = await fetchAuth(`/api/site/posts?de=${de}&ate=${ate}`);
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.ok) { setErro(j.erro || 'Não consegui carregar o calendário.'); setPosts([]); return; }
    setErro(''); setPosts(j.posts); setIdeias(j.ideias); setContas(j.contas || []); setPodeEditar(!!j.podeEditar);
  }, [inicioGrade, rota.ano]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar(); }, [carregar]);

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
        fetchAuth(`/api/site/posts?de=2000-01-01&ate=2100-01-01`).then((x) => x.json()).then((j) => {
          const q = (j.posts || []).find((x: Post) => x.id === rota.post);
          if (q) setR(rascunhoDe(q, chave)); else ir({ post: null }, true);
        });
        return;
      }
      setR(rascunhoDe(p, chave));
    } else if (rota.promo) {
      fetchAuth('/api/site/promocoes').then((x) => x.json()).then((j) => {
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
        notas: t ? `Ideia: ${t.ideia}` : '', promocao_id: null, status: 'ideia', resultado: {} });
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, posts, ideias]);

  function rascunhoDe(p: Post, k: string): Rascunho {
    return { id: p.id, chave: k, titulo: p.titulo, legenda: p.legenda || '', redes: p.redes || [], formato: p.formato, midia: p.midia || {}, data: p.quando ? diaDe(p.quando) : '',
      hora: p.quando ? horaDe(p.quando) : '09:00', notas: p.notas || '', promocao_id: p.promocao_id, status: p.status, resultado: p.resultado || {} };
  }

  async function chamar(metodo: string, corpo?: unknown, q = '') {
    setSalvando(true); setErroForm('');
    const res = await fetchAuth(`/api/site/posts${q}`, { method: metodo, headers: corpo ? { 'Content-Type': 'application/json' } : undefined, body: corpo ? JSON.stringify(corpo) : undefined });
    const j = await res.json().catch(() => ({}));
    setSalvando(false);
    if (!res.ok || !j.ok) { setErroForm(j.erro || 'Não consegui gravar.'); return null; }
    return j;
  }
  function corpoDe(x: Rascunho) {
    return { id: x.id, titulo: x.titulo, legenda: x.legenda, redes: x.redes, formato: x.formato, midia: x.midia, notas: x.notas, promocao_id: x.promocao_id,
      quando: x.data ? `${x.data}T${x.hora || '09:00'}:00-03:00` : null, status: statusDe(x), resultado: x.resultado };
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
  async function marcar(rede: RedeId, ok: boolean) {
    if (!r) return;
    const resultado = { ...r.resultado };
    if (ok) resultado[rede] = { ok: true, manual: true, em: new Date().toISOString() }; else delete resultado[rede];
    const novo = { ...r, resultado };
    setR(novo);
    if (novo.id) { await chamar('PATCH', corpoDe(novo)); carregar(); }
  }

  /** Abre o "compartilhar" do celular com o arquivo do post (o app do TikTok/YouTube/Insta aparece na lista). */
  async function compartilhar(rede: RedeId) {
    if (!r) return;
    const url = REDE[rede].artes.map((a) => r.midia[a]).find(Boolean);
    if (!url) return;
    try { await navigator.clipboard.writeText(r.legenda); setCopiado(rede); } catch { /* sem permissão de copiar */ }
    try {
      const blob = await (await fetch(url)).blob();
      const nome = `nova-tratores-${rede}.${blob.type.includes('mp4') ? 'mp4' : blob.type.includes('quicktime') ? 'mov' : blob.type.includes('png') ? 'png' : 'jpg'}`;
      const arq = new File([blob], nome, { type: blob.type });
      if (navigator.canShare?.({ files: [arq] })) { await navigator.share({ files: [arq], text: r.legenda }); return; }
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
  const semArte = todos.filter((p) => p.quando && diaDe(p.quando) >= hoje() && faltas(p.redes, p.midia).length).length;
  const ultimoCheio = (() => { let d = ''; for (const x of prox30) { if (!porDia.get(x)?.length) break; d = x; } return d; })();

  // datas do agro: as importantes (obrigatória e boa) dos próximos 30 dias que ainda estão sem post no dia
  const agroSemPost = DATAS_AGRO.filter((x) => x.prior >= 2 && x.d >= hoje() && x.d <= prox30[29] && !porDia.get(x.d)?.length);
  const proximasAgro = DATAS_AGRO.filter((x) => x.prior >= 2 && (x.ate || x.d) >= hoje() && x.d <= somaDias(hoje(), 60));

  // ---------------------------------------------------------------- peças
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
  const chipPost = (p: Post, compacto: boolean) => {
    const s = STATUS_POST[p.status] || STATUS_POST.ideia;
    const falta = faltas(p.redes, p.midia).length > 0;
    return (
      <button key={p.id} type="button" onClick={(e) => { e.stopPropagation(); abrirPost(p); }} title={`${p.titulo} · ${s.nome}`}
        style={{ display: 'grid', gap: 2, width: '100%', textAlign: 'left', font: 'inherit', cursor: 'pointer', padding: compacto ? '4px 6px' : '8px 10px', borderRadius: 8,
          border: `1px solid color-mix(in srgb, ${s.cor} 35%, transparent)`, background: `color-mix(in srgb, ${s.cor} 9%, var(--surface))`, color: T1, minWidth: 0 }}>
        <span style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: compacto ? 11 : 12, color: s.cor }}>
          {ic(s.icone)}{p.quando ? horaDe(p.quando) : 'sem data'}
          <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 3 }}>{p.redes.map((id) => <IconeRede key={id} id={id} tam={compacto ? 10 : 12} />)}</span>
        </span>
        <span style={{ fontSize: compacto ? 12 : 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: compacto ? 'nowrap' : 'normal' }}>{p.titulo}</span>
        {falta && <span style={{ fontSize: 11, color: '#b45309' }}>{ic('fa-triangle-exclamation')} falta arte</span>}
      </button>
    );
  };

  function grade7() {
    const dias = Array.from({ length: 42 }, (_, i) => somaDias(inicioGrade, i));
    const h = hoje();
    // só o mês da tela: dias de outro mês viram espaço vazio e a última semana sem dia do mês sai
    const ultimo = dias.map((d) => d.startsWith(rota.mes)).lastIndexOf(true);
    const visiveis = dias.slice(0, Math.ceil((ultimo + 1) / 7) * 7);
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 8 }}>
        {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => <span key={d} style={{ fontSize: 13, color: T2, padding: '0 6px' }}>{d}</span>)}
        {visiveis.map((d) => {
          if (!d.startsWith(rota.mes)) return <div key={d} />;
          const lista = porDia.get(d) || [];
          const passado = d < h;
          const vazioFuturo = !lista.length && !passado && d <= prox30[29];
          return (
            <div key={d} onClick={() => podeEditar && !passado && novoPost(d)}
              style={{ minHeight: 112, padding: 8, borderRadius: 12, display: 'grid', alignContent: 'start', gap: 6, cursor: podeEditar && !passado ? 'pointer' : 'default', minWidth: 0,
                border: `1px solid ${d === h ? '#dc2626' : 'var(--border)'}`, boxShadow: d === h ? '0 0 0 1px #dc2626' : 'none',
                background: passado ? 'transparent' : 'var(--surface)', opacity: passado ? 0.6 : 1 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 15, color: d === h ? '#dc2626' : T1 }}>{Number(d.slice(8))}</span>
                {d === h && <span style={{ fontSize: 12, color: '#dc2626' }}>hoje</span>}
                {vazioFuturo && <span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#b45309' }}>sem post</span>}
              </span>
              {datasDoDia(d).map((x) => chipAgro(x, d, true))}
              {lista.map((p) => chipPost(p, true))}
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
            <section key={m} onClick={() => ir({ mes: m, ano: false })} style={{ ...cartaoNP, display: 'grid', gap: 10, alignContent: 'start', cursor: 'pointer' }}>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 16, textTransform: 'capitalize', color: m === h.slice(0, 7) ? '#dc2626' : T1 }}>{nomeMes(m)}</span>
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
                        boxShadow: ag ? `inset 0 0 0 2px ${COR_PRIOR[ag.prior]}` : d === h ? 'inset 0 0 0 1px #dc2626' : 'none' }}>
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
              <span style={{ display: 'grid', justifyItems: 'center', padding: '6px 0', borderRadius: 10, background: d === h ? '#dc2626' : 'var(--surface)', color: d === h ? '#fefefe' : T1, border: '1px solid var(--border)' }}>
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
        <section style={{ ...cartaoNP, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" style={bt('#64748b')} onClick={fechar}>{ic('fa-arrow-left')}Voltar ao calendário</button>
          <span style={{ fontSize: 16 }}>{r.id ? r.titulo || 'Post' : 'Novo post'}</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, padding: '3px 10px', borderRadius: 999, color: s.cor, background: `color-mix(in srgb, ${s.cor} 11%, transparent)` }}>{ic(s.icone)} {s.nome}</span>
        </section>

        <Secao icone="fa-share-nodes" cor="#c13584" titulo="Onde vai sair" sub="Toque para ligar ou desligar cada rede. Pode ser uma só ou todas">
          <EscolherRedes so={SOCIAIS} valor={r.redes} onChange={(v) => setR({ ...r, redes: v })} />
        </Secao>

        <Secao icone="fa-images" cor="#7c3aed" titulo="Artes" sub="Cada rede usa um tamanho. Os ícones mostram quem usa cada arte">
          <ArtesDasRedes semSite redes={r.redes} midia={r.midia} pasta="posts" onTroca={(a: Arte, u) => setR({ ...r, midia: { ...r.midia, [a]: u } })} />
        </Secao>

        <Secao icone="fa-pen-to-square" titulo="Texto" sub="Do que é o post e o texto que vai junto da arte">
          <Campo rotulo="Do que é (aparece no calendário)" ajuda="Ex.: “Komander K60 pronta entrega”, “Dica de manutenção do 6075”.">
            <input style={campoNP} maxLength={120} value={r.titulo} onChange={(e) => setR({ ...r, titulo: e.target.value })} />
          </Campo>
          <Campo rotulo="Texto do post" ajuda="O mesmo texto vai para todas as redes escolhidas. O contador fica vermelho quando passa do limite da rede.">
            <LegendaRedes valor={r.legenda} onChange={(v) => setR({ ...r, legenda: v })} redes={r.redes} />
          </Campo>
          <Campo rotulo="Anotações (não vai para as redes)" ajuda="Ideia do post, quem gravar, material que falta.">
            <textarea style={{ ...campoNP, minHeight: 64, resize: 'vertical' }} maxLength={1000} value={r.notas} onChange={(e) => setR({ ...r, notas: e.target.value })} />
          </Campo>
          {r.data && datasDoDia(r.data).map((x) => (
            <div key={x.d + x.nome} style={{ display: 'grid', gap: 2, padding: '10px 12px', borderRadius: 12, background: `color-mix(in srgb, ${COR_PRIOR[x.prior]} 8%, var(--surface))`, border: `1px solid color-mix(in srgb, ${COR_PRIOR[x.prior]} 25%, transparent)` }}>
              <span style={{ fontSize: 13, color: COR_PRIOR[x.prior] }}>{ic('fa-wheat-awn')} {x.nome} · {NOME_PRIOR[x.prior]}{x.confirmar ? ' · confirmar a data' : ''}</span>
              <span style={{ fontSize: 13, color: T2 }}>{x.ideia}</span>
            </div>
          ))}
          <span style={{ fontSize: 12, color: T3 }}>Regra de ouro: mostrar gente real da região (cliente, técnico, operador). Sem material próprio, melhor não postar card genérico. Post de venda termina com o WhatsApp.</span>
        </Secao>

        <Secao icone="fa-calendar-days" cor="#0284c7" titulo="Quando sai" sub="Sem data, fica guardado em Ideias">
          <div style={grade(180)}>
            <Campo rotulo="Dia"><input type="date" style={campoNP} value={r.data} onChange={(e) => setR({ ...r, data: e.target.value })} /></Campo>
            <Campo rotulo="Hora" ajuda="Melhores horários no agro: 7h, 12h e 19h."><input type="time" style={campoNP} value={r.hora} onChange={(e) => setR({ ...r, hora: e.target.value })} /></Campo>
            <Campo rotulo="Formato no Insta e no Face">
              <select style={campoNP} value={r.formato} onChange={(e) => setR({ ...r, formato: e.target.value })}>
                <option value="feed">Post no feed (arte do feed)</option>
                <option value="reels">Reels (vídeo em pé)</option>
                <option value="story">Story (arte em pé)</option>
              </select>
            </Campo>
          </div>
        </Secao>

        {r.redes.length > 0 && (
          <Secao icone="fa-paper-plane" cor="#16a34a" titulo="Postar" sub="Por enquanto pelo celular em 1 toque. Instagram e Facebook vão sair sozinhos quando a conta for ligada">
            <div style={{ display: 'grid', gap: 8 }}>
              {r.redes.map((id) => {
                const rs = r.resultado[id];
                const semArte = f.some((x) => x.rede === id);
                const ligada = !!conta(id);
                return (
                  <div key={id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', borderRadius: 12, border: '1px solid var(--border)', background: rs?.ok ? 'color-mix(in srgb, #16a34a 6%, var(--surface))' : 'var(--surface)' }}>
                    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', minWidth: 150 }}><IconeRede id={id} tam={18} />{REDE[id].nome}</span>
                    <span style={{ fontSize: 12.5, color: rs?.ok ? '#16a34a' : semArte ? '#b45309' : T3, flex: '1 1 160px' }}>
                      {rs?.ok ? `Postado ${rs.manual ? 'pelo celular' : 'sozinho'} em ${new Date(rs.em || '').toLocaleString('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
                        : semArte ? 'Falta a arte desta rede' : REDE[id].envio === 'automatico' && ligada ? 'Sai sozinho no dia e hora marcados' : 'Pelo celular: toque em Postar, escolha o app e cole o texto'}
                    </span>
                    {!rs?.ok && !semArte && (
                      <button type="button" style={bt(REDE[id].cor)} onClick={() => compartilhar(id)} title="Abre o compartilhar do celular com o arquivo; o texto já fica copiado">
                        {ic('fa-share-from-square')}{copiado === id ? 'Texto copiado: postar' : 'Postar'}
                      </button>
                    )}
                    {podeEditar && (rs?.ok
                      ? <button type="button" style={bt('#64748b')} onClick={() => marcar(id, false)}>{ic('fa-rotate-left')}Desmarcar</button>
                      : <button type="button" style={bt('#16a34a')} disabled={semArte} onClick={() => marcar(id, true)}>{ic('fa-check')}Já postei</button>)}
                  </div>
                );
              })}
            </div>
          </Secao>
        )}

        <section style={{ ...cartaoNP, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {erroForm && <span style={{ flexBasis: '100%', color: '#dc2626', fontSize: 13 }}>{ic('fa-circle-exclamation')} {erroForm}</span>}
          {podeEditar && <button style={bt('#dc2626', true)} disabled={salvando} onClick={() => salvar()}>{ic('fa-floppy-disk')}{salvando ? 'Gravando…' : r.id ? 'Gravar' : 'Pôr no calendário'}</button>}
          <button style={bt('#64748b')} onClick={fechar}>Voltar sem gravar</button>
          {podeEditar && r.id && <button style={{ ...bt('#dc2626'), marginLeft: 'auto' }} onClick={apagar}>{ic('fa-trash')}Apagar</button>}
        </section>
      </div>
    );
  }

  // ---------------------------------------------------------------- tela
  const mesAnt = () => { const d = new Date(`${rota.mes}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); ir({ mes: d.toISOString().slice(0, 7) }); };
  const mesProx = () => { const d = new Date(`${rota.mes}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); ir({ mes: d.toISOString().slice(0, 7) }); };
  const cheio = vazios.length === 0;

  return (
    <div style={{ ...tela, color: T1 }}>
      <SubAbas abas={ABAS_CONTEUDO} />
      {erro && <Aviso>{erro}</Aviso>}
      {r ? editor() : (
        <>
          {/* conclusão primeiro: o mês adiantado está coberto? */}
          <section style={{ ...cartaoNP, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <Quadradinho icone={cheio ? 'fa-circle-check' : 'fa-calendar-xmark'} cor={cheio ? '#16a34a' : '#d97706'} tam={40} />
              <span style={{ flex: '1 1 240px', display: 'grid', gap: 2 }}>
                <span style={{ fontSize: 16 }}>
                  {posts === null ? 'Carregando…' : cheio ? 'Próximos 30 dias com post todo dia' : `${vazios.length} dos próximos 30 dias sem post`}
                </span>
                <span style={{ fontSize: 13, color: T3 }}>
                  {ultimoCheio ? `Coberto sem buraco até ${nomeDia(ultimoCheio, { day: '2-digit', month: '2-digit' })}. ` : 'Hoje ainda não tem post. '}
                  {semArte ? `${semArte} post${semArte > 1 ? 's' : ''} marcado${semArte > 1 ? 's' : ''} sem a arte.` : 'Meta: no mínimo 1 mês adiantado.'}
                  {agroSemPost.length > 0 && <span style={{ color: '#dc2626' }}> {agroSemPost.length} data{agroSemPost.length > 1 ? 's' : ''} do agro sem post: {agroSemPost.map((x) => `${x.nome} (${nomeDia(x.d, { day: '2-digit', month: '2-digit' })})`).join(', ')}.</span>}
                </span>
              </span>
              {podeEditar && <button style={bt('#dc2626', true)} onClick={() => novoPost(vazios[0] || '')}>{ic('fa-plus')}Novo post</button>}
            </div>
          </section>

          <section style={{ ...cartaoNP, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', padding: 3, borderRadius: 10, border: '1px solid var(--border)', gap: 2 }}>
                {([[false, 'Mês', 'fa-calendar'], [true, 'Ano todo', 'fa-calendar-days']] as const).map(([v, nome, icone]) => (
                  <button key={nome} type="button" onClick={() => ir({ ano: v })}
                    style={{ font: 'inherit', fontSize: 13, padding: '5px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', display: 'inline-flex', gap: 6, alignItems: 'center',
                      background: rota.ano === v ? '#dc2626' : 'transparent', color: rota.ano === v ? '#fefefe' : T2 }}>{ic(icone)}{nome}</button>
                ))}
              </span>
              {rota.ano ? <span style={{ fontSize: 17 }}>Próximos 12 meses</span> : (
                <>
                  <button style={bt('#64748b')} onClick={mesAnt} aria-label="Mês anterior">{ic('fa-chevron-left')}</button>
                  <span style={{ fontSize: 17, minWidth: 170, textAlign: 'center', textTransform: 'capitalize' }}>{nomeMes(rota.mes)}</span>
                  <button style={bt('#64748b')} onClick={mesProx} aria-label="Próximo mês">{ic('fa-chevron-right')}</button>
                  {rota.mes !== hoje().slice(0, 7) && <button style={bt(AZUL)} onClick={() => ir({ mes: hoje().slice(0, 7) })}>Hoje</button>}
                </>
              )}
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, color: T3 }}>
                {(['ideia', 'pronto', 'publicado'] as StatusPost[]).map((k) => <span key={k} style={{ color: STATUS_POST[k].cor }}>{ic(STATUS_POST[k].icone)} {STATUS_POST[k].nome}</span>)}
              </span>
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
            {posts === null ? <p>Carregando…</p> : rota.ano ? anoTodo() : largo ? grade7() : agenda()}
            {rota.ano && <span style={{ fontSize: 12, color: T3 }}><span style={{ color: '#16a34a' }}>●</span> dia com post · <span style={{ color: '#dc2626' }}>○</span> data obrigatória · <span style={{ color: '#d97706' }}>○</span> data boa. Toque num mês para abrir.</span>}
            {!rota.ano && largo && podeEditar && <span style={{ fontSize: 12, color: T3 }}>Toque num dia para criar um post nele. {ic('fa-wheat-awn')} = data do agro: tocar cria o post já com a ideia.</span>}
          </section>

          <Secao icone="fa-wheat-awn" cor="#dc2626" titulo={proximasAgro.length ? `${proximasAgro.filter((x) => !porDia.get(x.d)?.length).length} das ${proximasAgro.length} datas do agro dos próximos 60 dias ainda sem post` : 'Nenhuma data importante nos próximos 60 dias'}
            sub="Obrigatórias: planejar 2 a 3 semanas antes, de preferência com vídeo ou foto própria">
            <div style={{ display: 'grid', gap: 8 }}>
              {proximasAgro.map((x) => {
                const tem = porDia.get(x.d) || [];
                const faltam = Math.round((new Date(`${x.d}T12:00:00Z`).getTime() - new Date(`${hoje()}T12:00:00Z`).getTime()) / 864e5);
                return (
                  <div key={x.d + x.nome} style={{ display: 'grid', gridTemplateColumns: '54px 1fr', gap: 10, alignItems: 'start' }}>
                    <span style={{ display: 'grid', justifyItems: 'center', padding: '6px 0', borderRadius: 10, border: `1px solid color-mix(in srgb, ${COR_PRIOR[x.prior]} 35%, transparent)`, color: COR_PRIOR[x.prior] }}>
                      <span style={{ fontSize: 16 }}>{nomeDia(x.d, { day: '2-digit', month: '2-digit' })}</span>
                      <span style={{ fontSize: 11, color: T3 }}>{faltam <= 0 ? 'agora' : `${faltam} dia${faltam > 1 ? 's' : ''}`}</span>
                    </span>
                    <span style={{ display: 'grid', gap: 4 }}>
                      <span style={{ fontSize: 14 }}>{x.nome}{x.ate ? ` (até ${nomeDia(x.ate, { day: '2-digit', month: '2-digit' })})` : ''} <span style={{ fontSize: 12, color: COR_PRIOR[x.prior] }}>{NOME_PRIOR[x.prior]}{x.confirmar ? ' · confirmar a data' : ''}</span></span>
                      <span style={{ fontSize: 13, color: T2 }}>{x.ideia}</span>
                      {tem.length ? tem.map((p) => chipPost(p, false))
                        : podeEditar && <button type="button" style={{ ...bt(COR_PRIOR[x.prior]), width: 'fit-content' }} onClick={() => novoPost(x.d, x)}>{ic('fa-plus')}Criar o post</button>}
                    </span>
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
