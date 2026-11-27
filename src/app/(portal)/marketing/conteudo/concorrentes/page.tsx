'use client';
// Conteúdo → Concorrentes (27/11/2026). José: "ver o que os outros concorrentes estão fazendo para o marketing" ·
// "métricas com o que eles postam e comparar com o nosso" · "a constância, quantidade de post por mês, feed e stories".
// Dados: lib/marketing/rivais/rivais.ts (Instagram, Business Discovery). Stories e alcance de outra conta a Meta não
// entrega: aparecem só para a Nova.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAuth } from '@/lib/auth/client';
import { Aviso, tela, quando } from '@/components/marketing/redes/ui';
import SubAbas from '@/components/marketing/redes/SubAbas';
import { ABAS_CONTEUDO } from '@/components/marketing/redes/abasConteudo';
import { BORDA, FUNDO, T1, T2, T3, Secao, bt, campoNP, cartaoNP, grade, ic } from '@/components/marketing/redes/np';
import type { Analise, Metricas, PostRival } from '@/lib/marketing/rivais/rivais';

type Resp = { ok: boolean; erro?: string; metricas: Metricas[]; analise: { semana: string; analise: Analise; criado_em: string } | null; podeEditar: boolean; ia: boolean };

// cores fixas por tipo de post (sempre na mesma ordem; o texto ao lado diz o que é)
const COR = { foto: '#2563eb', carrossel: '#d97706', reels: '#db2777', stories: '#7c3aed' } as const;
const NOVA = '#d0102b';
const n = (x: number | null | undefined) => (x == null ? '–' : x.toLocaleString('pt-BR'));
const curto = (x: number | null | undefined) => (x == null ? '–' : x >= 1e6 ? `${(x / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : x >= 1e4 ? `${Math.round(x / 1e3)} mil` : x.toLocaleString('pt-BR'));
const MES = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace('.', '');
const NOME_TIPO: Record<string, string> = { FOTO: 'Foto', CARROSSEL: 'Carrossel', REELS: 'Reels', VIDEO: 'Vídeo' };
type Ordem = 'constancia' | 'porSemana' | 'engajamento' | 'seguidores';

export default function Concorrentes() {
  const [d, setD] = useState<Resp | null>(null);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [ocupado, setOcupado] = useState('');
  const [ordem, setOrdem] = useState<Ordem>('constancia');
  const [quem, setQuem] = useState('todos');
  const [novo, setNovo] = useState('');
  const [tipoNovo, setTipoNovo] = useState<'revenda' | 'marca'>('revenda');

  const carregar = useCallback(async () => {
    const r = await fetchAuth('/api/marketing/rivais');
    const j = (await r.json().catch(() => ({}))) as Resp;
    if (!r.ok || !j.ok) { setErro(j.erro || 'Não consegui abrir o radar.'); return; }
    setErro(''); setD(j);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function acao(corpo: Record<string, string>, rotulo: string, feito: string) {
    setOcupado(rotulo); setErro(''); setOk('');
    const r = await fetchAuth('/api/marketing/rivais', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    setOcupado('');
    if (!r.ok || !j.ok) { setErro(j.erro || 'Não deu certo.'); return false; }
    setOk(feito); await carregar(); return true;
  }

  const lista = useMemo(() => {
    const m = (d?.metricas || []).filter((x) => !x.erro && x.seguidores != null);
    return [...m].sort((a, b) => (b[ordem] ?? -1) - (a[ordem] ?? -1));
  }, [d, ordem]);
  const comErro = (d?.metricas || []).filter((x) => x.erro || x.seguidores == null);
  const ultima = (d?.metricas || []).map((x) => x.coletado_em).filter(Boolean).sort().pop();
  const maxMes = Math.max(1, ...lista.flatMap((x) => x.porMes.map((p) => p.total + (p.stories || 0))));
  const mural = useMemo(() => {
    const todos = lista.filter((x) => quem === 'todos' || x.username === quem).flatMap((x) => x.top.map((p) => ({ ...p, nome: x.nome || x.username, nos: x.tipo === 'nos' })));
    return todos.sort((a, b) => ((b.curtidas ?? 0) + (b.comentarios ?? 0)) - ((a.curtidas ?? 0) + (a.comentarios ?? 0))).slice(0, quem === 'todos' ? 12 : 6);
  }, [lista, quem]);

  return (
    <div style={{ ...tela, color: T1 }}>
      <SubAbas abas={ABAS_CONTEUDO} />
      {erro && <Aviso>{erro}</Aviso>}
      {ok && <Aviso tom="info">{ok}</Aviso>}

      <section style={{ ...cartaoNP, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ display: 'grid', gap: 2, flex: '1 1 320px' }}>
          <span style={{ fontSize: 18, fontWeight: 500 }}>{ic('fa-binoculars')} Radar dos concorrentes no Instagram</span>
          <span style={{ fontSize: 13, color: T3 }}>
            O portal lê todo dia, sozinho, o que cada um postou. A IA escreve a análise toda segunda.
            {ultima ? ` Última leitura: ${quando(ultima)}.` : ' Ainda não leu nenhuma vez.'}
          </span>
        </span>
        {d?.podeEditar && <>
          <button type="button" style={bt('#64748b')} disabled={!!ocupado} onClick={() => acao({ acao: 'coletar' }, 'coletar', 'Pronto: números atualizados.')}>
            {ic('fa-rotate')}{ocupado === 'coletar' ? 'Lendo o Instagram…' : 'Ler agora'}
          </button>
          {d.ia && <button type="button" style={bt('#7c3aed', true)} disabled={!!ocupado || lista.length < 2} onClick={() => acao({ acao: 'analisar' }, 'analisar', 'Análise nova pronta (logo abaixo).')}>
            {ic('fa-wand-magic-sparkles')}{ocupado === 'analisar' ? 'A IA está analisando…' : 'Pedir análise da IA'}
          </button>}
        </>}
      </section>

      {!d ? !erro && <p style={{ color: T3 }}>Carregando…</p> : <>
        {d.analise && <AnaliseIA a={d.analise} />}

        <Secao icone="fa-ranking-star" cor={NOVA} titulo="Placar" sub="Últimos 30 dias (mistura dos tipos: 90 dias). A linha vermelha é a Nova Tratores">
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 13, color: T3 }}>
            Ordenar por:
            {([['constancia', 'Constância'], ['porSemana', 'Posts por semana'], ['engajamento', 'Engajamento'], ['seguidores', 'Seguidores']] as [Ordem, string][]).map(([k, t]) => (
              <button key={k} type="button" onClick={() => setOrdem(k)} style={{ ...bt('#0891b2', ordem === k), minHeight: 34, fontSize: 13 }}>{t}</button>
            ))}
          </span>
          {lista.length === 0 && <span style={{ color: T3, fontSize: 14 }}>Ainda sem números. {d.podeEditar ? 'Toque em "Ler agora".' : 'A primeira leitura sai amanhã cedo.'}</span>}
          <div style={{ display: 'grid', gap: 8 }}>
            {lista.map((m) => <Linha key={m.username} m={m} />)}
          </div>
          <span style={{ fontSize: 12.5, color: T3, lineHeight: 1.5 }}>
            <b style={{ fontWeight: 500 }}>Constância</b>: em quantas das últimas 12 semanas postou pelo menos 1 vez.{' '}
            <b style={{ fontWeight: 500 }}>Engajamento</b>: curtidas + comentários de cada post, dividido pelos seguidores. É o jeito justo de comparar a Nova com marcas gigantes.
          </span>
        </Secao>

        <Secao icone="fa-chart-column" cor="#0891b2" titulo="Posts por mês" sub="Últimos 6 meses, separado por tipo. Stories só da Nova: de outras contas a Meta não mostra">
          <span style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12.5, color: T2 }}>
            {([['foto', 'Foto'], ['carrossel', 'Carrossel'], ['reels', 'Reels / vídeo'], ['stories', 'Stories (só Nova)']] as const).map(([k, t]) => (
              <span key={k} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><span style={{ width: 10, height: 10, borderRadius: 3, background: COR[k] }} />{t}</span>
            ))}
          </span>
          <div style={grade(260)}>
            {lista.map((m) => <Meses key={m.username} m={m} max={maxMes} />)}
          </div>
        </Secao>

        <Secao icone="fa-fire" cor="#db2777" titulo="Os posts que mais deram resultado" sub="Últimos 30 dias, por curtidas + comentários. Toque para abrir no Instagram">
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setQuem('todos')} style={{ ...bt('#db2777', quem === 'todos'), minHeight: 34, fontSize: 13 }}>Todos</button>
            {lista.map((m) => <button key={m.username} type="button" onClick={() => setQuem(m.username)} style={{ ...bt(m.tipo === 'nos' ? NOVA : '#db2777', quem === m.username), minHeight: 34, fontSize: 13 }}>{m.nome || m.username}</button>)}
          </span>
          <div style={grade(200)}>
            {mural.map((p) => <CartaoPost key={p.id} p={p} />)}
            {!mural.length && <span style={{ color: T3, fontSize: 14 }}>Nenhum post nos últimos 30 dias.</span>}
          </div>
        </Secao>

        <Secao icone="fa-list-check" cor="#64748b" titulo={`Quem estamos acompanhando (${(d.metricas || []).length})`} sub="Só conta comercial ou de criador abre (perfil pessoal não). As revendas da região entram aqui">
          {d.podeEditar && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input style={{ ...campoNP, flex: '1 1 220px' }} placeholder="@ do Instagram ou link do perfil" value={novo} onChange={(e) => setNovo(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && novo.trim()) acao({ acao: 'adicionar', username: novo, tipo: tipoNovo }, 'adicionar', 'Adicionado e lido.').then((x) => x && setNovo('')); }} />
              {(['revenda', 'marca'] as const).map((t) => <button key={t} type="button" onClick={() => setTipoNovo(t)} style={{ ...bt('#64748b', tipoNovo === t), minHeight: 40 }}>{t === 'revenda' ? 'Revenda' : 'Marca'}</button>)}
              <button type="button" style={bt('#16a34a', true)} disabled={!novo.trim() || !!ocupado} onClick={() => acao({ acao: 'adicionar', username: novo, tipo: tipoNovo }, 'adicionar', 'Adicionado e lido.').then((x) => x && setNovo(''))}>
                {ic('fa-plus')}{ocupado === 'adicionar' ? 'Lendo…' : 'Acompanhar'}
              </button>
            </div>
          )}
          <div style={{ display: 'grid', gap: 6 }}>
            {[...lista, ...comErro].map((m) => (
              <div key={m.username} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '8px 10px', borderRadius: 10, border: `1px solid ${BORDA}` }}>
                <Avatar m={m} tam={30} />
                <span style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <a href={`https://www.instagram.com/${m.username}/`} target="_blank" rel="noreferrer" style={{ color: T1 }}>@{m.username}</a>
                  <span style={{ color: T3, fontSize: 12.5 }}> · {m.tipo === 'nos' ? 'Nova Tratores' : m.tipo === 'marca' ? 'Marca' : 'Revenda'}</span>
                  {m.erro && <span style={{ display: 'block', fontSize: 12.5, color: '#b45309' }}>{ic('fa-triangle-exclamation')} {m.erro}</span>}
                </span>
                {d.podeEditar && m.tipo !== 'nos' && (
                  <button type="button" style={{ ...bt('#dc2626'), minHeight: 34 }} onClick={() => { if (confirm(`Parar de acompanhar @${m.username}? Os posts guardados dele também saem.`)) acao({ acao: 'remover', username: m.username }, 'remover', 'Removido.'); }}>{ic('fa-xmark')}Tirar</button>
                )}
              </div>
            ))}
          </div>
        </Secao>
      </>}
    </div>
  );
}

