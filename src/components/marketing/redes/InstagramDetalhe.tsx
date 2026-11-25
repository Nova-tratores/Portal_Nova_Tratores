'use client';
// Acessos → Instagram (25/11/2026, José: "e cadê os posts" + o painel do app: público, tipo de conteúdo,
// seguidores × não seguidores). Lê ao vivo da Meta por /api/marketing/redes/instagram.
// Gráficos: uma série cada → uma cor só (rosa do Instagram, magnitude), número em texto neutro, sem legenda;
// o título do cartão é a conclusão; passar o mouse mostra o número de cada barra.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchAuth } from '@/lib/auth/client';
import type { DetalheIG, PostIG } from '@/lib/marketing/redes/meta-detalhe';
import { T1, T2, T3, bt, cartaoNP, grade, ic } from './np';

const COR = '#c13584';
const n = (x: number | null | undefined) => (x == null ? '—' : x.toLocaleString('pt-BR'));
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '0%');
type Par = { nome: string; valor: number };

function Barras({ linhas, total, vazio = 'Sem dados.' }: { linhas: Par[]; total?: number; vazio?: string }) {
  const soma = total ?? linhas.reduce((s, l) => s + l.valor, 0);
  const max = Math.max(1, ...linhas.map((l) => l.valor));
  if (!linhas.length) return <span style={{ fontSize: 13, color: T3 }}>{vazio}</span>;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {linhas.map((l) => (
        <div key={l.nome} title={`${l.nome}: ${n(l.valor)} (${pct(l.valor, soma)})`} style={{ display: 'grid', gap: 3 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, color: T1 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.nome}</span>
            <span style={{ flex: 'none', fontVariantNumeric: 'tabular-nums' }}>{n(l.valor)} <span style={{ color: T3 }}>· {pct(l.valor, soma)}</span></span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: 'var(--portal-bg)' }}>
            <div style={{ height: '100%', width: `${(l.valor / max) * 100}%`, borderRadius: 4, background: COR }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Cartao({ assunto, icone, titulo, children, largo }: { assunto: string; icone: string; titulo: ReactNode; children: ReactNode; largo?: boolean }) {
  return (
    <section style={{ ...cartaoNP, display: 'grid', gap: 12, alignContent: 'start', gridColumn: largo ? '1 / -1' : undefined }}>
      <div style={{ display: 'grid', gap: 2 }}>
        <span style={{ fontSize: 12, color: T3, display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ color: COR }}>{ic(icone)}</span>{assunto}</span>
        <span style={{ fontSize: 16, color: T1, lineHeight: 1.35 }}>{titulo}</span>
      </div>
      {children}
    </section>
  );
}

const ORDENS = { visualizacoes: 'Mais vistos', alcance: 'Maior alcance', curtidas: 'Mais curtidos', quando: 'Mais recentes' } as const;
type Ordem = keyof typeof ORDENS;

function CartaoPost({ p }: { p: PostIG }) {
  const num = (icone: string, rotulo: string, v: number | null) => (
    <span title={rotulo} style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 12.5, color: T2, fontVariantNumeric: 'tabular-nums' }}>
      <span style={{ color: T3 }}>{ic(icone)}</span>{n(v)}
    </span>
  );
  return (
    <a href={p.link || undefined} target="_blank" rel="noreferrer"
      style={{ ...cartaoNP, padding: 0, overflow: 'hidden', display: 'grid', gridTemplateRows: 'auto 1fr', textDecoration: 'none', color: T1 }}>
      <div style={{ position: 'relative', aspectRatio: '4 / 5', background: 'var(--portal-bg)' }}>
        {p.miniatura
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={p.miniatura} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: T3 }}>{ic('fa-image')}</span>}
        <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 11.5, padding: '3px 8px', borderRadius: 999, background: 'rgba(0,0,0,.6)', color: '#fff' }}>
          {p.tipo} · {new Date(p.quando).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })}
        </span>
      </div>
      <div style={{ display: 'grid', gap: 8, padding: '10px 12px 12px', alignContent: 'start' }}>
        <span style={{ fontSize: 13, color: T2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.legenda || 'Sem legenda'}</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
          {num('fa-eye', 'Visualizações', p.visualizacoes)}
          {num('fa-bullhorn', 'Alcance (contas diferentes)', p.alcance)}
          {num('fa-heart', 'Curtidas', p.curtidas)}
          {num('fa-comment', 'Comentários', p.comentarios)}
          {num('fa-bookmark', 'Salvos', p.salvos)}
          {num('fa-paper-plane', 'Compartilhamentos', p.compartilhamentos)}
        </div>
      </div>
    </a>
  );
}

