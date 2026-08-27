'use client';
// Popup de composição de uma célula da aba Reconciliação (razão de estoque):
// lista os movimentos que somam aquele valor, agregados por produto.
// Consome /api/estoque/cruzamento-familia/reconciliacao/detalhe.
import { useEffect, useState } from 'react';

export interface DetalheParams { grupo: 'peca' | 'maquina'; ano: number; mes: number; bucket: string }
interface DetalheItem { codigo_produto: number; sku: string; descricao: string; movimentos: number; qtde: number; efeito: number }
interface DetalheResp { itens: DetalheItem[]; total: number; somaEfeito: number; bucket: string; erro?: string }

const fmtSig = (v: number) => (v >= 0 ? '+' : '−') + 'R$ ' + Math.abs(Math.round(v)).toLocaleString('pt-BR');
const fmtQtd = (n: number) => (Math.abs(n % 1) < 1e-9 ? n.toLocaleString('pt-BR') : n.toLocaleString('pt-BR', { maximumFractionDigits: 2 }));

export default function RazaoDetalheModal({ titulo, params, contaParam, onClose }: {
  titulo: string; params: DetalheParams; contaParam: string; onClose: () => void;
}) {
  const [dados, setDados] = useState<DetalheResp | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCarregando(true); setErro('');
      try {
        const qs = new URLSearchParams();
        qs.set('grupo', params.grupo); qs.set('ano', String(params.ano)); qs.set('mes', String(params.mes));
        if (params.bucket) qs.set('bucket', params.bucket);
        const r = await fetch(`/api/estoque/cruzamento-familia/reconciliacao/detalhe?${qs.toString()}${contaParam}`);
        const d = (await r.json()) as DetalheResp;
        if (!vivo) return;
        if (d.erro) { setErro(d.erro); setDados(null); return; }
        setDados(d);
      } catch (ex) { if (vivo) setErro('Erro: ' + (ex as Error).message); }
      finally { if (vivo) setCarregando(false); }
    })();
    return () => { vivo = false; };
  }, [params, contaParam]);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: 'min(880px, 100%)', maxHeight: '86vh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px 20px', borderBottom: '1px solid #eee' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#333' }}>{titulo}</h3>
            {dados && <div style={{ fontSize: '.78rem', color: '#888', marginTop: 4 }}>{dados.total} produto(s) · total {fmtSig(dados.somaEfeito)}</div>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.4rem', lineHeight: 1, cursor: 'pointer', color: '#999' }}>×</button>
        </div>
        <div style={{ overflow: 'auto', padding: '12px 20px 20px' }}>
          {carregando && <div style={{ color: '#888', fontSize: '.85rem', padding: '20px 0' }}>Carregando…</div>}
          {erro && <div style={{ color: '#dc2626', fontSize: '.85rem' }}>{erro}</div>}
          {dados && !carregando && (
            dados.itens.length === 0 ? (
              <div style={{ color: '#888', fontSize: '.85rem' }}>Nenhum movimento compõe este valor.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={thS}>Código</th>
                  <th style={thS}>Descrição</th>
                  <th style={{ ...thS, textAlign: 'right' }}>Movs</th>
                  <th style={{ ...thS, textAlign: 'right' }}>Qtd</th>
                  <th style={{ ...thS, textAlign: 'right' }}>Efeito (R$)</th>
                </tr></thead>
                <tbody>
                  {dados.itens.map((it, i) => (
                    <tr key={i}>
                      <td style={tdS}>{it.sku || it.codigo_produto}</td>
                      <td style={tdS}>{it.descricao || '—'}</td>
                      <td style={{ ...tdS, textAlign: 'right' }}>{it.movimentos}</td>
                      <td style={{ ...tdS, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtQtd(it.qtde)}</td>
                      <td style={{ ...tdS, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600, color: it.efeito >= 0 ? '#16a34a' : '#dc2626' }}>{fmtSig(it.efeito)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
        </div>
      </div>
    </div>
  );
}

const thS: React.CSSProperties = { background: '#fafafa', color: '#888', fontSize: '.6rem', textTransform: 'uppercase', letterSpacing: '.5px', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #eee', fontWeight: 600, whiteSpace: 'nowrap', position: 'sticky', top: 0 };
const tdS: React.CSSProperties = { padding: '7px 10px', borderBottom: '1px solid #f5f5f5', color: '#444', fontSize: '.8rem' };
