'use client';
// Site → Promoções (José, 12/11/2026): "coloca a foto da promoção, ou seleciona uma máquina do site, para aparecer como
// nos outros sites". Carrossel na página inicial; só aparece quando houver promoção ligada e dentro da data.
// 12/11 tarde: estilo NewPortal; cada campo e botão diz o que faz; guia de tamanho ideal das artes e aviso quando a
// arte enviada não tem o tamanho certo; prévia de computador e celular ao vivo.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAuth } from '@/lib/auth/client';
import { Aviso, ComoLer, tela } from '@/components/site/ui';
import PublicarBarra from '@/components/site/PublicarBarra';
import EnviarFoto from '@/components/site/EnviarFoto';
import { PreviaPromocao } from '@/components/site/Previa';

type Promo = {
  id: string; titulo: string; texto: string | null; imagem: string | null; imagem_celular?: string | null; produto_slug: string | null; link: string | null
  botao: string | null; inicio: string | null; fim: string | null; ativo: boolean; ordem: number; atualizado_por: string | null
};
type Maquina = { slug: string; titulo: string; marca: string; foto: string | null; categoria: string };
type Rascunho = Omit<Promo, 'id' | 'ordem' | 'atualizado_por'> & { id?: string };

import { AZUL, Campo, Quadradinho, Secao, T1, T2, T3, bt, campoNP, cartaoNP, grade, ic } from '@/components/site/np';

/** Tamanho real da imagem (para avisar quando a arte não tem o formato certo). */
function useTamanho(url: string | null | undefined) {
  const [t, setT] = useState<{ url: string; w: number; h: number } | null>(null);
  useEffect(() => {
    if (!url) return;
    const img = new Image();
    img.onload = () => setT({ url, w: img.naturalWidth, h: img.naturalHeight });
    img.src = url;
  }, [url]);
  return url && t?.url === url ? t : null;
}

/** Selo do tamanho: verde quando a proporção bate com a ideal, âmbar quando não. */
function SeloTamanho({ url, ideal }: { url: string | null | undefined; ideal: { w: number; h: number; nome: string } }) {
  const t = useTamanho(url);
  if (!url) return <span style={{ fontSize: 12, color: T3 }}>Ideal: {ideal.w}×{ideal.h} px ({ideal.nome})</span>;
  if (!t) return <span style={{ fontSize: 12, color: T3 }}>Medindo…</span>;
  const ok = Math.abs(t.w / t.h - ideal.w / ideal.h) < 0.08;
  const pequena = t.w < ideal.w * 0.6;
  const cor = ok && !pequena ? '#16a34a' : '#b45309';
  return (
    <span style={{ fontSize: 12, color: cor, display: 'flex', gap: 6, alignItems: 'flex-start', lineHeight: 1.45 }}>
      {ic(ok && !pequena ? 'fa-circle-check' : 'fa-triangle-exclamation')}
      <span>
        Esta tem {t.w}×{t.h} px.{' '}
        {ok && !pequena ? 'Tamanho certo.' : !ok ? `O ideal é ${ideal.w}×${ideal.h} px (${ideal.nome}): no site ela fica com faixas ou cortada.` : `Pequena: no computador pode ficar borrada (ideal ${ideal.w}×${ideal.h}).`}
      </span>
    </span>
  );
}

const muted = T3;
const hoje = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const dataBR = (d: string) => d.split('-').reverse().join('/');
const VAZIA: Rascunho = { titulo: '', texto: '', imagem: null, imagem_celular: null, produto_slug: null, link: '', botao: '', inicio: null, fim: null, ativo: true };
const IDEAL_PC = { w: 1920, h: 640, nome: 'deitada, 3 por 1' };
const IDEAL_CEL = { w: 1080, h: 1080, nome: 'quadrada' };

function situacao(p: Promo): { txt: string; cor: string } {
  const h = hoje();
  if (!p.ativo) return { txt: 'Desligada (não aparece no site)', cor: '#64748b' };
  if (p.fim && p.fim < h) return { txt: `Venceu em ${dataBR(p.fim)}`, cor: '#64748b' };
  if (p.inicio && p.inicio > h) return { txt: `Começa em ${dataBR(p.inicio)}`, cor: '#0284c7' };
  return { txt: p.fim ? `No ar até ${dataBR(p.fim)}` : 'No ar', cor: '#16a34a' };
}