export default function InstagramDetalhe() {
  const [dias, setDias] = useState<7 | 30>(30);
  const [d, setD] = useState<DetalheIG | null>(null);
  const [erro, setErro] = useState('');
  const [ordem, setOrdem] = useState<Ordem>('visualizacoes');
  const [carregando, setCarregando] = useState(false);

  const carregar = async (forcar = false) => {
    setCarregando(true);
    const r = await fetchAuth(`/api/marketing/redes/instagram?dias=${dias}${forcar ? '&forcar=1' : ''}`);
    const j = await r.json().catch(() => ({}));
    setCarregando(false);
    if (r.status === 404) { setD(null); setErro(''); return; }
    if (!r.ok || !j.ok) { setErro(j.erro || 'Não consegui falar com o Instagram.'); return; }
    setErro(''); setD(j);
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { carregar(); }, [dias]);

  const posts = useMemo(() => {
    const l = [...(d?.posts || [])];
    if (ordem === 'quando') return l.sort((a, b) => b.quando.localeCompare(a.quando));
    return l.sort((a, b) => (Number(b[ordem]) || 0) - (Number(a[ordem]) || 0));
  }, [d, ordem]);

  if (!d && !erro) return carregando ? <p style={{ color: T3, fontSize: 13 }}>Buscando no Instagram…</p> : null;

  const seg = d?.visualizacoesSeguidor.find((x) => x.nome === 'Seguidores')?.valor || 0;
  const naoSeg = d?.visualizacoesSeguidor.find((x) => x.nome === 'Não seguidores')?.valor || 0;
  const liquido = d && d.comecaram != null && d.deixaram != null ? d.comecaram - d.deixaram : null;
  const maxNovo = Math.max(1, ...(d?.novosPorDia || []).map((x) => x.valor));
  const topGenero = d?.genero[0];
  const topIdade = d ? [...d.idade].sort((a, b) => b.valor - a.valor)[0] : undefined;
  const totalGenero = (d?.genero || []).reduce((s, x) => s + x.valor, 0);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 16, color: T1, marginRight: 'auto' }}>Painel do Instagram {d ? <span style={{ color: T3, fontSize: 13 }}>· {d.conta}</span> : null}</span>
        {([7, 30] as const).map((x) => <button key={x} type="button" style={{ ...bt(COR, dias === x), minHeight: 34, padding: '4px 12px' }} onClick={() => setDias(x)}>{x} dias</button>)}
        <button type="button" style={{ ...bt('#64748b'), minHeight: 34, padding: '4px 12px' }} onClick={() => carregar(true)} disabled={carregando} title="Buscar de novo na Meta">
          {ic(carregando ? 'fa-spinner fa-spin' : 'fa-rotate')}Atualizar
        </button>
      </div>
      {erro && <span style={{ fontSize: 13, color: '#dc2626' }}>{erro}</span>}

      {d && (
        <>
          <div style={grade(300)}>
            <Cartao assunto="Quem viu" icone="fa-eye"
              titulo={seg + naoSeg ? <>{pct(naoSeg, seg + naoSeg)} das visualizações vieram de quem <b style={{ fontWeight: 500 }}>não segue</b></> : 'Sem visualizações no período'}>
              <span style={{ fontSize: 12.5, color: T3 }}>Visualizações ({n(d.visualizacoes)} no total)</span>
              <Barras linhas={d.visualizacoesSeguidor.filter((x) => x.nome !== 'Sem saber')} total={d.visualizacoes ?? undefined} />
              <span style={{ fontSize: 12.5, color: T3 }}>Contas alcançadas ({n(d.alcance)} pessoas diferentes)</span>
              <Barras linhas={d.alcanceSeguidor.filter((x) => x.nome !== 'Sem saber')} total={d.alcance ?? undefined} />
            </Cartao>

            <Cartao assunto="Visualizações por tipo de conteúdo" icone="fa-layer-group"
              titulo={d.porTipo[0] ? <>{d.porTipo[0].nome} trazem {pct(d.porTipo[0].valor, d.porTipo.reduce((s, x) => s + x.valor, 0))} das visualizações</> : 'Sem visualizações no período'}>
              <Barras linhas={d.porTipo} />
              <span style={{ fontSize: 12.5, color: T3 }}>Stories somem em 24 h, por isso só aparecem aqui no total (não na lista de posts).</span>
            </Cartao>

            <Cartao assunto="Seguidores" icone="fa-users"
              titulo={liquido != null ? <>{liquido >= 0 ? '+' : ''}{n(liquido)} seguidores em {dias} dias · total {n(d.seguidores)}</> : <>Total: {n(d.seguidores)}</>}>
              <div style={{ display: 'flex', gap: 16, fontSize: 13, color: T2 }}>
                <span>Começaram a seguir: <b style={{ fontWeight: 500, color: T1 }}>{n(d.comecaram)}</b></span>
                <span>Deixaram de seguir: <b style={{ fontWeight: 500, color: T1 }}>{n(d.deixaram)}</b></span>
              </div>
              {d.novosPorDia.length > 0 && (
                <div style={{ display: 'grid', gap: 4 }}>
                  <span style={{ fontSize: 12.5, color: T3 }}>Novos seguidores por dia</span>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 70 }}>
                    {d.novosPorDia.map((x) => (
                      <div key={x.dia} title={`${x.dia.split('-').reverse().slice(0, 2).join('/')}: ${x.valor} novo(s)`}
                        style={{ flex: 1, height: `${(x.valor / maxNovo) * 100}%`, minHeight: 2, borderRadius: '4px 4px 0 0', background: x.valor ? COR : 'var(--border)' }} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T3 }}>
                    <span>{d.novosPorDia[0].dia.split('-').reverse().slice(0, 2).join('/')}</span>
                    <span>{d.novosPorDia[d.novosPorDia.length - 1].dia.split('-').reverse().slice(0, 2).join('/')}</span>
                  </div>
                </div>
              )}
            </Cartao>

            <Cartao assunto="Público (quem segue)" icone="fa-user-group"
              titulo={topGenero && topIdade ? <>Maioria {topGenero.nome.toLowerCase()} ({pct(topGenero.valor, totalGenero)}), de {topIdade.nome} anos</> : 'Sem dados de público'}>
              <Barras linhas={d.genero} />
              <span style={{ fontSize: 12.5, color: T3 }}>Faixa etária</span>
              <Barras linhas={d.idade} />
            </Cartao>

            <Cartao assunto="De onde são os seguidores" icone="fa-location-dot"
              titulo={d.cidades[0] ? <>Mais seguidores em {d.cidades[0].nome}</> : 'Sem dados de cidade'}>
              <Barras linhas={d.cidades.slice(0, 10)} total={d.seguidores ?? undefined} />
              {d.paises.length > 1 && <span style={{ fontSize: 12.5, color: T3 }}>Países: {d.paises.slice(0, 4).map((p) => `${p.nome} ${n(p.valor)}`).join(' · ')}</span>}
            </Cartao>
          </div>

          <section style={{ ...cartaoNP, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 16, color: T1, marginRight: 'auto' }}>Posts no Instagram <span style={{ color: T3, fontSize: 13 }}>· {d.posts.length} · toque para abrir</span></span>
              {(Object.keys(ORDENS) as Ordem[]).map((o) => (
                <button key={o} type="button" style={{ ...bt(COR, ordem === o), minHeight: 32, padding: '3px 10px', fontSize: 13 }} onClick={() => setOrdem(o)}>{ORDENS[o]}</button>
              ))}
            </div>
            {!posts.length ? <span style={{ fontSize: 13, color: T3 }}>Nenhum post na conta.</span> : (
              <div style={grade(200)}>{posts.map((p) => <CartaoPost key={p.id} p={p} />)}</div>
            )}
            <span style={{ fontSize: 12, color: T3 }}>Números de cada post desde que ele saiu (não só do período). Atualizado {new Date(d.atualizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.</span>
          </section>
          {d.avisos.length > 0 && <span style={{ fontSize: 12, color: T3 }}>A Meta não mandou: {d.avisos.join(' · ')}</span>}
        </>
      )}
    </div>
  );
}
