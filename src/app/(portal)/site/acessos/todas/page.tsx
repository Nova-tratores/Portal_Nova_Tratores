'use client';
// Acessos → Todas as redes (José, 12/11/2026: "deve mostrar todos os acessos de todas as redes, e com analytics").
// Junta o contador do site (/api/site/acessos) com o que o robô grava de cada rede (site_redes_metricas via /api/site/redes?rede=todas).
// Rede sem conta ligada aparece como "falta ligar" — sem número inventado.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { fetchAuth } from '@/lib/auth/client';
import { Aviso, tela } from '@/components/site/ui';
import SubAbas from '@/components/site/SubAbas';
import { ABAS_ACESSOS } from '@/components/site/abasAcessos';
import { IconeRede } from '@/components/site/Artes';
import { REDE, REDES, type RedeId } from '@/lib/site/redes';
import { T1, T2, T3, bt, cartaoNP, grade, ic } from '@/components/site/np';

type Metrica = { rede: RedeId; dia: string; seguidores: number | null; alcance: number | null; visualizacoes: number | null; interacoes: number | null; cliques: number | null };
type PostR = { id: string; quando: string | null; redes: RedeId[]; resultado: Record<string, { ok?: boolean }> };
type ResumoSite = { visitantes: number; visitas: number; conversoes: number; porDia: { dia: string; visitas: number; conversoes: number }[] };
type Linha = { id: RedeId; ligada: boolean; pessoas: number | null; views: number | null; interacoes: number | null; contatos: number | null; seguidores: number | null; posts: number | null };

const COR = '#d97706';
const n = (x: number | null) => (x == null ? '—' : x.toLocaleString('pt-BR'));
const hojeSP = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const menos = (d: string, k: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() - k); return x.toISOString().slice(0, 10); };
const PERIODOS = [[7, '7 dias'], [30, '30 dias'], [90, '90 dias']] as const;

