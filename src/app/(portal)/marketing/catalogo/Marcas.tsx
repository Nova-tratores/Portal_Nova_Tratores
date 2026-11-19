'use client';
// Site → Catálogo → Marcas (José, 12/11/2026: "conseguir colocar uma nova marca, ou incluir modelos dentro de uma;
// pede a imagem do banner e tudo mais que é necessário e vai mostrando a prévia").
// Marca = nome + logo + foto do banner + texto "sobre" + itens sob consulta. Os modelos são as máquinas do catálogo com
// essa marca ("Incluir modelo nesta marca" abre a ficha de máquina nova já com a marca). Aparece no site depois do Publicar.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAuth } from '@/lib/auth/client';
import { Aviso, botao, campo, cartao, grade } from '@/components/marketing/redes/ui';
import EnviarFoto from '@/components/marketing/redes/EnviarFoto';
import { PreviaMarca, type CardPrevia } from '@/components/marketing/redes/Previa';
import { Voltar } from '@/components/marketing/redes/np';

type Modelo = { marca: string; categoria: string; cartao: CardPrevia; abrir: () => void };
type MarcaSite = { nome: string; logo_url?: string | null; banner_url?: string | null; sobre?: string | null; sob_consulta?: string[]; modelos?: number; origem?: string };
type Salva = { nome: string; logo: string | null; banner: string | null; sobre: string | null; sob_consulta: string[]; ordem: number | null; atualizado_em: string; atualizado_por: string | null };
type Rascunho = { chave: string; nome: string; nome_antigo?: string; logo: string | null; banner: string | null; sobre: string; consulta: string; nova: boolean };

const muted = 'var(--portal-text-muted, #6b7280)';
const rotulo: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 13 };
const ajuda: React.CSSProperties = { fontSize: 12, color: muted };

/** Valor de `aberta` para a marca nova (no endereço: ?marca=nova). */
export const MARCA_NOVA = 'nova';

