'use client';

// Popup "o que compõe esta barra" do gráfico de 12 meses do Dashboard de Vendas.
// Cada série tem a sua fonte:
//   - Peças Oficina/Balcão (venda ou custo) e Máquinas → /vendas do mês, agrupado por pedido;
//   - Serviços (venda) → /os do mês: OS com NFS-e (as internas aparecem à parte, fora da soma);
//   - Custo Serviços → /custo-servicos (Painel Omie): componentes + despesas + OS internas.
//     Custo fixo (RH) e comissão saem só como total — o detalhe exporia salário.
import { Fragment, useEffect, useMemo, useState } from 'react';

export type SerieBarra =
  | 'pecasOficina' | 'pecasBalcao' | 'servicos'
  | 'custoPecasOficina' | 'custoPecasBalcao' | 'custoServicos'
  | 'maquinas';

const CAT_BALCAO = '1.01.03';

const TITULO: Record<SerieBarra, string> = {
  pecasOficina: 'Peças Oficina — venda',
  pecasBalcao: 'Peças Balcão — venda',
  servicos: 'Serviços — venda (com NFS-e)',
  custoPecasOficina: 'Peças Oficina — custo (CMC)',
  custoPecasBalcao: 'Peças Balcão — custo (CMC)',
  custoServicos: 'Serviços — custo (Painel Omie)',
  maquinas: 'Máquinas — faturamento',
};

interface ItemVenda {
  numero_pedido?: string | null; data_pedido?: string | null; descricao?: string | null; codigo_produto?: string | null;
  quantidade?: number | string | null; valor_unitario?: number | string | null; valor_total?: number | string | null;
  codigo_categoria?: string | null; cmc_unitario?: number | string | null; nome_cliente?: string | null; familia?: string | null;
}
interface OSLinha { numero_os?: string; data?: string; cliente?: string; valor?: number; tem_nota?: boolean | null; nfse_num?: string | null; conta?: string }
interface ServLinha { numero_os?: string; descricao?: string; tipo?: string; qtde?: number; valor_total?: number }
interface DetalheCusto {
  componentes: { comissao: number; despesaGeral: number; despesaVeic: number; custoFixo: number; custoRealInterno: number; total: number };
  despesas: Array<{ data: string; descricao: string; valor: number; veiculo: string | null; tecnico: string | null; tipo: 'geral' | 'veiculo' }>;
  internas: Array<{ numero: string; cliente: string; data: string; tipo: string; custo: number }>;
}

const num = (v: unknown) => parseFloat(String(v ?? 0)) || 0;
const rs = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (s?: string | null) => {
  const t = String(s || '').split(/[ T]/)[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) { const [a, m, d] = t.split('-'); return `${d}/${m}/${a}`; }
  return t || '—';
};

// Texto vindo do Omie às vezes chega com entidades HTML ("d&apos;água").
const limpar = (s?: string | null) => String(s ?? '').replace(/&apos;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const semZeros = (s?: string | null) => (s ? String(s).replace(/^0+(?=\d)/, '') : '—');

const th: React.CSSProperties = { textAlign: 'left', padding: '7px 9px', fontSize: '.78rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.4px', borderBottom: '1px solid #e5e7eb', background: '#fafafa', position: 'sticky', top: 0, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '6px 9px', borderBottom: '1px solid #f3f4f6', fontSize: '.88rem', color: '#374151', verticalAlign: 'top' };
const tdN: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };

