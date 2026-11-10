'use client';
// Site → Catálogo do site (José, 10/11/2026): o que o site oferece, com preço, selo, pronta entrega e ocultar.
// A lista vem do próprio site (catalogo.json); aqui se grava só o que muda por cima. O site aplica ao abrir a página.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAuth } from '@/lib/auth/client';
import { Aviso, ComoLer, Conta, Numero, botao, campo, cartao, grade, real, tela } from '@/components/site/ui';

type Mudanca = { preco: number | null; exibir_preco: boolean; pronta_entrega: boolean; oculto: boolean; selo: string | null; notas: string | null; atualizado_em: string; atualizado_por: string | null };
type Item = {
  slug: string; titulo: string; categoria: string; marca: string; modelo: string; potencia_cv: number | null
  foto: string | null; link: string; padrao: { preco: number | null; exibir_preco: boolean; pronta_entrega: boolean }
  mudanca: Mudanca | null
};
/** Valor em vigor: o que foi mudado no portal, senão o que está nos arquivos do site. */
const vigor = (i: Item) => ({
  preco: i.mudanca ? i.mudanca.preco : i.padrao.preco,
  exibir_preco: i.mudanca ? i.mudanca.exibir_preco : i.padrao.exibir_preco,
  pronta_entrega: i.mudanca ? i.mudanca.pronta_entrega : i.padrao.pronta_entrega,
  oculto: i.mudanca?.oculto ?? false,
  selo: i.mudanca?.selo ?? '',
  notas: i.mudanca?.notas ?? '',
});

