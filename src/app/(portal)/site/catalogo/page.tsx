'use client';
// Site → Catálogo do site (José, 10/11/2026): o que o site oferece, com preço, selo, pronta entrega e ocultar.
// 12/11 ("um bloco onde vemos quais máquinas estão no site, para incluir, excluir ou alterar uma informação"):
// ficha completa de cada máquina (nome, fotos, textos, ficha técnica), máquina nova, tirar do site / voltar, e a barra
// Publicar. Preço, selo e pronta entrega aparecem no site sozinhos em até 10 min; o resto, depois de publicar.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchAuth } from '@/lib/auth/client';
import { Aviso, ComoLer, Conta, Numero, botao, campo, cartao, grade, real, tela } from '@/components/site/ui';
import PublicarBarra from '@/components/site/PublicarBarra';
import EnviarFoto from '@/components/site/EnviarFoto';
import { PreviaCartao, type CardPrevia } from '@/components/site/Previa';
import MarcasVista from './Marcas';

type Foto = { src: string; alt: string; url?: string };
type Dados = Partial<{
  categoria: 'tratores' | 'implementos'; titulo: string; marca: string; modelo: string; potencia_cv: number | null
  descricao_site: string; pontos: string[]; ideal_para: string[]; ideal_motivos: string[]; specs: Record<string, string>
  meta_description: string; fotos: Foto[]
}>;
type Mudanca = {
  preco: number | null; exibir_preco: boolean; pronta_entrega: boolean; oculto: boolean; selo: string | null; notas: string | null
  atualizado_em: string; atualizado_por: string | null; dados?: Dados; novo?: boolean
};
type Item = {
  slug: string; titulo: string; categoria: string; marca: string; modelo: string; potencia_cv: number | null
  foto: string | null; link: string; padrao: { preco: number | null; exibir_preco: boolean; pronta_entrega: boolean }
  origem?: 'arquivo' | 'portal'; publicar?: boolean; aguardando?: boolean
  descricao_site?: string; pontos?: string[]; ideal_para?: string[]; ideal_motivos?: string[]; specs?: Record<string, string>
  meta_description?: string; fotos?: Foto[]
  mudanca: Mudanca | null
};
type Venda = { preco: number | null; exibir_preco: boolean; pronta_entrega: boolean; oculto: boolean; selo: string; notas: string };
type Ficha = {
  categoria: 'tratores' | 'implementos'; titulo: string; marca: string; modelo: string; potencia: string
  descricao: string; pontos: string; ideal: string; motivos: string; specs: [string, string][]; meta: string; fotos: Foto[]
};

const muted = 'var(--portal-text-muted, #6b7280)';
const linhas = (t: string) => t.split('\n').map((s) => s.trim()).filter(Boolean);
/** Valor em vigor: o que foi mudado no portal, senão o que está nos arquivos do site. */
const vigor = (i: Item): Venda => ({
  preco: i.mudanca ? i.mudanca.preco : i.padrao.preco,
  exibir_preco: i.mudanca ? i.mudanca.exibir_preco : i.padrao.exibir_preco,
  pronta_entrega: i.mudanca ? i.mudanca.pronta_entrega : i.padrao.pronta_entrega,
  oculto: i.mudanca?.oculto ?? (i.publicar === false),
  selo: i.mudanca?.selo ?? '',
  notas: i.mudanca?.notas ?? '',
});
/** Ficha em vigor: campo mudado aqui por cima do que o site tem. */
function fichaDe(i: Item | null): Ficha {
  const d: Dados = i?.mudanca?.dados || {};
  const pega = <K extends keyof Dados>(k: K, site: Dados[K]) => (d[k] !== undefined ? d[k] : site);
  const cat = (pega('categoria', i?.categoria as Dados['categoria']) || 'implementos') as Ficha['categoria'];
  const cv = pega('potencia_cv', i?.potencia_cv ?? null);
  return {
    categoria: cat, titulo: pega('titulo', i?.titulo) || '', marca: pega('marca', i?.marca) || (i ? '' : 'Mahindra'), modelo: pega('modelo', i?.modelo) || '',
    potencia: cv ? String(cv) : '', descricao: pega('descricao_site', i?.descricao_site) || '',
    pontos: (pega('pontos', i?.pontos) || []).join('\n'), ideal: (pega('ideal_para', i?.ideal_para) || []).join('\n'),
    motivos: (pega('ideal_motivos', i?.ideal_motivos) || []).join('\n'), specs: Object.entries(pega('specs', i?.specs) || {}),
    meta: pega('meta_description', i?.meta_description) || '',
    fotos: (pega('fotos', i?.fotos) || []).map((f) => ({ ...f, url: f.url || i?.fotos?.find((x) => x.src === f.src)?.url })),
  };
}
const fotoUrl = (f: Foto) => f.url || (/^https:\/\//.test(f.src) ? f.src : '');
/** Só os campos que mudaram em relação ao que está em vigor (o portal grava o mínimo). */
function diferencas(a: Ficha, b: Ficha, novo: boolean): Dados {
  const d: Dados = {};
  const igual = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);
  if (novo || a.categoria !== b.categoria) d.categoria = b.categoria;
  if (novo || a.titulo !== b.titulo) d.titulo = b.titulo;
  if (novo || a.marca !== b.marca) d.marca = b.marca;
  if (novo || a.modelo !== b.modelo) d.modelo = b.modelo;
  if (novo || a.potencia !== b.potencia) d.potencia_cv = b.potencia ? Number(b.potencia) : null;
  if (novo || a.descricao !== b.descricao) d.descricao_site = b.descricao;
  if (novo || a.pontos !== b.pontos) d.pontos = linhas(b.pontos);
  if (novo || a.ideal !== b.ideal) d.ideal_para = linhas(b.ideal);
  if (novo || a.motivos !== b.motivos) d.ideal_motivos = linhas(b.motivos);
  if (novo || !igual(a.specs, b.specs)) d.specs = Object.fromEntries(b.specs.filter(([k, v]) => k.trim() && v.trim()));
  if (novo || a.meta !== b.meta) d.meta_description = b.meta;
  if (novo || !igual(a.fotos.map((f) => [f.src, f.alt]), b.fotos.map((f) => [f.src, f.alt]))) d.fotos = b.fotos.map(({ src, alt }) => ({ src, alt }));
  return d;
}

