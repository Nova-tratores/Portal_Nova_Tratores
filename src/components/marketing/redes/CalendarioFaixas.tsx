'use client';
// =============================================================================
// Calendário em faixas (27/11/2026). José: "Calendário único com faixas. Eventos, campanhas, promoções, posts e datas
// do agro em linhas paralelas na mesma linha do tempo. Pra mudar a data, é só arrastar."
// 14 dias lado a lado; cada tipo numa faixa. Arrastar uma barra para outro dia muda a data dela (mantendo a duração):
//   - post → PATCH /api/marketing/posts (pelo onMoverPost da página)
//   - campanha / evento → PATCH /api/marketing/acoes/[id] (data_inicio, data_fim)
//   - promoção → PATCH /api/marketing/promocoes (inicio, fim)
// Datas do agro são fixas (não arrastam). Quem não tem acesso a campanhas ou promoções vê a faixa vazia com o aviso.
// =============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAuth } from '@/lib/auth/client';
import { STATUS_POST, type Midia, type RedeId, type StatusPost } from '@/lib/marketing/redes/redes';
import { DATAS_AGRO } from '@/lib/marketing/redes/datasAgro';
import { ATENCAO, BOM, BORDA, CAFES, FUNDO, INFO, MARCA, SUP2, SUP3, T1, T2, T3, ic } from './np';

// 27/11/2026 (docs/design-marketing.md): sem cinza e cor só com significado. Faixas em café; datas obrigatórias em
// atenção, boas em informação; post pela situação (ideia café, pronto informação, publicado bom, erro marca).
const COR_STATUS: Record<string, string> = { ideia: T3, pronto: INFO, agendado: INFO, publicado: BOM, parcial: ATENCAO, erro: MARCA };

export type PostFaixa = { id: string; titulo: string; quando: string | null; status: StatusPost; midia: Midia; redes: RedeId[] };
type Faixa = 'agro' | 'campanha' | 'promo' | 'post';
type Item = { id: string; faixa: Faixa; ini: string; fim: string; titulo: string; cor: string; icone: string; arrasta: boolean; imagem?: string | null; sub?: string; abrir: () => void };

const FUSO = 'America/Sao_Paulo';
const DIAS = 14;
const soma = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const entre = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 864e5);
const hoje = () => new Date().toLocaleDateString('en-CA', { timeZone: FUSO });
const diaDe = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: FUSO });
const ehVideo = (u: string) => /\.(mp4|mov|webm)(\?|$)/i.test(u);

const FAIXAS: { id: Faixa; nome: string; icone: string; cor: string; dica: string }[] = [
  { id: 'agro', nome: 'Datas do agro', icone: 'fa-wheat-awn', cor: ATENCAO, dica: 'Fixas. Toque para criar o post da data' },
  { id: 'campanha', nome: 'Campanhas e eventos', icone: 'fa-flag', cor: CAFES[0], dica: 'Arraste para mudar a data' },
  { id: 'promo', nome: 'Promoções', icone: 'fa-tags', cor: CAFES[1], dica: 'Arraste para mudar a data' },
  { id: 'post', nome: 'Posts', icone: 'fa-images', cor: CAFES[0], dica: 'Arraste para mudar o dia · toque num dia vazio para criar' },
];


/** Empilha as barras que se cruzam em linhas diferentes dentro da faixa. */
function empilhar(itens: Item[]): (Item & { linha: number })[] {
  const fins: string[] = [];
  return [...itens].sort((a, b) => a.ini.localeCompare(b.ini) || b.fim.localeCompare(a.fim)).map((it) => {
    let l = fins.findIndex((f) => f < it.ini);
    if (l < 0) { l = fins.length; fins.push(it.fim); } else fins[l] = it.fim;
    return { ...it, linha: l };
  });
}

