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

export default function ComposicaoModal({ titulo, params, contaParam, onClose, resumo }: {
  titulo: string; params: ComposicaoParams; contaParam: string; onClose: () => void;
  // Modo "resumo": só o valor agregado (sem item-a-item). Usado no Estoque por Tipo
  // de meses PASSADOS — a composição item-a-item não é reconstruível do snapshot.
  resumo?: { valor: number };
}) {
  const [dados, setDados] = useState<ComposicaoResp | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  // Só faz sentido no drill de UM Tipo do estoque atual: mostra também os produtos
  // que ACABARAM (estoque zerado) — ajuda a ver o que saiu de linha.
  const [zerados, setZerados] = useState(false);
  const podeZerados = !resumo && params.fonte === 'estoque' && !!params.tipocarac;

  useEffect(() => {
    let vivo = true;
    // Meses passados do Estoque por Tipo: mostra só o valor do snapshot, sem fetch.
    if (resumo) {
      setDados({ itens: [], total: 0, somaValor: resumo.valor, fonte: params.fonte, aviso: 'Composição item-a-item indisponível para meses passados — o valor vem do snapshot mensal (só o mês atual tem a lista de produtos).' });
      setCarregando(false);
      setErro('');
      return () => { vivo = false; };
    }
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
        if (zerados) qs.set('zerados', '1');
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
  }, [params, contaParam, resumo, zerados]);

  const refLabel = params.fonte === 'entrada' ? 'NF' : params.fonte === 'saida' ? 'Pedido' : '';

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: 'min(860px, 100%)', maxHeight: '86vh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px 20px', borderBottom: '1px solid #eee' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#333' }}>{titulo}</h3>
            {dados && <div style={{ fontSize: '.78rem', color: '#888', marginTop: 4 }}>{resumo ? `total ${fmtRS0(dados.somaValor)}` : `${dados.total} item(ns) · total ${fmtRS0(dados.somaValor)}`}</div>}
            {podeZerados && (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '.74rem', color: '#555', cursor: 'pointer', marginTop: 6 }} title="Inclui produtos com estoque zerado — os que acabaram. Somam R$0 (não mudam o total).">
                <input type="checkbox" checked={zerados} onChange={(e) => setZerados(e.target.checked)} />
                Mostrar produtos zerados (os que acabaram)
              </label>
            )}
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
                resumo ? (
                  <div style={{ padding: '10px 0 4px' }}>
                    <div style={{ fontSize: '.72rem', color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Saldo do snapshot deste mês</div>
                    <div style={{ fontSize: '1.7rem', fontWeight: 800, color: dados.somaValor < 0 ? '#dc2626' : '#333' }}>{fmtRS0(dados.somaValor)}</div>
                    <div style={{ color: '#888', fontSize: '.78rem', marginTop: 6 }}>A lista item-a-item só existe para o mês atual (ao vivo). Nos meses passados guardamos apenas este total por Tipo.</div>
                  </div>
                ) : (
                  <div style={{ color: '#888', fontSize: '.85rem' }}>Nenhum item compõe este valor.</div>
                )
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
                    {dados.itens.map((it, i) => {
                      const zerado = it.qtd === 0;
                      return (
                      <tr key={i} style={zerado ? { color: '#b91c1c', background: '#fef2f2' } : undefined} title={zerado ? 'Estoque zerado (acabou)' : undefined}>
                        {refLabel && <td style={tdS}>{it.ref || '—'}</td>}
                        <td style={tdS}>{it.codigo}</td>
                        <td style={tdS}>{it.descricao || '—'}{zerado && ' · acabou'}</td>
                        <td style={tdS}>{it.familia}</td>
                        <td style={tdS}>{it.categoria || '—'}</td>
                        <td style={{ ...tdS, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtQtd(it.qtd)}</td>
                        <td style={{ ...tdS, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>{fmtRS0(it.valor)}</td>
                      </tr>
                      );
                    })}
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
