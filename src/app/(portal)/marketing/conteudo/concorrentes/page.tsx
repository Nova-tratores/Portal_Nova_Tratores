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
import { ATENCAO, BOM, BORDA, CAFES, FUNDO, INFO, MARCA, NEUTRO, SUP2, T1, T2, T3, Secao, bt, campoNP, cartaoNP, grade, ic } from '@/components/marketing/redes/np';
import type { Analise, Metricas, PostRival } from '@/lib/marketing/rivais/rivais';

type Resp = { ok: boolean; erro?: string; metricas: Metricas[]; analise: { semana: string; analise: Analise; criado_em: string } | null; podeEditar: boolean; ia: boolean };

// cores fixas por tipo de post (sempre na mesma ordem; o texto ao lado diz o que é)
// 27/11/2026 (docs/design-marketing.md): tipos em tons de café; stories (só da Nova) na cor da marca, como a Nova nos gráficos
const COR = { foto: CAFES[4], carrossel: CAFES[2], reels: CAFES[0], stories: MARCA } as const;
const NOVA = MARCA;
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
  const [fazendo, setFazendo] = useState('');

  /** "Fazer a nossa versão": cria a ideia no calendário com o post deles anexado e abre o post novo. */
  async function fazerVersao(postId: string) {
    setFazendo(postId); setErro('');
    const r = await fetchAuth('/api/marketing/rivais', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'nossa_versao', post: postId }) });
    const j = await r.json().catch(() => ({}));
    setFazendo('');
    if (!r.ok || !j.ok) { setErro(j.erro || 'Não consegui criar a ideia.'); return; }
    window.location.assign(`/marketing/conteudo?post=${j.postId}`);
  }

  const carregar = useCallback(async () => {
    const r = await fetchAuth('/api/marketing/rivais');
    const j = (await r.json().catch(() => ({}))) as Resp;
    if (!r.ok || !j.ok) { setErro(j.erro || 'Não consegui abrir o radar.'); return; }
    setErro(''); setD(j);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
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
    const ia = new Map((d?.analise?.analise.destaques || []).filter((x) => x.link).map((x) => [x.link as string, x]));
    const todos = lista.filter((x) => x.tipo !== 'nos' && (quem === 'todos' || x.username === quem))
      .flatMap((x) => x.top.map((p) => ({ ...p, nome: x.nome || x.username, nos: false, destaque: p.link ? ia.get(p.link) : undefined })));
    const pontos = (p: { curtidas: number | null; comentarios: number | null; destaque?: unknown }) => (p.destaque ? 1e9 : 0) + (p.curtidas ?? 0) + (p.comentarios ?? 0) * 3;
    return todos.sort((a, b) => pontos(b) - pontos(a)).slice(0, quem === 'todos' ? 12 : 6);
  }, [lista, quem, d]);

  return (
    <div style={{ ...tela, color: T1 }}>
      <SubAbas abas={ABAS_CONTEUDO} />
      {erro && <Aviso>{erro}</Aviso>}
      {ok && <Aviso tom="info">{ok}</Aviso>}

      <section style={{ ...cartaoNP, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ display: 'grid', gap: 2, flex: '1 1 320px' }}>
          <span style={{ fontSize: 24, fontWeight: 600 }}>{ic('fa-binoculars')} Radar dos concorrentes no Instagram</span>
          <span style={{ fontSize: 13, color: T3 }}>
            O portal lê todo dia, sozinho, o que cada um postou. A IA escreve a análise toda segunda.
            {ultima ? ` Última leitura: ${quando(ultima)}.` : ' Ainda não leu nenhuma vez.'}
          </span>
        </span>
        {d?.podeEditar && <>
          <button type="button" style={bt(NEUTRO)} disabled={!!ocupado} onClick={() => acao({ acao: 'coletar' }, 'coletar', 'Pronto: números atualizados.')}>
            {ic('fa-rotate')}{ocupado === 'coletar' ? 'Lendo o Instagram…' : 'Ler agora'}
          </button>
          {d.ia && <button type="button" style={bt(NEUTRO)} disabled={!!ocupado || lista.length < 2} onClick={() => acao({ acao: 'analisar' }, 'analisar', 'Análise nova pronta (logo abaixo).')}>
            {ic('fa-wand-magic-sparkles')}{ocupado === 'analisar' ? 'A IA está analisando…' : 'Pedir análise da IA'}
          </button>}
        </>}
      </section>

      {!d ? !erro && <p style={{ color: T3 }}>Carregando…</p> : <>
        {lista.some((m) => m.tipo === 'nos') && lista.length > 1 && <Tira lista={lista} />}

        <Secao icone="fa-fire" titulo="O que bombou nos concorrentes" sub={d.analise?.analise.manchete || 'Últimos 30 dias. Toque na imagem para abrir no Instagram'}>
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setQuem('todos')} style={{ ...bt(quem === 'todos' ? MARCA : NEUTRO, quem === 'todos'), minHeight: 34, fontSize: 13 }}>Todos</button>
            {lista.filter((m) => m.tipo !== 'nos').map((m) => <button key={m.username} type="button" onClick={() => setQuem(m.username)} style={{ ...bt(quem === m.username ? MARCA : NEUTRO, quem === m.username), minHeight: 34, fontSize: 13 }}>{m.nome || m.username}</button>)}
          </span>
          <div style={grade(210)}>
            {mural.map((p) => <CartaoPost key={p.id} p={p} onVersao={d.podeEditar ? () => fazerVersao(p.id) : undefined} fazendo={fazendo === p.id} />)}
            {!mural.length && <span style={{ color: T3, fontSize: 15 }}>Nenhum post nos últimos 30 dias.</span>}
          </div>
        </Secao>

        <Secao icone="fa-ranking-star" titulo="Placar" sub="Últimos 30 dias (mistura dos tipos: 90 dias). A linha vermelha é a Nova Tratores">
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 13, color: T3 }}>
            Ordenar por:
            {([['constancia', 'Constância'], ['porSemana', 'Posts por semana'], ['engajamento', 'Engajamento'], ['seguidores', 'Seguidores']] as [Ordem, string][]).map(([k, t]) => (
              <button key={k} type="button" onClick={() => setOrdem(k)} style={{ ...bt(ordem === k ? MARCA : NEUTRO, ordem === k), minHeight: 34, fontSize: 13 }}>{t}</button>
            ))}
          </span>
          {lista.length === 0 && <span style={{ color: T3, fontSize: 15 }}>Ainda sem números. {d.podeEditar ? 'Toque em "Ler agora".' : 'A primeira leitura sai amanhã cedo.'}</span>}
          <div style={{ display: 'grid', gap: 8 }}>
            {lista.map((m) => <Linha key={m.username} m={m} />)}
          </div>
        </Secao>

        <Secao icone="fa-chart-column" titulo="Posts por mês" sub="Últimos 6 meses, separado por tipo. Stories só da Nova: de outras contas a Meta não mostra">
          <span style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 13, color: T2 }}>
            {([['foto', 'Foto'], ['carrossel', 'Carrossel'], ['reels', 'Reels / vídeo'], ['stories', 'Stories (só Nova)']] as const).map(([k, t]) => (
              <span key={k} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><span style={{ width: 10, height: 10, borderRadius: 3, background: COR[k] }} />{t}</span>
            ))}
          </span>
          <div style={grade(260)}>
            {lista.map((m) => <Meses key={m.username} m={m} max={maxMes} />)}
          </div>
        </Secao>


        <Secao icone="fa-list-check" titulo={`Quem estamos acompanhando (${(d.metricas || []).length})`} sub="Só conta comercial ou de criador abre (perfil pessoal não). As revendas da região entram aqui">
          {d.podeEditar && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input style={{ ...campoNP, flex: '1 1 220px' }} placeholder="@ do Instagram ou link do perfil" value={novo} onChange={(e) => setNovo(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && novo.trim()) acao({ acao: 'adicionar', username: novo, tipo: tipoNovo }, 'adicionar', 'Adicionado e lido.').then((x) => x && setNovo('')); }} />
              {(['revenda', 'marca'] as const).map((t) => <button key={t} type="button" onClick={() => setTipoNovo(t)} style={{ ...bt(NEUTRO, tipoNovo === t), minHeight: 40 }}>{t === 'revenda' ? 'Revenda' : 'Marca'}</button>)}
              <button type="button" style={bt(MARCA, true)} disabled={!novo.trim() || !!ocupado} onClick={() => acao({ acao: 'adicionar', username: novo, tipo: tipoNovo }, 'adicionar', 'Adicionado e lido.').then((x) => x && setNovo(''))}>
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
                  <span style={{ color: T3, fontSize: 13 }}> · {m.tipo === 'nos' ? 'Nova Tratores' : m.tipo === 'marca' ? 'Marca' : 'Revenda'}</span>
                  {m.erro && <span style={{ display: 'block', fontSize: 13, color: ATENCAO }}>{ic('fa-triangle-exclamation')} {m.erro}</span>}
                </span>
                {d.podeEditar && m.tipo !== 'nos' && (
                  <button type="button" style={{ ...bt(NEUTRO), minHeight: 34 }} onClick={() => { if (confirm(`Parar de acompanhar @${m.username}? Os posts guardados dele também saem.`)) acao({ acao: 'remover', username: m.username }, 'remover', 'Removido.'); }}>{ic('fa-xmark')}Tirar</button>
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
    <span style={{ width: tam, height: tam, borderRadius: 999, overflow: 'hidden', flex: 'none', display: 'grid', placeItems: 'center', background: SUP2, color: T3,
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
      <span style={{ fontSize: 13, color: T3 }}>{rot}</span>
      <span style={{ fontSize: 17, fontWeight: 600 }}>{val}</span>
      {sub != null && <span style={{ fontSize: 13, color: T3 }}>{sub}</span>}
    </span>
  );
  const corConst = m.constancia >= 90 ? BOM : m.constancia >= 60 ? ATENCAO : MARCA;
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', padding: '12px 14px', borderRadius: 14,
      border: `1px solid ${nos ? `color-mix(in srgb, ${NOVA} 45%, ${BORDA})` : BORDA}`, borderLeft: `4px solid ${nos ? NOVA : 'transparent'}`,
      background: nos ? `color-mix(in srgb, ${NOVA} 5%, ${FUNDO})` : FUNDO }}>
      <span style={{ display: 'flex', gap: 10, alignItems: 'center', flex: '1 1 200px', minWidth: 0 }}>
        <Avatar m={m} tam={40} />
        <span style={{ display: 'grid', minWidth: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.nome || m.username}</span>
          <span style={{ fontSize: 13, color: T3 }}>{nos ? 'Nova Tratores' : m.tipo === 'marca' ? 'Marca' : 'Revenda'} · {m.diasSemPostar == null ? 'sem posts' : m.diasSemPostar === 0 ? 'postou hoje' : `último post há ${m.diasSemPostar} dia${m.diasSemPostar === 1 ? '' : 's'}`}</span>
        </span>
      </span>
      {num('Seguidores', curto(m.seguidores), m.cresc7 != null ? `${m.cresc7 >= 0 ? '+' : ''}${n(m.cresc7)} na semana` : 'crescimento: em breve')}
      {num('Posts (30 dias)', n(m.posts30), `${String(m.porSemana).replace('.', ',')} por semana`)}
      <span style={{ display: 'grid', gap: 3, minWidth: 110 }}>
        <span style={{ fontSize: 13, color: T3 }}>Constância</span>
        <span style={{ fontSize: 17, fontWeight: 600, color: corConst }}>{m.constancia}%</span>
        <span style={{ height: 6, borderRadius: 99, background: SUP2, overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${m.constancia}%`, background: corConst, borderRadius: 99 }} /></span>
      </span>
      <span style={{ display: 'grid', gap: 3, minWidth: 130 }}>
        <span style={{ fontSize: 13, color: T3 }}>O que posta</span>
        <span style={{ display: 'flex', height: 10, borderRadius: 99, overflow: 'hidden', gap: 2, background: SUP2 }}>
          {(['foto', 'carrossel', 'reels'] as const).map((k) => m.mix[k] > 0 && <span key={k} title={`${k}: ${m.mix[k]}%`} style={{ width: `${m.mix[k]}%`, background: COR[k] }} />)}
        </span>
        <span style={{ fontSize: 13, color: T3 }}>{m.mix.reels}% reels · {m.mix.carrossel}% carrossel · {m.mix.foto}% foto</span>
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
      <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Avatar m={m} tam={24} /><span style={{ fontSize: 15, fontWeight: 600 }}>{m.nome || m.username}</span></span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, alignItems: 'end', height: 120 }}>
        {m.porMes.map((p) => {
          const partes = [['reels', p.reels], ['carrossel', p.carrossel], ['foto', p.feed], ['stories', p.stories || 0]] as const;
          const total = p.total + (p.stories || 0);
          return (
            <span key={p.mes} title={`${MES(p.mes)}: ${p.total} posts (${p.feed} foto, ${p.carrossel} carrossel, ${p.reels} reels)${p.stories != null ? ` + ${p.stories} stories` : ''}`}
              style={{ display: 'grid', gap: 3, alignContent: 'end', height: '100%' }}>
              <span style={{ fontSize: 13, textAlign: 'center', color: T2 }}>{total || ''}</span>
              <span style={{ display: 'flex', flexDirection: 'column-reverse', gap: 2, height: `${(total / max) * 86}px`, minHeight: total ? 3 : 0 }}>
                {partes.map(([k, v]) => v > 0 && <span key={k} style={{ flex: v, background: COR[k], borderRadius: 3 }} />)}
              </span>
            </span>
          );
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
        {m.porMes.map((p) => <span key={p.mes} style={{ fontSize: 13, textAlign: 'center', color: T3 }}>{MES(p.mes)}</span>)}
      </div>
    </div>
  );
}

type Destaque = NonNullable<Resp['analise']>['analise']['destaques'][number];

/** Post do mural: imagem, o número grande, o título (da IA, quando ela destacou esse post) e "Fazer a nossa versão". */
function CartaoPost({ p, onVersao, fazendo }: { p: PostRival & { nome: string; nos: boolean; destaque?: Destaque }; onVersao?: () => void; fazendo?: boolean }) {
  const numero = p.destaque?.numero || `${n(p.curtidas)} curtidas`;
  const titulo = p.destaque?.titulo || (p.legenda || '').replace(/#\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, 90) || 'Sem texto';
  return (
    <div style={{ display: 'grid', alignContent: 'start', borderRadius: 14, overflow: 'hidden', border: `1px solid ${p.destaque ? INFO : BORDA}`, background: FUNDO }}>
      <a href={p.link || '#'} target="_blank" rel="noreferrer" style={{ height: 230, background: SUP2, display: 'grid', placeItems: 'center', color: T3, position: 'relative' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {p.imagem ? <img src={p.imagem} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} /> : ic('fa-image')}
        <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 13, padding: '2px 8px', borderRadius: 99, background: 'rgba(43,29,23,.78)', color: '#FFFFFF' }}>{NOME_TIPO[p.tipo || ''] || p.tipo}</span>
        {p.destaque && <span style={{ position: 'absolute', top: 8, right: 8, fontSize: 13, padding: '2px 8px', borderRadius: 99, background: 'var(--nt-info-suave, #E6F0F8)', color: INFO }}>{ic('fa-wand-magic-sparkles')} IA destacou</span>}
      </a>
      <span style={{ display: 'grid', gap: 5, padding: '10px 12px 12px' }}>
        <span style={{ fontSize: 13, color: T3 }}>{p.nome} · {new Date(p.quando).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
        <span style={{ fontSize: 24, fontWeight: 600, color: T1, lineHeight: 1.1 }}>{numero}</span>
        <span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{titulo}</span>
        {onVersao && (
          <button type="button" onClick={onVersao} disabled={fazendo} style={{ ...bt(NEUTRO), justifyContent: 'center', marginTop: 4 }}>
            {ic(fazendo ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles')}{fazendo ? 'Criando…' : 'Fazer a nossa versão'}
          </button>
        )}
      </span>
    </div>
  );
}

/** A tira de 12 semanas: um quadradinho por semana, cheio = postou, vazio = semana sem post.
 *  Nova numa linha, um concorrente (escolhido) na outra. O buraco aparece em 1 segundo. */
function Tira({ lista }: { lista: Metricas[] }) {
  const nova = lista.find((m) => m.tipo === 'nos')!;
  const rivais = lista.filter((m) => m.tipo !== 'nos');
  const [outro, setOutro] = useState(() => (rivais.find((m) => /massey/i.test(m.nome || m.username)) || rivais[0]).username);
  const r = rivais.find((m) => m.username === outro) || rivais[0];
  const [agora] = useState(() => Date.now());
  const segunda = (w: number) => { const x = new Date(agora - w * 7 * 864e5); return x.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); };
  const linha = (m: Metricas, cor: string) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 160px) 1fr auto', gap: 12, alignItems: 'center' }}>
      <span style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0, fontSize: 15, fontWeight: 600 }}><Avatar m={m} tam={26} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.tipo === 'nos' ? 'Nova' : m.nome || m.username}</span></span>
      <span style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 4 }}>
        {m.semanas.map((q, i) => (
          <span key={i} title={`Semana de ${segunda(11 - i)}: ${q} post${q === 1 ? '' : 's'}`}
            style={{ aspectRatio: '1', maxHeight: 34, borderRadius: 6, display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 600,
              background: q ? cor : 'var(--nt-atencao-suave, #FDF3E1)', color: q ? '#FFFFFF' : ATENCAO, border: q ? 'none' : `2px dashed ${ATENCAO}` }}>
            {q || ''}
          </span>
        ))}
      </span>
      <span style={{ fontSize: 15, fontWeight: 600, color: m.semanas.filter(Boolean).length >= 10 ? BOM : m.semanas.filter(Boolean).length >= 7 ? ATENCAO : MARCA, whiteSpace: 'nowrap' }}>
        {m.semanas.filter(Boolean).length}/12
      </span>
    </div>
  );
  return (
    <section style={{ ...cartaoNP, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 17, fontWeight: 600, flex: '1 1 260px' }}>{ic('fa-calendar-week')} Constância: últimas 12 semanas</span>
        <span style={{ fontSize: 13, color: T3 }}>contra</span>
        <select value={r.username} onChange={(e) => setOutro(e.target.value)} style={{ ...campoNP, width: 'auto', minHeight: 36, padding: '4px 10px' }}>
          {rivais.map((m) => <option key={m.username} value={m.username}>{m.nome || m.username}</option>)}
        </select>
      </div>
      {linha(nova, NOVA)}
      {linha(r, CAFES[0])}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 160px) 1fr auto', gap: 12, fontSize: 13, color: T3 }}>
        <span />
        <span style={{ display: 'flex', justifyContent: 'space-between' }}><span>{segunda(11)}</span><span>esta semana</span></span>
        <span style={{ visibility: 'hidden' }}>12/12</span>
      </div>
    </section>
  );
}

