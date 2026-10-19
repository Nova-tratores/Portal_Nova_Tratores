'use client';
// =============================================================================
// Boletim do agro + Plano Safra numa tela só — OPÇÕES de visual (página de teste).
// José, 19/10/2026: "pode juntar a notícia com o plano safra, e apresenta um designer
// melhor em testes, com imagens, e quando clicar na notícia abrir um modal praticamente
// idêntico ao da notícia, porém lá no final deixa o link". Plano Safra agora automático.
//   A · Portal   — manchete com foto grande + destaques ao lado, faixa do Plano Safra, grade
//   B · Revista  — capa de foto inteira, painéis rápidos e mosaico de fotos
//   C · Jornal   — lista com miniaturas à esquerda, Plano Safra completo na coluna da direita
// =============================================================================
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { NoticiaBoletim } from '@/lib/inteligencia-vendas/noticias';
import { apiEnviar, apiGet, Dica } from './ui';
import { linhaServeMaquina } from '@/lib/inteligencia-vendas/plano-safra';
import PlanoSafra from './PlanoSafra';
import {
  cat, Cotacoes, dataLonga, ESTILO_NOTICIAS, haQuanto, hojeISO, Previsoes, rotuloDia, Selo, TempoRegiao, TEND, CATEGORIAS,
  type Boletim,
} from './Noticias';

export type LayoutBoletim = 'portal' | 'revista' | 'jornal';
type Noticia = NoticiaBoletim & { id: number };
interface LinhaPS {
  id: number; programa: string; nome: string; taxa_aa: number | null; taxa_aa_max: number | null; prazo_anos: number | null;
  carencia_meses: number | null; participacao_pct: number | null; publico: string | null; fonte_url: string | null; status: string; conferido_em: string | null;
}
interface DadosPS { linhas: LinhaPS[]; safra: string; lendo?: boolean }

const TX = 'var(--portal-text, #0f172a)', MU = 'var(--portal-text-muted, #64748b)';
const PROGRAMAS: Record<string, { nome: string; cor: string }> = {
  pronaf: { nome: 'Pronaf Mais Alimentos', cor: '#16a34a' }, pronamp: { nome: 'Pronamp', cor: '#0891b2' },
  moderfrota: { nome: 'Moderfrota', cor: '#dc2626' }, inovagro: { nome: 'Inovagro', cor: '#7c3aed' },
};
const prog = (p: string) => PROGRAMAS[p] || { nome: p, cor: '#475569' };
/** Para quem é cada programa (texto fixo; os números vêm do BNDES). */
const PARA_QUEM: Record<string, string> = {
  pronaf: 'Agricultor familiar com cadastro no Pronaf (CAF/DAP). Tem os menores juros para trator e implemento.',
  pronamp: 'Médio produtor rural (renda bruta anual dentro do limite do Pronamp). Juros intermediários.',
  moderfrota: 'Qualquer produtor ou cooperativa, para trator, colheitadeira, plantadeira e pulverizador novos. O juro muda conforme a receita bruta.',
  inovagro: 'Para investir em inovação: agricultura de precisão, automação e máquinas com tecnologia embarcada.',
};
const LEGENDA_TAXAS = (
  <>
    <b style={{ fontSize: 14.5 }}>O que essas taxas significam</b>
    <div style={{ marginTop: 6 }}><b>% ao ano</b> — o juro cobrado por ano no financiamento, fixo no contrato. Quanto menor, mais barata fica a parcela.</div>
    <div style={{ marginTop: 6 }}><b>A partir de</b> — a menor taxa entre as linhas daquele programa. A taxa certa depende do tamanho do produtor (renda bruta) e do que ele vai comprar.</div>
    <div style={{ marginTop: 6 }}><b>Prazo</b> — tempo total para pagar. <b>Carência</b> — meses até a 1ª parcela. <b>Financia 100%</b> — o banco pode financiar o valor inteiro.</div>
    <div style={{ marginTop: 8, opacity: .8 }}>Os números vêm das páginas oficiais do BNDES, lidas pelo robô 2 vezes por dia. Clique numa linha para simular na Calculadora.</div>
  </>
);
const pct = (n: number | null) => (n == null ? '' : `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`);

// ── dados ────────────────────────────────────────────────────────────────────
function useBoletim(inicial?: { boletim: Boletim; ps: DadosPS }) {
  const [b, setB] = useState<Boletim | null>(inicial?.boletim ?? null);
  const [ps, setPs] = useState<DadosPS | null>(inicial?.ps ?? null);
  const [erro, setErro] = useState('');
  const [dia, setDia] = useState('');
  const [atualizando, setAtualizando] = useState(false);
  const carregar = useCallback(async (d: string) => {
    setErro('');
    const [rb, rp] = await Promise.allSettled([
      apiGet<Boletim>(`/api/inteligencia-vendas/noticias${d ? `?dia=${d}` : ''}`),
      apiGet<DadosPS>('/api/inteligencia-vendas/plano-safra'),
    ]);
    if (rb.status === 'fulfilled') setB(rb.value); else setErro((rb.reason as Error).message);
    if (rp.status === 'fulfilled') setPs(rp.value);
  }, []);
  useEffect(() => { if (!inicial) carregar(dia); }, [carregar, dia, inicial]);
  const atualizar = async () => {
    setAtualizando(true); setErro('');
    try { await apiEnviar('/api/inteligencia-vendas/noticias', 'POST', { acao: 'atualizar' }); setDia(''); await carregar(''); }
    catch (e) { setErro((e as Error).message); } finally { setAtualizando(false); }
  };
  return { b, ps, erro, setDia, atualizar, atualizando, recarregarPS: () => apiGet<DadosPS>('/api/inteligencia-vendas/plano-safra').then(setPs).catch(() => {}) };
}

// ── imagem com reserva ───────────────────────────────────────────────────────
/** Foto real da matéria. Sem foto (ou se não carregar): não mostra nada (pedido do José, 19/10). */
function Foto({ n, altura, className = '' }: { n: Noticia; altura?: number | string; className?: string; rotulo?: boolean }) {
  const [falhou, setFalhou] = useState(false);
  const estilo = { height: altura, ['--k' as string]: cat(n.categoria).cor };
  if (!n.imagem_url || falhou) return null;
  return (
    <div className={`bo-foto ${className}`} style={estilo}>
      {/* eslint-disable-next-line @next/next/no-img-element -- foto de site externo, tamanho livre */}
      <img src={n.imagem_url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFalhou(true)} />
    </div>
  );
}

