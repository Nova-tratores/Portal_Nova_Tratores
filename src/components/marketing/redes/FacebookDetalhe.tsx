'use client';
// Acessos → Facebook (25/11/2026, José: "quero os antigos posts também"). Lê ao vivo da Meta por
// /api/marketing/redes/facebook: visualizações, alcance, seguidores × não seguidores, orgânico × anúncio
// e TODOS os posts da Página (desde 2022) com os números de cada um. Mesmo desenho do InstagramDetalhe.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAuth } from '@/lib/auth/client';
import type { DetalheFB, PostFB } from '@/lib/marketing/redes/meta-detalhe';
import { REDE } from '@/lib/marketing/redes/redes';
import { Barras, Cartao } from './InstagramDetalhe';
import { T1, T2, T3, bt, cartaoNP, grade, ic } from './np';
import { CartaoPost, JanelaPost, type PostVis } from './PostsRede';

const paraVis = (p: PostFB): PostVis => ({ id: p.id, tipo: p.tipo, quando: p.quando, link: p.link, miniatura: p.miniatura, legenda: p.legenda,
  numeros: [{ rotulo: 'Visualizações', valor: p.visualizacoes }, { rotulo: 'Alcance', valor: p.alcance }, { rotulo: 'Reações', valor: p.reacoes }] });

const COR = REDE.facebook.cor;
const n = (x: number | null | undefined) => (x == null ? '—' : x.toLocaleString('pt-BR'));
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '0%');
const ddmm = (dia: string) => dia.split('-').reverse().slice(0, 2).join('/');

const ORDENS = { visualizacoes: 'Mais vistos', alcance: 'Maior alcance', reacoes: 'Mais reações', quando: 'Mais recentes' } as const;
type Ordem = keyof typeof ORDENS;
const POR_VEZ = 24;

/** Barrinhas por dia (uma série, uma cor); passar o mouse mostra o número. */
function PorDia({ linhas, rotulo }: { linhas: { dia: string; valor: number }[]; rotulo: string }) {
  if (!linhas.length) return null;
  const max = Math.max(1, ...linhas.map((x) => x.valor));
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 70 }}>
        {linhas.map((x) => (
          <div key={x.dia} title={`${ddmm(x.dia)}: ${n(x.valor)} ${rotulo}`} className="np-coluna"
            style={{ flex: 1, height: `${(x.valor / max) * 100}%`, minHeight: 2, borderRadius: '4px 4px 0 0', background: x.valor ? COR : 'var(--border)' }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T3 }}>
        <span>{ddmm(linhas[0].dia)}</span><span>{ddmm(linhas[linhas.length - 1].dia)}</span>
      </div>
    </div>
  );
}