export default function AcessosTodas() {
  const [dias, setDias] = useState<number>(30);
  const [site, setSite] = useState<ResumoSite | null>(null);
  const [redes, setRedes] = useState<{ metricas: Metrica[]; posts: PostR[] } | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const d = Number(new URLSearchParams(window.location.search).get('dias'));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if ([7, 30, 90].includes(d)) setDias(d);
  }, []);
  const trocar = (d: number) => { setDias(d); window.history.replaceState(null, '', d === 30 ? window.location.pathname : `?dias=${d}`); };

  useEffect(() => {
    let vivo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSite(null);
    fetchAuth(`/api/site/acessos?dias=${dias}`).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!vivo) return;
      if (!r.ok || !j.ok) { setErro(j.erro || 'Não consegui ler os acessos do site.'); setSite({ visitantes: 0, visitas: 0, conversoes: 0, porDia: [] }); return; }
      setSite(j.resumo);
    });
    return () => { vivo = false; };
  }, [dias]);
  useEffect(() => {
    fetchAuth('/api/site/redes?rede=todas').then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { setErro(j.erro || 'Não consegui ler as redes.'); setRedes({ metricas: [], posts: [] }); return; }
      setRedes({ metricas: j.metricas || [], posts: j.posts || [] });
    });
  }, []);

  const desde = menos(hojeSP(), dias - 1);
  const linhas: Linha[] = useMemo(() => {
    const m = (redes?.metricas || []).filter((x) => x.dia >= desde);
    const soma = (id: RedeId, k: keyof Metrica) => m.filter((x) => x.rede === id).reduce((s, x) => s + (Number(x[k]) || 0), 0);
    return REDES.map((r) => {
      if (r.id === 'site') return { id: r.id, ligada: true, pessoas: site?.visitantes ?? null, views: site?.visitas ?? null, interacoes: null, contatos: site?.conversoes ?? null, seguidores: null, posts: null };
      const tem = (redes?.metricas || []).some((x) => x.rede === r.id);
      const seg = (redes?.metricas || []).filter((x) => x.rede === r.id && x.seguidores != null).at(-1)?.seguidores ?? null;
      const posts = (redes?.posts || []).filter((p) => p.quando && p.quando.slice(0, 10) >= desde && p.resultado?.[r.id]?.ok).length;
      return { id: r.id, ligada: tem, pessoas: tem ? soma(r.id, 'alcance') : null, views: tem ? soma(r.id, 'visualizacoes') : null,
        interacoes: tem ? soma(r.id, 'interacoes') : null, contatos: tem ? soma(r.id, 'cliques') : null, seguidores: seg, posts };
    });
  }, [redes, site, desde]);

  const total = (k: 'pessoas' | 'views' | 'contatos' | 'posts') => linhas.reduce((s, l) => s + (l[k] || 0), 0);
  const comNumero = linhas.filter((l) => l.pessoas != null);
  const semConta = linhas.filter((l) => !l.ligada);
  const maior = Math.max(1, ...comNumero.map((l) => l.pessoas || 0));

  // pessoas por dia, tudo somado (site = visitas do dia; redes = alcance do dia)
  const porDia = useMemo(() => {
    const mapa = new Map<string, number>();
    for (let i = dias - 1; i >= 0; i--) mapa.set(menos(hojeSP(), i), 0);
    for (const d of site?.porDia || []) if (mapa.has(d.dia)) mapa.set(d.dia, mapa.get(d.dia)! + d.visitas);
    for (const x of redes?.metricas || []) if (mapa.has(x.dia)) mapa.set(x.dia, mapa.get(x.dia)! + (Number(x.alcance) || 0));
    return [...mapa].map(([dia, v]) => ({ dia, v }));
  }, [site, redes, dias]);
  const maxDia = Math.max(1, ...porDia.map((d) => d.v));
  const carregando = site === null || redes === null;

  const numero = (icone: string, rotulo: string, valor: number, detalhe: string) => (
    <section style={{ ...cartaoNP, display: 'grid', gap: 4 }}>
      <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: T2 }}><span style={{ color: COR }}>{ic(icone)}</span>{rotulo}</span>
      <span style={{ fontSize: 26, color: T1, fontVariantNumeric: 'tabular-nums' }}>{carregando ? '…' : valor.toLocaleString('pt-BR')}</span>
      <span style={{ fontSize: 12.5, color: T3 }}>{detalhe}</span>
    </section>
  );

  return (
    <div style={{ ...tela, color: T1 }}>
      <SubAbas abas={ABAS_ACESSOS} />
      {erro && <Aviso>{erro}</Aviso>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {PERIODOS.map(([d, rot]) => <button key={d} style={{ ...bt(COR, dias === d), minHeight: 36 }} onClick={() => trocar(d)}>{rot}</button>)}
        {semConta.length > 0 && (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, color: T3 }}>
            Sem conta ligada: {semConta.map((l) => REDE[l.id].nome).join(', ')}
            <Link href="/site/conteudo/contas" style={{ ...bt(COR), textDecoration: 'none', minHeight: 34, padding: '4px 12px' }}>{ic('fa-link')}Ver como ligar</Link>
          </span>
        )}
      </div>

      <div style={grade(210)}>
        {numero('fa-users', 'Pessoas alcançadas', total('pessoas'), `somando ${comNumero.map((l) => REDE[l.id].nome).join(', ')}`)}
        {numero('fa-eye', 'Visualizações', total('views'), 'páginas do site + vezes que os posts apareceram')}
        {numero('fa-comment-dots', 'Contatos gerados', total('contatos'), 'WhatsApp, telefone e proposta pelo site + cliques no link das redes')}
        {numero('fa-paper-plane', 'Posts que saíram', total('posts'), 'marcados como postados no calendário')}
      </div>

      <div style={grade(340)}>
        <section style={{ ...cartaoNP, display: 'grid', gap: 12, alignContent: 'start' }}>
          <span style={{ fontSize: 16 }}>Quem trouxe mais gente</span>
          <div style={{ display: 'grid', gap: 10 }}>
            {linhas.map((l) => {
              const r = REDE[l.id];
              return (
                <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 10, alignItems: 'center' }} title={l.pessoas == null ? `${r.nome}: conta não ligada` : `${r.nome}: ${n(l.pessoas)} pessoas`}>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, color: T1 }}><IconeRede id={l.id} tam={14} />{r.nome}</span>
                  {l.pessoas == null ? <span style={{ fontSize: 12.5, color: T3 }}>falta ligar a conta</span> : (
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ height: 14, width: `${Math.max(1.5, ((l.pessoas || 0) / maior) * 100)}%`, background: r.cor, borderRadius: '0 4px 4px 0', maxWidth: 'calc(100% - 64px)' }} />
                      <span style={{ fontSize: 13, color: T2, fontVariantNumeric: 'tabular-nums' }}>{n(l.pessoas)}</span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section style={{ ...cartaoNP, display: 'grid', gap: 12, alignContent: 'start' }}>
          <span style={{ fontSize: 16 }}>Pessoas por dia, todas as redes somadas</span>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: dias > 30 ? 1 : 3, height: 150, borderBottom: '1px solid var(--border)' }}>
            {porDia.map((d) => (
              <div key={d.dia} title={`${d.dia.slice(8)}/${d.dia.slice(5, 7)}: ${d.v.toLocaleString('pt-BR')} pessoas`}
                style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', cursor: 'default' }}>
                <div style={{ width: '100%', height: `${(d.v / maxDia) * 100}%`, minHeight: d.v ? 2 : 0, background: COR, borderRadius: '4px 4px 0 0' }} />
              </div>
            ))}
          </div>
          <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: T3 }}>
            <span>{porDia[0] && `${porDia[0].dia.slice(8)}/${porDia[0].dia.slice(5, 7)}`}</span>
            <span>maior dia: {maxDia > 1 ? maxDia.toLocaleString('pt-BR') : '0'}</span>
            <span>hoje</span>
          </span>
        </section>
      </div>

      <section style={{ ...cartaoNP, display: 'grid', gap: 10, overflowX: 'auto' }}>
        <span style={{ fontSize: 16 }}>Rede por rede</span>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 640 }}>
          <thead>
            <tr style={{ color: T3, fontSize: 12.5, textAlign: 'right' }}>
              <th style={{ textAlign: 'left', fontWeight: 400, padding: '6px 8px' }}>Rede</th>
              {['Pessoas', 'Visualizações', 'Interações', 'Contatos / cliques', 'Seguidores', 'Posts'].map((t) => <th key={t} style={{ fontWeight: 400, padding: '6px 8px' }}>{t}</th>)}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id} style={{ borderTop: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                <td style={{ textAlign: 'left', padding: '8px' }}>
                  <Link href={l.id === 'site' ? '/site/acessos' : `/site/acessos/${l.id}`} style={{ display: 'inline-flex', gap: 8, alignItems: 'center', color: T1, textDecoration: 'none' }}>
                    <IconeRede id={l.id} tam={14} />{REDE[l.id].nome}{!l.ligada && <span style={{ fontSize: 11.5, color: T3 }}>não ligada</span>}
                  </Link>
                </td>
                {[l.pessoas, l.views, l.interacoes, l.contatos, l.seguidores, l.posts].map((v, i) => <td key={i} style={{ padding: '8px', color: v == null ? T3 : T1 }}>{n(v)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        <span style={{ fontSize: 12, color: T3 }}>Site: pessoas = aparelhos diferentes, contatos = WhatsApp, telefone e pedido de proposta. Redes: números do robô depois que a conta é ligada (Instagram e Facebook pela Meta; TikTok e YouTube depois da aprovação deles). Toque numa rede para ver o detalhe.</span>
      </section>
    </div>
  );
}
