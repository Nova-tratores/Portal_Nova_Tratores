'use client';
// Site → Promoções (José, 12/11/2026): "coloca a foto da promoção, ou seleciona uma máquina do site, para aparecer como
// nos outros sites". Carrossel na página inicial; só aparece quando houver promoção ligada e dentro da data.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAuth } from '@/lib/auth/client';
import { Aviso, ComoLer, botao, campo, cartao, grade, tela } from '@/components/site/ui';
import PublicarBarra from '@/components/site/PublicarBarra';
import EnviarFoto from '@/components/site/EnviarFoto';
import { PreviaPromocao } from '@/components/site/Previa';

type Promo = {
  id: string; titulo: string; texto: string | null; imagem: string | null; imagem_celular?: string | null; produto_slug: string | null; link: string | null
  botao: string | null; inicio: string | null; fim: string | null; ativo: boolean; ordem: number; atualizado_por: string | null
};
type Maquina = { slug: string; titulo: string; marca: string; foto: string | null; categoria: string };
type Rascunho = Omit<Promo, 'id' | 'ordem' | 'atualizado_por'> & { id?: string };

const muted = 'var(--portal-text-muted, #6b7280)';
const hoje = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const dataBR = (d: string) => d.split('-').reverse().join('/');
const VAZIA: Rascunho = { titulo: '', texto: '', imagem: null, imagem_celular: null, produto_slug: null, link: '', botao: '', inicio: null, fim: null, ativo: true };