export default function FacebookDetalhe() {
  const [dias, setDias] = useState<7 | 28>(28);
  const [d, setD] = useState<DetalheFB | null>(null);
  const [erro, setErro] = useState('');
  const [ordem, setOrdem] = useState<Ordem>('visualizacoes');
  const [ano, setAno] = useState<string>('todos');
  const [mostrar, setMostrar] = useState(POR_VEZ);
  const [carregando, setCarregando] = useState(false);
  const [aberto, setAberto] = useState<PostVis | null>(null);
  const fechar = useCallback(() => setAberto(null), []);

  const carregar = async (forcar = false) => {
    setCarregando(true);
    const r = await fetchAuth(`/api/marketing/redes/facebook?dias=${dias}${forcar ? '&forcar=1' : ''}`);
    const j = await r.json().catch(() => ({}));
    setCarregando(false);
    if (r.status === 404) { setD(null); setErro(''); return; }
    if (!r.ok || !j.ok) { setErro(j.erro || 'Não consegui falar com o Facebook.'); return; }
    setErro(''); setD(j);
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { carregar(); }, [dias]);

  const anos = useMemo(() => [...new Set((d?.posts || []).map((p) => p.quando.slice(0, 4)))].sort().reverse(), [d]);
  const posts = useMemo(() => {
    const l = (d?.posts || []).filter((p) => ano === 'todos' || p.quando.startsWith(ano));
    if (ordem === 'quando') return l.sort((a, b) => b.quando.localeCompare(a.quando));
    return l.sort((a, b) => (Number(b[ordem]) || 0) - (Number(a[ordem]) || 0));
  }, [d, ordem, ano]);

  if (!d && !erro) return carregando ? <p style={{ color: T3, fontSize: 13 }}>Buscando no Facebook…</p> : null;

  const naoSeg = d?.deSeguidores.find((x) => x.nome === 'Não seguidores')?.valor || 0;
  const totSeg = (d?.deSeguidores || []).reduce((s, x) => s + x.valor, 0);
  const pago = d?.deAnuncio.find((x) => x.nome === 'Anúncio pago')?.valor || 0;
  const totAds = (d?.deAnuncio || []).reduce((s, x) => s + x.valor, 0);
  const liquido = d && d.comecaram != null && d.deixaram != null ? d.comecaram - d.deixaram : null;
  const filtro = (ativo: boolean) => ({ ...bt(COR, ativo), minHeight: 32, padding: '3px 10px', fontSize: 13 });

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 16, color: T1, marginRight: 'auto' }}>Painel do Facebook {d ? <span style={{ color: T3, fontSize: 13 }}>· {d.conta}</span> : null}</span>
        {([7, 28] as const).map((x) => <button key={x} type="button" style={{ ...bt(COR, dias === x), minHeight: 34, padding: '4px 12px' }} onClick={() => setDias(x)}>{x} dias</button>)}
        <button type="button" style={{ ...bt('#64748b'), minHeight: 34, padding: '4px 12px' }} onClick={() => carregar(true)} disabled={carregando} title="Buscar de novo na Meta">
          {ic(carregando ? 'fa-spinner fa-spin' : 'fa-rotate')}Atualizar
        </button>
      </div>
      {erro && <span style={{ fontSize: 13, color: '#dc2626' }}>{erro}</span>}

      {d && (
        <>
          <div style={grade(300)}>
            <Cartao cor={COR} assunto="Visualizações" icone="fa-eye"
              titulo={<>{n(d.visualizacoes)} visualizações e {n(d.alcance)} pessoas alcançadas em {dias} dias</>}>
              <PorDia linhas={d.viewsPorDia} rotulo="visualizações" />
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: T2 }}>
                <span>Visitas à Página: <b style={{ fontWeight: 500, color: T1 }}>{n(d.visitas)}</b></span>
                <span>Interações: <b style={{ fontWeight: 500, color: T1 }}>{n(d.interacoes)}</b></span>
                <span>Vídeo assistido: <b style={{ fontWeight: 500, color: T1 }}>{n(d.videoViews)}</b></span>
              </div>
            </Cartao>

            <Cartao cor={COR} assunto="Quem viu" icone="fa-user-group"
              titulo={totSeg ? <>{pct(naoSeg, totSeg)} das visualizações vieram de quem <b style={{ fontWeight: 500 }}>não segue</b></> : 'Sem visualizações no período'}>
              <Barras cor={COR} linhas={d.deSeguidores} />
              <span style={{ fontSize: 12.5, color: T3 }}>Orgânico ou anúncio</span>
              <Barras cor={COR} linhas={d.deAnuncio} />
              {totAds > 0 && <span style={{ fontSize: 12.5, color: T3 }}>{pago ? `${pct(pago, totAds)} veio de anúncio pago.` : 'Nada veio de anúncio: tudo orgânico.'}</span>}
            </Cartao>

            <Cartao cor={COR} assunto="Seguidores" icone="fa-users"
              titulo={liquido != null ? <>{liquido >= 0 ? '+' : ''}{n(liquido)} seguidores em {dias} dias · total {n(d.seguidores)}</> : <>Total: {n(d.seguidores)}</>}>
              <div style={{ display: 'flex', gap: 16, fontSize: 13, color: T2 }}>
                <span>Começaram a seguir: <b style={{ fontWeight: 500, color: T1 }}>{n(d.comecaram)}</b></span>
                <span>Deixaram de seguir: <b style={{ fontWeight: 500, color: T1 }}>{n(d.deixaram)}</b></span>
              </div>
              <PorDia linhas={d.novosPorDia} rotulo="novo(s)" />
            </Cartao>
          </div>

          <section style={{ ...cartaoNP, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 16, color: T1, marginRight: 'auto' }}>Posts no Facebook <span style={{ color: T3, fontSize: 13 }}>· {posts.length} · toque num post para ver tudo dele</span></span>
              {(Object.keys(ORDENS) as Ordem[]).map((o) => (
                <button key={o} type="button" style={filtro(ordem === o)} onClick={() => { setOrdem(o); setMostrar(POR_VEZ); }}>{ORDENS[o]}</button>
              ))}
            </div>
            {anos.length > 1 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['todos', ...anos].map((a) => (
                  <button key={a} type="button" style={filtro(ano === a)} onClick={() => { setAno(a); setMostrar(POR_VEZ); }}>{a === 'todos' ? 'Todos os anos' : a}</button>
                ))}
              </div>
            )}
            {!posts.length ? <span style={{ fontSize: 13, color: T3 }}>Nenhum post na Página.</span> : (
              <div style={grade(200)}>{posts.slice(0, mostrar).map((p, i) => { const v = paraVis(p); return <CartaoPost key={p.id} p={v} cor={COR} atraso={Math.min(i % POR_VEZ, 12) * 40} onAbrir={() => setAberto(v)} />; })}</div>
            )}
            {posts.length > mostrar && (
              <button type="button" style={{ ...bt(COR), width: 'fit-content', justifySelf: 'center' }} onClick={() => setMostrar((m) => m + POR_VEZ)}>
                {ic('fa-chevron-down')}Ver mais ({posts.length - mostrar})
              </button>
            )}
            <span style={{ fontSize: 12, color: T3 }}>Números de cada post desde que ele saiu (não só do período). Comentários ainda não aparecem: a Meta pede mais uma permissão. Atualizado {new Date(d.atualizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.</span>
          </section>
          {aberto && <JanelaPost rede="facebook" cor={COR} p={aberto} onFechar={fechar} />}
          {d.avisos.length > 0 && <span style={{ fontSize: 12, color: T3 }}>A Meta não mandou: {d.avisos.join(' · ')}</span>}
        </>
      )}
    </div>
  );
}