// ── modal da matéria ─────────────────────────────────────────────────────────
function ModalMateria({ lista, i, onTrocar, onFechar }: { lista: Noticia[]; i: number; onTrocar: (i: number) => void; onFechar: () => void }) {
  const n = lista[i];
  const c = cat(n.categoria);
  const [saindo, setSaindo] = useState(false);
  const fechar = useCallback(() => { setSaindo(true); setTimeout(onFechar, 200); }, [onFechar]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar();
      if (e.key === 'ArrowRight' && i < lista.length - 1) onTrocar(i + 1);
      if (e.key === 'ArrowLeft' && i > 0) onTrocar(i - 1);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [i, lista.length, onTrocar, fechar]);
  const corpo = n.corpo?.length ? n.corpo : null;
  const palavras = (corpo || [n.resumo]).join(' ').split(/\s+/).length;
  const link = n.url_artigo || n.fonte_url;
  let dominio = '';
  try { dominio = new URL(link).hostname.replace(/^www\./, ''); } catch { /* link estranho */ }
  const quando = n.publicado_em ? new Date(n.publicado_em) : null;
  return (
    <div className={`bo-modal-fundo ${saindo ? 'sai' : ''}`} onClick={fechar}>
      <div className={`bo-modal ${saindo ? 'sai' : ''}`} onClick={(e) => e.stopPropagation()} style={{ ['--k' as string]: c.cor }}>
        <div className="bo-modal-barra">
          <span className="bo-kicker"><i className={`fas ${c.icone}`} /> {c.nome}</span>
          <span style={{ fontSize: 12.5, color: MU }}>{i + 1} de {lista.length}</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button type="button" className="bo-nav" disabled={i === 0} onClick={() => onTrocar(i - 1)} aria-label="Anterior"><i className="fas fa-chevron-left" /></button>
            <button type="button" className="bo-nav" disabled={i === lista.length - 1} onClick={() => onTrocar(i + 1)} aria-label="Próxima"><i className="fas fa-chevron-right" /></button>
            <button type="button" className="bo-nav" onClick={fechar} aria-label="Fechar"><i className="fas fa-xmark" /></button>
          </span>
        </div>
        <article key={n.id} className="bo-materia">
          <div className="bo-materia-topo">
            <span className="bo-kicker"><i className={`fas ${c.icone}`} /> {c.nome}{n.cidades.length ? ` · ${n.cidades.join(', ')}` : ''}</span>
            <h1>{n.titulo}</h1>
            {n.resumo && <p className="bo-linha-fina">{n.resumo}</p>}
            <div className="bo-byline">
              <span><b>{n.fonte_nome || dominio}</b></span>
              {quando && <span>{quando.toLocaleDateString('pt-BR')} às {quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}
              <span>{Math.max(1, Math.round(palavras / 200))} min de leitura</span>
              <Selo t={n.tendencia} />
            </div>
          </div>
          {n.imagem_url && (
            <figure className="bo-materia-foto">
              <Foto n={n} />
              <figcaption>Foto: {n.fonte_nome || dominio}</figcaption>
            </figure>
          )}
          {n.impacto && <div className="bo-pra-quem"><i className="fas fa-tractor" /><div><b>Para quem vende trator</b><br />{n.impacto}</div></div>}
          <div className="bo-texto">
            {corpo ? corpo.map((p, k) => <p key={k}>{p}</p>) : (
              <>
                <p>{n.resumo}</p>
                <div className="bo-sem-texto"><i className="fas fa-circle-info" /> O texto completo desta matéria está no site de origem, no link abaixo.</div>
              </>
            )}
          </div>
          <a href={link} target="_blank" rel="noreferrer" className="bo-link-final">
            <span className="bo-link-ic"><i className="fas fa-arrow-up-right-from-square" /></span>
            <span style={{ minWidth: 0 }}>
              <b>Ler a matéria original em {n.fonte_nome || dominio}</b>
              <small>{link}</small>
            </span>
          </a>
          <div className="bo-fim">Texto reproduzido de {n.fonte_nome || dominio} para leitura interna da equipe. Os direitos são do veículo de origem.</div>
        </article>
      </div>
    </div>
  );
}

// ── Plano Safra ──────────────────────────────────────────────────────────────
function LinhaCredito({ l, i }: { l: LinhaPS; i: number }) {
  const p = prog(l.programa);
  const taxa = l.taxa_aa != null ? `${pct(l.taxa_aa)}${l.taxa_aa_max != null && l.taxa_aa_max !== l.taxa_aa ? ` a ${pct(l.taxa_aa_max)}` : ''}` : 'taxa não informada';
  const calc = `/inteligencia-vendas/calculadora?${new URLSearchParams({ ...(l.taxa_aa != null ? { taxa: String(l.taxa_aa) } : {}), ...(l.prazo_anos ? { prazo: String(l.prazo_anos) } : {}), linha: l.nome })}`;
  return (
    <div className="bo-ps-linha" style={{ ['--k' as string]: p.cor, animationDelay: `${i * 50}ms` }}>
      <div className="bo-ps-prog">{p.nome}</div>
      <div className="bo-ps-taxa">{taxa}<small> ao ano</small></div>
      <div className="bo-ps-nome">{l.nome}</div>
      <div className="bo-ps-info">
        {l.prazo_anos ? <span>{l.prazo_anos.toLocaleString('pt-BR')} anos</span> : null}
        {l.carencia_meses ? <span>carência {l.carencia_meses} m</span> : null}
        {l.participacao_pct ? <span>financia {pct(l.participacao_pct)}</span> : null}
      </div>
      <div className="bo-ps-acoes">
        <a href={calc}><i className="fas fa-calculator" /> Calcular</a>
        {l.fonte_url && <a href={l.fonte_url} target="_blank" rel="noreferrer"><i className="fas fa-arrow-up-right-from-square" /> BNDES</a>}
      </div>
    </div>
  );
}

function PlanoSafraBloco({ ps, modo, onAbrir }: { ps: DadosPS | null; modo: 'faixa' | 'painel' | 'mini'; onAbrir: () => void }) {
  const linhas = (ps?.linhas || []).filter((l) => (l.status === 'vigente' || l.status === 'proposta') && linhaServeMaquina(l))
    .sort((a, z) => (a.taxa_aa ?? 99) - (z.taxa_aa ?? 99));
  const atualizado = linhas.map((l) => l.conferido_em).filter(Boolean).sort().pop() || null;
  const cabeca = (
    <div className="bo-ps-cabeca">
      <div>
        <div className="bo-ps-titulo"><i className="fas fa-building-columns" /> Plano Safra {ps?.safra || ''}</div>
        <div style={{ fontSize: 12.5, color: MU }}>
          <span className="bo-auto"><i className="fas fa-robot" /> automático</span>
          {ps?.lendo ? ' · o robô está lendo as páginas do BNDES agora…' : atualizado ? ` · conferido pelo robô ${haQuanto(atualizado)}` : ' · lido 2x por dia no site do BNDES'}
        </div>
      </div>
      <button type="button" className="bo-ps-ver" onClick={onAbrir}>Ver todas e corrigir <i className="fas fa-arrow-right" /></button>
    </div>
  );
  if (!linhas.length) {
    return <section className={`bo-ps bo-ps-${modo}`}>{cabeca}<div style={{ color: MU, fontStyle: 'italic', padding: '8px 0' }}>{ps?.lendo ? 'Lendo as condições do BNDES…' : 'Ainda sem linhas: o robô faz a primeira leitura sozinho em instantes.'}</div></section>;
  }
  if (modo === 'mini') {
    const melhor = linhas[0];
    return (
      <section className="bo-ps bo-ps-mini" onClick={onAbrir} style={{ cursor: 'pointer' }}>
        <div className="bo-ps-titulo"><i className="fas fa-building-columns" /> Plano Safra</div>
        <div style={{ fontSize: 12.5, color: MU, marginBottom: 6 }}>menor juro para máquina hoje</div>
        <div className="bo-ps-taxa" style={{ fontSize: 34 }}>{pct(melhor.taxa_aa)}<small> ao ano</small></div>
        <div style={{ fontSize: 13.5, color: TX, fontWeight: 700 }}>{melhor.nome}</div>
        <div style={{ display: 'grid', gap: 4, marginTop: 10 }}>
          {[...new Map(linhas.map((l) => [l.programa, l])).values()].map((l) => (
            <div key={l.programa} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: TX }}>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 3, background: prog(l.programa).cor, marginRight: 6 }} />{prog(l.programa).nome}</span><b>a partir de {pct(l.taxa_aa)}</b>
            </div>
          ))}
        </div>
        <div className="bo-auto" style={{ marginTop: 10 }}><i className="fas fa-robot" /> atualiza sozinho</div>
      </section>
    );
  }
  if (modo === 'painel') return <PainelPS linhas={linhas} safra={ps?.safra || ''} atualizado={atualizado} lendo={!!ps?.lendo} onAbrir={onAbrir} />;
  return (
    <section className={`bo-ps bo-ps-${modo}`}>
      {cabeca}
      <div className={modo === 'faixa' ? 'bo-ps-faixa-lista' : 'bo-ps-painel-lista'}>
        {linhas.slice(0, modo === 'faixa' ? 12 : 30).map((l, i) => <LinhaCredito key={l.id} l={l} i={i} />)}
      </div>
    </section>
  );
}