function situacao(p: Promo): { txt: string; cor: string } {
  const h = hoje();
  if (!p.ativo) return { txt: 'Desligada', cor: '#6b7280' };
  if (p.fim && p.fim < h) return { txt: `Venceu em ${dataBR(p.fim)}`, cor: '#6b7280' };
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
  }

  async function chamar(metodo: string, corpo?: unknown, q = '') {
    setSalvando(true); setErroForm('');
    const res = await fetchAuth(`/api/site/promocoes${q}`, { method: metodo, headers: corpo ? { 'Content-Type': 'application/json' } : undefined, body: corpo ? JSON.stringify(corpo) : undefined });
    const j = await res.json().catch(() => ({}));
    setSalvando(false);
    if (!res.ok || !j.ok) { setErroForm(j.erro || 'Não consegui gravar.'); alert(j.erro || 'Não consegui gravar.'); return null; }
    return j;
  }

  async function salvar() {
    if (!r) return;
    const corpo = { ...r, imagem: modo === 'foto' ? r.imagem : null, imagem_celular: modo === 'foto' ? r.imagem_celular ?? null : null };
    if (modo === 'foto' && !corpo.imagem) { setErroForm('Envie a foto da promoção.'); return; }
    if (modo === 'maquina' && !corpo.produto_slug) { setErroForm('Escolha a máquina.'); return; }
    if (!corpo.titulo.trim()) { setErroForm('Escreva o título.'); return; }
    const j = await chamar(r.id ? 'PATCH' : 'POST', corpo);
    if (j) { setR(null); mudou(); }
  }
  async function ligar(p: Promo) { if (await chamar('PATCH', { id: p.id, ativo: !p.ativo })) mudou(); }
  async function apagar(p: Promo) { if (confirm(`Apagar a promoção "${p.titulo}"?`) && (await chamar('DELETE', undefined, `?id=${p.id}`))) mudou(); }
  async function mover(i: number, d: number) {
    const l = [...(promos || [])]; const j = i + d;
    if (j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]];
    setPromos(l);
    if (await chamar('PATCH', { ordem: l.map((p) => p.id) })) mudou();
  }

  const imagemDe = (p: Pick<Promo, 'imagem' | 'produto_slug'>) => p.imagem || maq(p.produto_slug)?.foto || null;

  return (
    <div style={tela}>
      {erro && <Aviso>{erro}</Aviso>}
      <PublicarBarra versao={versao} />

      <div style={{ ...cartao, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <span style={{ flex: '1 1 260px', display: 'grid', gap: 2 }}>
          <b style={{ fontWeight: 500, fontSize: 16 }}>
            {noAr ? `${noAr} ${noAr === 1 ? 'promoção no ar' : 'promoções no ar'} na página inicial` : 'Nenhuma promoção no ar: o bloco não aparece no site'}
          </b>
          <span style={{ fontSize: 13, color: muted }}>Com mais de uma, o site passa uma de cada vez, na ordem desta lista.</span>
        </span>
        {podeEditar && <button style={botao()} onClick={() => abrir()}><i className="fa-solid fa-plus" style={{ fontWeight: 900 }} />Nova promoção</button>}
      </div>

      {r && (
        <div style={{ ...cartao, display: 'grid', gap: 14 }}>
          <b style={{ fontWeight: 500 }}>{r.id ? 'Mudar promoção' : 'Nova promoção'}</b>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button style={botao('#dc2626', modo === 'foto')} onClick={() => setModo('foto')}><i className="fa-solid fa-image" style={{ fontWeight: 900 }} />Foto da promoção</button>
            <button style={botao('#dc2626', modo === 'maquina')} onClick={() => setModo('maquina')}><i className="fa-solid fa-tractor" style={{ fontWeight: 900 }} />Máquina do site</button>
          </div>

          {modo === 'foto' ? (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {/* 12/11: arte feita para o site = deitada (computador, 1920×640) + quadrada (celular, 1080×1080) → a faixa mostra só a arte */}
              <span style={{ display: 'grid', gap: 6, flex: '2 1 300px' }}>
                <span style={{ fontSize: 13 }}>Arte do computador <span style={{ color: muted }}>(deitada, 1920×640)</span></span>
                <span style={{ aspectRatio: '3', borderRadius: 12, background: '#111', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {r.imagem ? <img src={r.imagem} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <i className="fa-solid fa-image" style={{ color: '#9ca3af', fontSize: 28 }} />}
                </span>
                <EnviarFoto pasta="promocoes" rotulo={r.imagem ? 'Trocar' : 'Enviar a arte'} onEnviada={([u]) => setR({ ...r, imagem: u })} />
              </span>
              <span style={{ display: 'grid', gap: 6, flex: '1 1 160px', maxWidth: 220 }}>
                <span style={{ fontSize: 13 }}>Arte do celular <span style={{ color: muted }}>(quadrada, 1080×1080)</span></span>
                <span style={{ aspectRatio: '1', borderRadius: 12, background: '#111', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {r.imagem_celular ? <img src={r.imagem_celular} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <i className="fa-solid fa-mobile-screen" style={{ color: '#9ca3af', fontSize: 28 }} />}
                </span>
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <EnviarFoto pasta="promocoes" rotulo={r.imagem_celular ? 'Trocar' : 'Enviar'} onEnviada={([u]) => setR({ ...r, imagem_celular: u })} />
                  {r.imagem_celular && <button type="button" style={botao('#6b7280', false)} onClick={() => setR({ ...r, imagem_celular: null })}>Tirar</button>}
                </span>
              </span>
              <span style={{ display: 'grid', gap: 6, flexBasis: '100%' }}>
                <span style={{ fontSize: 12, color: muted }}>
                  Com as <b>duas</b> artes (feitas para o site), o quadro mostra só a arte, inteira e larga, como nos outros sites.
                  Com só uma arte (ex.: o story do Instagram), ela aparece inteira ao lado do título e do texto. JPG, PNG ou WebP.
                </span>
                <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Máquina ligada a esta promoção (opcional)
                  <select style={campo} value={r.produto_slug || ''} onChange={(e) => setR({ ...r, produto_slug: e.target.value || null })}>
                    <option value="">Nenhuma (o botão abre o WhatsApp)</option>
                    {maquinas.map((m) => <option key={m.slug} value={m.slug}>{m.titulo}</option>)}
                  </select>
                </label>
              </span>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              <input style={{ ...campo, maxWidth: 420 }} placeholder="Buscar máquina" value={buscaMaq} onChange={(e) => setBuscaMaq(e.target.value)} />
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(min(150px, 100%), 1fr))', maxHeight: 360, overflowY: 'auto', padding: 2 }}>
                {achadas.map((m) => (
                  <button key={m.slug} onClick={() => setR({ ...r, produto_slug: m.slug, titulo: r.titulo || m.titulo })}
                    style={{ ...cartao, padding: 8, display: 'grid', gap: 6, cursor: 'pointer', font: 'inherit', color: 'inherit', textAlign: 'left', outline: r.produto_slug === m.slug ? '2px solid #dc2626' : 'none' }}>
                    <span style={{ aspectRatio: '4 / 3', borderRadius: 8, background: '#fff', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {m.foto ? <img src={m.foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} loading="lazy" /> : <i className="fa-solid fa-image" />}
                    </span>
                    <span style={{ fontSize: 13 }}>{m.titulo}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={grade(240)}>
            <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Título (o que chama atenção)
              <input style={campo} maxLength={80} value={r.titulo} placeholder="Ex.: Mahindra 6075 com taxa especial" onChange={(e) => setR({ ...r, titulo: e.target.value })} />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Texto do botão (opcional)
              <input style={campo} maxLength={30} value={r.botao || ''} placeholder="Ex.: Quero essa condição" onChange={(e) => setR({ ...r, botao: e.target.value })} />
            </label>
          </div>
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Linha de apoio (opcional)
            <textarea style={{ ...campo, minHeight: 64, resize: 'vertical' }} maxLength={240} value={r.texto || ''} placeholder="Ex.: Entrada facilitada e primeira parcela para depois da safra. Válido enquanto durar o estoque." onChange={(e) => setR({ ...r, texto: e.target.value })} />
          </label>
          <div style={grade(180)}>
            <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Começa em (opcional)
              <input type="date" style={campo} value={r.inicio || ''} onChange={(e) => setR({ ...r, inicio: e.target.value || null })} />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Termina em (opcional)
              <input type="date" style={campo} value={r.fim || ''} onChange={(e) => setR({ ...r, fim: e.target.value || null })} />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Link do botão (opcional)
              <input style={campo} value={r.link || ''} placeholder="Vazio: página da máquina ou WhatsApp" onChange={(e) => setR({ ...r, link: e.target.value })} />
            </label>
          </div>
          <span style={{ fontSize: 12, color: muted }}>Na data de fim, a promoção sai do site sozinha.</span>
          {/* Prévia ao vivo (José, 12/11: "dentro já mostra como fica no site em celular e no PC") */}
          {(() => {
            const m = maq(r.produto_slug);
            const link = (r.link || '').trim();
            const whats = link ? /wa\.me|whatsapp/.test(link) : !m;
            return (
              <div style={{ ...cartao, background: 'var(--portal-bg)' }}>
                <PreviaPromocao total={Math.max(1, (promos || []).filter((p) => p.ativo).length + (r.id ? 0 : 1))} p={{
                  titulo: r.titulo || m?.titulo || '', texto: r.texto, botao: r.botao, fim: r.fim, whats,
                  imagem: modo === 'foto' ? r.imagem : null, imagem_celular: modo === 'foto' ? r.imagem_celular : null,
                  maquina: m ? { nome: m.titulo, foto: m.foto } : null,
                }} />
              </div>
            );
          })()}
          {erroForm && <span style={{ color: '#dc2626', fontSize: 13 }}>{erroForm}</span>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={botao()} disabled={salvando} onClick={salvar}>{salvando ? 'Gravando…' : r.id ? 'Gravar' : 'Criar promoção'}</button>
            <button style={botao('#dc2626', false)} onClick={() => setR(null)}>Cancelar</button>
          </div>
        </div>
      )}

      <div style={grade(300)}>
        {promos === null && <p>Carregando…</p>}
        {promos?.map((p, i) => {
          const s = situacao(p);
          const img = imagemDe(p);
          return (
            <div key={p.id} style={{ ...cartao, display: 'grid', gap: 10, opacity: s.cor === '#6b7280' ? 0.6 : 1 }}>
              <span style={{ aspectRatio: '16 / 9', borderRadius: 12, background: p.imagem ? '#111' : '#fff', display: 'grid', placeItems: 'center', overflow: 'hidden', border: '1px solid var(--border)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {img ? <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} loading="lazy" /> : <i className="fa-solid fa-image" />}
              </span>
              <span style={{ display: 'grid', gap: 2 }}>
                <b style={{ fontWeight: 500 }}>{p.titulo}</b>
                {p.texto && <span style={{ fontSize: 13, color: muted }}>{p.texto}</span>}
                <span style={{ fontSize: 12, color: muted }}>{p.imagem ? 'Foto da promoção' : `Máquina: ${maq(p.produto_slug)?.titulo || p.produto_slug}`}</span>
              </span>
              <span style={{ justifySelf: 'start', fontSize: 12, padding: '3px 8px', borderRadius: 999, background: `color-mix(in srgb, ${s.cor} 14%, transparent)` }}>{s.txt}</span>
              {podeEditar && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button style={botao('#dc2626', false)} onClick={() => abrir(p)}><i className="fa-solid fa-pen" style={{ fontWeight: 900 }} />Mudar</button>
                  <button style={botao(p.ativo ? '#6b7280' : '#16a34a', false)} disabled={salvando} onClick={() => ligar(p)}>{p.ativo ? 'Desligar' : 'Ligar'}</button>
                  <button aria-label="Subir na ordem" style={{ ...botao('#6b7280', false), padding: '8px 12px' }} disabled={i === 0 || salvando} onClick={() => mover(i, -1)}><i className="fa-solid fa-arrow-up" style={{ fontWeight: 900 }} /></button>
                  <button aria-label="Descer na ordem" style={{ ...botao('#6b7280', false), padding: '8px 12px' }} disabled={i === (promos?.length || 0) - 1 || salvando} onClick={() => mover(i, 1)}><i className="fa-solid fa-arrow-down" style={{ fontWeight: 900 }} /></button>
                  <button aria-label="Apagar" style={{ ...botao('#dc2626', false), padding: '8px 12px', marginLeft: 'auto' }} disabled={salvando} onClick={() => apagar(p)}><i className="fa-solid fa-trash" style={{ fontWeight: 900 }} /></button>
                </div>
              )}
            </div>
          );
        })}
        {promos && !promos.length && !erro && <p style={{ color: muted }}>Nenhuma promoção criada ainda.</p>}
      </div>

      <ComoLer>
        Cada promoção vira um quadro no carrossel da <b>página inicial</b> do site, logo abaixo do vídeo. Pode ser a <b>foto da promoção</b>
        (a arte do Instagram, por exemplo) ou uma <b>máquina do site</b> (usa a foto e a página dela). Com data de fim, sai sozinha no dia.
        Sem nenhuma promoção no ar, o bloco não aparece. Depois de criar ou mudar, toque em <b>Publicar site</b>.
      </ComoLer>
    </div>
  );
}