function Avatar({ m, tam }: { m: Metricas; tam: number }) {
  return (
    <span style={{ width: tam, height: tam, borderRadius: 999, overflow: 'hidden', flex: 'none', display: 'grid', placeItems: 'center', background: 'color-mix(in srgb, #64748b 14%, transparent)', color: T3,
      outline: m.tipo === 'nos' ? `2px solid ${NOVA}` : 'none', outlineOffset: 1 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {m.foto ? <img src={m.foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} /> : ic('fa-user')}
    </span>
  );
}

/** Uma linha do placar: quem + números lado a lado. */
function Linha({ m }: { m: Metricas }) {
  const nos = m.tipo === 'nos';
  const num = (rot: string, val: React.ReactNode, sub?: React.ReactNode) => (
    <span style={{ display: 'grid', gap: 1, minWidth: 92 }}>
      <span style={{ fontSize: 11.5, color: T3 }}>{rot}</span>
      <span style={{ fontSize: 16, fontWeight: 500 }}>{val}</span>
      {sub != null && <span style={{ fontSize: 11.5, color: T3 }}>{sub}</span>}
    </span>
  );
  const corConst = m.constancia >= 90 ? '#16a34a' : m.constancia >= 60 ? '#d97706' : '#dc2626';
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', padding: '12px 14px', borderRadius: 14,
      border: `1px solid ${nos ? `color-mix(in srgb, ${NOVA} 45%, ${BORDA})` : BORDA}`, borderLeft: `4px solid ${nos ? NOVA : 'transparent'}`,
      background: nos ? `color-mix(in srgb, ${NOVA} 5%, ${FUNDO})` : FUNDO }}>
      <span style={{ display: 'flex', gap: 10, alignItems: 'center', flex: '1 1 200px', minWidth: 0 }}>
        <Avatar m={m} tam={40} />
        <span style={{ display: 'grid', minWidth: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.nome || m.username}</span>
          <span style={{ fontSize: 12.5, color: T3 }}>{nos ? 'Nova Tratores' : m.tipo === 'marca' ? 'Marca' : 'Revenda'} · {m.diasSemPostar == null ? 'sem posts' : m.diasSemPostar === 0 ? 'postou hoje' : `último post há ${m.diasSemPostar} dia${m.diasSemPostar === 1 ? '' : 's'}`}</span>
        </span>
      </span>
      {num('Seguidores', curto(m.seguidores), m.cresc7 != null ? `${m.cresc7 >= 0 ? '+' : ''}${n(m.cresc7)} na semana` : 'crescimento: em breve')}
      {num('Posts (30 dias)', n(m.posts30), `${String(m.porSemana).replace('.', ',')} por semana`)}
      <span style={{ display: 'grid', gap: 3, minWidth: 110 }}>
        <span style={{ fontSize: 11.5, color: T3 }}>Constância</span>
        <span style={{ fontSize: 16, fontWeight: 500, color: corConst }}>{m.constancia}%</span>
        <span style={{ height: 6, borderRadius: 99, background: 'color-mix(in srgb, #64748b 15%, transparent)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${m.constancia}%`, background: corConst, borderRadius: 99 }} /></span>
      </span>
      <span style={{ display: 'grid', gap: 3, minWidth: 130 }}>
        <span style={{ fontSize: 11.5, color: T3 }}>O que posta</span>
        <span style={{ display: 'flex', height: 10, borderRadius: 99, overflow: 'hidden', gap: 2, background: 'color-mix(in srgb, #64748b 12%, transparent)' }}>
          {(['foto', 'carrossel', 'reels'] as const).map((k) => m.mix[k] > 0 && <span key={k} title={`${k}: ${m.mix[k]}%`} style={{ width: `${m.mix[k]}%`, background: COR[k] }} />)}
        </span>
        <span style={{ fontSize: 11.5, color: T3 }}>{m.mix.reels}% reels · {m.mix.carrossel}% carrossel · {m.mix.foto}% foto</span>
      </span>
      {num('Engajamento', m.engajamento == null ? '–' : `${String(m.engajamento).replace('.', ',')}%`, `${n(m.mediaCurtidas)} curtidas por post`)}
      {num('Melhor momento', m.melhorDia ? m.melhorDia : '–', m.melhorHora || undefined)}
    </div>
  );
}

/** Colunas dos 6 meses, empilhadas por tipo. */
function Meses({ m, max }: { m: Metricas; max: number }) {
  const nos = m.tipo === 'nos';
  return (
    <div style={{ display: 'grid', gap: 8, padding: '12px 14px', borderRadius: 14, border: `1px solid ${nos ? `color-mix(in srgb, ${NOVA} 45%, ${BORDA})` : BORDA}` }}>
      <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Avatar m={m} tam={24} /><span style={{ fontSize: 14, fontWeight: 500 }}>{m.nome || m.username}</span></span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, alignItems: 'end', height: 120 }}>
        {m.porMes.map((p) => {
          const partes = [['reels', p.reels], ['carrossel', p.carrossel], ['foto', p.feed], ['stories', p.stories || 0]] as const;
          const total = p.total + (p.stories || 0);
          return (
            <span key={p.mes} title={`${MES(p.mes)}: ${p.total} posts (${p.feed} foto, ${p.carrossel} carrossel, ${p.reels} reels)${p.stories != null ? ` + ${p.stories} stories` : ''}`}
              style={{ display: 'grid', gap: 3, alignContent: 'end', height: '100%' }}>
              <span style={{ fontSize: 11.5, textAlign: 'center', color: T2 }}>{total || ''}</span>
              <span style={{ display: 'flex', flexDirection: 'column-reverse', gap: 2, height: `${(total / max) * 86}px`, minHeight: total ? 3 : 0 }}>
                {partes.map(([k, v]) => v > 0 && <span key={k} style={{ flex: v, background: COR[k], borderRadius: 3 }} />)}
              </span>
            </span>
          );
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
        {m.porMes.map((p) => <span key={p.mes} style={{ fontSize: 11.5, textAlign: 'center', color: T3 }}>{MES(p.mes)}</span>)}
      </div>
    </div>
  );
}

function CartaoPost({ p }: { p: PostRival & { nome: string; nos: boolean } }) {
  return (
    <a href={p.link || '#'} target="_blank" rel="noreferrer" style={{ display: 'grid', borderRadius: 14, overflow: 'hidden', border: `1px solid ${p.nos ? `color-mix(in srgb, ${NOVA} 45%, ${BORDA})` : BORDA}`, color: T1, textDecoration: 'none', background: FUNDO }}>
      <span style={{ height: 200, background: 'color-mix(in srgb, #64748b 12%, transparent)', display: 'grid', placeItems: 'center', color: T3, position: 'relative' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {p.imagem ? <img src={p.imagem} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} /> : ic('fa-image')}
        <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 11.5, padding: '2px 8px', borderRadius: 99, background: 'rgba(15,23,42,.72)', color: '#fefefe' }}>{NOME_TIPO[p.tipo || ''] || p.tipo}</span>
      </span>
      <span style={{ display: 'grid', gap: 5, padding: '10px 12px' }}>
        <span style={{ fontSize: 12.5, color: p.nos ? NOVA : T2, fontWeight: 500 }}>{p.nome} · {new Date(p.quando).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
        <span style={{ fontSize: 13, color: T2, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.legenda || 'Sem texto'}</span>
        <span style={{ fontSize: 13, display: 'flex', gap: 12 }}><span>{ic('fa-heart')} {n(p.curtidas)}</span><span>{ic('fa-comment')} {n(p.comentarios)}</span></span>
      </span>
    </a>
  );
}

function AnaliseIA({ a }: { a: { semana: string; analise: Analise; criado_em: string } }) {
  const x = a.analise;
  const bloco = (titulo: string, icone: string, cor: string, filhos: React.ReactNode) => (
    <div style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontSize: 13.5, fontWeight: 500, color: cor }}>{ic(icone)} {titulo}</span>
      {filhos}
    </div>
  );
  const item = (t: React.ReactNode, k: number) => <span key={k} style={{ fontSize: 14, lineHeight: 1.5, color: T1 }}>• {t}</span>;
  return (
    <Secao icone="fa-wand-magic-sparkles" cor="#7c3aed" titulo="O que a IA viu esta semana" sub={`Análise de ${quando(a.criado_em)}. Feita com os números públicos de cada um`}>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55 }}>{x.resumo}</p>
      <div style={grade(300)}>
        {bloco('Destaques dos concorrentes', 'fa-eye', '#0891b2', x.destaques.map((d, k) => item(<><b style={{ fontWeight: 500 }}>{d.quem}:</b> {d.o_que}</>, k)))}
        {bloco('O que está dando resultado', 'fa-fire', '#db2777', x.o_que_funciona.map((t, k) => item(t, k)))}
      </div>
      <div style={{ padding: '12px 14px', borderRadius: 12, background: `color-mix(in srgb, ${NOVA} 6%, ${FUNDO})`, border: `1px solid color-mix(in srgb, ${NOVA} 25%, transparent)` }}>
        {bloco('E a Nova Tratores?', 'fa-flag', NOVA, <span style={{ fontSize: 14, lineHeight: 1.55 }}>{x.nova_comparada}</span>)}
      </div>
      {bloco('Ideias para a Nova', 'fa-lightbulb', '#d97706', x.ideias_para_nova.map((i, k) => item(<><b style={{ fontWeight: 500 }}>{i.ideia}</b> <span style={{ color: T3 }}>({i.por_que})</span></>, k)))}
    </Secao>
  );
}