export default function ComposicaoBarra({ serie, mes, ano, rotuloMes, valorBarra, contaParam, buscar, onAbrirMes, onFechar }: {
  serie: SerieBarra; mes: number; ano: number; rotuloMes: string;
  /** Valor que a barra mostra — comparado com a soma da lista. null = desconhecido. */
  valorBarra: number | null;
  contaParam: string;
  buscar: (url: string) => Promise<Response>;
  onAbrirMes?: () => void;
  onFechar: () => void;
}) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [itens, setItens] = useState<ItemVenda[] | null>(null);
  const [os, setOs] = useState<OSLinha[] | null>(null);
  const [servs, setServs] = useState<ServLinha[]>([]);
  const [custo, setCusto] = useState<DetalheCusto | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);

  const ehPecas = serie === 'pecasOficina' || serie === 'pecasBalcao' || serie === 'custoPecasOficina' || serie === 'custoPecasBalcao';
  const ehCusto = serie.startsWith('custo');
  const balcao = serie === 'pecasBalcao' || serie === 'custoPecasBalcao';

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        let url: string;
        if (ehPecas) url = `/api/estoque/dashboard/vendas?mes=${mes}&ano=${ano}&catKey=totalPecas${contaParam}`;
        else if (serie === 'maquinas') url = `/api/estoque/dashboard/vendas?mes=${mes}&ano=${ano}&familiaMaquina=__TODAS__${contaParam}`;
        else if (serie === 'servicos') url = `/api/estoque/dashboard/os?mes=${mes}&ano=${ano}${contaParam}`;
        else url = `/api/estoque/dashboard/custo-servicos?mes=${mes}&ano=${ano}${contaParam}`;
        const r = await buscar(url);
        const d = await r.json();
        if (!vivo) return;
        if (!r.ok || d.erro) { setErro(d.erro || `Erro ${r.status}`); return; }
        if (ehPecas || serie === 'maquinas') setItens(d.vendas || []);
        else if (serie === 'servicos') { setOs(d.os || []); setServs(d.servicos || []); }
        else setCusto(d as DetalheCusto);
      } catch (e) {
        if (vivo) setErro((e as Error).message);
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [serie, mes, ano, contaParam, buscar, ehPecas]);

  // Fechar com Esc.
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onFechar]);

  // Pedidos (peças/máquinas): itens da fatia, agrupados por pedido.
  const pedidos = useMemo(() => {
    if (!itens) return null;
    const fatia = ehPecas ? itens.filter((i) => (String(i.codigo_categoria ?? '') === CAT_BALCAO) === balcao) : itens;
    const m = new Map<string, { numero: string; data: string; cliente: string; venda: number; custo: number; itens: ItemVenda[] }>();
    for (const i of fatia) {
      const k = String(i.numero_pedido || '—');
      const p = m.get(k) || { numero: k, data: String(i.data_pedido || ''), cliente: String(i.nome_cliente || ''), venda: 0, custo: 0, itens: [] };
      p.venda += num(i.valor_total);
      const cmc = num(i.cmc_unitario), q = num(i.quantidade);
      p.custo += cmc > 0 && q > 0 ? cmc * q : 0;
      p.itens.push(i);
      m.set(k, p);
    }
    return [...m.values()].sort((a, b) => (ehCusto ? b.custo - a.custo : b.venda - a.venda));
  }, [itens, ehPecas, balcao, ehCusto]);

  const osNota = useMemo(() => (os || []).filter((o) => o.tem_nota === true).sort((a, b) => num(b.valor) - num(a.valor)), [os]);
  const osInternas = useMemo(() => (os || []).filter((o) => o.tem_nota !== true), [os]);

  const somaLista = pedidos
    ? pedidos.reduce((s, p) => s + (ehCusto ? p.custo : p.venda), 0)
    : os ? osNota.reduce((s, o) => s + num(o.valor), 0)
    : custo ? custo.componentes.total : null;
  const diverge = valorBarra != null && somaLista != null && Math.abs(valorBarra - somaLista) > Math.max(1, Math.abs(valorBarra) * 0.005);

  const alternar = (k: string) => setAberto((a) => (a === k ? null : k));

  return (
    <div onClick={onFechar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70, padding: 16 }}>
      <div className="est-modal" onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 12, width: 'min(1080px, 100%)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', color: '#111827' }}>
        <div style={{ padding: '16px 20px 10px', borderBottom: '1px solid #eee', display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: '.8rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 700 }}>{rotuloMes}</div>
            <h2 style={{ margin: '2px 0 0', fontSize: '1.15rem' }}>{TITULO[serie]}</h2>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: ehCusto ? '#b91c1c' : '#111827' }}>
              {valorBarra != null ? rs(valorBarra) : somaLista != null ? rs(somaLista) : '—'}
            </div>
            {diverge && somaLista != null && (
              <div style={{ fontSize: '.78rem', color: '#b45309' }} title="A barra e a lista usam a mesma fonte, mas a lista exclui clientes marcados para ignorar e itens sem pedido identificado.">
                soma da lista: {rs(somaLista)}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {onAbrirMes && <button onClick={onAbrirMes} style={{ padding: '7px 12px', border: '1px solid #111827', background: '#fff', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: '.85rem' }}>Abrir {rotuloMes} no dashboard</button>}
            <button onClick={onFechar} style={{ padding: '7px 12px', border: '1px solid #e5e7eb', background: '#fff', borderRadius: 8, cursor: 'pointer', fontSize: '.85rem' }}>Fechar</button>
          </div>
        </div>

        <div style={{ overflow: 'auto', padding: '8px 20px 18px' }}>
          {carregando && <div style={{ color: '#6b7280', padding: 20 }}>Carregando…</div>}
          {erro && <div style={{ color: '#b91c1c', padding: 20 }}>{erro}</div>}

          {/* Peças / Máquinas: pedidos */}
          {pedidos && (
            pedidos.length === 0 ? <div style={{ color: '#6b7280', padding: 20 }}>Nenhum pedido neste mês.</div> : (
              <>
                <div style={{ fontSize: '.82rem', color: '#6b7280', margin: '6px 0 8px' }}>
                  {pedidos.length} pedido(s) · clique num pedido para ver os itens{ehCusto ? ' · custo = CMC × quantidade' : ''}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th style={th}>Pedido</th><th style={th}>Data</th><th style={th}>Cliente</th><th style={{ ...th, textAlign: 'right' }}>Itens</th>
                    <th style={{ ...th, textAlign: 'right' }}>Venda</th>{serie !== 'maquinas' && <><th style={{ ...th, textAlign: 'right' }}>Custo</th><th style={{ ...th, textAlign: 'right' }}>Margem</th></>}
                  </tr></thead>
                  <tbody>
                    {pedidos.map((p) => {
                      const mg = p.venda > 0 && p.custo > 0 ? ((p.venda - p.custo) / p.venda) * 100 : null;
                      return (
                        <Fragment key={p.numero}>
                          <tr onClick={() => alternar(p.numero)} style={{ cursor: 'pointer', background: aberto === p.numero ? '#f9fafb' : undefined }}>
                            <td style={{ ...td, fontWeight: 600 }}>{aberto === p.numero ? '▾' : '▸'} {p.numero}</td>
                            <td style={td}>{dataBR(p.data)}</td>
                            <td style={td}>{p.cliente || '—'}</td>
                            <td style={tdN}>{p.itens.length}</td>
                            <td style={{ ...tdN, fontWeight: ehCusto ? 400 : 700 }}>{rs(p.venda)}</td>
                            {serie !== 'maquinas' && <>
                              <td style={{ ...tdN, fontWeight: ehCusto ? 700 : 400, color: ehCusto ? '#b91c1c' : undefined }}>{p.custo > 0 ? rs(p.custo) : '—'}</td>
                              <td style={tdN}>{mg == null ? '—' : mg.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'}</td>
                            </>}
                          </tr>
                          {aberto === p.numero && (
                            <tr><td colSpan={7} style={{ padding: '0 0 8px 24px', background: '#f9fafb' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead><tr><th style={th}>Código</th><th style={th}>Descrição</th><th style={{ ...th, textAlign: 'right' }}>Qtd</th><th style={{ ...th, textAlign: 'right' }}>V. unit.</th><th style={{ ...th, textAlign: 'right' }}>Venda</th><th style={{ ...th, textAlign: 'right' }}>CMC un.</th><th style={{ ...th, textAlign: 'right' }}>Custo</th></tr></thead>
                                <tbody>
                                  {p.itens.map((i, k) => {
                                    const cmc = num(i.cmc_unitario), q = num(i.quantidade);
                                    return (
                                      <tr key={k}>
                                        <td style={td}>{i.codigo_produto || '—'}</td>
                                        <td style={td}>{limpar(i.descricao) || '—'}</td>
                                        <td style={tdN}>{q.toLocaleString('pt-BR')}</td>
                                        <td style={tdN}>{rs(num(i.valor_unitario))}</td>
                                        <td style={tdN}>{rs(num(i.valor_total))}</td>
                                        <td style={tdN}>{cmc > 0 ? rs(cmc) : '—'}</td>
                                        <td style={tdN}>{cmc > 0 && q > 0 ? rs(cmc * q) : '—'}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </td></tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )
          )}

          {/* Serviços: OS com NFS-e */}
          {os && (
            <>
              <div style={{ fontSize: '.82rem', color: '#6b7280', margin: '6px 0 8px' }}>
                {osNota.length} OS com NFS-e · clique numa OS para ver os serviços
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>OS</th><th style={th}>Data</th><th style={th}>Cliente</th><th style={th}>NFS-e</th><th style={{ ...th, textAlign: 'right' }}>Valor</th></tr></thead>
                <tbody>
                  {osNota.map((o, k) => {
                    const chave = `${o.conta || ''}-${o.numero_os}`;
                    const itensOS = servs.filter((s) => s.numero_os === o.numero_os);
                    return (
                      <Fragment key={k}>
                        <tr onClick={() => alternar(chave)} style={{ cursor: 'pointer', background: aberto === chave ? '#f9fafb' : undefined }}>
                          <td style={{ ...td, fontWeight: 600 }}>{aberto === chave ? '▾' : '▸'} {o.numero_os}{o.conta && !contaParam ? ` · ${o.conta}` : ''}</td>
                          <td style={td}>{dataBR(o.data)}</td>
                          <td style={td}>{o.cliente || '—'}</td>
                          <td style={td}>{semZeros(o.nfse_num)}</td>
                          <td style={{ ...tdN, fontWeight: 700 }}>{rs(num(o.valor))}</td>
                        </tr>
                        {aberto === chave && (
                          <tr><td colSpan={5} style={{ padding: '0 0 8px 24px', background: '#f9fafb' }}>
                            {itensOS.length === 0 ? <div style={{ color: '#6b7280', padding: 8, fontSize: '.85rem' }}>Sem itens de serviço registrados.</div> : (
                              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead><tr><th style={th}>Serviço</th><th style={th}>Tipo</th><th style={{ ...th, textAlign: 'right' }}>Qtd</th><th style={{ ...th, textAlign: 'right' }}>Valor</th></tr></thead>
                                <tbody>{itensOS.map((s, j) => (
                                  <tr key={j}><td style={td}>{limpar(s.descricao) || '—'}</td><td style={td}>{s.tipo || '—'}</td><td style={tdN}>{num(s.qtde).toLocaleString('pt-BR')}</td><td style={tdN}>{rs(num(s.valor_total))}</td></tr>
                                ))}</tbody>
                              </table>
                            )}
                          </td></tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              {osInternas.length > 0 && (
                <details style={{ marginTop: 14 }}>
                  <summary style={{ cursor: 'pointer', color: '#6b7280', fontSize: '.88rem' }}>
                    {osInternas.length} OS sem nota (internas) · {rs(osInternas.reduce((s, o) => s + num(o.valor), 0))} — não entram na barra
                  </summary>
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
                    <tbody>{osInternas.map((o, k) => (
                      <tr key={k}><td style={td}>{o.numero_os}</td><td style={td}>{dataBR(o.data)}</td><td style={td}>{o.cliente || '—'}</td><td style={tdN}>{rs(num(o.valor))}</td></tr>
                    ))}</tbody>
                  </table>
                </details>
              )}
            </>
          )}

          {/* Custo de serviços (Painel Omie) */}
          {custo && (() => {
            const c = custo.componentes;
            const listaGeral = custo.despesas.filter((d) => d.tipo === 'geral');
            const listaVeic = custo.despesas.filter((d) => d.tipo === 'veiculo');
            const somaGeral = listaGeral.reduce((s, d) => s + d.valor, 0);
            const somaVeic = listaVeic.reduce((s, d) => s + d.valor, 0);
            const somaInt = custo.internas.reduce((s, o) => s + o.custo, 0);
            const linhas: Array<{ k: string; nome: string; valor: number; nota: string; lista?: React.ReactNode }> = [
              { k: 'fixo', nome: 'Custo fixo da equipe (RH)', valor: c.custoFixo, nota: 'salários + encargos dos técnicos no mês — só o total' },
              { k: 'com', nome: 'Comissão dos técnicos', valor: c.comissao, nota: 'só o total' },
              {
                k: 'int', nome: 'Custo real das OS internas', valor: c.custoRealInterno, nota: `${custo.internas.length} OS (horas × custo/hora + km)`,
                lista: (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr><th style={th}>OS</th><th style={th}>Data</th><th style={th}>Cliente</th><th style={th}>Tipo</th><th style={{ ...th, textAlign: 'right' }}>Custo</th></tr></thead>
                    <tbody>{custo.internas.map((o, j) => (
                      <tr key={j}><td style={td}>{o.numero}</td><td style={td}>{dataBR(o.data)}</td><td style={td}>{o.cliente || '—'}</td><td style={td}>{o.tipo || '—'}</td><td style={tdN}>{rs(o.custo)}</td></tr>
                    ))}</tbody>
                    {Math.abs(somaInt - c.custoRealInterno) > 1 && <tfoot><tr><td colSpan={5} style={{ ...td, color: '#b45309' }}>Diferença de {rs(c.custoRealInterno - somaInt)} sem OS identificada.</td></tr></tfoot>}
                  </table>
                ),
              },
              {
                k: 'veic', nome: 'Despesas de veículos (frota)', valor: c.despesaVeic, nota: `${listaVeic.length} lançamento(s)`,
                lista: <ListaDespesas lista={listaVeic} resto={c.despesaVeic - somaVeic} restoNome="manutenção de frota lançada por requisição" />,
              },
              {
                k: 'geral', nome: 'Despesas gerais', valor: c.despesaGeral, nota: `${listaGeral.length} lançamento(s)`,
                lista: <ListaDespesas lista={listaGeral} resto={c.despesaGeral - somaGeral} restoNome="outros lançamentos" />,
              },
            ];
            return (
              <>
                <div style={{ fontSize: '.82rem', color: '#6b7280', margin: '6px 0 8px' }}>Mesma régua do Painel Omie (saída da Oficina). Clique numa linha para ver os lançamentos.</div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th}>Componente</th><th style={th}>Detalhe</th><th style={{ ...th, textAlign: 'right' }}>Valor</th><th style={{ ...th, textAlign: 'right' }}>% do custo</th></tr></thead>
                  <tbody>
                    {linhas.map((l) => (
                      <Fragment key={l.k}>
                        <tr onClick={l.lista ? () => alternar(l.k) : undefined} style={{ cursor: l.lista ? 'pointer' : 'default', background: aberto === l.k ? '#f9fafb' : undefined }}>
                          <td style={{ ...td, fontWeight: 600 }}>{l.lista ? (aberto === l.k ? '▾ ' : '▸ ') : ''}{l.nome}</td>
                          <td style={{ ...td, color: '#6b7280' }}>{l.nota}</td>
                          <td style={{ ...tdN, fontWeight: 700 }}>{rs(l.valor)}</td>
                          <td style={tdN}>{c.total > 0 ? ((l.valor / c.total) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%' : '—'}</td>
                        </tr>
                        {aberto === l.k && l.lista && <tr><td colSpan={4} style={{ padding: '0 0 8px 24px', background: '#f9fafb' }}>{l.lista}</td></tr>}
                      </Fragment>
                    ))}
                    <tr><td style={{ ...td, fontWeight: 800, borderTop: '1.5px solid #111827' }}>Total</td><td style={{ ...td, borderTop: '1.5px solid #111827' }} /><td style={{ ...tdN, fontWeight: 800, borderTop: '1.5px solid #111827', color: '#b91c1c' }}>{rs(c.total)}</td><td style={{ ...tdN, borderTop: '1.5px solid #111827' }}>100%</td></tr>
                  </tbody>
                </table>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

function ListaDespesas({ lista, resto, restoNome }: { lista: DetalheCusto['despesas']; resto: number; restoNome: string }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr><th style={th}>Data</th><th style={th}>Descrição</th><th style={th}>Veículo</th><th style={th}>Responsável</th><th style={{ ...th, textAlign: 'right' }}>Valor</th></tr></thead>
      <tbody>
        {lista.map((d, j) => (
          <tr key={j}><td style={td}>{dataBR(d.data)}</td><td style={td}>{limpar(d.descricao) || '—'}</td><td style={td}>{d.veiculo || '—'}</td><td style={td}>{d.tecnico || '—'}</td><td style={tdN}>{rs(d.valor)}</td></tr>
        ))}
        {Math.abs(resto) > 1 && <tr><td colSpan={4} style={{ ...td, color: '#6b7280' }}>+ {restoNome}</td><td style={tdN}>{rs(resto)}</td></tr>}
      </tbody>
    </table>
  );
}
