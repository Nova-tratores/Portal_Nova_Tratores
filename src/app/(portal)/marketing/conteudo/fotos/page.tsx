'use client';
// Conteúdo e publicar → Banco de fotos (26/11/2026). Fotos de tratores para os posts: enviadas por aqui ou tiradas dos
// vídeos da Mahindra (próxima etapa). O Claude olha cada foto e põe descrição, etiquetas, modelo (só se dá para ler) e nota.
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAuth } from '@/lib/auth/client';
import { Aviso, tela, quando } from '@/components/marketing/redes/ui';
import SubAbas from '@/components/marketing/redes/SubAbas';
import { ABAS_CONTEUDO } from '@/components/marketing/redes/abasConteudo';
import { AZUL, BORDA, FUNDO, T1, T2, T3, bt, campoNP, ic } from '@/components/marketing/redes/np';

type Foto = {
  id: string; url: string; miniatura: string | null; largura: number | null; altura: number | null
  origem: 'envio' | 'youtube'; origem_id: string | null; origem_titulo: string | null; segundo: number | null
  descricao: string | null; etiquetas: string[]; modelo: string | null; nota: number | null
  ia_status: 'pendente' | 'ok' | 'erro'; ia_erro: string | null; usada_em: number; criado_por: string | null; criado_em: string
};
type Resp = { ok: boolean; erro?: string; fotos: Foto[]; total: number; porPagina: number; contagem: Record<string, number>; etiquetas: string[]; ia: boolean; podeEditar: boolean };

const VERDE = '#16a34a';
const VERMELHO = '#dc2626';
const estrelas = (n: number | null) => (n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '');

