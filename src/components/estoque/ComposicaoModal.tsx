'use client';
// Popup de composição: lista os itens que somam o valor de uma célula
// (estoque atual, NF entrada do mês ou NF saída do mês). Consome
// /api/estoque/cruzamento-familia/composicao.

import { useEffect, useState } from 'react';

export interface ComposicaoParams {
  fonte: 'estoque' | 'entrada' | 'saida';
  mes?: number;
  ano?: number;
  grupo?: 'peca' | 'maquina';
  categoria?: string;
  familia?: string;
  tipocarac?: string;
  tipocaracExceto?: string[];  // "Outras" = Tipos que NÃO estão nesta lista
  incluirSemTipo?: boolean;
}

interface ComposicaoItem {
  codigo: string; descricao: string; familia: string; categoria?: string;
  ref?: string; qtd: number; valor: number;
}
interface ComposicaoResp {
  itens: ComposicaoItem[]; total: number; somaValor: number; fonte: string; aviso?: string; erro?: string;
}

const fmtRS0 = (v: number) => 'R$ ' + Math.round(v).toLocaleString('pt-BR');
const fmtQtd = (n: number) => (Math.abs(n % 1) < 1e-9 ? n.toLocaleString('pt-BR') : n.toLocaleString('pt-BR', { maximumFractionDigits: 2 }));

export default function ComposicaoModal({ titulo, params, contaParam, onClose }: {
  titulo: string; params: ComposicaoParams; contaParam: string; onClose: () => void;
}) {
  const [dados, setDados] = useState<ComposicaoResp | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCarregando(true);
      setErro('');
      try {
        const qs = new URLSearchParams();
        qs.set('fonte', params.fonte);
        if (params.mes) qs.set('mes', String(params.mes));
        if (params.ano) qs.set('ano', String(params.ano));
        if (params.grupo) qs.set('grupo', params.grupo);
        if (params.categoria) qs.set('categoria', params.categoria);
        if (params.familia) qs.set('familia', params.familia);
        if (params.tipocarac) qs.set('tipocarac', params.tipocarac);
        if (params.tipocaracExceto) { qs.set('tipocarac_exceto', JSON.stringify(params.tipocaracExceto)); qs.set('semtipo', params.incluirSemTipo ? '1' : '0'); }
        const r = await fetch(`/api/estoque/cruzamento-familia/composicao?${qs.toString()}${contaParam}`);
        const d = (await r.json()) as ComposicaoResp;
        if (!vivo) return;
        if (d.erro) { setErro(d.erro); setDados(null); return; }
        setDados(d);
      } catch (ex) {
        if (vivo) setErro('Erro: ' + (ex as Error).message);
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [params, contaParam]);

  const refLabel = params.fonte === 'entrada' ? 'NF' : params.fonte === 'saida' ? 'Pedido' : '';

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: 'min(860px, 100%)', maxHeight: '86vh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px 20px', borderBottom: '1px solid #eee' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#333' }}>{titulo}</h3>
            {dados && <div style={{ fontSize: '.78rem', color: '#888', marginTop: 4 }}>{dados.total} item(ns) · total {fmtRS0(dados.somaValor)}</div>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.4rem', lineHeight: 1, cursor: 'pointer', color: '#999' }}>×</button>
        </div>

        <div style={{ overflow: 'auto', padding: '12px 20px 20px' }}>
          {carregando && <div style={{ color: '#888', fontSize: '.85rem', padding: '20px 0' }}>Carregando…</div>}
          {erro && <div style={{ color: '#dc2626', fontSize: '.85rem' }}>{erro}</div>}
          {dados && !carregando && (
            <>
              {dados.aviso && <div style={{ color: '#d97706', fontSize: '.74rem', marginBottom: 10 }}>⚠ {dados.aviso}</div>}
              {dados.itens.length === 0 ? (
                <div style={{ color: '#888', fontSize: '.85rem' }}>Nenhum item compõe este valor.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {refLabel && <th style={thS}>{refLabel}</th>}
                      <th style={thS}>Código</th>
                      <th style={thS}>Descrição</th>
                      <th style={thS}>Família</th>
                      <th style={thS}>Categoria</th>
                      <th style={{ ...thS, textAlign: 'right' }}>Qtd</th>
                      <th style={{ ...thS, textAlign: 'right' }}>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.itens.map((it, i) => (
                      <tr key={i}>
                        {refLabel && <td style={tdS}>{it.ref || '—'}</td>}
                        <td style={tdS}>{it.codigo}</td>
                        <td style={tdS}>{it.descricao || '—'}</td>
                        <td style={tdS}>{it.familia}</td>
                        <td style={tdS}>{it.categoria || '—'}</td>
                        <td style={{ ...tdS, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtQtd(it.qtd)}</td>
                        <td style={{ ...tdS, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>{fmtRS0(it.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const thS: React.CSSProperties = { background: '#fafafa', color: '#888', fontSize: '.6rem', textTransform: 'uppercase', letterSpacing: '.5px', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #eee', fontWeight: 600, whiteSpace: 'nowrap', position: 'sticky', top: 0 };
const tdS: React.CSSProperties = { padding: '7px 10px', borderBottom: '1px solid #f5f5f5', color: '#444', fontSize: '.8rem' };
