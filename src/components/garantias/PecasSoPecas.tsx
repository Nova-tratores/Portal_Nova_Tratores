'use client';
// Garantia SÓ DE PEÇAS (sem OS): busca de peça no cadastro OU digitada à mão
// (tinta, peça de terceiro…), o formulário de criação e o editor de peças da
// janela da garantia.
import { fetchAuth } from '@/lib/auth/client';
import { useEffect, useRef, useState } from 'react';
import { Search, Loader2, Plus, Trash2, Package } from 'lucide-react';
import { numeroBR, totalPecas, type PecaSoPecas } from '@/lib/garantias/so-pecas';

const fmtMoeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const inputGar: React.CSSProperties = {
  width: '100%', minHeight: 40, padding: '9px 12px', borderRadius: 9,
  border: '1px solid var(--portal-border)',
  background: 'var(--portal-bg-input)', color: 'var(--portal-text)',
  fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

interface ProdutoBusca { codigo: string; descricao: string; preco: number }

/** Busca no cadastro + "incluir à mão". Chama onAdd com a peça pronta. */
export function BuscaPecaGarantia({ onAdd, desabilitado }: { onAdd: (p: PecaSoPecas) => void | Promise<void>; desabilitado?: boolean }) {
  const [termo, setTermo] = useState('');
  const [lista, setLista] = useState<ProdutoBusca[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [escolhida, setEscolhida] = useState<{ cod: string; desc: string } | null>(null);
  const [qtd, setQtd] = useState('1');
  const [preco, setPreco] = useState('');
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (t.current) clearTimeout(t.current);
    if (escolhida || termo.trim().length < 2) { setLista([]); return; }
    t.current = setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await fetchAuth(`/api/ppv/produtos?termo=${encodeURIComponent(termo.trim())}`);
        const d = await r.json();
        setLista(Array.isArray(d) ? d.slice(0, 15) : []);
      } catch { setLista([]); } finally { setBuscando(false); }
    }, 350);
    return () => { if (t.current) clearTimeout(t.current); };
  }, [termo, escolhida]);

  const escolher = (p: ProdutoBusca) => {
    setEscolhida({ cod: p.codigo, desc: p.descricao });
    setPreco(p.preco ? String(p.preco).replace('.', ',') : '');
    setLista([]);
  };
  const aMao = () => { setEscolhida({ cod: '', desc: termo.trim() }); setPreco(''); setLista([]); };
  const limpar = () => { setEscolhida(null); setTermo(''); setQtd('1'); setPreco(''); };

  const incluir = async () => {
    if (!escolhida || !(escolhida.desc.trim() || escolhida.cod.trim())) return;
    await onAdd({
      cod_produto: escolhida.cod.trim() || null,
      descricao: escolhida.desc.trim() || escolhida.cod.trim(),
      quantidade: numeroBR(qtd) > 0 ? numeroBR(qtd) : 1,
      preco_unitario: numeroBR(preco),
    });
    limpar();
  };

  if (escolhida) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 10, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-secondary)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,2fr)', gap: 8 }}>
          <input style={inputGar} placeholder="Código (opcional)" value={escolhida.cod} onChange={(e) => setEscolhida({ ...escolhida, cod: e.target.value })} />
          <input style={inputGar} placeholder="Descrição da peça" value={escolhida.desc} onChange={(e) => setEscolhida({ ...escolhida, desc: e.target.value })} autoFocus />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ flex: '1 1 90px', fontSize: 11, color: 'var(--portal-text-muted)' }}>Quantidade
            <input style={inputGar} inputMode="decimal" value={qtd} onChange={(e) => setQtd(e.target.value)} />
          </label>
          <label style={{ flex: '1 1 120px', fontSize: 11, color: 'var(--portal-text-muted)' }}>Valor unitário (R$)
            <input style={inputGar} inputMode="decimal" placeholder="0,00" value={preco} onChange={(e) => setPreco(e.target.value)} />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={limpar} style={{ minHeight: 40, padding: '0 14px', borderRadius: 9, border: '1px solid var(--portal-border)', background: 'transparent', color: 'var(--portal-text-secondary)', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
          <button type="button" onClick={incluir} disabled={desabilitado || !(escolhida.desc.trim() || escolhida.cod.trim())}
            style={{ minHeight: 40, padding: '0 14px', borderRadius: 9, border: 'none', background: '#dc2626', color: '#fefefe', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} /> Incluir peça
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ position: 'relative' }}>
        <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--portal-text-muted)' }} />
        <input style={{ ...inputGar, paddingLeft: 36 }} value={termo} onChange={(e) => setTermo(e.target.value)} disabled={desabilitado}
          placeholder="Buscar peça no cadastro (código ou descrição)…" />
      </div>
      {buscando && <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}><Loader2 size={12} className="spin" /> Buscando…</div>}
      {lista.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--portal-border)', borderRadius: 10, maxHeight: 220, overflowY: 'auto' }}>
          {lista.map((p, i) => (
            <button key={`${p.codigo}-${i}`} type="button" onClick={() => escolher(p)}
              style={{ textAlign: 'left', minHeight: 40, padding: '8px 10px', border: 'none', borderBottom: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text)', fontSize: 12, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span><strong>{p.codigo}</strong> · {p.descricao}</span>
              <span style={{ color: 'var(--portal-text-muted)', whiteSpace: 'nowrap' }}>{p.preco ? fmtMoeda(p.preco) : ''}</span>
            </button>
          ))}
        </div>
      )}
      <button type="button" onClick={aMao} disabled={desabilitado}
        style={{ alignSelf: 'flex-start', minHeight: 40, padding: '0 12px', borderRadius: 9, border: '1px dashed var(--portal-border)', background: 'transparent', color: 'var(--portal-text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Plus size={13} /> {termo.trim() ? `Incluir "${termo.trim().slice(0, 40)}" à mão` : 'Peça fora do cadastro (tinta, terceiro…) — digitar à mão'}
      </button>
    </div>
  );
}