export default function BancoDeFotos() {
  const [dados, setDados] = useState<Resp | null>(null);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [texto, setTexto] = useState('');
  const [filtro, setFiltro] = useState<string[]>([]);
  const [pagina, setPagina] = useState(0);
  const [enviando, setEnviando] = useState<{ feitas: number; total: number } | null>(null);
  const [aberta, setAberta] = useState<Foto | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    const q = new URLSearchParams({ pagina: String(pagina) });
    if (texto.trim()) q.set('q', texto.trim());
    if (filtro.length) q.set('etiqueta', filtro.join(','));
    const r = await fetchAuth(`/api/marketing/fotos?${q}`);
    const j = (await r.json().catch(() => ({}))) as Resp;
    if (!r.ok || !j.ok) { setErro(j.erro || 'Não consegui abrir o banco de fotos.'); return; }
    setErro(''); setDados(j);
  }, [pagina, texto, filtro]);

  useEffect(() => { const t = setTimeout(carregar, texto ? 350 : 0); return () => clearTimeout(t); }, [carregar, texto]);

  async function enviar(lista: FileList | File[]) {
    const arquivos = [...lista].filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
    if (!arquivos.length) { setErro('Escolha fotos JPG, PNG ou WebP.'); return; }
    setErro(''); setOk('');
    let feitas = 0; const falhas: string[] = [];
    setEnviando({ feitas, total: arquivos.length });
    // de 3 em 3: cada foto passa pela IA (alguns segundos) e assim a barra anda
    for (let i = 0; i < arquivos.length; i += 3) {
      const fd = new FormData();
      for (const a of arquivos.slice(i, i + 3)) fd.append('arquivo', a);
      const r = await fetchAuth('/api/marketing/fotos', { method: 'POST', body: fd });
      const j = await r.json().catch(() => ({}));
      if (r.status === 503) { setErro(j.erro); setEnviando(null); return; }
      feitas += (j.fotos || []).length; falhas.push(...(j.falhas || []));
      setEnviando({ feitas: Math.min(arquivos.length, i + 3), total: arquivos.length });
    }
    setEnviando(null);
    setOk(`${feitas} foto(s) no banco${dados?.ia ? ', já etiquetadas pela IA' : ''}.${falhas.length ? ` Não entraram: ${falhas.join(' · ')}` : ''}`);
    setPagina(0); carregar();
  }

  const marcar = (e: string) => { setPagina(0); setFiltro((f) => (f.includes(e) ? f.filter((x) => x !== e) : [...f, e])); };
  const trocar = (f: Foto) => { setDados((d) => d && { ...d, fotos: d.fotos.map((x) => (x.id === f.id ? f : x)) }); setAberta(f); };
  const tirar = (id: string) => { setDados((d) => d && { ...d, fotos: d.fotos.filter((x) => x.id !== id), total: d.total - 1 }); setAberta(null); };

  const podeEditar = !!dados?.podeEditar;
  const usadas = Object.entries(dados?.contagem || {}).sort((a, b) => b[1] - a[1]);
  const paginas = dados ? Math.ceil(dados.total / dados.porPagina) : 0;

  return (
    <div style={tela}
      onDragOver={(e) => { if (podeEditar && e.dataTransfer.types.includes('Files')) { e.preventDefault(); setArrastando(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setArrastando(false); }}
      onDrop={(e) => { if (!podeEditar) return; e.preventDefault(); setArrastando(false); enviar(e.dataTransfer.files); }}>
      <SubAbas abas={ABAS_CONTEUDO} />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: T1 }}>Banco de fotos</h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: T2 }}>
            {dados ? `${dados.total.toLocaleString('pt-BR')} foto(s)` : 'Carregando…'} · a IA põe as etiquetas sozinha. Arraste fotos para qualquer lugar da tela.
          </p>
        </div>
        {podeEditar && (
          <>
            <input ref={entrada} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { if (e.target.files) enviar(e.target.files); e.target.value = ''; }} />
            <button style={bt(AZUL, true)} disabled={!!enviando} onClick={() => entrada.current?.click()}>{ic('fa-cloud-arrow-up')} Enviar fotos</button>
          </>
        )}
      </div>

      {erro && <Aviso>{erro}</Aviso>}
      {ok && <Aviso tom="info">{ok}</Aviso>}
      {dados && !dados.ia && <Aviso tom="info">A IA ainda não está ligada neste servidor (falta ANTHROPIC_API_KEY). As fotos entram, mas sem etiquetas.</Aviso>}
      {enviando && (
        <div style={{ background: FUNDO, border: `1px solid ${BORDA}`, borderRadius: 14, padding: 14, display: 'grid', gap: 8 }}>
          <span style={{ fontSize: 14, color: T1 }}>{ic('fa-wand-magic-sparkles')} Guardando e etiquetando: {enviando.feitas} de {enviando.total}…</span>
          <div style={{ height: 8, borderRadius: 8, background: BORDA, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(enviando.feitas / enviando.total) * 100}%`, background: AZUL, transition: 'width .4s ease' }} />
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        <input style={campoNP} placeholder="Buscar: descrição, modelo do trator ou vídeo (ex.: plantando soja, 6075)…" value={texto} onChange={(e) => { setPagina(0); setTexto(e.target.value); }} />
        {usadas.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {filtro.length > 0 && <button style={{ ...chip(false), color: VERMELHO }} onClick={() => { setPagina(0); setFiltro([]); }}>{ic('fa-xmark')} limpar</button>}
            {usadas.map(([e, n]) => (
              <button key={e} style={chip(filtro.includes(e))} onClick={() => marcar(e)}>{e} <span style={{ opacity: 0.7 }}>{n}</span></button>
            ))}
          </div>
        )}
      </div>

      {arrastando && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'color-mix(in srgb, #2563eb 14%, transparent)', border: '3px dashed #2563eb', display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          <span style={{ background: FUNDO, padding: '14px 20px', borderRadius: 14, fontSize: 16, color: T1 }}>{ic('fa-cloud-arrow-up')} Solte para mandar ao banco</span>
        </div>
      )}

      {dados && dados.fotos.length === 0 && !enviando && (
        <div style={{ background: FUNDO, border: `1px dashed ${BORDA}`, borderRadius: 16, padding: 32, textAlign: 'center', color: T2, fontSize: 15 }}>
          {filtro.length || texto ? 'Nenhuma foto com esse filtro.' : 'O banco está vazio. Envie as primeiras fotos de tratores (ou arraste para cá).'}
        </div>
      )}

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(min(190px, 100%), 1fr))' }}>
        {dados?.fotos.map((f) => (
          <button key={f.id} onClick={() => setAberta(f)} className="np-sobe"
            style={{ padding: 0, border: `1px solid ${BORDA}`, borderRadius: 14, overflow: 'hidden', background: FUNDO, cursor: 'pointer', textAlign: 'left', font: 'inherit', display: 'grid' }}>
            <div style={{ position: 'relative', aspectRatio: '4 / 3', background: '#0f172a' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.miniatura || f.url} alt={f.descricao || 'foto'} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              {f.origem === 'youtube' && <span style={selo('#ff0000')}><i className="fa-brands fa-youtube" /></span>}
              {f.ia_status !== 'ok' && <span style={{ ...selo(f.ia_status === 'erro' ? VERMELHO : '#64748b'), left: 8, right: 'auto' }}>{f.ia_status === 'erro' ? 'IA falhou' : 'sem etiquetas'}</span>}
            </div>
            <div style={{ padding: '8px 10px 10px', display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 13, color: T1, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{f.descricao || 'Sem descrição'}</span>
              <span style={{ fontSize: 12, color: '#d97706', letterSpacing: 1 }}>{estrelas(f.nota)}{f.modelo && <span style={{ color: T3, letterSpacing: 0, marginLeft: 6 }}>{f.modelo}</span>}</span>
            </div>
          </button>
        ))}
      </div>

      {paginas > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
          <button style={bt(AZUL)} disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>{ic('fa-chevron-left')} Anterior</button>
          <span style={{ fontSize: 14, color: T2 }}>{pagina + 1} de {paginas}</span>
          <button style={bt(AZUL)} disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)}>Próxima {ic('fa-chevron-right')}</button>
        </div>
      )}

      {aberta && dados && <JanelaFoto foto={aberta} etiquetas={dados.etiquetas} podeEditar={podeEditar} ia={dados.ia} fechar={() => setAberta(null)} trocar={trocar} tirar={tirar} />}
    </div>
  );
}

const chip = (ativo: boolean): React.CSSProperties => ({
  padding: '5px 11px', borderRadius: 999, font: 'inherit', fontSize: 13, cursor: 'pointer',
  border: `1px solid ${ativo ? AZUL : BORDA}`, background: ativo ? AZUL : FUNDO, color: ativo ? '#fff' : T1,
});
const selo = (cor: string): React.CSSProperties => ({
  position: 'absolute', top: 8, right: 8, padding: '3px 8px', borderRadius: 8, fontSize: 12, color: '#fff', background: cor,
});

function JanelaFoto({ foto, etiquetas, podeEditar, ia, fechar, trocar, tirar }: {
  foto: Foto; etiquetas: string[]; podeEditar: boolean; ia: boolean; fechar: () => void; trocar: (f: Foto) => void; tirar: (id: string) => void
}) {
  const [desc, setDesc] = useState(foto.descricao || '');
  const [modelo, setModelo] = useState(foto.modelo || '');
  const [marcadas, setMarcadas] = useState<string[]>(foto.etiquetas);
  const [ocupado, setOcupado] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar(); };
    addEventListener('keydown', esc); return () => removeEventListener('keydown', esc);
  }, [fechar]);

  const mudou = desc !== (foto.descricao || '') || modelo !== (foto.modelo || '') || marcadas.join() !== foto.etiquetas.join();

  async function patch(corpo: Record<string, unknown>, rotulo: string) {
    setOcupado(rotulo); setMsg('');
    const r = await fetchAuth('/api/marketing/fotos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: foto.id, ...corpo }) });
    const j = await r.json().catch(() => ({}));
    setOcupado('');
    if (!r.ok || !j.ok) { setMsg(j.erro || 'Não deu certo.'); return; }
    setDesc(j.foto.descricao || ''); setModelo(j.foto.modelo || ''); setMarcadas(j.foto.etiquetas || []);
    trocar(j.foto); setMsg(rotulo === 'ia' ? 'A IA leu a foto de novo.' : 'Guardado.');
  }

  async function apagar() {
    if (!confirm('Apagar esta foto do banco? Não dá para desfazer.')) return;
    setOcupado('apagar');
    const r = await fetchAuth(`/api/marketing/fotos?id=${foto.id}`, { method: 'DELETE' });
    const j = await r.json().catch(() => ({}));
    setOcupado('');
    if (!r.ok || !j.ok) { setMsg(j.erro || 'Não apagou.'); return; }
    tirar(foto.id);
  }

  return (
    <div onClick={fechar} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(15,23,42,.6)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="np-entra"
        style={{ background: 'var(--portal-bg-card, #fff)', borderRadius: 18, width: 'min(1000px, 100%)', maxHeight: '92vh', overflow: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))' }}>
        <div style={{ background: '#0f172a', display: 'grid', placeItems: 'center', minHeight: 260 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={foto.url} alt={foto.descricao || 'foto'} style={{ maxWidth: '100%', maxHeight: '80vh', display: 'block' }} />
        </div>
        <div style={{ padding: 18, display: 'grid', gap: 14, alignContent: 'start' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8 }}>
            <div style={{ fontSize: 13, color: T2, lineHeight: 1.5 }}>
              {foto.origem === 'youtube'
                ? <>Do vídeo <a href={`https://www.youtube.com/watch?v=${foto.origem_id}&t=${foto.segundo || 0}s`} target="_blank" rel="noreferrer" style={{ color: AZUL }}>{foto.origem_titulo || 'YouTube'}</a> ({foto.segundo}s)</>
                : <>Enviada por {foto.criado_por || 'alguém'}</>}
              {' · '}{quando(foto.criado_em)}{foto.largura ? ` · ${foto.largura}×${foto.altura}` : ''}
              {foto.usada_em > 0 && <> · usada em {foto.usada_em} post(s)</>}
            </div>
            <button onClick={fechar} style={{ ...bt(T2), minHeight: 34, padding: '4px 10px' }} aria-label="Fechar">{ic('fa-xmark')}</button>
          </div>

          {foto.ia_status === 'erro' && <Aviso>A IA não conseguiu ler: {foto.ia_erro}</Aviso>}
          {foto.nota && <div style={{ fontSize: 18, color: '#d97706', letterSpacing: 2 }} title="Nota da IA para post">{estrelas(foto.nota)}</div>}

          <label style={{ display: 'grid', gap: 5, fontSize: 13, color: T2 }}>Descrição
            <textarea style={{ ...campoNP, minHeight: 64, resize: 'vertical' }} value={desc} disabled={!podeEditar} onChange={(e) => setDesc(e.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: 5, fontSize: 13, color: T2 }}>Modelo do trator (só se aparece na foto)
            <input style={campoNP} value={modelo} disabled={!podeEditar} placeholder="ex.: Mahindra 6075" onChange={(e) => setModelo(e.target.value)} />
          </label>

          <div style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 13, color: T2 }}>Etiquetas {podeEditar && '(toque para marcar ou tirar)'}</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(podeEditar ? etiquetas : marcadas).map((e) => (
                <button key={e} disabled={!podeEditar} style={{ ...chip(marcadas.includes(e)), fontSize: 12, padding: '4px 9px', cursor: podeEditar ? 'pointer' : 'default' }}
                  onClick={() => setMarcadas((m) => (m.includes(e) ? m.filter((x) => x !== e) : [...m, e]))}>{e}</button>
              ))}
            </div>
          </div>

          {msg && <span style={{ fontSize: 13, color: /não/i.test(msg) ? VERMELHO : VERDE }}>{msg}</span>}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {podeEditar && <button style={bt(VERDE, true)} disabled={!mudou || !!ocupado} onClick={() => patch({ descricao: desc, modelo, etiquetas: marcadas }, 'salvar')}>{ic('fa-check')} {ocupado === 'salvar' ? 'Guardando…' : 'Guardar'}</button>}
            <a style={bt(AZUL)} href={foto.url} target="_blank" rel="noreferrer" download>{ic('fa-download')} Baixar</a>
            {podeEditar && ia && <button style={bt('#7c3aed')} disabled={!!ocupado} onClick={() => patch({ refazer: true }, 'ia')}>{ic('fa-wand-magic-sparkles')} {ocupado === 'ia' ? 'A IA está olhando…' : 'IA ler de novo'}</button>}
            {podeEditar && <button style={bt(VERMELHO)} disabled={!!ocupado} onClick={apagar}>{ic('fa-trash')} Apagar</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
