'use client';
// Pedidos de venda abertos + encerramento informal. Portado de pedidos.ejs +
// public/pedidos.js. Consome /api/ajustes/pedidos{,/encerrar-informal,/csv,/pdf}
// e /api/ajustes/encerramentos-informais.
import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';

// ---------- tipos ----------
interface ItemPedido {
  idProduto?: number | null; codigo?: string | null; descricao?: string | null;
  qtde?: number; valorUnit?: number; codLocalEstoque?: number | string | null;
}
interface Pedido {
  idPedido?: number | null; numero?: string | null; codigoCliente?: number | null;
  nomeCliente?: string | null; etapa?: string | null; etapaNome?: string | null;
  dataInclusao?: string | null; dataPrevisao?: string | null; dataAlteracao?: string | null;
  diasParadoEtapa?: number | null; criadoPorNome?: string | null; criadoPorLogin?: string | null;
  alteradoPorNome?: string | null; alteradoPorLogin?: string | null; valorTotal?: number;
  itens?: ItemPedido[];
}
interface PedidosPayload {
  conta?: string; total?: number; pedidos?: Pedido[]; fonte?: string; duracaoMs?: number; erro?: string;
}
interface Encerramento {
  id?: number; numero_pedido?: string; criado_em?: string; nome_cliente?: string | null;
  codigo_cliente?: number | null; status?: string; itens?: { erro?: string }[]; razao?: string; criado_por?: string;
}