/** Lista das peças com total e botão de remover. */
export function ListaPecasSoPecas({ pecas, onRemover, ocupado }: {
  pecas: (PecaSoPecas & { id?: string })[];
  onRemover?: (indice: number) => void;
  ocupado?: boolean;
}) {
  if (pecas.length === 0) {
    return <span style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>Nenhuma peça ainda.</span>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {pecas.map((p, i) => (
        <div key={p.id || i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--portal-text)', padding: '4px 0', borderBottom: '1px solid var(--portal-border)' }}>
          <Package size={13} style={{ color: 'var(--portal-text-muted)', flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{p.cod_produto ? `${p.cod_produto} · ` : ''}{p.descricao}</span>
          <span style={{ color: 'var(--portal-text-muted)', whiteSpace: 'nowrap' }}>x{p.quantidade}{p.preco_unitario ? ` · ${fmtMoeda(p.preco_unitario)}` : ''}</span>
          {onRemover && (
            <button type="button" onClick={() => onRemover(i)} disabled={ocupado} title="Tirar esta peça"
              style={{ width: 40, height: 40, border: 'none', background: 'transparent', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ))}
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text)', textAlign: 'right', paddingTop: 4 }}>
        Total: {fmtMoeda(totalPecas(pecas))}
      </div>
    </div>
  );
}

/** Editor da janela da garantia (grava na hora). */
export function EditorPecasGarantia({ garantiaId, pecas, editavel, onChange }: {
  garantiaId: string;
  pecas: (PecaSoPecas & { id: string })[];
  editavel: boolean;
  onChange: () => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');

  const incluir = async (p: PecaSoPecas) => {
    setOcupado(true); setErro('');
    try {
      const r = await fetchAuth(`/api/garantias/${garantiaId}/pecas-manual`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setErro(d.error || 'Falha ao incluir a peça.'); else onChange();
    } catch { setErro('Erro de conexão.'); } finally { setOcupado(false); }
  };
  const remover = async (i: number) => {
    const p = pecas[i];
    if (!p || !confirm(`Tirar "${p.descricao}" da garantia?`)) return;
    setOcupado(true); setErro('');
    try {
      const r = await fetchAuth(`/api/garantias/${garantiaId}/pecas-manual?peca=${encodeURIComponent(p.id)}`, { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setErro(d.error || 'Falha ao remover a peça.'); else onChange();
    } catch { setErro('Erro de conexão.'); } finally { setOcupado(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <ListaPecasSoPecas pecas={pecas} onRemover={editavel ? remover : undefined} ocupado={ocupado} />
      {editavel && <BuscaPecaGarantia onAdd={incluir} desabilitado={ocupado} />}
      {erro && <span style={{ fontSize: 12, color: '#dc2626' }}>{erro}</span>}
    </div>
  );
}

/** Formulário de criação (dentro do modal "Nova garantia"). */
export function FormGarantiaSoPecas({ onCriada, onCancelar }: { onCriada: (id: string) => void; onCancelar: () => void }) {
  const [motivo, setMotivo] = useState('');
  const [cliente, setCliente] = useState('');
  const [chassis, setChassis] = useState('');
  const [modelo, setModelo] = useState('');
  const [pecas, setPecas] = useState<PecaSoPecas[]>([]);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState('');

  const criar = async () => {
    setCriando(true); setErro('');
    try {
      const r = await fetchAuth('/api/garantias/so-pecas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo, cliente, chassis, modelo, pecas }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(d.error || 'Falha ao criar a garantia.'); return; }
      onCriada(d.garantia.id);
    } catch { setErro('Erro de conexão.'); } finally { setCriando(false); }
  };

  const rotulo: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--portal-text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', background: 'var(--portal-bg-secondary)', padding: '8px 10px', borderRadius: 8 }}>
        Para quando a fábrica só vai <strong>repor peças</strong>: peça do estoque com defeito, tinta, peça de terceiro…
        Não abre ordem de serviço e não tem horas nem km. Depois é igual às outras: escolha a montadora, envie à fábrica e aprove as peças repostas.
      </div>

      <label style={rotulo}>O que aconteceu? *
        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3}
          placeholder="Ex.: tinta veio com a cor errada; rolamento do estoque chegou travado…"
          style={{ ...inputGar, resize: 'vertical', fontFamily: 'inherit' }} />
      </label>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label style={{ ...rotulo, flex: '1 1 200px' }}>Cliente (opcional)
          <input style={inputGar} value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Deixe vazio se for do estoque" />
        </label>
        <label style={{ ...rotulo, flex: '1 1 140px' }}>Chassi (opcional)
          <input style={inputGar} value={chassis} onChange={(e) => setChassis(e.target.value)} />
        </label>
        <label style={{ ...rotulo, flex: '1 1 140px' }}>Modelo (opcional)
          <input style={inputGar} value={modelo} onChange={(e) => setModelo(e.target.value)} />
        </label>
      </div>

      <div style={rotulo}>Peças *
        <ListaPecasSoPecas pecas={pecas} onRemover={(i) => setPecas((l) => l.filter((_, j) => j !== i))} />
        <BuscaPecaGarantia onAdd={(p) => setPecas((l) => [...l, p])} />
      </div>

      {erro && <div style={{ padding: 10, borderRadius: 8, background: '#fef2f2', color: '#b91c1c', fontSize: 12 }}>{erro}</div>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={onCancelar} disabled={criando}
          style={{ minHeight: 40, padding: '0 14px', borderRadius: 9, border: '1px solid var(--portal-border)', background: 'transparent', color: 'var(--portal-text-secondary)', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
        <button type="button" onClick={criar} disabled={criando || !motivo.trim() || pecas.length === 0}
          style={{ minHeight: 40, padding: '0 16px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#dc2626,#7f1d1d)', color: '#fefefe', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: criando || !motivo.trim() || pecas.length === 0 ? 0.55 : 1 }}>
          {criando ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Criar garantia só de peças
        </button>
      </div>
    </div>
  );
}
