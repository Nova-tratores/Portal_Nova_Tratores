'use client';
// Acessos → uma rede (Instagram, Facebook, TikTok, YouTube), 12/11/2026. Lê só o que o robô gravou
// (site_redes_metricas) e os posts do calendário daquela rede. Sem conta ligada, mostra o que já dá para saber
// (quanto foi postado) e o que vai aparecer quando ligar.
import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { fetchAuth } from '@/lib/auth/client';
import { Aviso, tela } from '@/components/marketing/redes/ui';
import SubAbas from '@/components/marketing/redes/SubAbas';
import { ABAS_ACESSOS } from '@/components/marketing/redes/abasAcessos';
import { REDE, STATUS_POST, ehRede, type RedeId, type StatusPost } from '@/lib/marketing/redes/redes';
import { T1, T2, T3, bt, cartaoNP, grade, ic } from '@/components/marketing/redes/np';

type Metrica = { dia: string; seguidores: number | null; alcance: number | null; visualizacoes: number | null; interacoes: number | null; cliques: number | null };
type PostR = { id: string; titulo: string; quando: string | null; status: StatusPost; resultado: Record<string, { ok?: boolean; link?: string | null }> };
const n = (x: number) => x.toLocaleString('pt-BR');

export default function AcessosRede({ params }: { params: Promise<{ rede: string }> }) {
  const { rede: id } = use(params);
  const rede = ehRede(id) && id !== 'site' ? (id as RedeId) : null;
  const [dados, setDados] = useState<{ metricas: Metrica[]; conta: { nome: string | null } | null; posts: PostR[] } | null>(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    if (!rede) return;
    fetchAuth(`/api/marketing/redes?rede=${rede}`).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { setErro(j.erro || 'Não consegui carregar.'); setDados({ metricas: [], conta: null, posts: [] }); return; }
      setDados(j);
    });
  }, [rede]);

  const resumo = useMemo(() => {
    const m = dados?.metricas || [];
    const ult30 = m.slice(-30), ant30 = m.slice(-60, -30);
    const soma = (l: Metrica[], k: keyof Metrica) => l.reduce((s, x) => s + (Number(x[k]) || 0), 0);
    const seg = m.filter((x) => x.seguidores != null);
    const agora = new Date().toISOString();
    const posts = dados?.posts || [];
    return {
      tem: m.length > 0,
      seguidores: seg.at(-1)?.seguidores ?? null,
      ganhou: seg.length > 1 ? (seg.at(-1)!.seguidores! - seg[Math.max(0, seg.length - 31)].seguidores!) : null,
      alcance: soma(ult30, 'alcance'), alcanceAnt: soma(ant30, 'alcance'),
      views: soma(ult30, 'visualizacoes'), interacoes: soma(ult30, 'interacoes'), cliques: soma(ult30, 'cliques'),
      postados: posts.filter((p) => rede && p.resultado?.[rede]?.ok).length,
      marcados: posts.filter((p) => p.quando && p.quando > agora && !(rede && p.resultado?.[rede]?.ok)).length,
      atrasados: posts.filter((p) => p.quando && p.quando < agora && !(rede && p.resultado?.[rede]?.ok)).length,
    };
  }, [dados, rede]);

  if (!rede) return <div style={tela}><SubAbas abas={ABAS_ACESSOS} /><Aviso>Rede desconhecida.</Aviso></div>;
  const r = REDE[rede];
  const cartao = (icone: string, titulo: string, valor: string, sub: string, cor = r.cor) => (
    <section style={{ ...cartaoNP, display: 'grid', gap: 6 }}>
      <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: T2 }}><span style={{ color: cor }}>{ic(icone)}</span>{titulo}</span>
      <span style={{ fontSize: 26, color: T1 }}>{valor}</span>
      <span style={{ fontSize: 12.5, color: T3 }}>{sub}</span>
    </section>
  );

  return (
    <div style={{ ...tela, color: T1 }}>
      <SubAbas abas={ABAS_ACESSOS} />
      {erro && <Aviso>{erro}</Aviso>}
      {dados && !resumo.tem && (
        <span style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, color: T3 }}>
          Alcance, visualizações e seguidores aparecem quando a conta do {r.nome} for ligada.
          <Link href="/marketing/conteudo/contas" style={{ ...bt(r.cor), textDecoration: 'none', minHeight: 34, padding: '4px 12px' }}>{ic('fa-link')}Ver como ligar</Link>
        </span>
      )}
      <div style={grade(200)}>
        {resumo.tem ? (
          <>
            {cartao('fa-users', 'Seguidores', resumo.seguidores != null ? n(resumo.seguidores) : '—', resumo.ganhou != null ? `${resumo.ganhou >= 0 ? '+' : ''}${n(resumo.ganhou)} em 30 dias` : '')}
            {cartao('fa-bullhorn', 'Alcance (30 dias)', n(resumo.alcance), 'pessoas diferentes que viram')}
            {cartao('fa-eye', 'Visualizações (30 dias)', n(resumo.views), 'vezes que os posts apareceram')}
            {cartao('fa-heart', 'Interações (30 dias)', n(resumo.interacoes), 'curtidas, comentários, salvos')}
            {cartao('fa-arrow-pointer', 'Cliques (30 dias)', n(resumo.cliques), 'no link e no WhatsApp')}
          </>
        ) : (
          <>
            {cartao('fa-paper-plane', 'Postados (90 dias)', n(resumo.postados), 'marcados como postados no calendário', '#16a34a')}
            {cartao('fa-clock', 'Marcados para sair', n(resumo.marcados), 'no calendário, daqui para frente', '#7c3aed')}
            {cartao('fa-triangle-exclamation', 'Passou do dia sem postar', n(resumo.atrasados), 'abra no calendário e poste ou mude o dia', resumo.atrasados ? '#d97706' : '#64748b')}
          </>
        )}
      </div>

      <section style={{ ...cartaoNP, display: 'grid', gap: 10 }}>
        <span style={{ fontSize: 16 }}>Posts do calendário no {r.nome}</span>
        {!dados?.posts.length ? <span style={{ fontSize: 13, color: T3 }}>Nenhum post desta rede nos últimos 90 dias.</span> : (
          <div style={{ display: 'grid', gap: 6 }}>
            {dados.posts.map((p) => {
              const ok = p.resultado?.[rede]?.ok;
              const s = ok ? STATUS_POST.publicado : STATUS_POST[p.status] || STATUS_POST.ideia;
              const link = p.resultado?.[rede]?.link;
              return (
                <Link key={p.id} href={`/marketing/conteudo?post=${p.id}`} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', textDecoration: 'none', color: T1 }}>
                  <span style={{ fontSize: 12.5, color: T3, minWidth: 92 }}>{p.quando ? new Date(p.quando).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'sem data'}</span>
                  <span style={{ flex: '1 1 160px', fontSize: 14 }}>{p.titulo}</span>
                  <span style={{ fontSize: 12, color: s.cor }}>{ic(s.icone)} {ok ? 'Postado' : s.nome}</span>
                  {link && <span style={{ fontSize: 12, color: r.cor }}>{ic('fa-arrow-up-right-from-square')}</span>}
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