/**
 * Clima das notícias do dia (era o "Termômetro"): um medidor com ponteiro de "pede atenção"
 * a "dia bom", pelo saldo (boas − de atenção) ÷ total. Os números filtram a lista.
 */
function ClimaNoticias({ ns, fTend, setFTend }: { ns: Noticia[]; fTend: string; setFTend: (v: string) => void }) {
  const b = ns.filter((n) => n.tendencia === 'boa').length, r = ns.filter((n) => n.tendencia === 'ruim').length, t = Math.max(1, ns.length);
  const saldo = (b - r) / t; // -1 … 1
  const ang = saldo * 80; // graus a partir do meio
  const veredito = saldo >= 0.25 ? { txt: 'Dia bom para vender', cor: '#15803d', sub: 'mais notícias boas que ruins' }
    : saldo <= -0.25 ? { txt: 'Dia pede atenção', cor: '#b91c1c', sub: 'mais notícias de atenção que boas' }
      : { txt: 'Dia equilibrado', cor: '#475569', sub: 'boas e ruins quase empatadas' };
  const W = 220, R = 88, cx = W / 2, cy = 100;
  const ponto = (graus: number, raio: number) => { const a = ((graus - 90) * Math.PI) / 180; return [cx + raio * Math.cos(a), cy + raio * Math.sin(a)]; };
  const arco = (de: number, ate: number) => { const [x1, y1] = ponto(de, R), [x2, y2] = ponto(ate, R); return `M${x1},${y1} A${R},${R} 0 0 1 ${x2},${y2}`; };
  const chips: { k: 'boa' | '' | 'ruim'; n: number; nome: string; cor: string }[] = [
    { k: 'ruim', n: r, nome: 'de atenção', cor: '#dc2626' }, { k: '', n: t - b - r, nome: 'neutras', cor: '#64748b' }, { k: 'boa', n: b, nome: 'boas', cor: '#16a34a' },
  ];
  return (
    <section className="nt-lado-bloco bo-clima">
      <h3>
        <i className="fas fa-gauge-high" /> Clima das notícias de hoje
        <Dica largura={300} conteudo={<><b>Como é calculado</b><div style={{ marginTop: 6 }}>A IA marca cada notícia como <b>boa</b>, <b>neutra</b> ou <b>de atenção</b> para quem vende trator. O ponteiro mostra o saldo: (boas − de atenção) ÷ total. Para a direita, o dia está mais favorável para vender; para a esquerda, pede mais cuidado.</div><div style={{ marginTop: 6, opacity: .8 }}>Clique num número para ver só aquelas notícias.</div></>}>
          <span className="bo-pp-info" style={{ marginLeft: 'auto' }}><i className="fas fa-circle-info" /></span>
        </Dica>
      </h3>
      <svg viewBox={`0 0 ${W} 126`} style={{ width: '100%', maxWidth: 260, display: 'block', margin: '0 auto' }}>
        <defs>
          <linearGradient id="boClimaGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#dc2626" /><stop offset=".5" stopColor="#cbd5e1" /><stop offset="1" stopColor="#16a34a" /></linearGradient>
        </defs>
        <path d={arco(-90, 90)} fill="none" stroke="url(#boClimaGrad)" strokeWidth="16" strokeLinecap="round" />
        {[-60, -30, 0, 30, 60].map((g) => { const [x1, y1] = ponto(g, R - 14), [x2, y2] = ponto(g, R - 20); return <line key={g} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />; })}
        <g className="bo-ponteiro" style={{ transform: `rotate(${ang}deg)`, transformOrigin: `${cx}px ${cy}px` }}>
          <line x1={cx} y1={cy} x2={cx} y2={cy - R + 24} stroke="#111111" strokeWidth="4" strokeLinecap="round" />
        </g>
        <circle cx={cx} cy={cy} r="9" fill="#111111" /><circle cx={cx} cy={cy} r="3.5" fill="#fefefe" />
        <text x={ponto(-90, R)[0] - 8} y={cy + 24} fontSize="11" fill="#b91c1c" fontWeight="800">atenção</text>
        <text x={ponto(90, R)[0] + 8} y={cy + 24} fontSize="11" fill="#15803d" fontWeight="800" textAnchor="end">bom</text>
      </svg>
      <div style={{ textAlign: 'center', marginTop: 4 }}>
        <div style={{ fontSize: 17, fontWeight: 900, color: veredito.cor }}>{veredito.txt}</div>
        <div style={{ fontSize: 12.5, color: MU }}>{veredito.sub}</div>
      </div>
      <div className="bo-clima-chips">
        {chips.map((c) => (
          <button key={c.nome} type="button" className={fTend === c.k && c.k ? 'on' : ''} style={{ ['--k' as string]: c.cor }}
            onClick={() => c.k && setFTend(fTend === c.k ? '' : c.k)} disabled={!c.k}>
            <b>{c.n}</b><span>{c.nome}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Coluna do Plano Safra (Opção C): um bloco por programa, taxas em linhas, clique abre a calculadora. */
function PainelPS({ linhas, safra, atualizado, lendo, onAbrir }: { linhas: LinhaPS[]; safra: string; atualizado: string | null; lendo: boolean; onAbrir: () => void }) {
  const ordem = ['pronaf', 'pronamp', 'inovagro', 'moderfrota'];
  const pos = (x: string) => { const i = ordem.indexOf(x); return i < 0 ? 99 : i; };
  const grupos = [...new Set(linhas.map((l) => l.programa))].sort((a, z) => pos(a) - pos(z));
  const [aberto, setAberto] = useState<string>(grupos[0] || '');
  const curto = (l: LinhaPS) => l.nome.replace(/^[^—–-]*[—–-]\s*/, '').replace(/^\w/, (x) => x.toUpperCase()) || l.nome;
  const calc = (l: LinhaPS) => `/inteligencia-vendas/calculadora?${new URLSearchParams({ ...(l.taxa_aa != null ? { taxa: String(l.taxa_aa) } : {}), ...(l.prazo_anos ? { prazo: String(l.prazo_anos) } : {}), linha: l.nome })}`;
  return (
    <section className="bo-pp">
      <div className="bo-pp-topo">
        <div className="bo-pp-titulo"><i className="fas fa-building-columns" /> Plano Safra <span>{safra}</span></div>
        <Dica conteudo={LEGENDA_TAXAS} largura={340}><span className="bo-pp-info" aria-label="O que as taxas significam"><i className="fas fa-circle-info" /></span></Dica>
        <button type="button" className="bo-pp-corrigir" onClick={onAbrir} title="Ver todas as linhas e corrigir à mão"><i className="fas fa-pen" /></button>
      </div>
      <div className="bo-pp-sub"><span className="bo-auto"><i className="fas fa-robot" /> automático</span>{lendo ? 'lendo o BNDES agora…' : atualizado ? `lido ${haQuanto(atualizado)}` : 'lido 2x por dia'}</div>
      {!linhas.length && <div style={{ color: MU, fontSize: 13.5, padding: '8px 0' }}>Ainda sem linhas: o robô faz a primeira leitura sozinho.</div>}
      <div style={{ display: 'grid', gap: 8 }}>
        {grupos.map((g) => {
          const p = prog(g), ls = linhas.filter((l) => l.programa === g), on = aberto === g;
          const menor = ls.find((l) => l.taxa_aa != null);
          return (
            <div key={g} className={`bo-pp-prog ${on ? 'on' : ''}`} style={{ ['--k' as string]: p.cor }}>
              <button type="button" className="bo-pp-cab" onClick={() => setAberto(on ? '' : g)}>
                <span className="bo-pp-ponto" />
                <span style={{ flex: 1, textAlign: 'left' }}><b>{p.nome}</b><small>{ls.length} linha{ls.length > 1 ? 's' : ''}</small></span>
                <span className="bo-pp-menor"><small>a partir de</small>{pct(menor?.taxa_aa ?? null) || '—'}</span>
                <i className={`fas fa-chevron-${on ? 'up' : 'down'}`} style={{ color: MU, fontSize: 12 }} />
              </button>
              {on && (
                <div className="bo-pp-linhas">
                  {PARA_QUEM[g] && <div className="bo-pp-quem"><i className="fas fa-user-check" /> {PARA_QUEM[g]}</div>}
                  {ls.map((l) => (
                    <a key={l.id} href={calc(l)} className="bo-pp-linha" title="Abrir na calculadora com esta taxa e prazo">
                      <b>{pct(l.taxa_aa)}{l.taxa_aa_max != null && l.taxa_aa_max !== l.taxa_aa ? `–${pct(l.taxa_aa_max)}` : ''}</b>
                      <span>{curto(l)}<small>{[l.prazo_anos ? `${l.prazo_anos.toLocaleString('pt-BR')} anos` : '', l.carencia_meses ? `carência ${l.carencia_meses} m` : ''].filter(Boolean).join(' · ')}</small></span>
                      <i className="fas fa-calculator" />
                    </a>
                  ))}
                  {ls[0]?.fonte_url && <a href={ls[0].fonte_url} target="_blank" rel="noreferrer" className="bo-pp-fonte">Página oficial no BNDES <i className="fas fa-arrow-up-right-from-square" /></a>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── cartões ──────────────────────────────────────────────────────────────────
function CartaoFoto({ n, onAbrir, i, grande }: { n: Noticia; onAbrir: () => void; i: number; grande?: boolean }) {
  const c = cat(n.categoria);
  return (
    <button type="button" className={`bo-card ${grande ? 'bo-card-g' : ''}`} onClick={onAbrir} style={{ ['--k' as string]: c.cor, animationDelay: `${Math.min(i, 14) * 45}ms` }}>
      <Foto n={n} rotulo className="bo-card-foto" />
      <div className="bo-card-corpo">
        <div className="bo-kicker"><i className={`fas ${c.icone}`} /> {c.nome}<span style={{ marginLeft: 'auto' }}><Selo t={n.tendencia} /></span></div>
        <h3>{n.titulo}</h3>
        {n.resumo && <p>{n.resumo}</p>}
        <div className="bo-card-rodape"><span>{n.fonte_nome}{n.publicado_em ? ` · ${haQuanto(n.publicado_em)}` : ''}</span>{n.corpo?.length ? <span className="bo-ler"><i className="fas fa-book-open" /> Ler matéria</span> : <span className="bo-ler">Abrir</span>}</div>
      </div>
    </button>
  );
}

function ItemLista({ n, onAbrir, i }: { n: Noticia; onAbrir: () => void; i: number }) {
  const c = cat(n.categoria);
  return (
    <button type="button" className={`bo-item ${n.imagem_url ? '' : 'bo-item-sem'}`} onClick={onAbrir} style={{ ['--k' as string]: c.cor, animationDelay: `${Math.min(i, 14) * 40}ms` }}>
      <Foto n={n} className="bo-item-foto" />
      <div style={{ minWidth: 0, textAlign: 'left' }}>
        <div className="bo-kicker"><i className={`fas ${c.icone}`} /> {c.nome}{n.cidades.length ? <span style={{ color: MU, fontWeight: 600 }}> · {n.cidades[0]}</span> : null}</div>
        <h3>{n.titulo}</h3>
        {n.resumo && <p>{n.resumo}</p>}
        <div className="bo-card-rodape"><span>{n.fonte_nome}{n.publicado_em ? ` · ${haQuanto(n.publicado_em)}` : ''}</span><Selo t={n.tendencia} /></div>
      </div>
    </button>
  );
}

function Filtros({ ns, fCat, setFCat, fTend, setFTend }: { ns: Noticia[]; fCat: string; setFCat: (v: string) => void; fTend: string; setFTend: (v: string) => void }) {
  const conta = (k: string) => ns.filter((n) => n.categoria === k).length;
  return (
    <div className="nt-filtros">
      <button type="button" className={!fCat ? 'on' : ''} onClick={() => setFCat('')}>Todas <b>{ns.length}</b></button>
      {Object.entries(CATEGORIAS).filter(([k]) => conta(k)).map(([k, c]) => (
        <button key={k} type="button" className={fCat === k ? 'on' : ''} style={{ ['--k' as string]: c.cor }} onClick={() => setFCat(fCat === k ? '' : k)}><i className={`fas ${c.icone}`} /> {c.nome} <b>{conta(k)}</b></button>
      ))}
      <span className="nt-sep" />
      {(['boa', 'ruim'] as const).map((t) => (
        <button key={t} type="button" className={fTend === t ? 'on' : ''} style={{ ['--k' as string]: TEND[t].cor }} onClick={() => setFTend(fTend === t ? '' : t)}>
          <i className={`fas ${TEND[t].icone}`} /> {t === 'boa' ? 'Só as boas' : 'Só as de atenção'}
        </button>
      ))}
    </div>
  );
}

// ── tela ─────────────────────────────────────────────────────────────────────
export default function BoletimOpcoes({ layout, inicial, abrirInicial = null }: { layout: LayoutBoletim; inicial?: { boletim: Boletim; ps: DadosPS }; abrirInicial?: number | null }) {
  const { b, ps, erro, setDia, atualizar, atualizando, recarregarPS } = useBoletim(inicial);
  const [aberta, setAberta] = useState<number | null>(abrirInicial);
  const [psAberto, setPsAberto] = useState(false);
  const [fCat, setFCat] = useState('');
  const [fTend, setFTend] = useState('');
  const ns = useMemo(() => (b?.noticias ?? []) as Noticia[], [b]);
  const comFoto = ns.filter((n) => n.imagem_url);
  const principal = ns.find((n) => n.destaque && n.imagem_url) || comFoto[0] || ns[0];
  const destaques = ns.filter((n) => n.destaque && n !== principal).slice(0, 3);
  const resto = ns.filter((n) => n !== principal && !destaques.includes(n) && (!fCat || n.categoria === fCat) && (!fTend || n.tendencia === fTend));
  const filtrando = !!(fCat || fTend);
  const listaModal = ns;
  const abrir = (n: Noticia) => setAberta(listaModal.indexOf(n));
  const hoje = hojeISO();

  const dt = b ? new Date(`${b.dia}T12:00:00`) : null;
  const gerado = b?.geradoEm ? new Date(b.geradoEm) : null;
  const cabeca = (
    <header className="nt-cabeca">
      {dt ? (
        <div className="bo-data">
          <div className="bo-data-cal"><span>{dt.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span><b>{dt.getDate()}</b></div>
          <div>
            <div className="bo-data-dia">{((b!.dia === hoje ? 'hoje, ' : '') + dt.toLocaleDateString('pt-BR', { weekday: 'long' })).replace(/^./, (x) => x.toUpperCase())}</div>
            <div className="bo-data-longa">{dataLonga(b!.dia).split(', ')[1]}</div>
            {gerado && <div className="bo-data-robo"><i className="fas fa-robot" /> atualizado às {gerado.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · {haQuanto(b!.geradoEm)}</div>}
          </div>
        </div>
      ) : <div style={{ color: MU }}>Carregando…</div>}
      <div className="nt-dias-nav">
        {(b?.dias || []).slice(0, 7).map((d) => <button key={d} type="button" className={d === b?.dia ? 'on' : ''} onClick={() => setDia(d)}>{rotuloDia(d, hoje)}</button>)}
      </div>
      {b?.podeAtualizar && <button type="button" className="nt-atualizar" onClick={atualizar} disabled={atualizando}><i className={`fas fa-rotate ${atualizando ? 'fa-spin' : ''}`} /> {atualizando ? 'Lendo as fontes… (até 1 min)' : 'Atualizar agora'}</button>}
    </header>
  );

  const manchetePortal = principal && (
    <button type="button" className="bo-capa" onClick={() => abrir(principal)} style={{ ['--k' as string]: cat(principal.categoria).cor }}>
      <Foto n={principal} className="bo-capa-foto" />
      <div className="bo-capa-texto">
        <span className="bo-capa-k"><i className="fas fa-bolt" /> Manchete do dia</span>
        <h1>{b?.manchete?.titulo || principal.titulo}</h1>
        <p>{b?.manchete?.resumo || principal.resumo}</p>
        <span className="bo-capa-link">Ler: {principal.titulo.slice(0, 80)}{principal.titulo.length > 80 ? '…' : ''} <i className="fas fa-arrow-right" /></span>
      </div>
    </button>
  );

  let corpo: ReactNode = null;
  if (b && ns.length) {
    if (layout === 'portal') {
      corpo = (
        <div className="nt-grade">
          <main style={{ minWidth: 0, display: 'grid', gap: 18, alignContent: 'start' }}>
            {!filtrando && <div className="bo-topo-portal">{manchetePortal}<div className="bo-topo-lado">{destaques.slice(0, 2).map((n, i) => <CartaoFoto key={n.id} n={n} i={i} onAbrir={() => abrir(n)} />)}</div></div>}
            <PlanoSafraBloco ps={ps} modo="faixa" onAbrir={() => setPsAberto(true)} />
            <Filtros ns={ns} fCat={fCat} setFCat={setFCat} fTend={fTend} setFTend={setFTend} />
            <div key={fCat + fTend} className="bo-grade-cards">{(filtrando ? ns.filter((n) => (!fCat || n.categoria === fCat) && (!fTend || n.tendencia === fTend)) : [...destaques.slice(2), ...resto]).map((n, i) => <CartaoFoto key={n.id} n={n} i={i} onAbrir={() => abrir(n)} />)}</div>
          </main>
          <aside className="nt-lado"><ClimaNoticias ns={ns} fTend={fTend} setFTend={setFTend} /><Previsoes focus={b.previsoes.focus} /><TempoRegiao clima={b.previsoes.clima} /></aside>
        </div>
      );
    } else if (layout === 'revista') {
      corpo = (
        <div style={{ display: 'grid', gap: 18 }}>
          {!filtrando && principal && (
            <button type="button" className="bo-capa-revista" onClick={() => abrir(principal)}>
              <Foto n={principal} className="bo-capa-revista-foto" />
              <div className="bo-capa-revista-texto">
                <span className="bo-capa-k"><i className="fas fa-bolt" /> Manchete do dia</span>
                <h1>{b.manchete?.titulo || principal.titulo}</h1>
                <p>{b.manchete?.resumo || principal.resumo}</p>
              </div>
            </button>
          )}
          <div className="bo-paineis">
            <PlanoSafraBloco ps={ps} modo="mini" onAbrir={() => setPsAberto(true)} />
            <ClimaNoticias ns={ns} fTend={fTend} setFTend={setFTend} />
            <TempoRegiao clima={b.previsoes.clima} />
            <Previsoes focus={b.previsoes.focus} />
          </div>
          <Filtros ns={ns} fCat={fCat} setFCat={setFCat} fTend={fTend} setFTend={setFTend} />
          <div key={fCat + fTend} className="bo-mosaico">
            {(filtrando ? ns.filter((n) => (!fCat || n.categoria === fCat) && (!fTend || n.tendencia === fTend)) : ns.filter((n) => n !== principal)).map((n, i) => <CartaoFoto key={n.id} n={n} i={i} grande={i % 5 === 0} onAbrir={() => abrir(n)} />)}
          </div>
        </div>
      );
    } else {
      const lista = filtrando ? ns.filter((n) => (!fCat || n.categoria === fCat) && (!fTend || n.tendencia === fTend)) : ns;
      corpo = (
        <div className="bo-jornal">
          <main style={{ minWidth: 0, display: 'grid', gap: 14, alignContent: 'start' }}>
            {!filtrando && b.manchete && (
              <section className="bo-jornal-manchete">
                <span className="bo-capa-k" style={{ color: '#dc2626' }}><i className="fas fa-bolt" /> Manchete do dia</span>
                <h1>{b.manchete.titulo}</h1><p>{b.manchete.resumo}</p>
              </section>
            )}
            <Filtros ns={ns} fCat={fCat} setFCat={setFCat} fTend={fTend} setFTend={setFTend} />
            <div key={fCat + fTend} className="bo-lista">
              {!filtrando && <div className="bo-lista-sep">Destaques</div>}
              {lista.filter((n) => filtrando || n.destaque).map((n, i) => <ItemLista key={n.id} n={n} i={i} onAbrir={() => abrir(n)} />)}
              {!filtrando && <div className="bo-lista-sep">Mais notícias</div>}
              {!filtrando && lista.filter((n) => !n.destaque).map((n, i) => <ItemLista key={n.id} n={n} i={i + 3} onAbrir={() => abrir(n)} />)}
            </div>
          </main>
          <aside className="nt-lado"><PlanoSafraBloco ps={ps} modo="painel" onAbrir={() => setPsAberto(true)} /><ClimaNoticias ns={ns} fTend={fTend} setFTend={setFTend} /><Previsoes focus={b.previsoes.focus} /><TempoRegiao clima={b.previsoes.clima} /></aside>
        </div>
      );
    }
  }

  return (
    <div className="nt-tela">
      <style>{ESTILO_NOTICIAS}{ESTILO}</style>
      {cabeca}
      {erro && <div className="nt-erro"><i className="fas fa-triangle-exclamation" /> {erro}</div>}
      {b && <Cotacoes ind={b.indicadores} focus={b.previsoes.focus} />}
      {b && !ns.length && (
        <>
          <div className="nt-vazio"><i className="fas fa-mug-hot" /><b>Ainda não tem boletim neste dia</b><span>O robô monta o boletim todo dia às 06:30.{b.podeAtualizar ? ' Clique em "Atualizar agora" para gerar já.' : ''}</span></div>
          <PlanoSafraBloco ps={ps} modo="faixa" onAbrir={() => setPsAberto(true)} />
        </>
      )}
      {corpo}
      {aberta != null && listaModal[aberta] && <ModalMateria lista={listaModal} i={aberta} onTrocar={setAberta} onFechar={() => setAberta(null)} />}
      {psAberto && (
        <div className="bo-modal-fundo" onClick={() => { setPsAberto(false); recarregarPS(); }}>
          <div className="bo-modal bo-modal-ps" onClick={(e) => e.stopPropagation()}>
            <div className="bo-modal-barra"><b style={{ fontSize: 15 }}><i className="fas fa-building-columns" /> Plano Safra — todas as linhas</b>
              <button type="button" className="bo-nav" style={{ marginLeft: 'auto' }} onClick={() => { setPsAberto(false); recarregarPS(); }} aria-label="Fechar"><i className="fas fa-xmark" /></button></div>
            <div style={{ overflowY: 'auto' }}><PlanoSafra /></div>
          </div>
        </div>
      )}
    </div>
  );
}

const ESTILO = `
  /* coluna da direita: gruda logo abaixo do cabeçalho do portal (84 px) e, se for mais alta que a tela, rola por dentro */
  .nt-lado { top: 96px; max-height: calc(100vh - 108px); overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; padding-right: 4px; align-content: start }
  .nt-lado::-webkit-scrollbar { width: 6px } .nt-lado::-webkit-scrollbar-thumb { background: rgba(148,163,184,.5); border-radius: 6px }
  .nt-filtros { top: 84px }
  .em-iframe .nt-lado { top: 12px; max-height: calc(100vh - 24px) } .em-iframe .nt-filtros { top: 0 }
  @media (max-width: 1100px) { .nt-lado { position: static; max-height: none; overflow: visible } }
  .nt-grade > main, .bo-jornal > main { grid-template-columns: minmax(0, 1fr) } /* a faixa rolável do Plano Safra não pode alargar a coluna */
  .bo-foto { position: relative; overflow: hidden; background: #e2e8f0 }
  .bo-foto img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .6s cubic-bezier(.2,.8,.2,1) }
  .bo-foto-sem { display: grid; place-items: center; align-content: center; gap: 6px; color: #fefefe; background: linear-gradient(135deg, var(--k), color-mix(in srgb, var(--k) 45%, #111111)) }
  .bo-foto-sem::before { content: ''; position: absolute; inset: 0; background-image: radial-gradient(rgba(255,255,255,.14) 1.5px, transparent 1.5px); background-size: 16px 16px }
  .bo-foto-sem i { font-size: 36px; opacity: .9; position: relative } .bo-foto-sem span { position: relative; font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; opacity: .9 }
  .bo-kicker { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; color: var(--k) }
  /* portal */
  .bo-topo-portal { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr); gap: 16px }
  @media (max-width: 900px) { .bo-topo-portal { grid-template-columns: 1fr } }
  .bo-topo-lado { display: grid; gap: 16px }
  .bo-capa { position: relative; display: grid; border: 0; padding: 0; border-radius: 18px; overflow: hidden; cursor: pointer; text-align: left; min-height: 440px; background: #111111; animation: ntSobe .5s ease both }
  .bo-capa-foto { position: absolute; inset: 0 } .bo-capa:hover .bo-foto img { transform: scale(1.04) }
  .bo-capa-texto { position: relative; align-self: end; padding: 28px; color: #fefefe; background: linear-gradient(transparent, rgba(0,0,0,.55) 25%, rgba(0,0,0,.88)) }
  .bo-capa-k { font-size: 12.5px; font-weight: 900; letter-spacing: .1em; text-transform: uppercase; color: #fca5a5 }
  .bo-capa-texto h1 { margin: 8px 0; font-size: clamp(24px, 2.4vw, 34px); line-height: 1.15; font-weight: 900; letter-spacing: -.02em }
  .bo-capa-texto p { margin: 0 0 10px; font-size: 15.5px; line-height: 1.5; opacity: .9 }
  .bo-capa-link { font-size: 13px; font-weight: 700; opacity: .85 }
  .bo-card { display: flex; flex-direction: column; text-align: left; border: 1px solid var(--portal-border, #e2e8f0); padding: 0; border-radius: 14px; overflow: hidden; background: var(--portal-bg-card, #fefefe); cursor: pointer; font: inherit; color: inherit; animation: ntSobe .45s ease both; transition: transform .25s, box-shadow .25s }
  .bo-card:hover { transform: translateY(-4px); box-shadow: 0 16px 34px rgba(15,23,42,.14) } .bo-card:hover .bo-foto img { transform: scale(1.06) }
  .bo-card-foto { height: 170px; flex-shrink: 0 } .bo-card-g .bo-card-foto { height: 240px }
  .bo-card-corpo { padding: 13px 15px 14px; display: flex; flex-direction: column; gap: 6px; flex: 1 }
  .bo-card h3 { margin: 0; font-size: 17px; line-height: 1.3; font-weight: 800; color: ${TX} } .bo-card:hover h3 { color: var(--k) }
  .bo-card p { margin: 0; font-size: 14px; line-height: 1.5; color: var(--portal-text-secondary, #334155); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden }
  .bo-card-rodape { display: flex; justify-content: space-between; gap: 8px; align-items: center; margin-top: auto; padding-top: 6px; font-size: 12.5px; color: ${MU} }
  .bo-ler { color: var(--k); font-weight: 800; white-space: nowrap }
  .bo-grade-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(290px, 100%), 1fr)); gap: 16px }
  /* revista */
  .bo-capa-revista { position: relative; display: grid; border: 0; padding: 0; border-radius: 22px; overflow: hidden; cursor: pointer; text-align: left; height: min(62vh, 560px); background: #111111; animation: ntSobe .5s ease both }
  .bo-capa-revista-foto { position: absolute; inset: 0 } .bo-capa-revista:hover .bo-foto img { transform: scale(1.03) }
  .bo-capa-revista-texto { position: relative; align-self: end; padding: clamp(20px, 4vw, 48px); color: #fefefe; background: linear-gradient(transparent, rgba(0,0,0,.75) 40%) }
  .bo-capa-revista-texto h1 { margin: 10px 0; font-size: clamp(28px, 3.6vw, 52px); line-height: 1.05; font-weight: 900; letter-spacing: -.03em; max-width: 1000px }
  .bo-capa-revista-texto p { margin: 0; font-size: 17px; line-height: 1.5; opacity: .9; max-width: 820px }
  .bo-paineis { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(270px, 100%), 1fr)); gap: 14px; align-items: start }
  .bo-mosaico { columns: 3 300px; column-gap: 16px } .bo-mosaico > .bo-card { break-inside: avoid; margin-bottom: 16px; width: 100% }
  /* jornal */
  .bo-jornal { display: grid; grid-template-columns: minmax(0, 1fr) 400px; gap: 22px; align-items: start }
  @media (max-width: 1100px) { .bo-jornal { grid-template-columns: 1fr } }
  .bo-jornal-manchete { border-bottom: 3px solid #111111; padding-bottom: 14px; animation: ntSobe .5s ease both }
  .bo-jornal-manchete h1 { margin: 6px 0 8px; font-size: clamp(26px, 2.6vw, 36px); line-height: 1.15; font-weight: 900; letter-spacing: -.025em; color: ${TX} }
  .bo-jornal-manchete p { margin: 0; font-size: 17px; line-height: 1.5; color: var(--portal-text-secondary, #334155) }
  .bo-lista { display: grid }
  .bo-lista-sep { font-size: 12.5px; font-weight: 900; letter-spacing: .1em; text-transform: uppercase; color: ${MU}; padding: 14px 0 6px; border-bottom: 1px solid var(--portal-border, #e2e8f0) }
  .bo-item { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 16px; padding: 14px 6px; border: 0; border-bottom: 1px solid var(--portal-border, #e2e8f0); background: none; cursor: pointer; font: inherit; color: inherit; border-radius: 10px; animation: ntSobe .4s ease both; transition: background .2s }
  .bo-item:hover { background: var(--portal-bg-card, #fefefe) } .bo-item:hover .bo-foto img { transform: scale(1.06) } .bo-item:hover h3 { color: var(--k) }
  .bo-item-foto { height: 128px; border-radius: 10px }
  .bo-item-sem { grid-template-columns: minmax(0, 1fr); border-left: 3px solid var(--k); padding-left: 14px; border-radius: 0 10px 10px 0 }
  .bo-item h3 { margin: 4px 0; font-size: 18px; line-height: 1.3; font-weight: 800; color: ${TX} }
  .bo-item p { margin: 0 0 6px; font-size: 14px; line-height: 1.5; color: var(--portal-text-secondary, #334155); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden }
  @media (max-width: 640px) { .bo-item { grid-template-columns: 110px minmax(0, 1fr) } .bo-item-foto { height: 90px } }
  /* clima das notícias */
  .bo-ponteiro { transition: transform 1.2s cubic-bezier(.2,1.3,.3,1); animation: boPonteiro 1.2s cubic-bezier(.2,1.3,.3,1) both }
  @keyframes boPonteiro { from { transform: rotate(-90deg) } }
  .bo-clima-chips { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 12px }
  .bo-clima-chips button { display: grid; justify-items: center; gap: 1px; padding: 8px 4px; border-radius: 10px; border: 1px solid var(--portal-border, #e2e8f0); background: none; cursor: pointer; font: inherit; transition: all .2s }
  .bo-clima-chips button b { font-size: 20px; color: var(--k); line-height: 1.1 } .bo-clima-chips button span { font-size: 11.5px; color: var(--portal-text-muted, #64748b); font-weight: 600 }
  .bo-clima-chips button:hover:not(:disabled) { border-color: var(--k); transform: translateY(-1px) } .bo-clima-chips button:disabled { cursor: default }
  .bo-clima-chips button.on { background: var(--k); border-color: var(--k) } .bo-clima-chips button.on b, .bo-clima-chips button.on span { color: #fefefe }
  .bo-pp-info { display: inline-grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; color: var(--portal-text-muted, #64748b); font-size: 14px; transition: color .2s, background .2s }
  .bo-pp-info:hover { color: #2563eb; background: #eff6ff }
  .bo-pp-quem { display: flex; gap: 8px; font-size: 12.5px; line-height: 1.45; color: var(--portal-text-secondary, #334155); background: color-mix(in srgb, var(--k) 7%, transparent); border-radius: 8px; padding: 8px 10px; margin: 6px 0 4px } .bo-pp-quem i { color: var(--k); margin-top: 2px }
  @media (prefers-reduced-motion: reduce) { .bo-ponteiro { animation: none; transition: none } }
  /* data */
  .bo-data { display: flex; align-items: center; gap: 14px; animation: ntSobe .4s ease both }
  .bo-data-cal { width: 62px; border-radius: 14px; overflow: hidden; text-align: center; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); box-shadow: 0 6px 16px rgba(15,23,42,.08) }
  .bo-data-cal span { display: block; background: #dc2626; color: #fefefe; font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; padding: 3px 0 }
  .bo-data-cal b { display: block; font-size: 28px; font-weight: 900; color: ${TX}; padding: 3px 0 5px; line-height: 1.1 }
  .bo-data-dia { font-size: 22px; font-weight: 900; color: ${TX}; letter-spacing: -.01em }
  .bo-data-longa { font-size: 14.5px; color: ${MU}; font-weight: 600 }
  .bo-data-robo { font-size: 12.5px; color: #15803d; font-weight: 700; margin-top: 2px } .bo-data-robo i { margin-right: 4px }
  /* coluna do plano safra (C) */
  .bo-pp { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); border-top: 4px solid #16a34a; border-radius: 16px; padding: 14px 14px 12px; animation: ntSobe .5s ease both }
  .bo-pp-topo { display: flex; align-items: center; gap: 8px }
  .bo-pp-titulo { font-size: 17px; font-weight: 900; color: ${TX}; white-space: nowrap } .bo-pp-titulo i { color: #16a34a; margin-right: 6px } .bo-pp-titulo span { color: ${MU}; font-weight: 700; font-size: 14px }
  .bo-pp-corrigir { margin-left: auto; width: 32px; height: 32px; border-radius: 9px; border: 1px solid var(--portal-border, #e2e8f0); background: none; color: ${MU}; cursor: pointer } .bo-pp-corrigir:hover { color: #15803d; border-color: #16a34a }
  .bo-pp-sub { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: ${MU}; margin: 6px 0 12px }
  .bo-pp-prog { border: 1px solid var(--portal-border, #e2e8f0); border-radius: 12px; overflow: hidden; transition: box-shadow .2s, border-color .2s }
  .bo-pp-prog.on { border-color: var(--k); box-shadow: 0 8px 20px rgba(15,23,42,.08) }
  .bo-pp-cab { width: 100%; display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 0; background: none; cursor: pointer; font: inherit; color: ${TX} }
  .bo-pp-cab:hover { background: var(--portal-bg-secondary, #f1f5f9) }
  .bo-pp-ponto { width: 10px; height: 10px; border-radius: 4px; background: var(--k); flex-shrink: 0 }
  .bo-pp-cab b { display: block; font-size: 14.5px } .bo-pp-cab small { font-size: 12px; color: ${MU} }
  .bo-pp-menor { text-align: right; font-size: 20px; font-weight: 900; color: var(--k); line-height: 1.05; font-variant-numeric: tabular-nums } .bo-pp-menor small { display: block; font-size: 10.5px; font-weight: 700; color: ${MU}; text-transform: uppercase; letter-spacing: .04em }
  .bo-pp-linhas { border-top: 1px dashed var(--portal-border, #e2e8f0); padding: 4px 6px 8px; animation: ntSobe .3s ease both }
  .bo-pp-linha { display: grid; grid-template-columns: 62px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 8px 6px; border-radius: 8px; text-decoration: none; color: ${TX}; transition: background .15s }
  .bo-pp-linha:hover { background: color-mix(in srgb, var(--k) 8%, transparent) }
  .bo-pp-linha b { font-size: 15px; color: var(--k); font-variant-numeric: tabular-nums }
  .bo-pp-linha span { font-size: 13px; line-height: 1.35 } .bo-pp-linha small { display: block; color: ${MU}; font-size: 11.5px; margin-top: 1px }
  .bo-pp-linha i { color: ${MU}; font-size: 12px; opacity: 0; transition: opacity .15s } .bo-pp-linha:hover i { opacity: 1; color: var(--k) }
  .bo-pp-fonte { display: block; font-size: 12px; font-weight: 700; color: #2563eb; text-decoration: none; padding: 6px 6px 0 }
  /* plano safra */
  .bo-ps { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); border-radius: 16px; padding: 16px; animation: ntSobe .5s ease both }
  .bo-ps-faixa { border-top: 4px solid #16a34a }
  .bo-ps-cabeca { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px }
  .bo-ps-titulo { font-size: 17px; font-weight: 900; color: ${TX} } .bo-ps-titulo i { color: #16a34a; margin-right: 6px }
  .bo-auto { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 800; color: #15803d; background: #dcfce7; border-radius: 999px; padding: 2px 8px }
  .bo-ps-ver { margin-left: auto; border: 1px solid var(--portal-border, #e2e8f0); background: none; border-radius: 9px; padding: 7px 12px; font: inherit; font-size: 13px; font-weight: 700; color: ${TX}; cursor: pointer; white-space: nowrap }
  .bo-ps-ver:hover { border-color: #16a34a; color: #15803d }
  .bo-ps-faixa-lista { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 6px; scroll-snap-type: x mandatory }
  .bo-ps-faixa-lista > .bo-ps-linha { flex: 0 0 240px; scroll-snap-align: start }
  .bo-ps-painel-lista { display: grid; gap: 10px }
  .bo-ps-linha { border: 1px solid var(--portal-border, #e2e8f0); border-left: 4px solid var(--k); border-radius: 12px; padding: 11px 13px; display: grid; gap: 4px; animation: ntSobe .4s ease both; transition: transform .2s, box-shadow .2s }
  .bo-ps-linha:hover { transform: translateY(-2px); box-shadow: 0 10px 22px rgba(15,23,42,.08) }
  .bo-ps-prog { font-size: 11.5px; font-weight: 900; text-transform: uppercase; letter-spacing: .06em; color: var(--k) }
  .bo-ps-taxa { font-size: 24px; font-weight: 900; letter-spacing: -.02em; color: ${TX}; font-variant-numeric: tabular-nums } .bo-ps-taxa small { font-size: 12px; font-weight: 600; color: ${MU} }
  .bo-ps-nome { font-size: 13px; color: ${TX}; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden }
  .bo-ps-info { display: flex; gap: 6px; flex-wrap: wrap } .bo-ps-info span { font-size: 12px; color: ${MU}; background: var(--portal-bg-secondary, #f1f5f9); border-radius: 6px; padding: 2px 7px }
  .bo-ps-acoes { display: flex; gap: 12px; margin-top: 4px } .bo-ps-acoes a { font-size: 12.5px; font-weight: 800; color: var(--k); text-decoration: none } .bo-ps-acoes a:hover { text-decoration: underline }
  /* modal da matéria */
  .bo-modal-fundo { position: fixed; inset: 0; z-index: 9000; background: rgba(15,23,42,.6); backdrop-filter: blur(3px); display: grid; place-items: center; padding: 14px; animation: boFundo .2s ease both }
  @keyframes boFundo { from { opacity: 0 } } .bo-modal-fundo.sai { animation: boSaiF .2s ease both } @keyframes boSaiF { to { opacity: 0 } }
  .bo-modal { width: min(880px, 100%); max-height: calc(100vh - 28px); display: flex; flex-direction: column; background: #fefefe; color: #111111; border-radius: 16px; overflow: hidden; box-shadow: 0 30px 80px rgba(0,0,0,.4); animation: boEntra .35s cubic-bezier(.2,.9,.25,1) both }
  .bo-modal-ps { width: min(1200px, 100%); background: var(--portal-bg, #f8fafc); color: inherit }
  @keyframes boEntra { from { opacity: 0; transform: translateY(24px) scale(.98) } } .bo-modal.sai { animation: boSai .2s ease both } @keyframes boSai { to { opacity: 0; transform: translateY(16px) } }
  .bo-modal-barra { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-bottom: 1px solid #e5e7eb; background: #fefefe; color: #111111 }
  .bo-nav { width: 34px; height: 34px; border-radius: 9px; border: 1px solid #e5e7eb; background: #fefefe; color: #111111; cursor: pointer; transition: background .2s }
  .bo-nav:hover:not(:disabled) { background: #f3f4f6 } .bo-nav:disabled { opacity: .35; cursor: default }
  .bo-materia { overflow-y: auto; padding: 28px clamp(18px, 5vw, 56px) 36px; animation: ntSobe .35s ease both }
  .bo-materia h1 { margin: 10px 0 12px; font-size: clamp(26px, 3vw, 36px); line-height: 1.15; font-weight: 900; letter-spacing: -.025em; color: #111111 }
  .bo-linha-fina { margin: 0 0 16px; font-size: 18px; line-height: 1.55; color: #4b5563; font-weight: 500 }
  .bo-byline { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; font-size: 13.5px; color: #6b7280; padding: 12px 0; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb }
  .bo-materia-foto { margin: 20px 0 6px } .bo-materia-foto .bo-foto { height: auto; max-height: 460px; border-radius: 6px } .bo-materia-foto img { max-height: 460px }
  .bo-materia-foto figcaption { font-size: 12.5px; color: #6b7280; margin-top: 6px }
  .bo-pra-quem { display: flex; gap: 12px; margin: 20px 0; padding: 14px 16px; border-left: 4px solid var(--k); background: color-mix(in srgb, var(--k) 8%, #fefefe); border-radius: 0 10px 10px 0; font-size: 15px; line-height: 1.5; color: #111111 }
  .bo-pra-quem i { color: var(--k); font-size: 18px; margin-top: 2px }
  .bo-texto p { font-size: 17px; line-height: 1.75; color: #1f2937; margin: 0 0 16px }
  .bo-sem-texto { display: flex; gap: 8px; align-items: center; font-size: 14px; color: #475569; background: #f1f5f9; border-radius: 10px; padding: 10px 13px; margin-bottom: 4px }
  .bo-link-final { display: flex; align-items: center; gap: 14px; margin-top: 26px; padding: 16px 18px; border-radius: 14px; background: #111111; color: #fefefe; text-decoration: none; transition: transform .2s, background .2s }
  .bo-link-final:hover { transform: translateY(-2px); background: #dc2626 }
  .bo-link-final b { display: block; font-size: 16px } .bo-link-final small { display: block; font-size: 12.5px; opacity: .75; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
  .bo-link-ic { width: 42px; height: 42px; border-radius: 12px; background: rgba(255,255,255,.14); display: grid; place-items: center; flex-shrink: 0; font-size: 16px }
  .bo-fim { margin-top: 12px; font-size: 12px; color: #9ca3af }
  @media (prefers-reduced-motion: reduce) { .bo-capa, .bo-capa-revista, .bo-card, .bo-item, .bo-ps, .bo-ps-linha, .bo-modal, .bo-modal-fundo, .bo-materia, .bo-jornal-manchete { animation: none !important } .bo-foto img { transition: none } }
`;
