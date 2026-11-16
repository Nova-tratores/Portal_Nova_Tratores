'use client';
// Acessos → Todas as redes (José, 12/11/2026: "deve mostrar todos os acessos de todas as redes, e com analytics").
// 13/11: logos das redes, apresentação melhor e modo exemplo com números inventados (todas as redes misturadas).
// Dados reais: contador do site (/api/site/acessos) + o que o robô grava de cada rede (site_redes_metricas via /api/site/redes?rede=todas).
// Rede sem conta ligada aparece como "falta ligar" — número inventado só no modo exemplo, com aviso.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { fetchAuth } from '@/lib/auth/client';
import { Aviso, tela } from '@/components/site/ui';
import SubAbas from '@/components/site/SubAbas';
import { ABAS_ACESSOS } from '@/components/site/abasAcessos';
import { LogoRede } from '@/components/site/LogoRede';
import { REDE, type RedeId } from '@/lib/site/redes';
import { T1, T2, T3, bt, cartaoNP, grade, ic } from '@/components/site/np';

type Metrica = { rede: RedeId; dia: string; seguidores: number | null; alcance: number | null; visualizacoes: number | null; interacoes: number | null; cliques: number | null };
type PostR = { id: string; quando: string | null; redes: RedeId[]; resultado: Record<string, { ok?: boolean }> };
type RespSite = { resumo: { visitantes: number; visitas: number; conversoes: number; porDia: { dia: string; visitas: number; conversoes: number }[] }; anterior: { visitantes: number; visitas: number; conversoes: number } };
type Tot = { pessoas: number; views: number; interacoes: number; contatos: number };
type Dia = Tot & { dia: string };
type Bloco = { id: RedeId; ligada: boolean; atual: Tot; antes: Tot | null; dias: Dia[]; seguidores: number | null; novosSeg: number | null; posts: number; temInteracao: boolean };
type TopPost = { titulo: string; rede: RedeId; dia: string; pessoas: number; interacoes: number; contatos: number; formato: string };

const COR = '#d97706';
// Ordem fixa das redes.
const ORDEM: RedeId[] = ['site', 'facebook', 'youtube', 'tiktok', 'instagram'];
const VERDE = '#15803d';
const VERMELHO = '#b91c1c';