export default function CatalogoSitePage() {
  const [itens, setItens] = useState<Item[] | null>(null);
  const [erro, setErro] = useState('');
  const [erroSite, setErroSite] = useState('');
  const [site, setSite] = useState('');
  const [podeEditar, setPodeEditar] = useState(false);
  const [busca, setBusca] = useState('');
  const [cat, setCat] = useState<'todos' | 'tratores' | 'implementos' | 'com-preco' | 'ocultos' | 'pronta'>('todos');
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<ReturnType<typeof vigor> | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const r = await fetchAuth('/api/site/catalogo');
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) { setErro(j.erro || 'Não consegui carregar o catálogo.'); setItens([]); return; }
    setErro(''); setErroSite(j.erroSite || ''); setSite(j.site); setPodeEditar(!!j.podeEditar); setItens(j.itens);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar(); }, [carregar]);

  const contagem = useMemo(() => {
    const l = itens || [];
    return {
      tratores: l.filter((i) => i.categoria === 'tratores').length,
      implementos: l.filter((i) => i.categoria === 'implementos').length,
      comPreco: l.filter((i) => { const v = vigor(i); return v.exibir_preco && v.preco; }).length,
      ocultos: l.filter((i) => vigor(i).oculto).length,
      pronta: l.filter((i) => vigor(i).pronta_entrega).length,
    };
  }, [itens]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (itens || []).filter((i) => {
      const v = vigor(i);
      if (cat === 'tratores' && i.categoria !== 'tratores') return false;
      if (cat === 'implementos' && i.categoria !== 'implementos') return false;
      if (cat === 'com-preco' && !(v.exibir_preco && v.preco)) return false;
      if (cat === 'ocultos' && !v.oculto) return false;
      if (cat === 'pronta' && !v.pronta_entrega) return false;
      return !q || `${i.titulo} ${i.marca}`.toLowerCase().includes(q);
    });
  }, [itens, busca, cat]);

  function abrir(i: Item) { setEditando(i.slug); setRascunho(vigor(i)); }

  async function salvar(slug: string) {
    if (!rascunho) return;
    setSalvando(true);
    const r = await fetchAuth('/api/site/catalogo', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, ...rascunho, preco: rascunho.preco === null || Number.isNaN(rascunho.preco) ? null : rascunho.preco }),
    });
    const j = await r.json().catch(() => ({}));
    setSalvando(false);
    if (!r.ok || !j.ok) { alert(j.erro || 'Não consegui salvar.'); return; }
    setItens((l) => (l || []).map((i) => (i.slug === slug ? { ...i, mudanca: j.mudanca } : i)));
    setEditando(null);
  }

  const filtro = (id: typeof cat) => () => setCat(cat === id ? 'todos' : id);

  return (
    <div style={tela}>
      {erro && <Aviso>{erro}</Aviso>}
      {erroSite && <Aviso>{erroSite} Confira a variável SITE_URL do portal.</Aviso>}
      <div style={grade(170)}>
        <Numero icone="fa-tractor" cor="#dc2626" rotulo="Tratores no site" valor={<Conta valor={contagem.tratores} />} ativo={cat === 'tratores'} onClick={filtro('tratores')} />
        <Numero icone="fa-gears" cor="#0284c7" rotulo="Implementos no site" valor={<Conta valor={contagem.implementos} />} ativo={cat === 'implementos'} onClick={filtro('implementos')} />
        <Numero icone="fa-tag" cor="#16a34a" rotulo="Com preço à mostra" valor={<Conta valor={contagem.comPreco} />} ativo={cat === 'com-preco'} onClick={filtro('com-preco')} />
        <Numero icone="fa-truck-fast" cor="#d97706" rotulo="Pronta entrega" valor={<Conta valor={contagem.pronta} />} ativo={cat === 'pronta'} onClick={filtro('pronta')} />
        <Numero icone="fa-eye-slash" cor="#6b7280" rotulo="Escondidos do site" valor={<Conta valor={contagem.ocultos} />} ativo={cat === 'ocultos'} onClick={filtro('ocultos')} />
      </div>

      <ComoLer>
        Esta é a lista do que está no site{site ? <> (<a href={site} target="_blank" rel="noopener">{site.replace(/^https?:\/\//, '')}</a>)</> : null}, lida do próprio site.
        Toque em <b>Mudar</b> para pôr o preço, mostrar ou esconder o preço, marcar <b>pronta entrega</b>, escrever um selo curto
        (ex.: “Oferta do mês”) ou <b>esconder</b> o produto do site. A mudança aparece no site em até 10 minutos, sem publicar nada.
        Para mudar foto, texto ou ficha técnica, peça ao T.I. (isso fica nos arquivos do site). Os cartões de cima filtram.
      </ComoLer>

      <input style={{ ...campo, maxWidth: 420 }} placeholder="Buscar por nome ou marca" value={busca} onChange={(e) => setBusca(e.target.value)} />

      <div style={grade(280)}>
        {itens === null && <p>Carregando…</p>}
        {lista.map((i) => {
          const v = vigor(i);
          const ed = editando === i.slug && rascunho;
          return (
            <div key={i.slug} style={{ ...cartao, display: 'grid', gap: 10, opacity: v.oculto && !ed ? 0.55 : 1 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ flex: 'none', width: 84, height: 63, borderRadius: 10, background: 'var(--portal-bg)', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                  {/* foto já otimizada pelo site (webp 320 px) */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {i.foto ? <img src={i.foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} loading="lazy" /> : <i className="fa-solid fa-image" />}
                </span>
                <span style={{ minWidth: 0, display: 'grid' }}>
                  <a href={i.link} target="_blank" rel="noopener" style={{ fontWeight: 500, color: 'var(--portal-text)', textDecoration: 'none' }}>{i.titulo}</a>
                  <span style={{ fontSize: 13, color: 'var(--portal-text-muted, #6b7280)' }}>{i.marca}{i.potencia_cv ? ` · ${i.potencia_cv} cv` : ''}</span>
                </span>
              </div>

              {!ed && (
                <>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 12 }}>
                    <span style={{ padding: '3px 8px', borderRadius: 999, background: 'var(--portal-bg)' }}>{v.exibir_preco && v.preco ? real(v.preco) : 'Sem preço no site'}</span>
                    {v.pronta_entrega && <span style={{ padding: '3px 8px', borderRadius: 999, background: 'color-mix(in srgb, #d97706 12%, transparent)' }}>Pronta entrega</span>}
                    {v.selo && <span style={{ padding: '3px 8px', borderRadius: 999, background: 'color-mix(in srgb, #dc2626 12%, transparent)' }}>{v.selo}</span>}
                    {v.oculto && <span style={{ padding: '3px 8px', borderRadius: 999, background: 'color-mix(in srgb, #6b7280 15%, transparent)' }}>Escondido</span>}
                  </div>
                  {i.mudanca && <span style={{ fontSize: 12, color: 'var(--portal-text-muted, #6b7280)' }}>Mudado por {i.mudanca.atualizado_por || '—'} em {new Date(i.mudanca.atualizado_em).toLocaleDateString('pt-BR')}</span>}
                  {podeEditar && <div><button style={botao('#dc2626', false)} onClick={() => abrir(i)}>Mudar</button></div>}
                </>
              )}

              {ed && rascunho && (
                <div style={{ display: 'grid', gap: 10 }}>
                  <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Preço (R$, sem centavos)
                    <input style={campo} inputMode="numeric" value={rascunho.preco == null ? '' : Math.round(rascunho.preco).toLocaleString('pt-BR')} placeholder="Ex.: 189.900"
                      onChange={(e) => { const t = e.target.value.replace(/\D/g, ''); setRascunho({ ...rascunho, preco: t === '' ? null : Number(t) }); }} />
                  </label>
                  {[['exibir_preco', 'Mostrar o preço no site'], ['pronta_entrega', 'Pronta entrega'], ['oculto', 'Esconder do site']].map(([k, r]) => (
                    <label key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
                      <input type="checkbox" checked={!!rascunho[k as 'oculto']} onChange={(e) => setRascunho({ ...rascunho, [k]: e.target.checked })} style={{ width: 18, height: 18, accentColor: '#dc2626' }} />{r}
                    </label>
                  ))}
                  <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Selo no cartão (até 30 letras)
                    <input style={campo} maxLength={30} value={rascunho.selo} placeholder="Ex.: Oferta do mês" onChange={(e) => setRascunho({ ...rascunho, selo: e.target.value })} />
                  </label>
                  <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Nota interna
                    <input style={campo} value={rascunho.notas} placeholder="Ex.: preço válido até 30/11" onChange={(e) => setRascunho({ ...rascunho, notas: e.target.value })} />
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button disabled={salvando} style={botao()} onClick={() => salvar(i.slug)}>{salvando ? 'Salvando…' : 'Salvar'}</button>
                    <button style={botao('#dc2626', false)} onClick={() => setEditando(null)}>Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
