'use client';
// Acessos → Todas as redes (José, 12/11/2026: "deve mostrar todos os acessos de todas as redes, e com analytics").
// 13/11: logos das redes, apresentação melhor e modo exemplo com números inventados (todas as redes misturadas).
// Dados reais: contador do site (/api/site/acessos) + o que o robô grava de cada rede (site_redes_metricas via /api/site/redes?rede=todas).
// Rede sem conta ligada aparece como "falta ligar" — número inventado só no modo exemplo, com aviso.
import { useEffect, useMemo, useState } from 'react';
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
// Ordem fixa e cores dos gráficos (conferidas no validador de cores, claro e escuro, inclusive daltonismo).
// A cor segue a rede, nunca a posição; a logo vai junto em toda legenda.
const ORDEM: RedeId[] = ['site', 'facebook', 'youtube', 'tiktok', 'instagram'];
const CORG: Record<RedeId, string> = { site: '#d97706', facebook: '#2563eb', youtube: '#dc2626', tiktok: '#059669', instagram: '#9333ea' };
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
  const semConta = blocos.filter((b) => !b.ligada);
  const tot = somar(ligados.map((b) => b.atual));
  const temAntes = ligados.some((b) => b.antes);
  const totAntes = somar(ligados.map((b) => b.antes || ZERO));
  const novosSeg = ligados.reduce((s, b) => s + (b.novosSeg || 0), 0);
  const posts = ligados.reduce((s, b) => s + b.posts, 0);

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

  const seta = (v: number | null, inverso = false) => {
    if (v == null) return <span style={{ fontSize: 12.5, color: T3 }}>sem período anterior</span>;
    const bom = inverso ? v < 0 : v >= 0;
    return (
      <span style={{ fontSize: 12.5, color: bom ? VERDE : VERMELHO, display: 'inline-flex', gap: 4, alignItems: 'center' }}>
        <i className={`fa-solid ${v >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}`} style={{ fontWeight: 900 }} />
        {v >= 0 ? '+' : ''}{v}% <span style={{ color: T3 }}>que os {dias} dias antes</span>
      </span>
    );
  };

  const numero = (icone: string, rotulo: string, valor: number, antes: number | null, detalhe: string) => (
    <section style={{ ...cartaoNP, display: 'grid', gap: 6, alignContent: 'start' }}>
      <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: T2 }}><span style={{ color: COR }}>{ic(icone)}</span>{rotulo}</span>
      <span style={{ fontSize: 28, color: T1, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{carregando ? '…' : curto(valor)}</span>
      {!carregando && seta(variacao(valor, antes))}
      <span style={{ fontSize: 12, color: T3 }}>{detalhe}</span>
    </section>
  );

  const sparkline = (b: Bloco) => {
    const v = b.dias.map((d) => d.pessoas);
    const mx = Math.max(1, ...v);
    const W = 100, H = 30;
    const pts = v.map((y, i) => `${v.length < 2 ? 0 : (i / (v.length - 1)) * W},${H - (y / mx) * (H - 2) - 1}`).join(' ');
    return (
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 34, display: 'block' }} aria-hidden>
        <polyline points={`0,${H} ${pts} ${W},${H}`} fill={`color-mix(in srgb, ${CORG[b.id]} 14%, transparent)`} stroke="none" />
        <polyline points={pts} fill="none" stroke={CORG[b.id]} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    );
  };

  const legenda = (
    <span style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, color: T2 }}>
      {ligados.map((b) => (
        <span key={b.id} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: CORG[b.id] }} />
          <LogoRede id={b.id} tam={16} />{REDE[b.id].nome}
        </span>
      ))}
    </span>
  );

  return (
    <div style={{ ...tela, color: T1 }}>
      <SubAbas abas={ABAS_ACESSOS} />
      {erro && !ex && <Aviso>{erro}</Aviso>}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {PERIODOS.map(([d, rot]) => <button key={d} style={{ ...bt(COR, dias === d), minHeight: 36 }} onClick={() => trocar(d)}>{rot}</button>)}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {ex
            ? <button style={{ ...bt('#b45309'), minHeight: 36 }} onClick={() => trocarEx(false)}>{ic('fa-xmark')}Sair do exemplo</button>
            : <button style={{ ...bt('#b45309'), minHeight: 36 }} onClick={() => trocarEx(true)}>{ic('fa-eye')}Ver exemplo com dados</button>}
        </span>
      </div>

      {ex && (
        <div style={{ ...cartaoNP, borderColor: '#f59e0b', background: 'color-mix(in srgb, #f59e0b 12%, var(--surface))', fontSize: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ color: '#b45309' }}>{ic('fa-flask')}</span>
          <span><span style={{ color: T1 }}>Exemplo com números inventados.</span> <span style={{ color: T2 }}>Só para ver como a tela fica com todas as redes ligadas. Nada disto é real.</span></span>
        </div>
      )}

      {!ex && semConta.length > 0 && (
        <div style={{ ...cartaoNP, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '12px 16px' }}>
          <span style={{ display: 'inline-flex', gap: 4 }}>{semConta.map((b) => <span key={b.id} style={{ opacity: 0.45 }}><LogoRede id={b.id} tam={24} /></span>)}</span>
          <span style={{ fontSize: 13.5, color: T2, flex: '1 1 220px' }}>Ainda sem conta ligada: {semConta.map((b) => REDE[b.id].nome).join(', ')}. Por enquanto só o site conta.</span>
          <Link href="/site/conteudo/contas" style={{ ...bt(COR), textDecoration: 'none', minHeight: 34, padding: '4px 12px' }}>{ic('fa-link')}Ver como ligar</Link>
        </div>
      )}

      {/* números do período */}
      <div style={grade(180)}>
        {numero('fa-users', 'Pessoas alcançadas', tot.pessoas, temAntes ? totAntes.pessoas : null, 'gente diferente que viu a Nova Tratores')}
        {numero('fa-eye', 'Visualizações', tot.views, temAntes ? totAntes.views : null, 'páginas do site + vezes que os posts apareceram')}
        {numero('fa-heart', 'Interações', tot.interacoes, temAntes ? totAntes.interacoes : null, 'curtidas, comentários, salvos e compartilhamentos')}
        {numero('fa-comment-dots', 'Contatos gerados', tot.contatos, temAntes ? totAntes.contatos : null, 'WhatsApp, telefone e proposta + cliques no link')}
        <section style={{ ...cartaoNP, display: 'grid', gap: 6, alignContent: 'start' }}>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: T2 }}><span style={{ color: COR }}>{ic('fa-user-plus')}</span>Seguidores novos</span>
          <span style={{ fontSize: 28, color: T1, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{carregando ? '…' : `+${fmt(novosSeg)}`}</span>
          <span style={{ fontSize: 12.5, color: T3 }}>{posts} posts saíram no período</span>
        </section>
      </div>

      {vazio && !ex && (
        <div style={{ ...cartaoNP, display: 'grid', gap: 10, justifyItems: 'start' }}>
          <span style={{ fontSize: 15 }}>Ainda não tem número para mostrar.</span>
          <span style={{ fontSize: 13.5, color: T3 }}>O site novo ainda não está no ar e as redes ainda não foram ligadas. Quer ver como a tela fica cheia?</span>
          <button style={bt('#b45309', true)} onClick={() => trocarEx(true)}>{ic('fa-eye')}Ver exemplo com dados</button>
        </div>
      )}

      {!vazio && !carregando && (
        <>
          {/* de onde vem o público */}
          <section style={{ ...cartaoNP, display: 'grid', gap: 12 }}>
            <span style={{ fontSize: 16 }}>{lider ? `${REDE[lider.id].nome} trouxe ${parte(lider)}% das pessoas` : 'De onde vem o público'}</span>
            <div style={{ display: 'flex', height: 22, gap: 2, borderRadius: 6, overflow: 'hidden' }}>
              {ligados.filter((b) => b.atual.pessoas > 0).map((b) => (
                <div key={b.id} title={`${REDE[b.id].nome}: ${fmt(b.atual.pessoas)} pessoas (${parte(b)}%)`} style={{ flex: b.atual.pessoas, background: CORG[b.id], minWidth: 3 }} />
              ))}
            </div>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))' }}>
              {ligados.map((b) => (
                <span key={b.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <LogoRede id={b.id} tam={26} />
                  <span style={{ display: 'grid', lineHeight: 1.25 }}>
                    <span style={{ fontSize: 13.5, color: T1 }}>{REDE[b.id].nome} <span style={{ color: T2, fontVariantNumeric: 'tabular-nums' }}>{parte(b)}%</span></span>
                    <span style={{ fontSize: 12, color: T3, fontVariantNumeric: 'tabular-nums' }}>{fmt(b.atual.pessoas)} pessoas</span>
                  </span>
                </span>
              ))}
            </div>
          </section>

          {/* dia a dia empilhado */}
          <section style={{ ...cartaoNP, display: 'grid', gap: 12 }}>
            <span style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <span style={{ fontSize: 16 }}>{melhorDia ? `Melhor dia: ${ddmm(melhorDia.dia)}, com ${fmt(melhorDia.total)} pessoas` : 'Pessoas por dia'}</span>
              <span style={{ fontSize: 12.5, color: T3 }}>todas as redes somadas, dia a dia</span>
            </span>
            {legenda}
            <div style={{ position: 'relative' }} onMouseLeave={() => setFoco(null)}>
              <span style={{ position: 'absolute', top: -2, left: 0, fontSize: 11, color: T3, fontVariantNumeric: 'tabular-nums' }}>{curto(maxDia)}</span>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: dias > 30 ? 1 : 3, height: 190, paddingTop: 16, borderBottom: '1px solid var(--border)' }}>
                {porDia.map((d, i) => (
                  <div key={d.dia} onMouseEnter={() => setFoco(i)} onClick={() => setFoco(foco === i ? null : i)}
                    style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column-reverse', gap: 1, cursor: 'default', opacity: foco == null || foco === i ? 1 : 0.45 }}>
                    {d.partes.map((p, k) => p.v > 0 && (
                      <div key={p.id} style={{ height: `${(p.v / maxDia) * 100}%`, background: CORG[p.id], borderRadius: k === d.partes.length - 1 ? '3px 3px 0 0' : 0, minHeight: 1 }} />
                    ))}
                  </div>
                ))}
              </div>
              {foco != null && porDia[foco] && (
                <div style={{ position: 'absolute', top: 0, [foco > porDia.length / 2 ? 'right' : 'left']: `${foco > porDia.length / 2 ? ((porDia.length - foco - 1) / porDia.length) * 100 : (foco / porDia.length) * 100}%`,
                  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px', boxShadow: '0 8px 24px rgba(0,0,0,.14)', fontSize: 12.5, display: 'grid', gap: 4, minWidth: 170, pointerEvents: 'none', zIndex: 2 }}>
                  <span style={{ color: T1 }}>{SEMANA[semanaDe(porDia[foco].dia)]}, {ddmm(porDia[foco].dia)}</span>
                  {[...porDia[foco].partes].reverse().map((p) => (
                    <span key={p.id} style={{ display: 'flex', gap: 6, alignItems: 'center', color: T2 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: CORG[p.id] }} />{REDE[p.id].nome}
                      <span style={{ marginLeft: 'auto', color: T1, fontVariantNumeric: 'tabular-nums' }}>{fmt(p.v)}</span>
                    </span>
                  ))}
                  <span style={{ display: 'flex', borderTop: '1px solid var(--border)', paddingTop: 4, color: T2 }}>Total<span style={{ marginLeft: 'auto', color: T1, fontVariantNumeric: 'tabular-nums' }}>{fmt(porDia[foco].total)}</span></span>
                </div>
              )}
            </div>
            <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: T3 }}>
              <span>{porDia[0] && ddmm(porDia[0].dia)}</span>
              <span>passe o dedo ou o mouse nas barras</span>
              <span>hoje</span>
            </span>
          </section>

          {/* cartão por rede */}
          <div style={grade(250)}>
            {blocos.map((b) => {
              const r = REDE[b.id];
              const v = variacao(b.atual.pessoas, b.antes?.pessoas);
              return (
                <Link key={b.id} href={b.id === 'site' ? '/site/acessos' : `/site/acessos/${b.id}`}
                  style={{ ...cartaoNP, display: 'grid', gap: 10, alignContent: 'start', textDecoration: 'none', color: T1, opacity: b.ligada ? 1 : 0.6 }}>
                  <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <LogoRede id={b.id} tam={36} />
                    <span style={{ display: 'grid', lineHeight: 1.25 }}>
                      <span style={{ fontSize: 15 }}>{r.nome}</span>
                      <span style={{ fontSize: 12, color: T3 }}>{b.seguidores != null ? `${fmt(b.seguidores)} seguidores${b.novosSeg ? ` · +${fmt(b.novosSeg)}` : ''}` : b.id === 'site' ? 'contador próprio' : 'conta não ligada'}</span>
                    </span>
                    <span style={{ marginLeft: 'auto', color: T3, fontSize: 12 }}>{ic('fa-chevron-right')}</span>
                  </span>
                  {b.ligada ? (
                    <>
                      <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 24, fontVariantNumeric: 'tabular-nums' }}>{curto(b.atual.pessoas)}</span>
                        <span style={{ fontSize: 12.5, color: T3 }}>pessoas</span>
                        {v != null && <span style={{ fontSize: 12.5, color: v >= 0 ? VERDE : VERMELHO, marginLeft: 'auto' }}>{v >= 0 ? '▲' : '▼'} {Math.abs(v)}%</span>}
                      </span>
                      {sparkline(b)}
                      <span style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, fontSize: 12, color: T3 }}>
                        <span style={{ display: 'grid' }}><span style={{ color: T1, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{curto(b.atual.views)}</span>visualizações</span>
                        <span style={{ display: 'grid' }}><span style={{ color: T1, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{b.temInteracao ? curto(b.atual.interacoes) : '—'}</span>interações</span>
                        <span style={{ display: 'grid' }}><span style={{ color: T1, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{fmt(b.atual.contatos)}</span>contatos</span>
                      </span>
                    </>
                  ) : <span style={{ fontSize: 13, color: T3 }}>Os números aparecem aqui quando a conta for ligada.</span>}
                </Link>
              );
            })}
          </div>

          <div style={grade(340)}>
            {/* funil */}
            <section style={{ ...cartaoNP, display: 'grid', gap: 12, alignContent: 'start' }}>
              <span style={{ fontSize: 16 }}>De {curto(tot.pessoas)} pessoas, {fmt(tot.contatos)} viraram contato</span>
              {[
                { rot: 'Viram a Nova Tratores', v: tot.pessoas, ic: 'fa-users' },
                { rot: 'Interagiram', v: tot.interacoes, ic: 'fa-heart' },
                { rot: 'Chamaram ou pediram proposta', v: tot.contatos, ic: 'fa-comment-dots' },
              ].map((e, i, a) => (
                <div key={e.rot} style={{ display: 'grid', gap: 4 }}>
                  <span style={{ display: 'flex', gap: 8, fontSize: 13, color: T2 }}>
                    <span style={{ color: COR }}>{ic(e.ic)}</span>{e.rot}
                    <span style={{ marginLeft: 'auto', color: T1, fontVariantNumeric: 'tabular-nums' }}>{fmt(e.v)}</span>
                  </span>
                  <span style={{ height: 14, background: 'color-mix(in srgb, var(--portal-text, #0f172a) 6%, transparent)', borderRadius: 4, overflow: 'hidden' }}>
                    <span style={{ display: 'block', height: '100%', width: `${Math.max(1, tot.pessoas ? Math.sqrt(e.v / tot.pessoas) * 100 : 0)}%`, background: COR, borderRadius: 4 }} />
                  </span>
                  {i > 0 && <span style={{ fontSize: 11.5, color: T3 }}>{a[i - 1].v ? `${(e.v / a[i - 1].v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% do passo de cima` : ''}</span>}
                </div>
              ))}
              {quemMaisContato && quemMaisContato.atual.contatos > 0 && (
                <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: T2 }}>
                  <LogoRede id={quemMaisContato.id} tam={18} />{REDE[quemMaisContato.id].nome} é quem mais gera contato ({fmt(quemMaisContato.atual.contatos)}).
                </span>
              )}
              <span style={{ fontSize: 11.5, color: T3 }}>Barras em escala que mostra os passos pequenos; o número ao lado é o real.</span>
            </section>

            {/* dia da semana */}
            <section style={{ ...cartaoNP, display: 'grid', gap: 12, alignContent: 'start' }}>
              <span style={{ fontSize: 16 }}>{melhorSemana.media ? `${SEMANA[melhorSemana.w][0].toUpperCase()}${SEMANA[melhorSemana.w].slice(1)} é o dia que mais gente vê` : 'Melhor dia da semana'}</span>
              <div style={{ display: 'grid', gap: 7 }}>
                {[1, 2, 3, 4, 5, 6, 0].map((w) => {
                  const s = semana[w];
                  return (
                    <div key={w} style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 10, alignItems: 'center' }} title={`${SEMANA[w]}: média de ${fmt(s.media)} pessoas`}>
                      <span style={{ fontSize: 13, color: T2 }}>{SEMANA[w].slice(0, 3)}</span>
                      <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ height: 12, width: `${Math.max(1, (s.media / maxSemana) * 100)}%`, maxWidth: 'calc(100% - 60px)', background: w === melhorSemana.w ? COR : 'color-mix(in srgb, #d97706 40%, transparent)', borderRadius: '0 4px 4px 0' }} />
                        <span style={{ fontSize: 12, color: T2, fontVariantNumeric: 'tabular-nums' }}>{curto(s.media)}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
              <span style={{ fontSize: 11.5, color: T3 }}>Média de pessoas por dia, todas as redes. Bom dia para soltar o post mais importante.</span>
            </section>
          </div>

          {/* posts campeões */}
          <section style={{ ...cartaoNP, display: 'grid', gap: 10 }}>
            <span style={{ fontSize: 16 }}>{top.length ? `Post campeão: "${top[0].titulo}"` : 'Posts que mais deram resultado'}</span>
            {top.length === 0 ? (
              <span style={{ fontSize: 13, color: T3 }}>Aparece quando as contas forem ligadas: o robô lê o resultado de cada post e mostra aqui os que mais trouxeram gente e contato.</span>
            ) : (
              <div style={{ display: 'grid' }}>
                {top.map((p, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '22px 30px minmax(0, 1fr) auto', gap: 10, alignItems: 'center', padding: '10px 0', borderTop: i ? '1px solid var(--border)' : 0 }}>
                    <span style={{ fontSize: 13, color: T3, textAlign: 'center' }}>{i + 1}</span>
                    <LogoRede id={p.rede} tam={28} />
                    <span style={{ display: 'grid', minWidth: 0 }}>
                      <span style={{ fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.titulo}</span>
                      <span style={{ fontSize: 12, color: T3 }}>{REDE[p.rede].nome} · {p.formato} · {ddmm(p.dia)}</span>
                    </span>
                    <span style={{ display: 'flex', gap: 14, fontSize: 12, color: T3, textAlign: 'right' }}>
                      <span style={{ display: 'grid' }}><span style={{ color: T1, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{curto(p.pessoas)}</span>pessoas</span>
                      <span style={{ display: 'grid' }}><span style={{ color: T1, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{fmt(p.contatos)}</span>contatos</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* tabela */}
          <section style={{ ...cartaoNP, display: 'grid', gap: 10, overflowX: 'auto' }}>
            <span style={{ fontSize: 16 }}>Rede por rede, em números</span>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 640 }}>
              <thead>
                <tr style={{ color: T3, fontSize: 12.5, textAlign: 'right' }}>
                  <th style={{ textAlign: 'left', fontWeight: 400, padding: '6px 8px' }}>Rede</th>
                  {['Pessoas', 'Visualizações', 'Interações', 'Contatos', 'Seguidores', 'Posts'].map((t) => <th key={t} style={{ fontWeight: 400, padding: '6px 8px' }}>{t}</th>)}
                </tr>
              </thead>
              <tbody>
                {blocos.map((b) => {
                  const c = b.ligada ? [b.atual.pessoas, b.atual.views, b.temInteracao ? b.atual.interacoes : null, b.atual.contatos, b.seguidores, b.id === 'site' ? null : b.posts] : [null, null, null, null, null, null];
                  return (
                    <tr key={b.id} style={{ borderTop: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      <td style={{ textAlign: 'left', padding: '8px' }}>
                        <Link href={b.id === 'site' ? '/site/acessos' : `/site/acessos/${b.id}`} style={{ display: 'inline-flex', gap: 8, alignItems: 'center', color: T1, textDecoration: 'none' }}>
                          <LogoRede id={b.id} tam={20} />{REDE[b.id].nome}{!b.ligada && <span style={{ fontSize: 11.5, color: T3 }}>não ligada</span>}
                        </Link>
                      </td>
                      {c.map((v, i) => <td key={i} style={{ padding: '8px', color: v == null ? T3 : T1 }}>{v == null ? '—' : fmt(v)}</td>)}
                    </tr>
                  );
                })}
                <tr style={{ borderTop: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T2 }}>
                  <td style={{ textAlign: 'left', padding: '8px' }}>Total</td>
                  {[tot.pessoas, tot.views, tot.interacoes, tot.contatos, null, posts].map((v, i) => <td key={i} style={{ padding: '8px' }}>{v == null ? '' : fmt(v)}</td>)}
                </tr>
              </tbody>
            </table>
            <span style={{ fontSize: 12, color: T3 }}>Site: pessoas = aparelhos diferentes, contatos = WhatsApp, telefone e pedido de proposta. Redes: números do robô depois que a conta é ligada (Instagram e Facebook pela Meta; TikTok e YouTube depois da aprovação deles). Toque numa rede para ver o detalhe.</span>
          </section>
        </>
      )}
    </div>
  );
}