const fmt = (x: number) => x.toLocaleString('pt-BR');
const curto = (x: number) => (x >= 10_000 ? `${(x / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : fmt(x));
const hojeSP = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const menos = (d: string, k: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() - k); return x.toISOString().slice(0, 10); };
const ddmm = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;
const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const semanaDe = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
const PERIODOS = [[7, '7 dias'], [30, '30 dias'], [90, '90 dias']] as const;
const ZERO: Tot = { pessoas: 0, views: 0, interacoes: 0, contatos: 0 };
const somar = (l: Tot[]): Tot => l.reduce((s, x) => ({ pessoas: s.pessoas + x.pessoas, views: s.views + x.views, interacoes: s.interacoes + x.interacoes, contatos: s.contatos + x.contatos }), { ...ZERO });
const variacao = (a: number, b: number | null | undefined) => (b == null || b === 0 ? null : Math.round(((a - b) / b) * 100));

// ---------- Exemplo (números inventados, sempre iguais para o mesmo dia) ----------
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const PERFIL: Record<RedeId, { base: number; views: number; inter: number; cont: number; seg: number | null; postsSemana: number; fimDeSemana: number }> = {
  site: { base: 165, views: 2.3, inter: 0, cont: 0.024, seg: null, postsSemana: 0, fimDeSemana: 0.72 },
  facebook: { base: 640, views: 1.5, inter: 0.032, cont: 0.006, seg: 12_340, postsSemana: 4, fimDeSemana: 0.95 },
  youtube: { base: 420, views: 1.9, inter: 0.041, cont: 0.0018, seg: 960, postsSemana: 2, fimDeSemana: 1.15 },
  tiktok: { base: 1450, views: 2.2, inter: 0.063, cont: 0.0011, seg: 3_120, postsSemana: 3, fimDeSemana: 1.25 },
  instagram: { base: 1080, views: 1.7, inter: 0.054, cont: 0.0042, seg: 8_430, postsSemana: 4, fimDeSemana: 1.1 },
};
function exemplo(dias: number): { blocos: Bloco[]; top: TopPost[] } {
  const hoje = hojeSP();
  const total = dias * 2;
  const blocos = ORDEM.map((id, k) => {
    const p = PERFIL[id];
    const r = rng(9173 + k * 101);
    const serie: Dia[] = [];
    let posts = 0;
    for (let i = total - 1; i >= 0; i--) {
      const dia = menos(hoje, i);
      const w = semanaDe(dia);
      const tendencia = 1 + (total - i) * 0.0045;
      const fds = w === 0 || w === 6 ? p.fimDeSemana : 1;
      const postou = p.postsSemana > 0 && r() < p.postsSemana / 7;
      if (postou && i < dias) posts++;
      const pico = postou ? 1.6 + r() * 1.4 : 1;
      const pessoas = Math.round(p.base * tendencia * fds * pico * (0.8 + r() * 0.4));
      serie.push({ dia, pessoas, views: Math.round(pessoas * p.views * (0.9 + r() * 0.2)), interacoes: Math.round(pessoas * p.inter * (0.7 + r() * 0.6)), contatos: Math.round(pessoas * p.cont * (0.5 + r()) + (r() < 0.15 ? 1 : 0)) });
    }
    const atualD = serie.slice(dias);
    const antesD = serie.slice(0, dias);
    const novosSeg = p.seg == null ? null : Math.round(somar(atualD).pessoas * 0.0021);
    return { id, ligada: true, atual: somar(atualD), antes: somar(antesD), dias: atualD, seguidores: p.seg == null ? null : p.seg + novosSeg!, novosSeg, posts, temInteracao: id !== 'site' } as Bloco;
  });
  const modelos: Omit<TopPost, 'dia'>[] = [
    { titulo: 'Mahindra 6075 chegando na fazenda do cliente', rede: 'tiktok', pessoas: 18_400, interacoes: 1_310, contatos: 22, formato: 'vídeo' },
    { titulo: 'Revisão de 250 horas: o que a gente confere', rede: 'instagram', pessoas: 9_870, interacoes: 742, contatos: 41, formato: 'reels' },
    { titulo: 'Usado da semana: TL 75 revisado, pronto pra trabalhar', rede: 'facebook', pessoas: 7_230, interacoes: 318, contatos: 57, formato: 'feed' },
    { titulo: 'Tobata na horta: serviço que não para', rede: 'youtube', pessoas: 5_610, interacoes: 260, contatos: 9, formato: 'shorts' },
    { titulo: 'Condição especial: Mahindra 4x4 com entrada facilitada', rede: 'site', pessoas: 1_940, interacoes: 0, contatos: 63, formato: 'página' },
    { titulo: 'Dia do Agricultor: obrigado a quem faz o campo andar', rede: 'instagram', pessoas: 6_120, interacoes: 905, contatos: 6, formato: 'carrossel' },
  ];
  const escala = dias / 30;
  const top = modelos.map((m, i) => ({ ...m, dia: menos(hoje, Math.min(dias - 1, Math.round((i * 4 + 2) * escala))), pessoas: Math.round(m.pessoas * Math.min(1, 0.5 + escala / 2)), interacoes: Math.round(m.interacoes * Math.min(1, 0.5 + escala / 2)), contatos: Math.max(1, Math.round(m.contatos * Math.min(1, 0.5 + escala / 2))) }))
    .sort((a, b) => b.contatos * 50 + b.pessoas - (a.contatos * 50 + a.pessoas));
  return { blocos, top };
}

// ---------- Dados reais ----------
function reais(dias: number, site: RespSite | null, metricas: Metrica[], posts: PostR[]): Bloco[] {
  const hoje = hojeSP();
  const desde = menos(hoje, dias - 1);
  const antesDe = menos(hoje, dias * 2 - 1);
  const janela: string[] = []; for (let i = dias - 1; i >= 0; i--) janela.push(menos(hoje, i));
  return ORDEM.map((id) => {
    if (id === 'site') {
      const mapa = new Map((site?.resumo.porDia || []).map((d) => [d.dia, d]));
      return {
        id, ligada: true, temInteracao: false, seguidores: null, novosSeg: null, posts: 0,
        atual: { pessoas: site?.resumo.visitantes || 0, views: site?.resumo.visitas || 0, interacoes: 0, contatos: site?.resumo.conversoes || 0 },
        antes: site ? { pessoas: site.anterior.visitantes, views: site.anterior.visitas, interacoes: 0, contatos: site.anterior.conversoes } : null,
        dias: janela.map((dia) => ({ dia, pessoas: mapa.get(dia)?.visitas || 0, views: mapa.get(dia)?.visitas || 0, interacoes: 0, contatos: mapa.get(dia)?.conversoes || 0 })),
      };
    }
    const m = metricas.filter((x) => x.rede === id);
    const paraTot = (x: Metrica): Tot => ({ pessoas: Number(x.alcance) || 0, views: Number(x.visualizacoes) || 0, interacoes: Number(x.interacoes) || 0, contatos: Number(x.cliques) || 0 });
    const mapa = new Map(m.map((x) => [x.dia, paraTot(x)]));
    const comSeg = m.filter((x) => x.seguidores != null);
    const ultimo = comSeg.at(-1)?.seguidores ?? null;
    const noInicio = comSeg.filter((x) => x.dia < desde).at(-1)?.seguidores ?? comSeg.find((x) => x.dia >= desde)?.seguidores ?? null;
    const antesM = m.filter((x) => x.dia >= antesDe && x.dia < desde);
    return {
      id, ligada: m.length > 0, temInteracao: true,
      atual: somar(m.filter((x) => x.dia >= desde).map(paraTot)),
      antes: antesM.length ? somar(antesM.map(paraTot)) : null,
      dias: janela.map((dia) => ({ dia, ...(mapa.get(dia) || ZERO) })),
      seguidores: ultimo, novosSeg: ultimo != null && noInicio != null ? ultimo - noInicio : null,
      posts: posts.filter((p) => p.quando && p.quando.slice(0, 10) >= desde && p.resultado?.[id]?.ok).length,
    };
  });
}

export default function AcessosTodas() {
  const [dias, setDias] = useState<number>(30);
  const [ex, setEx] = useState(false);
  const [site, setSite] = useState<RespSite | null>(null);
  const [redes, setRedes] = useState<{ metricas: Metrica[]; posts: PostR[] } | null>(null);
  const [erro, setErro] = useState('');
  const [foco, setFoco] = useState<number | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const d = Number(q.get('dias'));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if ([7, 30, 90].includes(d)) setDias(d);
    if (q.get('exemplo') === '1') setEx(true);
  }, []);
  const urlCom = (d: number, e: boolean) => {
    const q = new URLSearchParams();
    if (d !== 30) q.set('dias', String(d));
    if (e) q.set('exemplo', '1');
    window.history.replaceState(null, '', q.toString() ? `?${q}` : window.location.pathname);
  };
  const trocar = (d: number) => { setDias(d); setFoco(null); urlCom(d, ex); };
  const trocarEx = (e: boolean) => { setEx(e); setFoco(null); urlCom(dias, e); };

  useEffect(() => {
    if (ex) return;
    let vivo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSite(null);
    fetchAuth(`/api/site/acessos?dias=${dias}`).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!vivo) return;
      if (!r.ok || !j.ok) { setErro(j.erro || 'Não consegui ler os acessos do site.'); setSite({ resumo: { visitantes: 0, visitas: 0, conversoes: 0, porDia: [] }, anterior: { visitantes: 0, visitas: 0, conversoes: 0 } }); return; }
      setSite({ resumo: j.resumo, anterior: j.anterior });
    });
    return () => { vivo = false; };
  }, [dias, ex]);
  useEffect(() => {
    fetchAuth('/api/site/redes?rede=todas').then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { setErro(j.erro || 'Não consegui ler as redes.'); setRedes({ metricas: [], posts: [] }); return; }
      setRedes({ metricas: j.metricas || [], posts: j.posts || [] });
    });
  }, []);

  const { blocos, top } = useMemo(() => (ex ? exemplo(dias) : { blocos: reais(dias, site, redes?.metricas || [], redes?.posts || []), top: [] as TopPost[] }), [ex, dias, site, redes]);
  const carregando = !ex && (site === null || redes === null);
  const ligados = blocos.filter((b) => b.ligada);
  const tot = somar(ligados.map((b) => b.atual));
  const temAntes = ligados.some((b) => b.antes);
  const totAntes = somar(ligados.map((b) => b.antes || ZERO));
  const novosSeg = ligados.reduce((s, b) => s + (b.novosSeg || 0), 0);

  // dia a dia, rede por rede (barras empilhadas)
  const porDia = (() => {
    const n = blocos[0]?.dias.length || 0;
    return Array.from({ length: n }, (_, i) => ({ dia: blocos[0].dias[i].dia, partes: ligados.map((b) => ({ id: b.id, v: b.dias[i]?.pessoas || 0 })) }))
      .map((d) => ({ ...d, total: d.partes.reduce((s, p) => s + p.v, 0) }));
  })();
  const maxDia = Math.max(1, ...porDia.map((d) => d.total));
  const melhorDia = porDia.reduce<(typeof porDia)[number] | null>((m, d) => (!m || d.total > m.total ? d : m), null);

  // média por dia da semana
  const semana = (() => {
    const s = Array.from({ length: 7 }, () => ({ soma: 0, n: 0 }));
    for (const d of porDia) { const w = semanaDe(d.dia); s[w].soma += d.total; s[w].n++; }
    return s.map((x, w) => ({ w, media: x.n ? Math.round(x.soma / x.n) : 0 }));
  })();
  const maxSemana = Math.max(1, ...semana.map((s) => s.media));
  const melhorSemana = semana.reduce((m, s) => (s.media > m.media ? s : m), semana[0]);

  const lider = [...ligados].sort((a, b) => b.atual.pessoas - a.atual.pessoas)[0];
  const parte = (b: Bloco) => (tot.pessoas ? Math.round((b.atual.pessoas / tot.pessoas) * 100) : 0);
  const quemMaisContato = [...ligados].sort((a, b) => b.atual.contatos - a.atual.contatos)[0];
  const vazio = !carregando && tot.pessoas === 0;

  // José 13/11: "ta ruim de entender" → jeito leigo: uma frase no topo, redes em ranking, cartões com uma conclusão cada; o detalhe abre numa janela.
  type Janela = { tipo: 'rede'; id: RedeId } | { tipo: 'contato' | 'semana' | 'dias' | 'posts' | 'seguidores' };
  const [janela, setJanela] = useState<Janela | null>(null);
  useEffect(() => {
    if (!janela) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setJanela(null); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [janela]);

  const periodo = `Nos últimos ${dias} dias`;
  const comparar = (a: number, b: number | null | undefined) => {
    const v = variacao(a, b);
    if (v == null) return null;
    if (v === 0) return <span style={{ color: T2 }}>igual aos {dias} dias antes</span>;
    return <span style={{ color: v > 0 ? VERDE : VERMELHO }}>{v > 0 ? '▲' : '▼'} {Math.abs(v)}% {v > 0 ? 'a mais' : 'a menos'} que nos {dias} dias antes</span>;
  };
  const ranking = [...blocos].sort((a, b) => (b.ligada ? 1 : 0) - (a.ligada ? 1 : 0) || b.atual.pessoas - a.atual.pessoas);
  const maiorRede = Math.max(1, ...ligados.map((b) => b.atual.pessoas));
  const maisSeg = [...ligados].filter((b) => b.novosSeg).sort((a, b) => (b.novosSeg || 0) - (a.novosSeg || 0));
  const nomeSemana = (w: number) => `${SEMANA[w][0].toUpperCase()}${SEMANA[w].slice(1)}`;

  const barra = (pct: number, cor = COR, alto = 12) => (
    <span style={{ display: 'block', height: alto, background: 'color-mix(in srgb, var(--portal-text, #0f172a) 6%, transparent)', borderRadius: 4, overflow: 'hidden' }}>
      <span style={{ display: 'block', height: '100%', width: `${Math.max(1.5, Math.min(100, pct))}%`, background: cor, borderRadius: 4 }} />
    </span>
  );

  const linhaSimples = (b: Bloco) => {
    const v = b.dias.map((d) => d.pessoas);
    const mx = Math.max(1, ...v);
    const W = 100, H = 40;
    const pts = v.map((y, i) => `${v.length < 2 ? 0 : (i / (v.length - 1)) * W},${H - (y / mx) * (H - 2) - 1}`).join(' ');
    return (
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 90, display: 'block' }} aria-hidden>
        <polyline points={`0,${H} ${pts} ${W},${H}`} fill="color-mix(in srgb, #d97706 14%, transparent)" stroke="none" />
        <polyline points={pts} fill="none" stroke={COR} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    );
  };

  // cartão de conclusão: título é a conclusão, uma frase embaixo, toque abre o detalhe
  const conclusao = (icone: string, titulo: ReactNode, frase: ReactNode, abrir: Janela, logo?: RedeId) => (
    <button type="button" onClick={() => setJanela(abrir)}
      style={{ ...cartaoNP, display: 'grid', gap: 6, alignContent: 'start', textAlign: 'left', font: 'inherit', color: T1, cursor: 'pointer' }}>
      <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: T3 }}>
        {logo ? <LogoRede id={logo} tam={22} /> : <span style={{ color: COR }}>{ic(icone)}</span>}
        <span style={{ marginLeft: 'auto', fontSize: 12.5 }}>ver mais {ic('fa-chevron-right')}</span>
      </span>
      <span style={{ fontSize: 17, lineHeight: 1.3 }}>{titulo}</span>
      <span style={{ fontSize: 13, color: T2, lineHeight: 1.4 }}>{frase}</span>
    </button>
  );

  const quatro = (b: Bloco) => [
    { rot: 'Pessoas que viram', v: b.atual.pessoas, a: b.antes?.pessoas },
    { rot: 'Visualizações', v: b.atual.views, a: b.antes?.views },
    ...(b.temInteracao ? [{ rot: 'Curtidas, comentários e salvos', v: b.atual.interacoes, a: b.antes?.interacoes }] : []),
    { rot: b.id === 'site' ? 'Chamaram ou pediram proposta' : 'Clicaram no link / chamaram', v: b.atual.contatos, a: b.antes?.contatos },
  ];

  const conteudoJanela = () => {
    if (!janela) return null;
    if (janela.tipo === 'rede') {
      const b = blocos.find((x) => x.id === janela.id)!;
      return {
        titulo: <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}><LogoRede id={b.id} tam={30} />{REDE[b.id].nome}</span>,
        corpo: !b.ligada ? (
          <span style={{ display: 'grid', gap: 10, justifyItems: 'start' }}>
            <span style={{ fontSize: 14, color: T2 }}>A conta ainda não foi ligada, então não tem número. Depois de ligada, um robô busca os números todo dia.</span>
            <Link href="/site/conteudo/contas" style={{ ...bt(COR, true), textDecoration: 'none' }}>{ic('fa-link')}Ver como ligar</Link>
          </span>
        ) : (
          <>
            <span style={{ fontSize: 13, color: T3 }}>{periodo}</span>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))' }}>
              {quatro(b).map((q) => (
                <span key={q.rot} style={{ display: 'grid', gap: 2, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 12 }}>
                  <span style={{ fontSize: 12.5, color: T3 }}>{q.rot}</span>
                  <span style={{ fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>{fmt(q.v)}</span>
                  <span style={{ fontSize: 12 }}>{comparar(q.v, q.a)}</span>
                </span>
              ))}
            </div>
            {b.seguidores != null && <span style={{ fontSize: 14, color: T2 }}>{fmt(b.seguidores)} seguidores{b.novosSeg ? `, ${fmt(b.novosSeg)} novos no período` : ''}.</span>}
            <span style={{ fontSize: 13, color: T2 }}>Pessoas por dia</span>
            {linhaSimples(b)}
            <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: T3 }}><span>{b.dias[0] && ddmm(b.dias[0].dia)}</span><span>hoje</span></span>
            <Link href={b.id === 'site' ? '/site/acessos' : `/site/acessos/${b.id}`} style={{ ...bt(COR), textDecoration: 'none', justifySelf: 'start' }}>Abrir a página {b.id === 'site' ? 'do site' : `do ${REDE[b.id].nome}`} {ic('fa-arrow-right')}</Link>
          </>
        ),
      };
    }
    if (janela.tipo === 'contato') {
      const l = [...ligados].sort((a, b) => b.atual.contatos - a.atual.contatos);
      const mx = Math.max(1, ...l.map((b) => b.atual.contatos));
      return {
        titulo: `${fmt(tot.contatos)} contatos ${periodo.toLowerCase()}`,
        corpo: (
          <>
            <span style={{ fontSize: 14, color: T2 }}>Contato é quem chamou no WhatsApp, ligou, pediu proposta no site ou clicou no link das redes. De cada 1.000 pessoas que viram, {tot.pessoas ? (tot.contatos / tot.pessoas * 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : 0} viraram contato.</span>
            {l.map((b) => (
              <span key={b.id} style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: 10, alignItems: 'center' }}>
                <LogoRede id={b.id} tam={28} />
                <span style={{ display: 'grid', gap: 4 }}>
                  <span style={{ display: 'flex', fontSize: 13.5 }}>{REDE[b.id].nome}<span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{fmt(b.atual.contatos)}</span></span>
                  {barra((b.atual.contatos / mx) * 100)}
                </span>
              </span>
            ))}
          </>
        ),
      };
    }
    if (janela.tipo === 'semana') {
      return {
        titulo: `${nomeSemana(melhorSemana.w)} é o dia que mais gente vê`,
        corpo: (
          <>
            <span style={{ fontSize: 14, color: T2 }}>Média de pessoas por dia da semana, somando todas as redes. Solte o post mais importante no dia mais forte.</span>
            {[1, 2, 3, 4, 5, 6, 0].map((w) => (
              <span key={w} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 60px', gap: 10, alignItems: 'center', fontSize: 13.5 }}>
                <span style={{ color: w === melhorSemana.w ? T1 : T2 }}>{nomeSemana(w)}</span>
                {barra((semana[w].media / maxSemana) * 100, w === melhorSemana.w ? COR : 'color-mix(in srgb, #d97706 45%, transparent)')}
                <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T2 }}>{curto(semana[w].media)}</span>
              </span>
            ))}
          </>
        ),
      };
    }
    if (janela.tipo === 'dias') {
      return {
        titulo: melhorDia ? `Melhor dia: ${SEMANA[semanaDe(melhorDia.dia)]}, ${ddmm(melhorDia.dia)}` : 'Pessoas por dia',
        corpo: (
          <>
            <span style={{ fontSize: 14, color: T2 }}>Quantas pessoas viram a Nova Tratores em cada dia, todas as redes somadas. Toque numa barra para ver o número.</span>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: dias > 30 ? 1 : 3, height: 170, borderBottom: '1px solid var(--border)' }}>
              {porDia.map((d, i) => (
                <div key={d.dia} onMouseEnter={() => setFoco(i)} onClick={() => setFoco(i)} style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', cursor: 'default' }}>
                  <div style={{ width: '100%', height: `${(d.total / maxDia) * 100}%`, minHeight: d.total ? 2 : 0, background: foco === i || (foco == null && d === melhorDia) ? '#b45309' : COR, opacity: foco == null || foco === i ? 1 : 0.55, borderRadius: '3px 3px 0 0' }} />
                </div>
              ))}
            </div>
            <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: T3 }}><span>{porDia[0] && ddmm(porDia[0].dia)}</span><span>hoje</span></span>
            {(() => {
              const d = foco != null ? porDia[foco] : melhorDia;
              if (!d) return null;
              return (
                <span style={{ display: 'grid', gap: 6, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 12 }}>
                  <span style={{ fontSize: 14 }}>{nomeSemana(semanaDe(d.dia))}, {ddmm(d.dia)}: {fmt(d.total)} pessoas</span>
                  <span style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, color: T2 }}>
                    {[...d.partes].sort((a, b) => b.v - a.v).map((p) => <span key={p.id} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><LogoRede id={p.id} tam={16} />{fmt(p.v)}</span>)}
                  </span>
                </span>
              );
            })()}
          </>
        ),
      };
    }
    if (janela.tipo === 'seguidores') {
      return {
        titulo: `+${fmt(novosSeg)} seguidores novos`,
        corpo: (
          <>
            <span style={{ fontSize: 14, color: T2 }}>{periodo}, somando as redes.</span>
            {maisSeg.map((b) => (
              <span key={b.id} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14 }}>
                <LogoRede id={b.id} tam={28} />{REDE[b.id].nome}
                <span style={{ marginLeft: 'auto', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>+{fmt(b.novosSeg || 0)}<span style={{ display: 'block', fontSize: 12, color: T3 }}>{fmt(b.seguidores || 0)} no total</span></span>
              </span>
            ))}
          </>
        ),
      };
    }
    return {
      titulo: 'Posts que mais deram resultado',
      corpo: (
        <>
          {top.map((p, i) => (
            <span key={i} style={{ display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr)', gap: 10, alignItems: 'start', paddingTop: i ? 10 : 0, borderTop: i ? '1px solid var(--border)' : 0 }}>
              <LogoRede id={p.rede} tam={28} />
              <span style={{ display: 'grid', gap: 2 }}>
                <span style={{ fontSize: 14 }}>{p.titulo}</span>
                <span style={{ fontSize: 12.5, color: T3 }}>{REDE[p.rede].nome} · {p.formato} · {ddmm(p.dia)}</span>
                <span style={{ fontSize: 13, color: T2 }}>{fmt(p.pessoas)} pessoas viram · {fmt(p.contatos)} viraram contato</span>
              </span>
            </span>
          ))}
        </>
      ),
    };
  };
  const j = conteudoJanela();

  return (
    <div style={{ ...tela, color: T1 }}>
      <SubAbas abas={ABAS_ACESSOS} />
      {erro && !ex && <Aviso>{erro}</Aviso>}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {PERIODOS.map(([d, rot]) => <button key={d} style={{ ...bt(COR, dias === d), minHeight: 36 }} onClick={() => trocar(d)}>{rot}</button>)}
        <span style={{ marginLeft: 'auto' }}>
          {ex
            ? <button style={{ ...bt('#b45309'), minHeight: 36 }} onClick={() => trocarEx(false)}>{ic('fa-xmark')}Sair do exemplo</button>
            : <button style={{ ...bt('#b45309'), minHeight: 36 }} onClick={() => trocarEx(true)}>{ic('fa-eye')}Ver exemplo com dados</button>}
        </span>
      </div>

      {ex && (
        <div style={{ ...cartaoNP, borderColor: '#f59e0b', background: 'color-mix(in srgb, #f59e0b 12%, var(--surface))', fontSize: 14, display: 'flex', gap: 10, alignItems: 'center', padding: '10px 16px' }}>
          <span style={{ color: '#b45309' }}>{ic('fa-flask')}</span>
          <span style={{ color: T2 }}>Exemplo com números inventados, só para ver como fica. Nada disto é real.</span>
        </div>
      )}

      {carregando && <span style={{ color: T3 }}>Carregando…</span>}

      {vazio && !ex && (
        <div style={{ ...cartaoNP, display: 'grid', gap: 10, justifyItems: 'start' }}>
          <span style={{ fontSize: 16 }}>Ainda não tem número para mostrar.</span>
          <span style={{ fontSize: 13.5, color: T3 }}>O site novo ainda não está no ar e as redes ainda não foram ligadas.</span>
          <button style={bt('#b45309', true)} onClick={() => trocarEx(true)}>{ic('fa-eye')}Ver exemplo com dados</button>
        </div>
      )}

      {!vazio && !carregando && (
        <>
          {/* 1. a frase do período */}
          <section style={{ ...cartaoNP, display: 'grid', gap: 8, padding: '20px 22px' }}>
            <span style={{ fontSize: 14, color: T3 }}>{periodo}</span>
            <span style={{ fontSize: 'clamp(20px, 3.2vw, 28px)', lineHeight: 1.25 }}>
              <span style={{ color: COR, fontVariantNumeric: 'tabular-nums' }}>{curto(tot.pessoas)} pessoas</span> viram a Nova Tratores
              {tot.contatos > 0 && <> e <span style={{ color: COR, fontVariantNumeric: 'tabular-nums' }}>{fmt(tot.contatos)}</span> chamaram</>}
            </span>
            {temAntes && <span style={{ fontSize: 14 }}>{comparar(tot.pessoas, totAntes.pessoas)}</span>}
          </section>

          {/* 2. redes em ranking */}
          <section style={{ ...cartaoNP, display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 16, marginBottom: 6 }}>{lider ? `${REDE[lider.id].nome} é a rede que mais traz gente` : 'Rede por rede'}</span>
            {ranking.map((b, i) => (
              <button key={b.id} type="button" onClick={() => setJanela({ tipo: 'rede', id: b.id })}
                style={{ display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr) 16px', gap: 12, alignItems: 'center', padding: '10px 4px', border: 0, borderTop: i ? '1px solid var(--border)' : 0, background: 'transparent', font: 'inherit', color: T1, textAlign: 'left', cursor: 'pointer', opacity: b.ligada ? 1 : 0.55 }}>
                <LogoRede id={b.id} tam={40} />
                <span style={{ display: 'grid', gap: 5, minWidth: 0 }}>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 15 }}>{REDE[b.id].nome}</span>
                    <span style={{ fontSize: 13, color: T2 }}>
                      {b.ligada ? <>{curto(b.atual.pessoas)} pessoas · {fmt(b.atual.contatos)} contatos{tot.pessoas ? ` · ${parte(b)}% do total` : ''}</> : 'conta ainda não ligada'}
                    </span>
                  </span>
                  {b.ligada && barra((b.atual.pessoas / maiorRede) * 100)}
                </span>
                <span style={{ color: T3, fontSize: 12 }}>{ic('fa-chevron-right')}</span>
              </button>
            ))}
          </section>

          {/* 3. conclusões, uma por cartão */}
          <div style={grade(240)}>
            {quemMaisContato && quemMaisContato.atual.contatos > 0 && conclusao('fa-comment-dots',
              <>{REDE[quemMaisContato.id].nome} é quem mais traz contato</>,
              <>{fmt(quemMaisContato.atual.contatos)} dos {fmt(tot.contatos)} contatos vieram {quemMaisContato.id === 'site' ? 'do site' : `do ${REDE[quemMaisContato.id].nome}`}.</>,
              { tipo: 'contato' }, quemMaisContato.id)}
            {melhorSemana.media > 0 && conclusao('fa-calendar-day',
              <>{nomeSemana(melhorSemana.w)} é o melhor dia para postar</>,
              <>Em média {curto(melhorSemana.media)} pessoas nesse dia.</>,
              { tipo: 'semana' })}
            {melhorDia && conclusao('fa-chart-column',
              <>O dia mais forte foi {ddmm(melhorDia.dia)}</>,
              <>{fmt(melhorDia.total)} pessoas num dia só. Toque para ver dia a dia.</>,
              { tipo: 'dias' })}
            {novosSeg > 0 && conclusao('fa-user-plus',
              <>Ganhou {fmt(novosSeg)} seguidores</>,
              <>{maisSeg[0] ? `${REDE[maisSeg[0].id].nome} foi a que mais cresceu.` : ''}</>,
              { tipo: 'seguidores' })}
            {top.length > 0 && conclusao('fa-trophy',
              <>Post campeão: {top[0].titulo}</>,
              <>{fmt(top[0].pessoas)} pessoas viram e {fmt(top[0].contatos)} chamaram.</>,
              { tipo: 'posts' }, top[0].rede)}
          </div>
        </>
      )}

      {j && (
        <div role="dialog" aria-modal="true" onClick={() => { setJanela(null); setFoco(null); }}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 12px', overflowY: 'auto' }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 560, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, display: 'grid', gap: 14, color: T1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18, flex: 1, minWidth: 0 }}>{j.titulo}</span>
              <button type="button" aria-label="Fechar" onClick={() => { setJanela(null); setFoco(null); }} style={{ ...bt('#64748b'), minHeight: 34, padding: '4px 10px' }}>{ic('fa-xmark')}</button>
            </div>
            {j.corpo}
          </div>
        </div>
      )}
    </div>
  );
}