// Qual marca está aberta vem do endereço da página (?marca=Piccin), para o Voltar do navegador funcionar
// (José, 12/11: "eu entro e não consigo voltar, tem que ter a opção e mudar a URL").
export default function MarcasVista({ itens, podeEditar, versao, gravou, incluirModelo, aberta, irMarca }: {
  itens: Modelo[]; podeEditar: boolean; versao: number; gravou: () => void; incluirModelo: (marca: string) => void;
  aberta: string | null; irMarca: (nome: string | null) => void;
}) {
  const [doSite, setDoSite] = useState<MarcaSite[]>([]);
  const [salvas, setSalvas] = useState<Salva[]>([]);
  const [erro, setErro] = useState('');
  const [r, setR] = useState<Rascunho | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState('');

  const carregar = useCallback(async () => {
    const res = await fetchAuth('/api/marketing/marcas');
    const j = await res.json().catch(() => ({}));
    setDoSite(j.doSite || []);
    if (!res.ok || !j.ok) { setErro(j.erro || 'Não consegui carregar as marcas.'); return; }
    setErro(''); setSalvas(j.salvas || []);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar(); }, [carregar, versao]);

  /** Todas as marcas: do site, gravadas aqui e as que só aparecem nos modelos (implementos). */
  const marcas = useMemo(() => {
    const nomes = new Set<string>([
      ...doSite.map((m) => m.nome), ...salvas.map((s) => s.nome),
      ...itens.filter((i) => i.categoria === 'implementos').map((i) => i.marca),
    ].filter(Boolean));
    return [...nomes].map((nome) => {
      const s = salvas.find((x) => x.nome === nome);
      const d = doSite.find((x) => x.nome === nome);
      const modelos = itens.filter((i) => i.marca === nome);
      return {
        nome, salva: s, site: d, modelos,
        logo: s?.logo || d?.logo_url || null, banner: s?.banner || d?.banner_url || null,
        sobre: s?.sobre ?? d?.sobre ?? '', consulta: s?.sob_consulta?.length ? s.sob_consulta : d?.sob_consulta || [],
        nova: !d,
      };
    }).sort((a, b) => b.modelos.length - a.modelos.length || a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [doSite, salvas, itens]);

  // abre/fecha conforme o endereço; não apaga o que está sendo digitado na mesma marca
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (aberta === null) { setR(null); return; }
    setErroForm('');
    if (aberta === MARCA_NOVA) { setR((x) => (x?.chave === MARCA_NOVA ? x : { chave: MARCA_NOVA, nome: '', logo: null, banner: null, sobre: '', consulta: '', nova: true })); return; }
    const m = marcas.find((x) => x.nome === aberta);
    if (!m) return;
    setR((x) => (x?.chave === aberta ? x : { chave: aberta, nome: m.nome, nome_antigo: m.salva?.nome, logo: m.logo, banner: m.banner, sobre: m.sobre || '', consulta: m.consulta.join('\n'), nova: m.nova }));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [aberta, marcas]);
  const fecharMarca = () => irMarca(null);

  async function salvar() {
    if (!r) return;
    if (r.nome.trim().length < 2) { setErroForm('Escreva o nome da marca.'); return; }
    if (r.nova && !r.logo) { setErroForm('Envie o logo da marca.'); return; }
    setSalvando(true); setErroForm('');
    const res = await fetchAuth('/api/marketing/marcas', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: r.nome, nome_antigo: r.nome_antigo, logo: r.logo, banner: r.banner, sobre: r.sobre, sob_consulta: r.consulta.split('\n').map((s) => s.trim()).filter(Boolean) }),
    });
    const j = await res.json().catch(() => ({}));
    setSalvando(false);
    if (!res.ok || !j.ok) { setErroForm(j.erro || 'Não consegui gravar.'); return; }
    gravou(); carregar();
    return true;
  }

  async function desfazer(nome: string, nova: boolean) {
    if (!confirm(nova ? `Apagar a marca "${nome}"? Os modelos dela continuam no catálogo.` : `Voltar a marca "${nome}" ao que está no site (logo, banner e textos)?`)) return;
    const res = await fetchAuth(`/api/marketing/marcas?nome=${encodeURIComponent(nome)}`, { method: 'DELETE' });
    if (res.ok) { fecharMarca(); gravou(); carregar(); }
  }

  const atual = r ? marcas.find((m) => m.nome === (r.nome_antigo || r.nome)) : null;
  const modelosDaMarca = r ? itens.filter((i) => i.marca === (r.nome_antigo || r.nome)) : [];

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {erro && <Aviso>{erro}</Aviso>}
      {!r && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ flex: '1 1 240px', fontSize: 14, color: muted }}>
          {marcas.length} marcas de implemento no site. Toque numa para mudar o logo, a foto do banner e os textos, ou para incluir um modelo nela.
        </span>
        {podeEditar && <button style={botao()} onClick={() => irMarca(MARCA_NOVA)}><i className="fa-solid fa-plus" style={{ fontWeight: 900 }} />Nova marca</button>}
      </div>}

      {r && (
        <div style={{ ...cartao, display: 'grid', gap: 14 }}>
          <Voltar para="Marcas" atual={r.nova && !atual ? 'Nova marca no site' : r.nome_antigo || r.nome} onClick={fecharMarca} />
          <fieldset disabled={!podeEditar || salvando} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 14, minWidth: 0 }}>
            <label style={rotulo}>Nome da marca
              <input style={{ ...campo, maxWidth: 360 }} maxLength={40} value={r.nome} placeholder="Ex.: Jumil" onChange={(e) => setR({ ...r, nome: e.target.value })} />
            </label>
            <div style={grade(260)}>
              <div style={{ display: 'grid', gap: 6, alignContent: 'start' }}>
                <span style={{ fontSize: 13 }}>Logo <span style={{ color: muted }}>(PNG com fundo transparente ou branco)</span></span>
                <span style={{ height: 90, borderRadius: 12, background: '#fff', border: '1px solid var(--border)', display: 'grid', placeItems: 'center', overflow: 'hidden', padding: 10 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {r.logo ? <img src={r.logo} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : <span style={ajuda}>sem logo</span>}
                </span>
                <EnviarFoto pasta="marcas" rotulo={r.logo ? 'Trocar o logo' : 'Enviar o logo'} onEnviada={([u]) => setR({ ...r, logo: u })} />
              </div>
              <div style={{ display: 'grid', gap: 6, alignContent: 'start' }}>
                <span style={{ fontSize: 13 }}>Foto do banner <span style={{ color: muted }}>(foto de campo, deitada, do fabricante)</span></span>
                <span style={{ aspectRatio: '3', borderRadius: 12, background: '#111', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {r.banner ? <img src={r.banner} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ ...ajuda, color: '#9ca3af' }}>sem foto: o site usa a máquina de destaque</span>}
                </span>
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <EnviarFoto pasta="marcas" rotulo={r.banner ? 'Trocar a foto' : 'Enviar a foto'} onEnviada={([u]) => setR({ ...r, banner: u })} />
                  {r.banner && <button type="button" style={botao('#6b7280', false)} onClick={() => setR({ ...r, banner: null })}>Tirar</button>}
                </span>
              </div>
            </div>
            <label style={rotulo}>Sobre a marca <span style={ajuda}>2 ou 3 frases: o que fabrica e por que a Nova revende</span>
              <textarea style={{ ...campo, minHeight: 80, resize: 'vertical' }} maxLength={600} value={r.sobre} onChange={(e) => setR({ ...r, sobre: e.target.value })} placeholder="Ex.: Fabricante de plantadeiras e pulverizadores desde 1960…" />
            </label>
            <label style={rotulo}>Também vendemos sob consulta <span style={ajuda}>um por linha (aparece em “Sob consulta”)</span>
              <textarea style={{ ...campo, minHeight: 70, resize: 'vertical' }} value={r.consulta} onChange={(e) => setR({ ...r, consulta: e.target.value })} placeholder={'Ex.: plantadeira\npulverizador'} />
            </label>
          </fieldset>

          <div style={{ display: 'grid', gap: 8 }}>
            <span style={{ fontSize: 13 }}>Modelos desta marca no site ({modelosDaMarca.length})</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {modelosDaMarca.map((m, i) => (
                <button key={i} type="button" onClick={m.abrir} style={{ ...botao('#6b7280', false), minHeight: 34, padding: '4px 10px', fontSize: 13 }}>{m.cartao.nome}</button>
              ))}
              {podeEditar && r.nome.trim().length >= 2 && (
                <button type="button" style={{ ...botao('#dc2626', false), minHeight: 34, padding: '4px 12px', fontSize: 13 }}
                  onClick={async () => { if (r.nova && !atual?.salva && !(await salvar())) return; incluirModelo(r.nome.trim()); }}>
                  <i className="fa-solid fa-plus" style={{ fontWeight: 900 }} />Incluir modelo nesta marca
                </button>
              )}
            </div>
            {r.nova && !atual?.salva && <span style={ajuda}>Ao incluir o primeiro modelo, a marca é gravada antes.</span>}
          </div>

          <div style={{ ...cartao, background: 'var(--portal-bg)' }}>
            <PreviaMarca m={{
              nome: r.nome, logo: r.logo, banner: r.banner, sobre: r.sobre,
              modelos: modelosDaMarca.map((m) => m.cartao), sobConsulta: r.consulta.split('\n').map((s) => s.trim()).filter(Boolean),
            }} />
          </div>

          {erroForm && <span style={{ color: '#dc2626', fontSize: 13 }}>{erroForm}</span>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {podeEditar && <button style={botao()} disabled={salvando} onClick={async () => { if (await salvar()) fecharMarca(); }}>{salvando ? 'Gravando…' : 'Gravar marca'}</button>}
            <button style={botao('#dc2626', false)} onClick={fecharMarca}>Voltar sem gravar</button>
            {podeEditar && atual?.salva && (
              <button style={{ ...botao('#6b7280', false), marginLeft: 'auto' }} onClick={() => desfazer(atual.nome, atual.nova)}>
                <i className={`fa-solid ${atual.nova ? 'fa-trash' : 'fa-rotate-left'}`} style={{ fontWeight: 900 }} />{atual.nova ? 'Apagar marca' : 'Desfazer mudanças'}
              </button>
            )}
          </div>
        </div>
      )}

      {!r && <div style={grade(240)}>
        {marcas.map((m) => (
          <button key={m.nome} onClick={() => irMarca(m.nome)} style={{ ...cartao, padding: 0, overflow: 'hidden', display: 'grid', textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer' }}>
            <span style={{ position: 'relative', aspectRatio: '3', background: m.banner ? '#111' : 'linear-gradient(#fff, #ececee)', display: 'block', overflow: 'hidden' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {m.banner && <img src={m.banner} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }} loading="lazy" />}
              {m.logo && (
                <span style={{ position: 'absolute', left: 10, bottom: 10, background: '#fff', borderRadius: 8, padding: '5px 8px', display: 'flex' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.logo} alt="" style={{ height: 22, width: 'auto' }} />
                </span>
              )}
            </span>
            <span style={{ padding: '10px 12px', display: 'grid', gap: 2 }}>
              <span style={{ fontWeight: 500 }}>{m.nome}</span>
              <span style={{ fontSize: 12, color: muted }}>
                {m.modelos.length} {m.modelos.length === 1 ? 'modelo' : 'modelos'}{m.consulta.length ? ` · ${m.consulta.length} sob consulta` : ''}
                {m.nova ? ' · nova (falta publicar)' : m.salva ? ' · mudada aqui' : ''}
                {!m.banner ? ' · sem foto de banner' : ''}
              </span>
            </span>
          </button>
        ))}
      </div>}
    </div>
  );
}