export default function PromocoesSitePage() {
  const [promos, setPromos] = useState<Promo[] | null>(null);
  const [maquinas, setMaquinas] = useState<Maquina[]>([]);
  const [podeEditar, setPodeEditar] = useState(false);
  const [erro, setErro] = useState('');
  const [r, setR] = useState<Rascunho | null>(null);
  const [modo, setModo] = useState<'foto' | 'maquina'>('foto');
  const [buscaMaq, setBuscaMaq] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState('');
  const [versao, setVersao] = useState(0);

  const carregar = useCallback(async () => {
    const [a, b] = await Promise.all([fetchAuth('/api/site/promocoes'), fetchAuth('/api/site/catalogo')]);
    const ja = await a.json().catch(() => ({}));
    const jb = await b.json().catch(() => ({}));
    if (!a.ok || !ja.ok) { setErro(ja.erro || 'Não consegui carregar as promoções.'); setPromos([]); }
    else { setErro(''); setPromos(ja.promocoes); setPodeEditar(!!ja.podeEditar); }
    if (jb.ok) setMaquinas((jb.itens || []).filter((i: Maquina & { publicar?: boolean; mudanca?: { oculto?: boolean } }) => i.publicar !== false && !i.mudanca?.oculto));
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar(); }, [carregar]);
  const mudou = () => { setVersao((n) => n + 1); carregar(); };

  const maq = (slug: string | null) => maquinas.find((m) => m.slug === slug);
  const achadas = useMemo(() => {
    const q = buscaMaq.trim().toLowerCase();
    return maquinas.filter((m) => !q || `${m.titulo} ${m.marca}`.toLowerCase().includes(q)).slice(0, 40);
  }, [maquinas, buscaMaq]);
  const noAr = (promos || []).filter((p) => situacao(p).cor === '#16a34a').length;

  function abrir(p?: Promo) {
    setErroForm(''); setBuscaMaq('');
    if (p) { setR({ ...p, texto: p.texto || '', link: p.link || '', botao: p.botao || '' }); setModo(p.imagem ? 'foto' : 'maquina'); }
    else { setR({ ...VAZIA }); setModo('foto'); }
    if (typeof window !== 'undefined') setTimeout(() => document.getElementById('editor-promo')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  async function chamar(metodo: string, corpo?: unknown, q = '') {
    setSalvando(true); setErroForm('');
    const res = await fetchAuth(`/api/site/promocoes${q}`, { method: metodo, headers: corpo ? { 'Content-Type': 'application/json' } : undefined, body: corpo ? JSON.stringify(corpo) : undefined });
    const j = await res.json().catch(() => ({}));
    setSalvando(false);
    if (!res.ok || !j.ok) { setErroForm(j.erro || 'Não consegui gravar.'); if (!r) alert(j.erro || 'Não consegui gravar.'); return null; }
    return j;
  }

  async function salvar() {
    if (!r) return;
    const corpo = { ...r, imagem: modo === 'foto' ? r.imagem : null, imagem_celular: modo === 'foto' ? r.imagem_celular ?? null : null };
    if (modo === 'foto' && !corpo.imagem) { setErroForm('Envie a arte do computador.'); return; }
    if (modo === 'maquina' && !corpo.produto_slug) { setErroForm('Escolha a máquina.'); return; }
    if (!corpo.titulo.trim()) { setErroForm('Escreva o título.'); return; }
    const j = await chamar(r.id ? 'PATCH' : 'POST', corpo);
    if (j) { setR(null); mudou(); }
  }
  async function ligar(p: Promo) { if (await chamar('PATCH', { id: p.id, ativo: !p.ativo })) mudou(); }
  async function apagar(p: Promo) { if (confirm(`Apagar de vez a promoção "${p.titulo}"? (Para tirar do site só por um tempo, use Desligar.)`) && (await chamar('DELETE', undefined, `?id=${p.id}`))) mudou(); }
  async function mover(i: number, d: number) {
    const l = [...(promos || [])]; const j = i + d;
    if (j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]];
    setPromos(l);
    if (await chamar('PATCH', { ordem: l.map((p) => p.id) })) mudou();
  }

  const faixa = (p: Pick<Promo, 'imagem' | 'imagem_celular'>) => !!(p.imagem && p.imagem_celular);

  return (
    <div style={{ ...tela, color: T1 }}>
      {erro && <Aviso>{erro}</Aviso>}
      <PublicarBarra versao={versao} />

      <section style={{ ...cartaoNP, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <Quadradinho icone="fa-bullhorn" cor="#dc2626" tam={40} />
        <span style={{ flex: '1 1 260px', display: 'grid', gap: 2 }}>
          <span style={{ fontSize: 16, fontWeight: 500 }}>
            {noAr ? `${noAr} ${noAr === 1 ? 'promoção no ar' : 'promoções no ar'} na página inicial do site` : 'Nenhuma promoção no ar: o bloco não aparece no site'}
          </span>
          <span style={{ fontSize: 13, color: T3 }}>Com mais de uma, o site passa uma de cada vez, a cada 6 segundos, na ordem desta lista.</span>
        </span>
        {podeEditar && <button style={bt('#dc2626', true)} onClick={() => abrir()}>{ic('fa-plus')}Nova promoção</button>}
      </section>

      {r && (
        <div id="editor-promo" style={{ display: 'grid', gap: 14, scrollMarginTop: 80 }}>
          <Secao icone="fa-shapes" titulo={r.id ? 'Mudar promoção' : 'Nova promoção'} sub="Primeiro escolha o que vai aparecer no quadro">
            <div style={grade(260)}>
              {([
                ['foto', 'fa-image', 'Arte da promoção', 'Uma imagem pronta, feita no Canva ou pelo designer (ex.: a arte do Instagram).'],
                ['maquina', 'fa-tractor', 'Máquina do site', 'Usa a foto da máquina que já está no site. O botão leva para a página dela.'],
              ] as const).map(([id, icone, t, d]) => (
                <button key={id} type="button" onClick={() => setModo(id)}
                  style={{ ...cartaoNP, padding: 14, display: 'flex', gap: 12, alignItems: 'flex-start', textAlign: 'left', cursor: 'pointer', font: 'inherit', color: T1,
                    borderColor: modo === id ? '#dc2626' : 'var(--border)', background: modo === id ? 'color-mix(in srgb, #dc2626 6%, var(--surface))' : 'var(--surface)' }}>
                  <Quadradinho icone={icone} cor={modo === id ? '#dc2626' : '#64748b'} />
                  <span style={{ display: 'grid', gap: 2 }}>
                    <span style={{ fontSize: 15, fontWeight: 500 }}>{t}</span>
                    <span style={{ fontSize: 13, color: T3, lineHeight: 1.45 }}>{d}</span>
                  </span>
                </button>
              ))}
            </div>
          </Secao>

          {modo === 'foto' ? (
            <Secao icone="fa-ruler-combined" cor="#7c3aed" titulo="Artes e tamanhos" sub="Envie a arte do computador e, se tiver, a do celular">
              <div style={{ display: 'grid', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'var(--portal-bg-secondary, color-mix(in srgb, #7c3aed 4%, var(--surface)))', fontSize: 13, color: T2, lineHeight: 1.5 }}>
                <span style={{ color: T1, fontWeight: 500 }}>Tamanho ideal</span>
                <span>{ic('fa-desktop')}&nbsp; <b style={{ fontWeight: 500, color: T1 }}>Computador: 1920 × 640 px</b> (deitada, 3 por 1). Deixe o texto importante no meio, longe das bordas.</span>
                <span>{ic('fa-mobile-screen')}&nbsp; <b style={{ fontWeight: 500, color: T1 }}>Celular: 1080 × 1080 px</b> (quadrada). É o mesmo tamanho do post do feed do Instagram.</span>
                <span>{ic('fa-circle-info')}&nbsp; Com as <b style={{ fontWeight: 500, color: T1 }}>duas</b>, o quadro do site mostra só a arte, larga e inteira. Com só a do computador (ou um story), ela aparece ao lado do título e do texto.</span>
                <span style={{ color: T3 }}>JPG, PNG ou WebP, até 8 MB (foto grande do celular é reduzida sozinha).</span>
              </div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ display: 'grid', gap: 8, flex: '3 1 320px', minWidth: 0 }}>
                  <span style={{ fontSize: 13, color: T2 }}>{ic('fa-desktop')}&nbsp; Arte do computador <span style={{ color: T3 }}>(obrigatória)</span></span>
                  <span style={{ aspectRatio: '3', borderRadius: 12, background: '#111111', display: 'grid', placeItems: 'center', overflow: 'hidden', border: '1px solid var(--border)' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {r.imagem ? <img src={r.imagem} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ color: '#94a3b8', fontSize: 13 }}>1920 × 640</span>}
                  </span>
                  <SeloTamanho url={r.imagem} ideal={IDEAL_PC} />
                  <EnviarFoto pasta="promocoes" rotulo={r.imagem ? 'Trocar a arte do computador' : 'Enviar a arte do computador'} onEnviada={([u]) => setR({ ...r, imagem: u })} />
                </div>
                <div style={{ display: 'grid', gap: 8, flex: '1 1 180px', maxWidth: 260, minWidth: 0 }}>
                  <span style={{ fontSize: 13, color: T2 }}>{ic('fa-mobile-screen')}&nbsp; Arte do celular <span style={{ color: T3 }}>(recomendada)</span></span>
                  <span style={{ aspectRatio: '1', borderRadius: 12, background: '#111111', display: 'grid', placeItems: 'center', overflow: 'hidden', border: '1px solid var(--border)' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {r.imagem_celular ? <img src={r.imagem_celular} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ color: '#94a3b8', fontSize: 13 }}>1080 × 1080</span>}
                  </span>
                  <SeloTamanho url={r.imagem_celular} ideal={IDEAL_CEL} />
                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <EnviarFoto pasta="promocoes" rotulo={r.imagem_celular ? 'Trocar' : 'Enviar a do celular'} onEnviada={([u]) => setR({ ...r, imagem_celular: u })} />
                    {r.imagem_celular && <button type="button" style={bt('#64748b')} onClick={() => setR({ ...r, imagem_celular: null })} title="Tira a arte do celular: o quadro volta a mostrar a arte ao lado do texto">{ic('fa-xmark')}Tirar</button>}
                  </span>
                </div>
              </div>
              <Campo rotulo="Máquina ligada a esta promoção (opcional)" ajuda="Se escolher, o botão da promoção leva para a página da máquina no site. Se não, abre o WhatsApp do vendedor com a mensagem “Vi a promoção … no site”.">
                <select style={campoNP} value={r.produto_slug || ''} onChange={(e) => setR({ ...r, produto_slug: e.target.value || null })}>
                  <option value="">Nenhuma: o botão abre o WhatsApp</option>
                  {maquinas.map((m) => <option key={m.slug} value={m.slug}>{m.titulo}</option>)}
                </select>
              </Campo>
            </Secao>
          ) : (
            <Secao icone="fa-tractor" cor="#dc2626" titulo="Qual máquina" sub="Toque na máquina. A foto e a página dela vêm do próprio site">
              <input style={{ ...campoNP, maxWidth: 420 }} placeholder="Buscar máquina pelo nome ou marca" value={buscaMaq} onChange={(e) => setBuscaMaq(e.target.value)} />
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(min(150px, 100%), 1fr))', maxHeight: 380, overflowY: 'auto', padding: 2 }}>
                {achadas.map((m) => (
                  <button key={m.slug} type="button" onClick={() => setR({ ...r, produto_slug: m.slug, titulo: r.titulo || m.titulo })}
                    style={{ ...cartaoNP, padding: 8, display: 'grid', gap: 6, cursor: 'pointer', font: 'inherit', color: T1, textAlign: 'left',
                      borderColor: r.produto_slug === m.slug ? '#dc2626' : 'var(--border)', boxShadow: r.produto_slug === m.slug ? '0 0 0 1px #dc2626' : 'none' }}>
                    <span style={{ aspectRatio: '4 / 3', borderRadius: 10, background: '#fefefe', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {m.foto ? <img src={m.foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} loading="lazy" /> : ic('fa-image')}
                    </span>
                    <span style={{ fontSize: 13 }}>{m.titulo}</span>
                  </button>
                ))}
              </div>
            </Secao>
          )}

          <Secao icone="fa-pen-to-square" titulo="Textos e botão" sub={faixa(r) && modo === 'foto' ? 'Com as duas artes, o texto não aparece no quadro (já está na arte): serve para o Google e para quem usa leitor de tela' : 'Aparecem ao lado da arte, no site'}>
            <div style={grade(260)}>
              <Campo rotulo="Título" ajuda="A frase principal, em letra grande. Curta: até 80 letras. Ex.: “Mahindra 6075 com primeira parcela depois da safra”.">
                <input style={campoNP} maxLength={80} value={r.titulo} placeholder="Ex.: Mahindra 6075 com taxa especial" onChange={(e) => setR({ ...r, titulo: e.target.value })} />
              </Campo>
              <Campo rotulo="Texto do botão (opcional)" ajuda="O que está escrito no botão vermelho. Vazio: “Quero essa condição” (WhatsApp) ou “Ver condições” (página da máquina).">
                <input style={campoNP} maxLength={30} value={r.botao || ''} placeholder="Ex.: Quero essa condição" onChange={(e) => setR({ ...r, botao: e.target.value })} />
              </Campo>
            </div>
            <Campo rotulo="Linha de apoio (opcional)" ajuda="Uma ou duas frases embaixo do título: a condição, o prazo, o que está incluso.">
              <textarea style={{ ...campoNP, minHeight: 70, resize: 'vertical' }} maxLength={240} value={r.texto || ''} placeholder="Ex.: Entrada facilitada e primeira parcela para depois da safra." onChange={(e) => setR({ ...r, texto: e.target.value })} />
            </Campo>
            <Campo rotulo="Para onde o botão leva (opcional)" ajuda="Deixe vazio na maioria das vezes: vai para a página da máquina escolhida ou para o WhatsApp do vendedor. Use só para mandar a outra página, ex.: /credito/.">
              <input style={campoNP} value={r.link || ''} placeholder="Vazio = página da máquina ou WhatsApp" onChange={(e) => setR({ ...r, link: e.target.value })} />
            </Campo>
          </Secao>

          <Secao icone="fa-calendar-days" cor="#0284c7" titulo="Quando aparece" sub="Sem datas, fica no ar até alguém desligar">
            <div style={grade(200)}>
              <Campo rotulo="Começa em (opcional)" ajuda="Antes deste dia a promoção não aparece no site.">
                <input type="date" style={campoNP} value={r.inicio || ''} onChange={(e) => setR({ ...r, inicio: e.target.value || null })} />
              </Campo>
              <Campo rotulo="Termina em (opcional)" ajuda="Depois deste dia ela sai do site sozinha, sem precisar publicar.">
                <input type="date" style={campoNP} value={r.fim || ''} onChange={(e) => setR({ ...r, fim: e.target.value || null })} />
              </Campo>
            </div>
          </Secao>

          {/* Prévia ao vivo (José, 12/11: "dentro já mostra como fica no site em celular e no PC") */}
          {(() => {
            const m = maq(r.produto_slug);
            const link = (r.link || '').trim();
            const whats = link ? /wa\.me|whatsapp/.test(link) : !m;
            return (
              <section style={cartaoNP}>
                <PreviaPromocao total={Math.max(1, (promos || []).filter((p) => p.ativo).length + (r.id ? 0 : 1))} p={{
                  titulo: r.titulo || m?.titulo || '', texto: r.texto, botao: r.botao, fim: r.fim, whats,
                  imagem: modo === 'foto' ? r.imagem : null, imagem_celular: modo === 'foto' ? r.imagem_celular : null,
                  maquina: m ? { nome: m.titulo, foto: m.foto } : null,
                }} />
              </section>
            );
          })()}

          <section style={{ ...cartaoNP, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {erroForm && <span style={{ flexBasis: '100%', color: '#dc2626', fontSize: 13 }}>{ic('fa-circle-exclamation')} {erroForm}</span>}
            <button style={bt('#dc2626', true)} disabled={salvando} onClick={salvar}>{ic('fa-floppy-disk')}{salvando ? 'Gravando…' : r.id ? 'Gravar mudanças' : 'Criar promoção'}</button>
            <button style={bt('#64748b')} onClick={() => setR(null)}>Cancelar</button>
            <span style={{ fontSize: 12, color: T3, marginLeft: 'auto' }}>Depois de gravar, toque em <b style={{ fontWeight: 500 }}>Publicar site</b> (no alto) para ir para o site.</span>
          </section>
        </div>
      )}

      {promos && promos.length > 0 && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: T3, padding: '0 4px' }}>
          <span>{ic('fa-pen')} Mudar: abre para trocar arte, textos e datas</span>
          <span>{ic('fa-eye-slash')} Desligar: tira do site sem apagar</span>
          <span>{ic('fa-arrow-up')}{ic('fa-arrow-down')} ordem em que passam no site</span>
          <span>{ic('fa-trash')} Apagar: some de vez</span>
        </div>
      )}

      <div style={grade(320)}>
        {promos === null && <p>Carregando…</p>}
        {promos?.map((p, i) => {
          const s = situacao(p);
          const m = maq(p.produto_slug);
          const img = p.imagem || m?.foto || null;
          return (
            <section key={p.id} style={{ ...cartaoNP, display: 'grid', gap: 12, alignContent: 'start', opacity: s.cor === '#64748b' ? 0.65 : 1 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 999, color: s.cor, background: `color-mix(in srgb, ${s.cor} 11%, transparent)` }}>{s.txt}</span>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: T3 }}>{i + 1}ª no carrossel</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ flex: 3, aspectRatio: '3', borderRadius: 10, background: p.imagem ? '#111111' : '#fefefe', display: 'grid', placeItems: 'center', overflow: 'hidden', border: '1px solid var(--border)', position: 'relative' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {img ? <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} loading="lazy" /> : ic('fa-image')}
                  <span style={{ position: 'absolute', left: 6, bottom: 6, fontSize: 11, padding: '1px 6px', borderRadius: 6, background: 'rgba(17,17,17,.7)', color: '#fefefe' }}>{ic('fa-desktop')} computador</span>
                </span>
                {p.imagem_celular && (
                  <span style={{ flex: 1, aspectRatio: '1', borderRadius: 10, background: '#111111', overflow: 'hidden', border: '1px solid var(--border)', position: 'relative' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.imagem_celular} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} loading="lazy" />
                    <span style={{ position: 'absolute', left: 4, bottom: 4, fontSize: 11, padding: '1px 5px', borderRadius: 6, background: 'rgba(17,17,17,.7)', color: '#fefefe' }}>{ic('fa-mobile-screen')}</span>
                  </span>
                )}
              </div>
              <span style={{ display: 'grid', gap: 3 }}>
                <span style={{ fontSize: 15.5, fontWeight: 500, lineHeight: 1.35 }}>{p.titulo}</span>
                {p.texto && <span style={{ fontSize: 13, color: T2 }}>{p.texto}</span>}
                <span style={{ fontSize: 12, color: T3 }}>
                  {p.imagem ? (faixa(p) ? 'Arte do computador e do celular: aparece só a arte, larga' : 'Uma arte: aparece ao lado do texto') : `Máquina do site: ${m?.titulo || p.produto_slug}`}
                  {' · '}botão leva {p.link ? `para ${p.link}` : p.produto_slug ? 'à página da máquina' : 'ao WhatsApp'}
                </span>
              </span>
              {podeEditar && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  <button style={bt(AZUL)} onClick={() => abrir(p)} title="Trocar arte, textos e datas">{ic('fa-pen')}Mudar</button>
                  <button style={bt(p.ativo ? '#64748b' : '#16a34a')} disabled={salvando} onClick={() => ligar(p)}
                    title={p.ativo ? 'Tira do site sem apagar (dá para ligar de novo)' : 'Volta a aparecer no site'}>
                    {ic(p.ativo ? 'fa-eye-slash' : 'fa-eye')}{p.ativo ? 'Desligar' : 'Ligar'}
                  </button>
                  <button aria-label="Passar antes no carrossel" title="Passar antes no carrossel" style={{ ...bt('#64748b'), padding: '8px 12px' }} disabled={i === 0 || salvando} onClick={() => mover(i, -1)}>{ic('fa-arrow-up')}</button>
                  <button aria-label="Passar depois no carrossel" title="Passar depois no carrossel" style={{ ...bt('#64748b'), padding: '8px 12px' }} disabled={i === (promos?.length || 0) - 1 || salvando} onClick={() => mover(i, 1)}>{ic('fa-arrow-down')}</button>
                  <button aria-label="Apagar de vez" title="Apagar de vez" style={{ ...bt('#dc2626'), padding: '8px 12px', marginLeft: 'auto' }} disabled={salvando} onClick={() => apagar(p)}>{ic('fa-trash')}</button>
                </div>
              )}
            </section>
          );
        })}
        {promos && !promos.length && !erro && <p style={{ color: muted }}>Nenhuma promoção criada ainda.</p>}
      </div>

      <ComoLer>
        Cada promoção vira um quadro no carrossel da <b>página inicial</b> do site, logo abaixo do vídeo. Pode ser uma <b>arte pronta</b>
        (tamanho ideal: 1920×640 no computador e 1080×1080 no celular) ou uma <b>máquina do site</b> (usa a foto e a página dela).
        <b> Desligar</b> tira do site sem apagar; com data de fim, sai sozinha no dia. Sem nenhuma promoção no ar, o bloco não aparece.
        Depois de criar ou mudar, toque em <b>Publicar site</b>.
      </ComoLer>
    </div>
  );
}
