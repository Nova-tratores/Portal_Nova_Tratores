'use client';
// Janela do produto de uma nota de entrada: estoque + CMC e o PREÇO DE VENDA, que
// pode ser trocado (grava na Omie). Veio da antiga /estoque/recebimentos-omie.
import { useEffect, useState } from 'react';
import { fetchAuth } from '@/lib/auth/client';
import { fmtRS } from '@/components/estoque/ui';

interface ProdDetalhe { produto: { codigo_produto: number; codigo: string; descricao: string; familia: string; marca: string; valor_venda: number }; estoque: Record<string, unknown> }

const RED = '#dc2626';

export default function ProdutoPrecoModal({ idProd, contaUp, onClose, onMsg }: {
  idProd: string; contaUp: string; onClose: () => void; onMsg: (t: string, k?: 'ok' | 'err') => void;
}) {
  const [det, setDet] = useState<ProdDetalhe | null>(null);
  const [erro, setErro] = useState('');
  const [preco, setPreco] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    fetchAuth(`/api/estoque/recebimentos/produto?id=${encodeURIComponent(idProd)}${contaUp ? `&conta=${encodeURIComponent(contaUp)}` : ''}`)
      .then((r) => r.json())
      .then((d: ProdDetalhe & { erro?: string }) => {
        if (d.erro) { setErro(d.erro); return; }
        setDet(d);
        setPreco(String(d.produto.valor_venda || 0));
      })
      .catch((e) => setErro((e as Error).message));
  }, [idProd, contaUp]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const salvar = async () => {
    const val = parseFloat(preco.replace(',', '.'));
    if (isNaN(val) || val < 0) return onMsg('Preço inválido', 'err');
    if (!confirm(`Atualizar o preço de venda na Omie para R$ ${val.toFixed(2).replace('.', ',')}?`)) return;
    setSalvando(true);
    try {
      const r = await fetchAuth(`/api/estoque/recebimentos/produto/preco-venda${contaUp ? `?conta=${encodeURIComponent(contaUp)}` : ''}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo_produto: det?.produto.codigo_produto || idProd, valor_venda: val }),
      });
      const d = await r.json();
      if (d.erro) { onMsg(d.erro, 'err'); return; }
      onMsg('Preço de venda atualizado na Omie.');
      onClose();
    } catch (e) {
      onMsg('Erro: ' + (e as Error).message, 'err');
    } finally {
      setSalvando(false);
    }
  };

  const e = (det?.estoque || {}) as Record<string, unknown>;
  const lbl: React.CSSProperties = { display: 'block', fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.5px', color: '#888', fontWeight: 600, marginBottom: 6, marginTop: 4 };
  return (
    <div onClick={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 120, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div className="est-modal" style={{ background: '#fff', borderRadius: 14, padding: 24, maxWidth: 520, width: '95%', maxHeight: '85vh', overflowY: 'auto', position: 'relative', boxShadow: '0 8px 30px rgba(0,0,0,.12)' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 16, cursor: 'pointer', fontSize: '1.3rem', color: '#bbb', background: 'none', border: 'none' }}>×</button>
        {erro && <div style={{ color: '#b91c1c', padding: 12 }}>{erro}</div>}
        {!det && !erro && <div style={{ color: '#94a3b8', padding: 12 }}>Carregando o produto na Omie…</div>}
        {det && (
          <>
            <h3 style={{ color: RED, marginBottom: 14, fontSize: '1.05rem', fontWeight: 700 }}>{det.produto.codigo} — {det.produto.descricao}</h3>
            <div style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 10, padding: 12, marginBottom: 16, fontSize: '.82rem', lineHeight: 1.6 }}>
              Família: {det.produto.familia || '-'}<br />Marca: {det.produto.marca || '-'}<br />
              Saldo: {String(e.saldo ?? '-')} · Físico: {String(e.fisico ?? '-')} · Reservado: {String(e.reservado ?? '-')}<br />
              CMC: {fmtRS(e.cmc as number)}
            </div>
            <label style={lbl}>Preço de venda (atualiza na Omie)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <input type="number" step="0.01" min="0" value={preco} onChange={(ev) => setPreco(ev.target.value)}
                style={{ flex: 1, padding: '10px 14px', border: '1px solid #e0e0e0', borderRadius: 10, fontSize: 14 }} />
              <button onClick={salvar} disabled={salvando}
                style={{ padding: '11px 18px', border: 'none', borderRadius: 8, cursor: salvando ? 'wait' : 'pointer', fontSize: '.8rem', fontWeight: 600, background: '#16a34a', color: '#fff' }}>
                {salvando ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