export default function CalendarioFaixas({ inicio, posts, podeEditar, onAbrirPost, onNovoPost, onMoverPost, onDataAgro }: {
  inicio: string; posts: PostFaixa[]; podeEditar: boolean
  onAbrirPost: (id: string) => void; onNovoPost: (dia: string) => void; onMoverPost: (id: string, dia: string) => void
  onDataAgro: (dia: string, nome: string) => void
}) {
  const [acoes, setAcoes] = useState<{ id: string; nome: string; tipo: string; status: string; data_inicio: string | null; data_fim: string | null }[] | null>(null);
  const [promos, setPromos] = useState<{ id: string; titulo: string; inicio: string | null; fim: string | null; ativo: boolean; post_id?: string | null }[] | null>(null);
  const [semAcesso, setSemAcesso] = useState<Partial<Record<Faixa, boolean>>>({});
  const [arrastando, setArrastando] = useState<{ it: Item; pega: number } | null>(null);
  const [alvo, setAlvo] = useState<{ faixa: Faixa; dia: string } | null>(null);
  const [aviso, setAviso] = useState('');

  const carregar = useCallback(async () => {
    const [ra, rp] = await Promise.all([fetchAuth('/api/marketing/acoes'), fetchAuth('/api/marketing/promocoes')]);
    const ja = await ra.json().catch(() => ({})), jp = await rp.json().catch(() => ({}));
    setSemAcesso({ campanha: !ra.ok, promo: !rp.ok });
    setAcoes(ra.ok ? ja.acoes || [] : []);
    setPromos(rp.ok ? jp.promocoes || [] : []);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar(); }, [carregar]);

  const dias = useMemo(() => Array.from({ length: DIAS }, (_, i) => soma(inicio, i)), [inicio]);
  const fimJanela = dias[DIAS - 1];

  const itens = useMemo(() => {
    const dentro = (ini: string, fim: string) => fim >= inicio && ini <= fimJanela;
    const l: Item[] = [];
    for (const d of DATAS_AGRO) {
      const fim = d.ate || d.d;
      if (d.prior >= 2 && dentro(d.d, fim)) l.push({ id: `agro:${d.d}:${d.nome}`, faixa: 'agro', ini: d.d, fim, titulo: d.nome.replace(/\s*\(.*\)$/, ''), cor: d.prior === 3 ? ATENCAO : INFO, icone: 'fa-wheat-awn', arrasta: false, abrir: () => onDataAgro(d.d, d.nome) });
    }
    for (const a of acoes || []) {
      if (!a.data_inicio || a.status === 'cancelada') continue;
      const ini = a.data_inicio.slice(0, 10), fim = (a.data_fim || a.data_inicio).slice(0, 10);
      if (dentro(ini, fim)) l.push({ id: a.id, faixa: 'campanha', ini, fim, titulo: a.nome, cor: CAFES[0], icone: a.tipo === 'feira' ? 'fa-tent' : 'fa-flag', arrasta: podeEditar, abrir: () => { window.location.href = `/marketing/${a.id}`; } });
    }
    for (const p of promos || []) {
      if (!p.inicio && !p.fim) continue;
      const ini = (p.inicio || p.fim)!.slice(0, 10), fim = (p.fim || p.inicio)!.slice(0, 10);
      if (dentro(ini, fim)) l.push({ id: p.id, faixa: 'promo', ini, fim, titulo: p.titulo, cor: p.ativo ? CAFES[1] : CAFES[3], icone: 'fa-tags', arrasta: podeEditar, sub: p.ativo ? undefined : 'desligada',
        abrir: () => { window.location.href = p.post_id ? `/marketing/conteudo?post=${p.post_id}` : '/marketing/promocoes'; } });
    }
    for (const p of posts) {
      if (!p.quando) continue;
      const dia = diaDe(p.quando);
      if (!dentro(dia, dia)) continue;
      const s = STATUS_POST[p.status] || STATUS_POST.ideia;
      const corPost = COR_STATUS[p.status] || T3;
      const img = [p.midia?.feed, p.midia?.vertical, p.midia?.video].find(Boolean) || null;
      l.push({ id: p.id, faixa: 'post', ini: dia, fim: dia, titulo: p.titulo, cor: corPost, icone: s.icone, imagem: img, sub: s.nome,
        arrasta: podeEditar && !['publicado', 'parcial'].includes(p.status), abrir: () => onAbrirPost(p.id) });
    }
    return l;
  }, [acoes, promos, posts, inicio, fimJanela, podeEditar, onAbrirPost, onDataAgro]);

  async function soltar(faixa: Faixa, dia: string) {
    const a = arrastando; setArrastando(null); setAlvo(null);
    if (!a || a.it.faixa !== faixa) return;
    const delta = entre(soma(a.it.ini, a.pega), dia);
    if (!delta) return;
    const ini = soma(a.it.ini, delta), fim = soma(a.it.fim, delta);
    setAviso('');
    if (faixa === 'post') { onMoverPost(a.it.id, ini); return; }
    // mostra já no lugar novo; se der erro, volta
    if (faixa === 'campanha') setAcoes((l) => (l || []).map((x) => x.id === a.it.id ? { ...x, data_inicio: ini, data_fim: x.data_fim ? fim : null } : x));
    if (faixa === 'promo') setPromos((l) => (l || []).map((x) => x.id === a.it.id ? { ...x, inicio: x.inicio ? ini : null, fim: x.fim ? fim : null } : x));
    const r = faixa === 'campanha'
      ? await fetchAuth(`/api/marketing/acoes/${a.it.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data_inicio: ini, data_fim: fim }) })
      : await fetchAuth('/api/marketing/promocoes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.it.id, inicio: ini, fim }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false || j.error) setAviso(`Não consegui mudar a data de "${a.it.titulo}": ${j.erro || j.error || 'erro ao gravar'}`);
    else if (faixa === 'campanha') setAviso(`"${a.it.titulo}" agora começa em ${ini.split('-').reverse().slice(0, 2).join('/')}. Os posts automáticos da data nova aparecem em alguns minutos.`);
    await carregar();
  }

  const COLS = `150px repeat(${DIAS}, minmax(0, 1fr))`;
  const hj = hoje();
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {aviso && <span style={{ fontSize: 13, padding: '8px 12px', borderRadius: 10, background: 'var(--nt-info-suave, #E6F0F8)', color: INFO }}>{ic('fa-circle-info')} {aviso}</span>}
      <div style={{ border: `1px solid ${BORDA}`, borderRadius: 14, overflow: 'hidden', background: FUNDO }}>
        {/* cabeçalho dos dias */}
        <div style={{ display: 'grid', gridTemplateColumns: COLS, borderBottom: `1px solid ${BORDA}`, background: SUP2 }}>
          <span />
          {dias.map((d) => {
            const dt = new Date(`${d}T12:00:00Z`), fds = [0, 6].includes(dt.getUTCDay());
            return (
              <span key={d} style={{ display: 'grid', justifyItems: 'center', padding: '6px 0', borderLeft: `1px solid ${BORDA}`, color: d === hj ? T1 : fds ? T3 : T2 }}>
                <span style={{ fontSize: 13, textTransform: 'uppercase' }}>{dt.toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' }).replace('.', '')}</span>
                <span style={{ fontSize: 15, fontWeight: d === hj ? 700 : 500, ...(d === hj ? { background: T1, color: FUNDO, borderRadius: 99, width: 26, height: 26, display: 'grid', placeItems: 'center' } : {}) }}>{dt.getUTCDate()}</span>
              </span>
            );
          })}
        </div>

        {FAIXAS.map((f) => {
          const meus = empilhar(itens.filter((i) => i.faixa === f.id));
          const linhas = Math.max(1, ...meus.map((i) => i.linha + 1));
          const alturaLinha = f.id === 'post' ? 62 : 34;
          return (
            <div key={f.id} style={{ display: 'grid', gridTemplateColumns: COLS, borderBottom: `1px solid ${BORDA}`, position: 'relative' }}>
              <span style={{ display: 'grid', alignContent: 'center', gap: 2, padding: '8px 10px', borderRight: `1px solid ${BORDA}` }} title={f.dica}>
                <span style={{ fontSize: 15, fontWeight: 600, color: T1 }}><span style={{ color: T2 }}>{ic(f.icone)}</span> {f.nome}</span>
                <span style={{ fontSize: 13, color: T3, lineHeight: 1.3 }}>{semAcesso[f.id as Faixa] ? 'sem acesso a esta parte' : f.dica}</span>
              </span>
              <div style={{ gridColumn: `2 / span ${DIAS}`, display: 'grid', gridTemplateColumns: `repeat(${DIAS}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${linhas}, ${alturaLinha}px)`, rowGap: 4, padding: '6px 0', position: 'relative' }}>
                {/* fundo: um alvo por dia (soltar aqui / tocar para criar post) */}
                {dias.map((d, k) => {
                  const fds = [0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay());
                  const eAlvo = alvo?.faixa === f.id && alvo.dia === d;
                  return (
                    <span key={d}
                      onDragOver={(e) => { if (arrastando?.it.faixa === f.id) { e.preventDefault(); if (!eAlvo) setAlvo({ faixa: f.id, dia: d }); } }}
                      onDrop={(e) => { e.preventDefault(); soltar(f.id, d); }}
                      onClick={() => { if (f.id === 'post' && podeEditar && d >= hj) onNovoPost(d); }}
                      title={f.id === 'post' && podeEditar && d >= hj ? 'Criar um post neste dia' : undefined}
                      style={{ gridColumn: k + 1, gridRow: `1 / span ${linhas}`, margin: '-6px 0', borderLeft: k ? `1px solid ${BORDA}` : 'none',
                        cursor: f.id === 'post' && podeEditar && d >= hj ? 'copy' : 'default',
                        background: eAlvo ? SUP3 : d === hj ? 'var(--nt-info-suave, #E6F0F8)' : fds ? SUP2 : 'transparent' }} />
                  );
                })}
                {/* as barras */}
                {meus.map((it) => {
                  const c0 = Math.max(0, entre(inicio, it.ini)), c1 = Math.min(DIAS - 1, entre(inicio, it.fim));
                  const cortadoIni = it.ini < inicio, cortadoFim = it.fim > fimJanela;
                  return (
                    <button key={it.id} type="button" draggable={it.arrasta}
                      onDragStart={(e) => {
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        const span = c1 - c0 + 1;
                        const pega = Math.min(span - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * span))) + (c0 - entre(inicio, it.ini));
                        e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', it.id);
                        setArrastando({ it, pega });
                      }}
                      onDragEnd={() => { setArrastando(null); setAlvo(null); }}
                      onClick={it.abrir}
                      title={`${it.titulo}${it.sub ? ` · ${it.sub}` : ''} · ${it.ini.split('-').reverse().slice(0, 2).join('/')}${it.fim !== it.ini ? ` a ${it.fim.split('-').reverse().slice(0, 2).join('/')}` : ''}${it.arrasta ? ' · arraste para mudar a data' : ''}`}
                      style={{ gridColumn: `${c0 + 1} / ${c1 + 2}`, gridRow: it.linha + 1, zIndex: 1, margin: '0 3px', minWidth: 0, font: 'inherit', textAlign: 'left',
                        cursor: it.arrasta ? 'grab' : 'pointer', opacity: arrastando?.it.id === it.id ? 0.45 : 1,
                        display: 'flex', gap: 6, alignItems: 'center', padding: it.faixa === 'post' ? 3 : '0 8px', overflow: 'hidden',
                        borderRadius: `${cortadoIni ? 2 : 9}px ${cortadoFim ? 2 : 9}px ${cortadoFim ? 2 : 9}px ${cortadoIni ? 2 : 9}px`,
                        border: `1px solid color-mix(in srgb, ${it.cor} 45%, transparent)`, borderLeft: `4px solid ${it.cor}`,
                        background: it.faixa === 'post' ? FUNDO : SUP2, color: T1, boxShadow: 'none' }}>
                      {it.faixa === 'post' && (
                        <span style={{ width: 52, height: 52, flex: 'none', borderRadius: 6, overflow: 'hidden', display: 'grid', placeItems: 'center', background: `color-mix(in srgb, ${it.cor} 14%, transparent)`, color: it.cor }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {it.imagem && !ehVideo(it.imagem) ? <img src={it.imagem} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : ic(it.imagem ? 'fa-film' : 'fa-image')}
                        </span>
                      )}
                      <span style={{ display: 'grid', minWidth: 0, gap: 1 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2, overflow: 'hidden', ...(it.faixa === 'post' ? { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const } : { whiteSpace: 'nowrap', textOverflow: 'ellipsis' }) }}>
                          {it.faixa !== 'post' && <span style={{ color: it.cor }}>{ic(it.icone)} </span>}{it.titulo}
                        </span>
                        {it.faixa === 'post' && <span style={{ fontSize: 13, color: it.cor, whiteSpace: 'nowrap' }}>{ic(it.icone)} {it.sub}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