const rotulo: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 13 };
const ajuda: React.CSSProperties = { fontSize: 12, color: muted };
const chip = (cor: string): React.CSSProperties => ({ padding: '3px 8px', borderRadius: 999, background: `color-mix(in srgb, ${cor} 13%, transparent)` });

function Bloco({ titulo, children, aberto = true }: { titulo: string; children: React.ReactNode; aberto?: boolean }) {
  return (
    <details open={aberto} style={{ ...cartao, padding: '12px 14px' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 500 }}>{titulo}</summary>
      <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>{children}</div>
    </details>
  );
}

function Editor({ item, podeEditar, fechar, gravou, marcaInicial }: { item: Item | null; podeEditar: boolean; fechar: () => void; gravou: (slugAbrir?: string) => void; marcaInicial?: string }) {
  const novo = !item;
  // "Incluir modelo nesta marca" (12/11): máquina nova já com a marca e como implemento
  const original = useMemo(() => (!item && marcaInicial ? { ...fichaDe(null), categoria: 'implementos' as const, marca: marcaInicial } : fichaDe(item)), [item, marcaInicial]);
  const [f, setF] = useState<Ficha>(original);
  const [v, setV] = useState<Venda>(item ? vigor(item) : { preco: null, exibir_preco: false, pronta_entrega: false, oculto: false, selo: '', notas: '' });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const set = (p: Partial<Ficha>) => setF((x) => ({ ...x, ...p }));
  const mudouDados = !novo && Object.keys(item?.mudanca?.dados || {}).length > 0 && !item?.mudanca?.novo;
  const eNova = item?.mudanca?.novo;

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar(); };
    addEventListener('keydown', esc); return () => removeEventListener('keydown', esc);
  }, [fechar]);

  async function chamar(url: string, metodo: string, corpo?: unknown) {
    setSalvando(true); setErro('');
    const r = await fetchAuth(url, { method: metodo, headers: corpo ? { 'Content-Type': 'application/json' } : undefined, body: corpo ? JSON.stringify(corpo) : undefined });
    const j = await r.json().catch(() => ({}));
    setSalvando(false);
    if (!r.ok || !j.ok) { setErro(j.erro || 'Não consegui gravar.'); return null; }
    return j;
  }

  async function salvar() {
    if (!f.titulo.trim()) { setErro('Escreva o nome da máquina.'); return; }
    if (!f.fotos.length) { setErro('Coloque pelo menos uma foto.'); return; }
    const dados = diferencas(original, f, novo);
    if (novo) {
      const j = await chamar('/api/site/catalogo', 'POST', { dados });
      if (!j) return;
      // preço/selo da máquina nova vão na mesma linha
      if (v.preco || v.selo || v.pronta_entrega || v.exibir_preco) await chamar('/api/site/catalogo', 'PATCH', { slug: j.slug, ...v });
      gravou(); fechar(); return;
    }
    const j = await chamar('/api/site/catalogo', 'PATCH', { slug: item!.slug, ...v, ...(Object.keys(dados).length ? { dados } : {}) });
    if (j) { gravou(); fechar(); }
  }
  async function alternarSite() {
    const j = await chamar('/api/site/catalogo', 'PATCH', { slug: item!.slug, oculto: !v.oculto });
    if (j) { setV({ ...v, oculto: !v.oculto }); gravou(item!.slug); }
  }
  async function desfazer() {
    if (!confirm('Voltar nome, textos, fotos e ficha ao que está nos arquivos do site? Preço e selo continuam.')) return;
    const j = await chamar('/api/site/catalogo', 'PATCH', { slug: item!.slug, desfazer: true });
    if (j) { gravou(); fechar(); }
  }
  async function apagar() {
    if (!confirm(`Apagar "${f.titulo}"? Ela foi criada aqui no portal e sai de vez do site depois de publicar.`)) return;
    const j = await chamar(`/api/site/catalogo?slug=${encodeURIComponent(item!.slug)}`, 'DELETE');
    if (j) { gravou(); fechar(); }
  }

  const moverFoto = (i: number, d: number) => {
    const l = [...f.fotos]; const j = i + d;
    if (j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]]; set({ fotos: l });
  };
  const nome = f.categoria === 'tratores' ? `${f.marca} ${f.modelo}`.trim() : f.titulo;
  const so = !podeEditar;

  return (
    <div role="dialog" aria-modal="true" aria-label={novo ? 'Nova máquina' : `Ficha de ${item!.titulo}`}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.45)', display: 'grid', placeItems: 'center', padding: 'clamp(0px, 2vw, 24px)' }}
      onClick={fechar}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(860px, 100%)', height: 'min(100%, 940px)', background: 'var(--portal-bg)', borderRadius: 'clamp(0px, 2vw, 16px)', display: 'grid', gridTemplateRows: 'auto 1fr auto', overflow: 'hidden', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
          <span style={{ flex: 1, minWidth: 0, display: 'grid' }}>
            <b style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{novo ? 'Nova máquina no site' : nome || item!.titulo}</b>
            <span style={ajuda}>{novo ? 'Aparece no site depois de publicar' : v.oculto ? 'Fora do site' : item!.aguardando ? 'Nova: aparece no site depois de publicar' : 'No site'}</span>
          </span>
          {!novo && !item!.aguardando && <a href={item!.link} target="_blank" rel="noopener" style={{ ...botao('#dc2626', false), minHeight: 36 }}><i className="fa-solid fa-arrow-up-right-from-square" style={{ fontWeight: 900 }} />Ver no site</a>}
          <button onClick={fechar} aria-label="Fechar" style={{ width: 40, height: 40, border: 0, borderRadius: 10, background: 'var(--portal-bg)', color: 'var(--portal-text)', cursor: 'pointer' }}>
            <i className="fa-solid fa-xmark" style={{ fontWeight: 900 }} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: 'clamp(10px, 2vw, 18px)', display: 'grid', gap: 12, alignContent: 'start' }}>
          {mudouDados && <Aviso tom="info">Esta ficha tem mudanças feitas aqui no portal por cima do que está nos arquivos do site.</Aviso>}
          <fieldset disabled={so || salvando} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 12, minWidth: 0 }}>
            <Bloco titulo="O básico">
              <div style={grade(180)}>
                <label style={rotulo}>Tipo
                  <select style={campo} value={f.categoria} disabled={!novo} onChange={(e) => set({ categoria: e.target.value as Ficha['categoria'] })}>
                    <option value="tratores">Trator</option><option value="implementos">Implemento</option>
                  </select>
                </label>
                <label style={rotulo}>Marca<input style={campo} value={f.marca} onChange={(e) => set({ marca: e.target.value })} placeholder="Ex.: Kuhn" /></label>
                <label style={rotulo}>Modelo<input style={campo} value={f.modelo} onChange={(e) => set({ modelo: e.target.value })} placeholder="Ex.: 6075" /></label>
                <label style={rotulo}>Potência (cv)<input style={campo} inputMode="numeric" value={f.potencia} onChange={(e) => set({ potencia: e.target.value.replace(/\D/g, '').slice(0, 3) })} placeholder={f.categoria === 'tratores' ? 'Ex.: 75' : 'Mínima do trator (opcional)'} /></label>
              </div>
              <label style={rotulo}>Nome completo no site
                <input style={campo} value={f.titulo} onChange={(e) => set({ titulo: e.target.value })} placeholder={f.categoria === 'tratores' ? 'Ex.: Trator Mahindra 6075' : 'Ex.: Plantadeira Kuhn PG 700'} />
              </label>
            </Bloco>

            <Bloco titulo={`Fotos (${f.fotos.length})`}>
              <span style={ajuda}>A primeira é a do cartão e do topo da página. Use as setas para mudar a ordem.</span>
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(min(150px, 100%), 1fr))' }}>
                {f.fotos.map((foto, i) => (
                  <div key={`${foto.src}-${i}`} style={{ ...cartao, padding: 8, display: 'grid', gap: 6, outline: i === 0 ? '2px solid #dc2626' : 'none' }}>
                    <span style={{ aspectRatio: '4 / 3', borderRadius: 8, background: '#fff', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {fotoUrl(foto) ? <img src={fotoUrl(foto)} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} loading="lazy" /> : <i className="fa-solid fa-image" style={{ color: muted }} />}
                    </span>
                    <span style={{ fontSize: 11, color: i === 0 ? '#dc2626' : muted }}>{i === 0 ? 'Principal' : `Foto ${i + 1}`}</span>
                    <input style={{ ...campo, minHeight: 34, fontSize: 12 }} value={foto.alt} placeholder="O que aparece na foto" onChange={(e) => set({ fotos: f.fotos.map((x, k) => (k === i ? { ...x, alt: e.target.value } : x)) })} />
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button type="button" aria-label="Para a esquerda" style={{ ...botao('#6b7280', false), minHeight: 34, padding: '4px 10px' }} onClick={() => moverFoto(i, -1)} disabled={i === 0}><i className="fa-solid fa-arrow-left" style={{ fontWeight: 900 }} /></button>
                      <button type="button" aria-label="Para a direita" style={{ ...botao('#6b7280', false), minHeight: 34, padding: '4px 10px' }} onClick={() => moverFoto(i, 1)} disabled={i === f.fotos.length - 1}><i className="fa-solid fa-arrow-right" style={{ fontWeight: 900 }} /></button>
                      <button type="button" aria-label="Tirar foto" style={{ ...botao('#dc2626', false), minHeight: 34, padding: '4px 10px', marginLeft: 'auto' }} onClick={() => set({ fotos: f.fotos.filter((_, k) => k !== i) })}><i className="fa-solid fa-trash" style={{ fontWeight: 900 }} /></button>
                    </div>
                  </div>
                ))}
              </div>
              {!so && <EnviarFoto pasta={item?.slug || 'novas'} varias rotulo="Enviar fotos" onEnviada={(urls) => set({ fotos: [...f.fotos, ...urls.map((u) => ({ src: u, alt: nome, url: u }))] })} />}
              <span style={ajuda}>Foto real da máquina (da fábrica ou tirada aqui), sem marca d’água de outra loja. Fundo branco ou recorte fica melhor no cartão.</span>
            </Bloco>

            <Bloco titulo="Textos da página">
              <label style={rotulo}>Descrição
                <textarea style={{ ...campo, minHeight: 110, resize: 'vertical' }} value={f.descricao} onChange={(e) => set({ descricao: e.target.value })} placeholder="O que é a máquina e por que vale a pena, em 2 ou 3 frases." />
                <span style={ajuda}>Com pontos fortes preenchidos, a página mostra os pontos no lugar da descrição (a descrição vai para o Google e para o WhatsApp).</span>
              </label>
              <label style={rotulo}>Pontos fortes <span style={ajuda}>um por linha</span>
                <textarea style={{ ...campo, minHeight: 90, resize: 'vertical' }} value={f.pontos} onChange={(e) => set({ pontos: e.target.value })} placeholder={'Ex.: Cabine com ar-condicionado\nTDP reversora'} />
              </label>
              <div style={grade(260)}>
                <label style={rotulo}>Ideal para <span style={ajuda}>um por linha (aparece no cartão)</span>
                  <textarea style={{ ...campo, minHeight: 80, resize: 'vertical' }} value={f.ideal} onChange={(e) => set({ ideal: e.target.value })} placeholder={'Ex.: Café\nPecuária'} />
                </label>
                <label style={rotulo}>Por que serve <span style={ajuda}>na mesma ordem do “Ideal para”</span>
                  <textarea style={{ ...campo, minHeight: 80, resize: 'vertical' }} value={f.motivos} onChange={(e) => set({ motivos: e.target.value })} placeholder={'Ex.: Estreito, passa entre as ruas do cafezal'} />
                </label>
              </div>
            </Bloco>

            <Bloco titulo={`Ficha técnica (${f.specs.length})`} aberto={novo}>
              {f.specs.map(([k, val], i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 3fr) auto', gap: 6 }}>
                  <input style={campo} value={k} placeholder="Ex.: Motor" onChange={(e) => set({ specs: f.specs.map((x, j) => (j === i ? [e.target.value, x[1]] : x)) })} />
                  <input style={campo} value={val} placeholder="Ex.: 4 cilindros, 3.8 litros" onChange={(e) => set({ specs: f.specs.map((x, j) => (j === i ? [x[0], e.target.value] : x)) })} />
                  <button type="button" aria-label="Tirar linha" style={{ ...botao('#dc2626', false), padding: '4px 12px' }} onClick={() => set({ specs: f.specs.filter((_, j) => j !== i) })}><i className="fa-solid fa-trash" style={{ fontWeight: 900 }} /></button>
                </div>
              ))}
              <button type="button" style={{ ...botao('#dc2626', false), justifySelf: 'start' }} onClick={() => set({ specs: [...f.specs, ['', '']] })}><i className="fa-solid fa-plus" style={{ fontWeight: 900 }} />Linha na ficha</button>
            </Bloco>

            <Bloco titulo="Preço e selo" aberto={novo}>
              <span style={ajuda}>Isto aparece no site sozinho em até 10 minutos, sem publicar.</span>
              <div style={grade(200)}>
                <label style={rotulo}>Preço (R$, sem centavos)
                  <input style={campo} inputMode="numeric" value={v.preco == null ? '' : Math.round(v.preco).toLocaleString('pt-BR')} placeholder="Ex.: 189.900"
                    onChange={(e) => { const t = e.target.value.replace(/\D/g, ''); setV({ ...v, preco: t === '' ? null : Number(t) }); }} />
                </label>
                <label style={rotulo}>Selo no cartão (até 30 letras)
                  <input style={campo} maxLength={30} value={v.selo} placeholder="Ex.: Oferta do mês" onChange={(e) => setV({ ...v, selo: e.target.value })} />
                </label>
              </div>
              {([['exibir_preco', 'Mostrar o preço no site'], ['pronta_entrega', 'Pronta entrega']] as const).map(([k, r]) => (
                <label key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, minHeight: 32 }}>
                  <input type="checkbox" checked={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.checked })} style={{ width: 18, height: 18, accentColor: '#dc2626' }} />{r}
                </label>
              ))}
              <label style={rotulo}>Nota interna (não aparece no site)
                <input style={campo} value={v.notas} placeholder="Ex.: preço válido até 30/11" onChange={(e) => setV({ ...v, notas: e.target.value })} />
              </label>
            </Bloco>

            <Bloco titulo="Texto que aparece no Google" aberto={false}>
              <textarea style={{ ...campo, minHeight: 70, resize: 'vertical' }} maxLength={160} value={f.meta} onChange={(e) => set({ meta: e.target.value })} placeholder="Vazio: o site usa o começo da descrição." />
              <span style={ajuda}>{f.meta.length}/160 letras.</span>
            </Bloco>
          </fieldset>

          {/* Prévia ao vivo do cartão (José, 12/11: "vai mostrando a prévia") */}
          <div style={{ ...cartao }}>
            <PreviaCartao c={{
              nome: f.categoria === 'tratores' ? `${f.marca} ${f.modelo}`.trim() : f.titulo, marca: f.marca, cv: f.potencia || null,
              foto: f.fotos[0] ? fotoUrl(f.fotos[0]) || null : null, ideal: linhas(f.ideal), selo: v.selo || (v.pronta_entrega ? 'Pronta entrega' : null),
              trator: f.categoria === 'tratores',
            }} />
          </div>

          {!novo && podeEditar && (
            <div style={{ ...cartao, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <span style={{ flex: '1 1 220px', fontSize: 13, color: muted }}>
                {v.oculto ? 'Esta máquina está fora do site. Dá para voltar quando quiser.' : 'Tirar do site esconde na hora e some da lista depois de publicar. Dá para voltar.'}
              </span>
              <button style={botao(v.oculto ? '#16a34a' : '#6b7280', false)} disabled={salvando} onClick={alternarSite}>
                <i className={`fa-solid ${v.oculto ? 'fa-eye' : 'fa-eye-slash'}`} style={{ fontWeight: 900 }} />{v.oculto ? 'Voltar ao site' : 'Tirar do site'}
              </button>
              {mudouDados && <button style={botao('#6b7280', false)} disabled={salvando} onClick={desfazer}><i className="fa-solid fa-rotate-left" style={{ fontWeight: 900 }} />Desfazer mudanças da ficha</button>}
              {eNova && <button style={botao('#dc2626', false)} disabled={salvando} onClick={apagar}><i className="fa-solid fa-trash" style={{ fontWeight: 900 }} />Apagar máquina</button>}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 16px', background: 'var(--surface)', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
          {erro && <span style={{ flexBasis: '100%', color: '#dc2626', fontSize: 13 }}>{erro}</span>}
          {podeEditar && <button style={botao()} disabled={salvando} onClick={salvar}>{salvando ? 'Gravando…' : novo ? 'Incluir máquina' : 'Gravar'}</button>}
          <button style={botao('#dc2626', false)} onClick={fechar}>{podeEditar ? 'Cancelar' : 'Fechar'}</button>
          <span style={{ ...ajuda, marginLeft: 'auto' }}>Depois de gravar, toque em Publicar site.</span>
        </div>
      </div>
    </div>
  );
}

export default function CatalogoSitePage() {
  const [itens, setItens] = useState<Item[] | null>(null);
  const [erro, setErro] = useState('');
  const [erroSite, setErroSite] = useState('');
  const [site, setSite] = useState('');
  const [podeEditar, setPodeEditar] = useState(false);
  const [semSql, setSemSql] = useState(false);
  const [busca, setBusca] = useState('');
  const [cat, setCat] = useState<'todos' | 'tratores' | 'implementos' | 'com-preco' | 'ocultos' | 'pronta' | 'mudados'>('todos');
  const [versao, setVersao] = useState(0);
  const abriuAqui = useRef(false);
  // O que está aberto mora no endereço (?aba=marcas, ?marca=Piccin, ?maquina=slug | novo, &na_marca=Piccin), para o
  // Voltar do navegador e do celular funcionarem (José, 12/11: "eu entro e não consigo voltar, tem que mudar a URL").
  const [url, setUrl] = useState<{ aba: string | null; marca: string | null; maquina: string | null; naMarca: string | null }>({ aba: null, marca: null, maquina: null, naMarca: null });
  useEffect(() => {
    const ler = () => {
      const q = new URLSearchParams(window.location.search);
      setUrl({ aba: q.get('aba'), marca: q.get('marca'), maquina: q.get('maquina'), naMarca: q.get('na_marca') });
    };
    ler();
    const voltou = () => { abriuAqui.current = false; ler(); };
    window.addEventListener('popstate', voltou);
    return () => window.removeEventListener('popstate', voltou);
  }, []);
  const ir = useCallback((novo: Partial<typeof url>, trocar = false) => {
    setUrl((atual) => {
      const u = { ...atual, ...novo };
      const q = new URLSearchParams();
      if (u.aba === 'marcas') q.set('aba', 'marcas');
      if (u.marca) q.set('marca', u.marca);
      if (u.maquina) q.set('maquina', u.maquina);
      if (u.maquina === 'novo' && u.naMarca) q.set('na_marca', u.naMarca);
      const destino = `${window.location.pathname}${q.toString() ? `?${q}` : ''}`;
      if (destino !== `${window.location.pathname}${window.location.search}`) window.history[trocar ? 'replaceState' : 'pushState'](null, '', destino);
      return u;
    });
  }, []);
  const vista: 'maquinas' | 'marcas' = url.aba === 'marcas' || url.marca ? 'marcas' : 'maquinas';
  const setVista = (v: 'maquinas' | 'marcas') => ir({ aba: v === 'marcas' ? 'marcas' : null, marca: null, maquina: null });
  const aberto: Item | 'novo' | null = useMemo(
    () => (url.maquina === 'novo' ? 'novo' : (url.maquina && itens?.find((i) => i.slug === url.maquina)) || null),
    [url.maquina, itens],
  );
  const marcaNova = url.naMarca || undefined;
  const abrirMaquina = useCallback((slug: string, naMarca?: string) => { abriuAqui.current = true; ir({ maquina: slug, naMarca: naMarca || null }); }, [ir]);

  const carregar = useCallback(async () => {
    const r = await fetchAuth('/api/site/catalogo');
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) { setErro(j.erro || 'Não consegui carregar o catálogo.'); setItens([]); return; }
    setErro(''); setErroSite(j.erroSite || ''); setSite(j.site); setPodeEditar(!!j.podeEditar); setSemSql(j.temColunaDados === false); setItens(j.itens);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar(); }, [carregar]);
  const gravou = useCallback(() => { setVersao((n) => n + 1); carregar(); }, [carregar]);
  // fechar a ficha = voltar uma página quando ela foi aberta aqui (assim o Voltar do navegador não reabre a ficha)
  const fechar = useCallback(() => { if (abriuAqui.current) { abriuAqui.current = false; window.history.back(); } else ir({ maquina: null, naMarca: null }, true); }, [ir]);

  const mudado = (i: Item) => !!i.mudanca && (Object.keys(i.mudanca.dados || {}).length > 0 || !!i.mudanca.novo);
  const contagem = useMemo(() => {
    const l = (itens || []).filter((i) => !vigor(i).oculto);
    return {
      tratores: l.filter((i) => i.categoria === 'tratores').length,
      implementos: l.filter((i) => i.categoria === 'implementos').length,
      comPreco: l.filter((i) => { const v = vigor(i); return v.exibir_preco && v.preco; }).length,
      ocultos: (itens || []).filter((i) => vigor(i).oculto).length,
      pronta: l.filter((i) => vigor(i).pronta_entrega).length,
      mudados: (itens || []).filter(mudado).length,
    };
  }, [itens]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (itens || []).filter((i) => {
      const v = vigor(i);
      if (cat !== 'ocultos' && v.oculto && cat !== 'todos') return false;
      if (cat === 'tratores' && i.categoria !== 'tratores') return false;
      if (cat === 'implementos' && i.categoria !== 'implementos') return false;
      if (cat === 'com-preco' && !(v.exibir_preco && v.preco)) return false;
      if (cat === 'ocultos' && !v.oculto) return false;
      if (cat === 'pronta' && !v.pronta_entrega) return false;
      if (cat === 'mudados' && !mudado(i)) return false;
      return !q || `${i.titulo} ${i.marca} ${i.modelo}`.toLowerCase().includes(q);
    }).sort((a, b) => Number(vigor(a).oculto) - Number(vigor(b).oculto));
  }, [itens, busca, cat]);

  const filtro = (id: typeof cat) => () => setCat(cat === id ? 'todos' : id);

  /** Cartão do jeito que o site mostra (nome, foto e usos em vigor), para a prévia das marcas. */
  const cartaoDe = useCallback((i: Item): CardPrevia => {
    const f = fichaDe(i);
    const v = vigor(i);
    return {
      nome: f.categoria === 'tratores' ? `${f.marca} ${f.modelo}`.trim() : f.titulo, marca: f.marca, cv: f.potencia || null,
      foto: (f.fotos[0] && fotoUrl(f.fotos[0])) || i.foto, ideal: linhas(f.ideal), selo: v.selo || (v.pronta_entrega ? 'Pronta entrega' : null),
      trator: f.categoria === 'tratores',
    };
  }, []);
  const marcaDe = (i: Item) => fichaDe(i).marca;

  return (
    <div style={tela}>
      {erro && <Aviso>{erro}</Aviso>}
      {erroSite && <Aviso>{erroSite} Confira a variável SITE_URL do portal.</Aviso>}
      {semSql && <Aviso>Para incluir máquinas e mudar textos e fotos, rode <b>sql/site-produtos-promocoes.sql</b> no projeto do portal (citrhumdkfivdzbmayde).</Aviso>}
      <PublicarBarra versao={versao} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button style={botao('#dc2626', vista === 'maquinas')} onClick={() => setVista('maquinas')}><i className="fa-solid fa-tractor" style={{ fontWeight: 900 }} />Máquinas</button>
        <button style={botao('#dc2626', vista === 'marcas')} onClick={() => setVista('marcas')}><i className="fa-solid fa-copyright" style={{ fontWeight: 900 }} />Marcas</button>
      </div>
      {vista === 'marcas' ? (
        <MarcasVista
          itens={(itens || []).filter((i) => !vigor(i).oculto).map((i) => ({ marca: marcaDe(i), categoria: fichaDe(i).categoria, cartao: cartaoDe(i), abrir: () => abrirMaquina(i.slug) }))}
          podeEditar={podeEditar && !semSql} versao={versao} gravou={gravou}
          incluirModelo={(marca) => abrirMaquina('novo', marca)}
          aberta={url.marca} irMarca={(nome) => ir({ aba: 'marcas', marca: nome })}
        />
      ) : (<>
      <div style={grade(160)}>
        <Numero icone="fa-tractor" cor="#dc2626" rotulo="Tratores no site" valor={<Conta valor={contagem.tratores} />} ativo={cat === 'tratores'} onClick={filtro('tratores')} />
        <Numero icone="fa-gears" cor="#0284c7" rotulo="Implementos no site" valor={<Conta valor={contagem.implementos} />} ativo={cat === 'implementos'} onClick={filtro('implementos')} />
        <Numero icone="fa-tag" cor="#16a34a" rotulo="Com preço à mostra" valor={<Conta valor={contagem.comPreco} />} ativo={cat === 'com-preco'} onClick={filtro('com-preco')} />
        <Numero icone="fa-truck-fast" cor="#d97706" rotulo="Pronta entrega" valor={<Conta valor={contagem.pronta} />} ativo={cat === 'pronta'} onClick={filtro('pronta')} />
        <Numero icone="fa-pen" cor="#7c3aed" rotulo="Mudados ou novos aqui" valor={<Conta valor={contagem.mudados} />} ativo={cat === 'mudados'} onClick={filtro('mudados')} />
        <Numero icone="fa-eye-slash" cor="#6b7280" rotulo="Fora do site" valor={<Conta valor={contagem.ocultos} />} ativo={cat === 'ocultos'} onClick={filtro('ocultos')} />
      </div>

      <ComoLer>
        Esta é a lista das máquinas do site{site ? <> (<a href={site} target="_blank" rel="noopener">{site.replace(/^https?:\/\//, '')}</a>)</> : null}.
        Toque numa máquina para abrir a <b>ficha</b>: nome, fotos, descrição, pontos fortes, “ideal para”, ficha técnica, preço e selo.
        <b> + Nova máquina</b> inclui uma que ainda não está no site. <b>Tirar do site</b> esconde (dá para voltar).
        Preço, selo e pronta entrega aparecem sozinhos em até 10 minutos; o resto aparece depois do botão <b>Publicar site</b>.
      </ComoLer>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={{ ...campo, flex: '1 1 240px', maxWidth: 420 }} placeholder="Buscar por nome, marca ou modelo" value={busca} onChange={(e) => setBusca(e.target.value)} />
        {podeEditar && !semSql && <button style={botao()} onClick={() => abrirMaquina('novo')}><i className="fa-solid fa-plus" style={{ fontWeight: 900 }} />Nova máquina</button>}
      </div>

      <div style={grade(280)}>
        {itens === null && <p>Carregando…</p>}
        {itens !== null && !lista.length && <p style={{ color: muted }}>Nada com esse filtro.</p>}
        {lista.map((i) => {
          const v = vigor(i);
          const d = i.mudanca?.dados || {};
          const foto = (d.fotos?.[0] && fotoUrl({ ...d.fotos[0], url: i.fotos?.find((x) => x.src === d.fotos![0].src)?.url })) || i.foto;
          const nome = i.categoria === 'tratores' && (d.marca || d.modelo) ? `${d.marca || i.marca} ${d.modelo || i.modelo}` : d.titulo || i.titulo;
          return (
            <button key={i.slug} onClick={() => abrirMaquina(i.slug)}
              style={{ ...cartao, display: 'grid', gap: 10, textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer', opacity: v.oculto ? 0.55 : 1 }}>
              <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ flex: 'none', width: 84, height: 63, borderRadius: 10, background: '#fff', display: 'grid', placeItems: 'center', overflow: 'hidden', border: '1px solid var(--border)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {foto ? <img src={foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} loading="lazy" /> : <i className="fa-solid fa-image" style={{ color: muted }} />}
                </span>
                <span style={{ minWidth: 0, display: 'grid' }}>
                  <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>{nome}</span>
                  <span style={{ fontSize: 13, color: muted }}>{d.marca || i.marca}{(d.potencia_cv ?? i.potencia_cv) ? ` · ${d.potencia_cv ?? i.potencia_cv} cv` : ''}</span>
                </span>
              </span>
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 12 }}>
                <span style={{ padding: '3px 8px', borderRadius: 999, background: 'var(--portal-bg)' }}>{v.exibir_preco && v.preco ? real(v.preco) : 'Sem preço no site'}</span>
                {v.pronta_entrega && <span style={chip('#d97706')}>Pronta entrega</span>}
                {v.selo && <span style={chip('#dc2626')}>{v.selo}</span>}
                {v.oculto && <span style={chip('#6b7280')}>Fora do site</span>}
                {i.aguardando && <span style={chip('#7c3aed')}>Nova: falta publicar</span>}
                {!i.aguardando && mudado(i) && <span style={chip('#7c3aed')}>Mudada aqui</span>}
              </span>
              {i.mudanca && <span style={{ fontSize: 12, color: muted }}>Mudado por {i.mudanca.atualizado_por || '—'} em {new Date(i.mudanca.atualizado_em).toLocaleDateString('pt-BR')}</span>}
            </button>
          );
        })}
      </div>
      </>)}
      {aberto && <Editor key={aberto === 'novo' ? `novo-${marcaNova || ''}` : aberto.slug} item={aberto === 'novo' ? null : aberto} podeEditar={podeEditar} fechar={fechar} gravou={gravou} marcaInicial={aberto === 'novo' ? marcaNova : undefined} />}
    </div>
  );
}