// ---------- helpers ----------
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmtBRL(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return '-';
  return brl.format(Number(n));
}
function fmtNum(n: number | null | undefined, dec = 0): string {
  if (n == null || isNaN(Number(n))) return '-';
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function diasDesdeBR(dataBR?: string | null): number | null {
  if (!dataBR) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(dataBR);
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}
function isoOffset(dias: number): string {
  const d = new Date(Date.now() - dias * 86400000);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

const thStyle: React.CSSProperties = { background: '#f8fafc', color: '#475569', fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.4px', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f1f5f9', color: '#334155', fontSize: '.82rem' };

export default function PedidosPage() {
  const { userProfile } = useAuth();
  const { temAcesso, loading: permLoading } = usePermissoes(userProfile?.id);
  const { conta, contaParam } = useConta();
  const criadoPor = userProfile?.nome || 'portal';
  const router = useRouter();

  const [modo, setModo] = useState<'abertos' | 'encerrados'>('abertos');
  const [de, setDe] = useState(isoOffset(60));
  const [ate, setAte] = useState(isoOffset(0));
  const [dados, setDados] = useState<PedidosPayload | null>(null);
  const [encerramentos, setEncerramentos] = useState<Encerramento[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [erro, setErro] = useState('');

  // modal
  const [pedidoSel, setPedidoSel] = useState<Pedido | null>(null);
  const [razao, setRazao] = useState('');
  const [modalStatus, setModalStatus] = useState('');
  const [aplicando, setAplicando] = useState(false);

  const buscarAbertos = useCallback(async (force: boolean) => {
    if (!conta) return;
    setCarregando(true); setErro('');
    setStatusMsg('buscando...');
    try {
      let qs = contaParam.replace(/^&/, '');
      if (de) qs += '&de=' + encodeURIComponent(de);
      if (ate) qs += '&ate=' + encodeURIComponent(ate);
      if (force) qs += '&force=1';
      const r = await fetch(`/api/ajustes/pedidos?${qs}`);
      const d = (await r.json()) as PedidosPayload;
      if (d.erro) { setErro(d.erro); setStatusMsg(''); return; }
      setDados(d);
      const peds = d.pedidos || [];
      setStatusMsg(`${fmtNum(peds.length)} pedido(s) ativo(s)${d.fonte === 'cache' ? ' (cache)' : ''}${d.duracaoMs ? ' · ' + (d.duracaoMs / 1000).toFixed(1) + 's' : ''}`);
    } catch (ex) {
      setErro('erro de rede: ' + (ex as Error).message); setStatusMsg('');
    } finally { setCarregando(false); }
  }, [conta, contaParam, de, ate]);

  const buscarEncerrados = useCallback(async () => {
    setCarregando(true); setErro('');
    setStatusMsg('buscando encerramentos...');
    try {
      const r = await fetch(`/api/ajustes/encerramentos-informais?${contaParam.replace(/^&/, '')}`);
      const d = await r.json();
      if (d.erro) { setErro(d.erro); setStatusMsg(''); return; }
      const linhas: Encerramento[] = d.linhas || [];
      setEncerramentos(linhas);
      setStatusMsg(`${linhas.length} encerramento(s) registrado(s)`);
    } catch (ex) {
      setErro('erro de rede: ' + (ex as Error).message); setStatusMsg('');
    } finally { setCarregando(false); }
  }, [contaParam]);

  // (re)busca ao trocar conta/modo
  useEffect(() => {
    if (modo === 'encerrados') buscarEncerrados();
    else if (conta) buscarAbertos(false);
    else { setDados(null); setStatusMsg(''); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conta, modo]);

  const abrirModal = useCallback((p: Pedido) => {
    setPedidoSel(p); setRazao(''); setModalStatus('');
  }, []);
  const fecharModal = useCallback(() => { setPedidoSel(null); setRazao(''); setModalStatus(''); }, []);

  const confirmar = useCallback(async () => {
    if (!pedidoSel) return;
    const r = razao.trim();
    if (r.length < 3) { setModalStatus('informe a razao (min 3 chars)'); return; }
    if (!confirm(`Encerrar o pedido #${pedidoSel.numero || pedidoSel.idPedido} informalmente?\n\nIsso vai BAIXAR o estoque de ${(pedidoSel.itens || []).length} item(ns), gravar a razao na obs do pedido e CANCELAR o pedido no Omie. Confirmar?`)) return;
    setAplicando(true); setModalStatus('aplicando...');
    try {
      const resp = await fetch('/api/ajustes/pedidos/encerrar-informal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conta, idPedido: pedidoSel.idPedido, numeroPedido: pedidoSel.numero, razao: r, criadoPor }),
      });
      const d = await resp.json();
      if (d.ok) {
        const nErr = (d.itens || []).filter((x: { erro?: string }) => x.erro).length;
        setModalStatus(`${d.status === 'aplicado' ? '✔ encerrado' : '⚠ parcial'} · ${(d.itens || []).length - nErr} baixa(s)${nErr ? ` (${nErr} c/ erro)` : ''}${d.cancelado ? ' · cancelado' : ' · NAO cancelou'}${d.alterouObs ? '' : ' · obs falhou'} · abrindo recibo...`);
        if (d.logId) {
          setTimeout(() => router.push(`/ajustes/encerramentos/${encodeURIComponent(d.logId)}?conta=${encodeURIComponent(conta)}`), 1200);
        } else {
          setTimeout(() => { fecharModal(); buscarAbertos(true); }, 1200);
        }
      } else {
        setModalStatus(d.erro || 'falhou');
      }
    } catch (ex) {
      setModalStatus('erro de rede: ' + (ex as Error).message);
    } finally { setAplicando(false); }
  }, [pedidoSel, razao, conta, criadoPor, router, fecharModal, buscarAbertos]);

  const exportar = useCallback((fmt: 'csv' | 'pdf') => {
    if (!conta) { alert('Selecione NOVA ou CASTRO no menu.'); return; }
    let qs = contaParam.replace(/^&/, '');
    if (de) qs += '&de=' + encodeURIComponent(de);
    if (ate) qs += '&ate=' + encodeURIComponent(ate);
    const url = `/api/ajustes/pedidos/${fmt}?${qs}`;
    if (fmt === 'pdf') window.open(url, '_blank');
    else window.location.href = url;
  }, [conta, contaParam, de, ate]);

  if (!permLoading && userProfile && !temAcesso('ajustes')) return <SemPermissao />;

  const peds = dados?.pedidos || [];
  const corStatusEnc = (s?: string) => s === 'aplicado' ? { background: '#d1fae5', color: '#065f46' } : s === 'parcial' ? { background: '#fef3c7', color: '#92400e' } : s === 'erro' ? { background: '#fee2e2', color: '#991b1b' } : { background: '#f1f5f9', color: '#334155' };

  return (
    <div style={{ maxWidth: 1300, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Pedidos de venda abertos</h1>
          <p style={{ color: '#64748b', fontSize: '.82rem', maxWidth: 760 }}>
            Conta <b>{conta ? conta.toUpperCase() : '—'}</b>. Encerrar de forma <b>informal</b> = baixar o estoque dos itens (SAI), registrar a razao no movimento e na observacao do pedido, e cancelar o pedido no Omie. Sem NF.
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          {modo === 'abertos' && (
            <>
              <div>
                <label style={{ display: 'block', fontSize: '.65rem', color: '#64748b', marginBottom: 2 }}>Previsao de fat. de</label>
                <input type="date" value={de} onChange={(e) => setDe(e.target.value)} style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.82rem' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '.65rem', color: '#64748b', marginBottom: 2 }}>Ate</label>
                <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.82rem' }} />
              </div>
              <button onClick={() => buscarAbertos(false)} disabled={carregando || !conta} style={{ padding: '7px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: 'pointer', opacity: carregando || !conta ? 0.5 : 1 }}>Buscar</button>
              <button onClick={() => buscarAbertos(true)} disabled={carregando || !conta} title="Refaz a busca ignorando o cache" style={{ padding: '7px 14px', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: 'pointer', opacity: carregando || !conta ? 0.5 : 1 }}>Atualizar</button>
              <button onClick={() => exportar('csv')} style={{ padding: '7px 12px', background: '#f1f5f9', color: '#334155', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: 'pointer' }}>CSV</button>
              <button onClick={() => exportar('pdf')} style={{ padding: '7px 12px', background: '#f1f5f9', color: '#334155', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: 'pointer' }}>PDF</button>
            </>
          )}
          <ContaSelector />
        </div>
      </div>

      <div style={{ margin: '6px 0 12px', display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '.8rem' }}>
        <Link href="/ajustes/pedidos-antigos?dias=15" style={{ color: '#b45309', textDecoration: 'none', fontWeight: 600 }}>→ Antigos &gt;15d (NOVA + CASTRO)</Link>
        <Link href="/ajustes/saude-mensal" style={{ color: '#dc2626', textDecoration: 'none', fontWeight: 600 }}>→ Saude mensal</Link>
      </div>

      {/* Toggle abertos | encerrados */}
      <div style={{ display: 'inline-flex', border: '1px solid #e2e8f0', background: '#fff', borderRadius: 8, padding: 4, marginBottom: 12, fontSize: '.72rem' }}>
        {(['abertos', 'encerrados'] as const).map((m) => (
          <button key={m} onClick={() => setModo(m)} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', marginLeft: m === 'encerrados' ? 4 : 0, background: modo === m ? '#1e293b' : '#f1f5f9', color: modo === m ? '#fff' : '#334155' }}>
            {m === 'abertos' ? 'Pedidos abertos' : 'Encerrados pelo app'}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: '.72rem' }}>
        <span style={{ padding: '3px 8px', borderRadius: 6, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
          ⚠ O encerramento informal e&apos; <b>irreversivel pelo app</b> (baixa de estoque + cancelamento do pedido). Conferir os itens antes.
        </span>
        <span style={{ marginLeft: 'auto', color: '#64748b' }}>{carregando ? 'Carregando…' : statusMsg}</span>
      </div>

      {erro && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '.82rem' }}>{erro}</div>}

      {modo === 'abertos' && !conta ? (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: 16, fontSize: '.85rem' }}>
          Esta tela precisa de uma conta especifica para listar os pedidos. Selecione <b>NOVA</b> ou <b>CASTRO</b> no menu acima.
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            {modo === 'abertos' ? (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Numero</th>
                    <th style={thStyle}>Inclusao</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Dias</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Parado</th>
                    <th style={thStyle}>Cliente</th>
                    <th style={thStyle}>Criado por</th>
                    <th style={thStyle}>Etapa</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Itens</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Valor</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Acao</th>
                  </tr>
                </thead>
                <tbody>
                  {!dados ? (
                    <tr><td colSpan={10} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Clique em <b>Buscar</b> para listar os pedidos abertos.</td></tr>
                  ) : peds.length === 0 ? (
                    <tr><td colSpan={10} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Nenhum pedido ativo na janela.</td></tr>
                  ) : (
                    peds.map((p, i) => {
                      const dias = p.diasParadoEtapa != null ? diasDesdeBR(p.dataInclusao || p.dataPrevisao) : diasDesdeBR(p.dataInclusao || p.dataPrevisao);
                      const corDias = dias != null && dias >= 30 ? { color: '#b91c1c', fontWeight: 600 } : dias != null && dias >= 15 ? { color: '#b45309' } : {};
                      const parado = p.diasParadoEtapa != null ? p.diasParadoEtapa : diasDesdeBR(p.dataAlteracao || p.dataInclusao);
                      const corParado = parado != null && parado >= 30 ? { color: '#b91c1c', fontWeight: 600 } : parado != null && parado >= 15 ? { color: '#b45309' } : {};
                      const podeEncerrar = p.idPedido != null && (p.itens || []).length > 0;
                      return (
                        <tr key={p.idPedido ?? i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{p.numero || '?'}</td>
                          <td style={{ ...tdStyle, fontSize: '.72rem' }}>{p.dataInclusao || p.dataPrevisao || ''}</td>
                          <td style={{ ...tdStyle, textAlign: 'right', fontSize: '.72rem', ...corDias }}>{dias != null ? dias : '-'}</td>
                          <td style={{ ...tdStyle, textAlign: 'right', fontSize: '.72rem', ...corParado }} title={(p.alteradoPorNome || p.alteradoPorLogin) ? 'alteracao por ' + (p.alteradoPorNome || p.alteradoPorLogin) : ''}>{parado != null ? parado : '-'}</td>
                          <td style={{ ...tdStyle, fontSize: '.78rem' }}>{p.nomeCliente || ('cli #' + (p.codigoCliente || '?'))}</td>
                          <td style={{ ...tdStyle, fontSize: '.72rem' }}>{p.criadoPorNome || p.criadoPorLogin || '-'}</td>
                          <td style={{ ...tdStyle, fontSize: '.72rem' }}>{p.etapaNome || p.etapa || ''}</td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>{(p.itens || []).length}</td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtBRL(p.valorTotal)}</td>
                          <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button onClick={() => abrirModal(p)} disabled={!podeEncerrar} style={{ padding: '3px 8px', fontSize: '.72rem', border: 'none', borderRadius: 4, cursor: podeEncerrar ? 'pointer' : 'not-allowed', background: podeEncerrar ? '#dc2626' : '#e2e8f0', color: podeEncerrar ? '#fff' : '#94a3b8' }}>Encerrar informal</button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Pedido</th>
                    <th style={thStyle}>Quando</th>
                    <th style={thStyle}>Cliente</th>
                    <th style={thStyle}>Status</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Itens OK</th>
                    <th style={thStyle}>Razao</th>
                    <th style={thStyle}>Por</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Acao</th>
                  </tr>
                </thead>
                <tbody>
                  {encerramentos.length === 0 ? (
                    <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Nenhum pedido foi encerrado pelo app ainda.</td></tr>
                  ) : (
                    encerramentos.map((l) => {
                      const itens = Array.isArray(l.itens) ? l.itens : [];
                      const ok = itens.filter((i) => !i.erro).length;
                      const quando = l.criado_em ? new Date(l.criado_em).toLocaleString('pt-BR') : '';
                      return (
                        <tr key={l.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ ...tdStyle, fontFamily: 'monospace' }}>#{l.numero_pedido || '?'}</td>
                          <td style={{ ...tdStyle, fontSize: '.72rem' }}>{quando}</td>
                          <td style={{ ...tdStyle, fontSize: '.78rem' }}>{l.nome_cliente || ('cli #' + (l.codigo_cliente || '?'))}</td>
                          <td style={tdStyle}><span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 4, fontSize: '.7rem', ...corStatusEnc(l.status) }}>{l.status || '?'}</span></td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>{ok}/{itens.length}</td>
                          <td style={{ ...tdStyle, fontSize: '.72rem' }} title={l.razao || ''}>{(l.razao || '').slice(0, 60)}{l.razao && l.razao.length > 60 ? '...' : ''}</td>
                          <td style={{ ...tdStyle, fontSize: '.72rem' }}>{l.criado_por || ''}</td>
                          <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <Link href={`/ajustes/encerramentos/${l.id}?conta=${encodeURIComponent(conta)}`} style={{ padding: '3px 8px', fontSize: '.72rem', background: '#2563eb', color: '#fff', borderRadius: 4, textDecoration: 'none' }}>Ver detalhes</Link>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Modal de encerramento */}
      {pedidoSel && (
        <div onClick={fecharModal} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 10, width: '100%', maxWidth: 760, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,.25)' }}>
            <div style={{ borderBottom: '1px solid #e2e8f0', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontWeight: 600, color: '#1e293b', fontSize: '.95rem', margin: 0 }}>Encerrar pedido #{pedidoSel.numero || pedidoSel.idPedido} informalmente</h2>
              <button onClick={fecharModal} style={{ background: 'none', border: 'none', fontSize: '1.5rem', lineHeight: 1, color: '#64748b', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: 18, overflowY: 'auto', fontSize: '.82rem' }}>
              <div style={{ marginBottom: 10, fontSize: '.74rem', color: '#475569' }}>
                Cliente <b>{pedidoSel.nomeCliente || ('#' + (pedidoSel.codigoCliente || '?'))}</b> · etapa <b>{pedidoSel.etapaNome || pedidoSel.etapa || '?'}</b> · previsao <b>{pedidoSel.dataPrevisao || '?'}</b> · valor <b>{fmtBRL(pedidoSel.valorTotal)}</b>
              </div>
              <div style={{ marginBottom: 12, fontSize: '.74rem', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: 8 }}>
                A acao vai (1) <b>BAIXAR DO ESTOQUE</b> a quantidade total de cada item do pedido como SAI; (2) acrescentar a razao na observacao do pedido; (3) <b>CANCELAR</b> o pedido no Omie. Irreversivel pelo app.
              </div>
              <h3 style={{ fontWeight: 600, color: '#334155', marginBottom: 4, fontSize: '.82rem' }}>Itens a baixar</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #e2e8f0', borderRadius: 6, marginBottom: 12 }}>
                <thead><tr>
                  <th style={{ ...thStyle, fontSize: '.62rem', padding: '4px 8px' }}>Codigo</th>
                  <th style={{ ...thStyle, fontSize: '.62rem', padding: '4px 8px' }}>Descricao</th>
                  <th style={{ ...thStyle, fontSize: '.62rem', padding: '4px 8px', textAlign: 'right' }}>Qtde</th>
                  <th style={{ ...thStyle, fontSize: '.62rem', padding: '4px 8px', textAlign: 'right' }}>Vlr unit</th>
                  <th style={{ ...thStyle, fontSize: '.62rem', padding: '4px 8px' }}>Local</th>
                </tr></thead>
                <tbody>
                  {(pedidoSel.itens || []).length === 0 ? (
                    <tr><td colSpan={5} style={{ ...tdStyle, color: '#94a3b8' }}>(sem itens)</td></tr>
                  ) : (pedidoSel.itens || []).map((it, i) => (
                    <tr key={i}>
                      <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '.72rem', padding: '4px 8px' }}>{it.codigo || it.idProduto || '?'}</td>
                      <td style={{ ...tdStyle, fontSize: '.72rem', padding: '4px 8px' }}>{it.descricao || ''}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontSize: '.72rem', padding: '4px 8px' }}>{fmtNum(it.qtde, 0)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontSize: '.72rem', padding: '4px 8px' }}>{fmtBRL(it.valorUnit)}</td>
                      <td style={{ ...tdStyle, fontSize: '.72rem', padding: '4px 8px' }}>{it.codLocalEstoque || '(padrao)'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <label style={{ display: 'block', fontSize: '.7rem', color: '#64748b', marginBottom: 2 }}>Razao do encerramento <span style={{ color: '#dc2626' }}>*</span></label>
              <textarea value={razao} onChange={(e) => setRazao(e.target.value)} rows={3} placeholder="Ex.: consumo interno; brinde; quebra; substituido por outro pedido; cliente desistiu apos retirar amostra..." style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.82rem' }} />
              <div style={{ fontSize: '.7rem', color: '#94a3b8', marginTop: 4 }}>A razao vai p/ a observacao do pedido (visivel no Omie) e na observacao do ajuste de estoque de cada item.</div>
            </div>
            <div style={{ borderTop: '1px solid #e2e8f0', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '.72rem', color: modalStatus.startsWith('✔') || modalStatus.startsWith('⚠') ? '#047857' : '#64748b', marginRight: 'auto' }}>{modalStatus}</span>
              <button onClick={fecharModal} style={{ padding: '6px 14px', fontSize: '.82rem', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={confirmar} disabled={aplicando} style={{ padding: '6px 14px', fontSize: '.82rem', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, cursor: aplicando ? 'wait' : 'pointer', opacity: aplicando ? 0.6 : 1 }}>Encerrar informalmente</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
