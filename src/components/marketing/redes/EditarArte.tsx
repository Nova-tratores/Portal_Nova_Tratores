'use client';
// Editar a arte em camadas (26/11/2026, José: "entregar o resultado em camada, de forma que qualquer coisa conseguimos
// editar o post, lá no módulo de marketing mesmo, se não ficar algo extremamente pesado ou contraintuitivo").
// Texto, cor e posição: a prévia redesenha em ~1 s, sem custo. "Nova cena": a IA refaz o fundo (centavos, ~30 s).
import { useEffect, useRef, useState } from 'react';
import { fetchAuth } from '@/lib/auth/client';
import { PALETAS, PALETAS_EM_ORDEM, type Camadas } from '@/lib/marketing/robo/paletas';
import { AZUL, BORDA, T1, T2, T3, bt, campoNP, ic } from './np';

const VERDE = '#16a34a';

export default function EditarArte({ postId, arte, atual, podeEditar, onSalvo }: {
  postId: string; arte: Camadas; atual?: string; podeEditar: boolean; onSalvo: (url: string, arte: Camadas) => void;
}) {
  const [c, setC] = useState<Camadas>(arte);
  const [previa, setPrevia] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [ocupado, setOcupado] = useState<'' | 'salvar' | 'cena'>('');
  const [pedido, setPedido] = useState('');
  const [msg, setMsg] = useState('');
  const ultima = useRef(0);
  const mudou = JSON.stringify(c) !== JSON.stringify(arte);

  // prévia: espera parar de digitar (0,6 s) e redesenha no servidor
  useEffect(() => {
    if (!mudou) return;
    const n = ++ultima.current;
    const t = setTimeout(async () => {
      setCarregando(true);
      const r = await fetchAuth('/api/marketing/posts/arte', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: postId, camadas: c, previa: true }) });
      if (n !== ultima.current) return;
      setCarregando(false);
      if (!r.ok) { const j = await r.json().catch(() => ({})); setMsg(j.erro || 'Não consegui desenhar a prévia.'); return; }
      const url = URL.createObjectURL(await r.blob());
      setPrevia((antes) => { if (antes) URL.revokeObjectURL(antes); return url; });
    }, 600);
    return () => clearTimeout(t);
  }, [c, mudou, postId]);

  async function enviar(corpo: Record<string, unknown>, tipo: 'salvar' | 'cena') {
    setOcupado(tipo); setMsg('');
    const r = await fetchAuth('/api/marketing/posts/arte', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: postId, camadas: c, ...corpo }) });
    const j = await r.json().catch(() => ({}));
    setOcupado('');
    if (!r.ok || !j.ok) { setMsg(j.erro || 'Não deu certo.'); return; }
    setC(j.arte); setPrevia(null); setPedido('');
    onSalvo(j.url, j.arte);
    setMsg(tipo === 'cena' ? 'Cena nova pronta e guardada.' : 'Arte guardada.');
  }

  const muda = <K extends keyof Camadas>(k: K, v: Camadas[K]) => setC((x) => ({ ...x, [k]: v }));
  const rot: React.CSSProperties = { display: 'grid', gap: 5, fontSize: 13, color: T2 };

  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', alignItems: 'start' }}>
      {/* prévia */}
      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', border: `1px solid ${BORDA}`, aspectRatio: '4 / 5', background: '#111', maxWidth: '100%' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={(mudou && previa) || atual || undefined} alt="Prévia da arte" style={{ width: '100%', height: '100%', objectFit: 'cover', display: previa || atual ? 'block' : 'none' }} />
          {(carregando || ocupado === 'cena') && (
            <span style={{ position: 'absolute', left: 10, bottom: 10, background: 'rgba(0,0,0,.7)', color: '#fff', fontSize: 13, padding: '5px 10px', borderRadius: 8 }}>
              {ocupado === 'cena' ? 'A IA está montando a cena nova (uns 30 s)…' : 'Desenhando…'}
            </span>
          )}
        </div>
        <span style={{ fontSize: 12.5, color: T3 }}>{mudou ? 'Prévia das mudanças. Só vale depois de “Guardar arte”.' : 'Arte atual do post.'}</span>
      </div>

      {/* camadas */}
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
          <label style={{ ...rot, flex: '0 0 90px' }}>Dia
            <input style={campoNP} value={c.data?.dia || ''} placeholder="05/12" maxLength={5} disabled={!podeEditar || !c.data}
              onChange={(e) => muda('data', c.data ? { ...c.data, dia: e.target.value } : null)} />
          </label>
          <label style={{ ...rot, flex: '1 1 160px' }}>Data comemorativa
            <input style={campoNP} value={c.data?.nome || ''} placeholder="sem data" maxLength={40} disabled={!podeEditar}
              onChange={(e) => muda('data', e.target.value ? { dia: c.data?.dia || '', nome: e.target.value } : null)} />
          </label>
        </div>
        <label style={rot}>Título (grande)
          <input style={campoNP} value={c.titulo} maxLength={60} disabled={!podeEditar} onChange={(e) => muda('titulo', e.target.value)} />
        </label>
        <label style={rot}>Frase
          <textarea style={{ ...campoNP, minHeight: 60, resize: 'vertical' }} value={c.frase} maxLength={140} disabled={!podeEditar} onChange={(e) => muda('frase', e.target.value)} />
        </label>
        <label style={rot}>Parte colorida da frase (copie um pedaço da frase)
          <input style={{ ...campoNP, borderColor: c.destaque && !c.frase.includes(c.destaque) ? '#dc2626' : undefined }} value={c.destaque} maxLength={80} disabled={!podeEditar} onChange={(e) => muda('destaque', e.target.value)} />
        </label>

        <div style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 13, color: T2 }}>Cores do texto</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {PALETAS_EM_ORDEM.map((p) => (
              <button key={p} type="button" disabled={!podeEditar} onClick={() => muda('paleta', p)} title={PALETAS[p].nome} aria-pressed={c.paleta === p}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px 5px 6px', borderRadius: 999, cursor: 'pointer', font: 'inherit', fontSize: 13, color: T1,
                  background: 'transparent', border: `2px solid ${c.paleta === p ? AZUL : BORDA}` }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: `linear-gradient(135deg, ${PALETAS[p].t1} 50%, #1f2328 50%)`, border: '1px solid #0003' }} />
                {PALETAS[p].nome}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 13, color: T2 }}>Onde fica o texto</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['alto', 'baixo'] as const).map((p) => (
              <button key={p} type="button" disabled={!podeEditar} onClick={() => muda('posicao', p)} aria-pressed={c.posicao === p}
                style={{ ...bt(c.posicao === p ? AZUL : T2, c.posicao === p), minHeight: 36 }}>{ic(p === 'alto' ? 'fa-arrow-up' : 'fa-arrow-down')} {p === 'alto' ? 'Em cima' : 'Embaixo'}</button>
            ))}
          </div>
        </div>

        {msg && <span style={{ fontSize: 13, color: /não|erro|Rode/i.test(msg) ? '#dc2626' : VERDE }}>{msg}</span>}

        {podeEditar && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" style={bt(VERDE, true)} disabled={!mudou || !!ocupado} onClick={() => enviar({}, 'salvar')}>{ic('fa-check')} {ocupado === 'salvar' ? 'Guardando…' : 'Guardar arte'}</button>
            <button type="button" style={bt(T2)} disabled={!mudou || !!ocupado} onClick={() => { setC(arte); setMsg(''); }}>{ic('fa-rotate-left')} Desfazer</button>
          </div>
        )}

        {podeEditar && (
          <details style={{ borderTop: `1px solid ${BORDA}`, paddingTop: 10 }}>
            <summary style={{ cursor: 'pointer', fontSize: 14, color: T1 }}>{ic('fa-wand-magic-sparkles')} Trocar a imagem de fundo (nova cena)</summary>
            <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
              <span style={{ fontSize: 13, color: T2 }}>A IA monta outro cenário com o mesmo trator. Leva uns 30 segundos e custa alguns centavos. Pode deixar em branco para repetir a ideia, ou descrever o que quer.</span>
              <textarea style={{ ...campoNP, minHeight: 56 }} value={pedido} maxLength={600} placeholder="Ex.: trator no cafezal ao amanhecer, com neblina" onChange={(e) => setPedido(e.target.value)} />
              <button type="button" style={bt('#7c3aed')} disabled={!!ocupado} onClick={() => enviar({ novaCena: true, pedido }, 'cena')}>{ic('fa-wand-magic-sparkles')} {ocupado === 'cena' ? 'Montando…' : 'Gerar nova cena'}</button>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
