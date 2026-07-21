'use client';
// Pedidos de venda abertos + encerramento informal. Portado de pedidos.ejs +
// public/pedidos.js. Consome /api/ajustes/pedidos{,/encerrar-informal,/csv,/pdf}
// e /api/ajustes/encerramentos-informais.
import { useState, useCallback, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
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

// "Criado por"/"Alterado por": a API devolve o codigo interno do usuario Omie
// (ex. "P000454031") e o servidor troca pelo nome. Quando o nome volta IGUAL ao
// codigo e' porque o usuario nao esta mais no cadastro (inativo/removido) — a
// Omie nao expoe esses via API. Marcamos como codigo cru p/ nao parecer um nome.
function ehCodigoOmie(nome?: string | null, login?: string | null): boolean {
  return !!nome && (nome === login || /^P\d{6,}$/.test(nome));
}
function CelulaUsuario({ nome, login }: { nome?: string | null; login?: string | null }) {
  const valor = nome || login;
  if (!valor) return <>-</>;
  if (!ehCodigoOmie(valor, login)) return <>{valor}</>;
  return (
    <span style={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: '.7rem' }} title={`Codigo interno do usuario Omie (${valor}). O usuario nao consta mais no cadastro da conta — provavelmente foi inativado/removido no Omie.`}>
      {valor}
    </span>
  );
}

const thStyle: React.CSSProperties = { background: '#f8fafc', color: '#475569', fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.4px', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f1f5f9', color: '#334155', fontSize: '.82rem' };

// Acessores de coluna (ordenacao + filtro) da tabela de pedidos abertos. Numeros
// ordenam por subtracao; strings por localeCompare. Datas BR viram timestamp.
const ACESSO: Record<string, (p: Pedido) => string | number> = {
  numero: (p) => p.numero || '',
  inclusao: (p) => { const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(p.dataInclusao || p.dataPrevisao || ''); return m ? new Date(+m[3], +m[2] - 1, +m[1]).getTime() : 0; },
  dias: (p) => diasDesdeBR(p.dataInclusao || p.dataPrevisao) ?? -1,
  parado: (p) => p.diasParadoEtapa != null ? p.diasParadoEtapa : (diasDesdeBR(p.dataAlteracao || p.dataInclusao) ?? -1),
  cliente: (p) => p.nomeCliente || ('cli #' + (p.codigoCliente || '')),
  criadoPor: (p) => p.criadoPorNome || p.criadoPorLogin || '',
  etapa: (p) => p.etapaNome || p.etapa || '',
  itens: (p) => (p.itens || []).length,
  valor: (p) => p.valorTotal || 0,
};
// Cabecalho clicavel (ordena) — esq. e dir.
const thSort: React.CSSProperties = { ...thStyle, cursor: 'pointer', userSelect: 'none' };
const thSortR: React.CSSProperties = { ...thStyle, cursor: 'pointer', userSelect: 'none', textAlign: 'right' };
const thFiltroStyle: React.CSSProperties = { background: '#f8fafc', padding: '0 6px 6px', borderBottom: '1px solid #e2e8f0' };
const filtroInput: React.CSSProperties = { width: '100%', minWidth: 60, border: '1px solid #cbd5e1', borderRadius: 4, padding: '3px 6px', fontSize: '.72rem', fontWeight: 400 };

export default function PedidosPage() {
  const { userProfile } = useAuth();
  const { pode, loading: permLoading } = usePermissoes(userProfile?.id);
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

  // permissao granular pra encerrar (alem do acesso a pagina)
  const podeEncerrarInformal = pode('ajustes', 'pedidos:encerrar');

  // popup de detalhes (read-only) ao clicar na linha
  const [detalheSel, setDetalheSel] = useState<Pedido | null>(null);

  // ordenacao + filtro da tabela de abertos
  const [ordem, setOrdem] = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null);
  const [filtros, setFiltros] = useState<Record<string, string>>({});
  const toggleOrdem = useCallback((col: string) => {
    setOrdem((o) => (o && o.col === col ? (o.dir === 'asc' ? { col, dir: 'desc' } : null) : { col, dir: 'asc' }));
  }, []);
  const setaCol = (col: string) => (ordem?.col === col ? (ordem.dir === 'asc' ? ' ▲' : ' ▼') : '');

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
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch('/api/ajustes/pedidos/encerrar-informal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
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

  const peds = useMemo(() => dados?.pedidos || [], [dados]);
  // aplica filtros de texto e ordenacao sobre a lista de abertos
  const pedsView = useMemo(() => {
    let arr = peds.slice();
    for (const [col, termo] of Object.entries(filtros)) {
      const t = (termo || '').trim().toLowerCase();
      if (!t) continue;
      const acc = ACESSO[col];
      if (!acc) continue;
      arr = arr.filter((p) => String(acc(p)).toLowerCase().includes(t));
    }
    if (ordem) {
      const acc = ACESSO[ordem.col];
      if (acc) {
        arr = arr.slice().sort((a, b) => {
          const va = acc(a), vb = acc(b);
          const c = (typeof va === 'number' && typeof vb === 'number') ? va - vb : String(va).localeCompare(String(vb), 'pt-BR');
          return ordem.dir === 'asc' ? c : -c;
        });
      }
    }
    return arr;
  }, [peds, filtros, ordem]);

  if (!permLoading && userProfile && !pode('ajustes', 'pedidos')) return <SemPermissao />;

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
                    <th style={thSort} onClick={() => toggleOrdem('numero')}>Numero{setaCol('numero')}</th>
                    <th style={thSort} onClick={() => toggleOrdem('inclusao')}>Inclusao{setaCol('inclusao')}</th>
                    <th style={thSortR} onClick={() => toggleOrdem('dias')}>Dias{setaCol('dias')}</th>
                    <th style={thSortR} onClick={() => toggleOrdem('parado')}>Parado{setaCol('parado')}</th>
                    <th style={thSort} onClick={() => toggleOrdem('cliente')}>Cliente{setaCol('cliente')}</th>
                    <th style={thSort} onClick={() => toggleOrdem('criadoPor')}>Criado por{setaCol('criadoPor')}</th>
                    <th style={thSort} onClick={() => toggleOrdem('etapa')}>Etapa{setaCol('etapa')}</th>
                    <th style={thSortR} onClick={() => toggleOrdem('itens')}>Itens{setaCol('itens')}</th>
                    <th style={thSortR} onClick={() => toggleOrdem('valor')}>Valor{setaCol('valor')}</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Acao</th>
                  </tr>
                  <tr>
                    <th style={thFiltroStyle}><input value={filtros.numero || ''} onChange={(e) => setFiltros((f) => ({ ...f, numero: e.target.value }))} placeholder="filtrar…" style={filtroInput} /></th>
                    <th style={thFiltroStyle}></th>
                    <th style={thFiltroStyle}></th>
                    <th style={thFiltroStyle}></th>
                    <th style={thFiltroStyle}><input value={filtros.cliente || ''} onChange={(e) => setFiltros((f) => ({ ...f, cliente: e.target.value }))} placeholder="filtrar…" style={filtroInput} /></th>
                    <th style={thFiltroStyle}><input value={filtros.criadoPor || ''} onChange={(e) => setFiltros((f) => ({ ...f, criadoPor: e.target.value }))} placeholder="filtrar…" style={filtroInput} /></th>
                    <th style={thFiltroStyle}><input value={filtros.etapa || ''} onChange={(e) => setFiltros((f) => ({ ...f, etapa: e.target.value }))} placeholder="filtrar…" style={filtroInput} /></th>
                    <th style={thFiltroStyle}></th>
                    <th style={thFiltroStyle}></th>
                    <th style={thFiltroStyle}></th>
                  </tr>
                </thead>
                <tbody>
                  {!dados ? (
                    <tr><td colSpan={10} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Clique em <b>Buscar</b> para listar os pedidos abertos.</td></tr>
                  ) : peds.length === 0 ? (
                    <tr><td colSpan={10} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Nenhum pedido ativo na janela.</td></tr>
                  ) : pedsView.length === 0 ? (
                    <tr><td colSpan={10} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Nenhum pedido corresponde ao filtro.</td></tr>
                  ) : (
                    pedsView.map((p, i) => {
                      const dias = p.diasParadoEtapa != null ? diasDesdeBR(p.dataInclusao || p.dataPrevisao) : diasDesdeBR(p.dataInclusao || p.dataPrevisao);
                      const corDias = dias != null && dias >= 30 ? { color: '#b91c1c', fontWeight: 600 } : dias != null && dias >= 15 ? { color: '#b45309' } : {};
                      const parado = p.diasParadoEtapa != null ? p.diasParadoEtapa : diasDesdeBR(p.dataAlteracao || p.dataInclusao);
                      const corParado = parado != null && parado >= 30 ? { color: '#b91c1c', fontWeight: 600 } : parado != null && parado >= 15 ? { color: '#b45309' } : {};
                      const temItens = p.idPedido != null && (p.itens || []).length > 0;
                      const podeEncerrar = temItens && podeEncerrarInformal;
                      return (
                        <tr key={p.idPedido ?? i} onClick={() => setDetalheSel(p)} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }} title="Ver detalhes do pedido">
                          <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{p.numero || '?'}</td>
                          <td style={{ ...tdStyle, fontSize: '.72rem' }}>{p.dataInclusao || p.dataPrevisao || ''}</td>
                          <td style={{ ...tdStyle, textAlign: 'right', fontSize: '.72rem', ...corDias }}>{dias != null ? dias : '-'}</td>
                          <td style={{ ...tdStyle, textAlign: 'right', fontSize: '.72rem', ...corParado }} title={(p.alteradoPorNome || p.alteradoPorLogin) ? 'alteracao por ' + (p.alteradoPorNome || p.alteradoPorLogin) : ''}>{parado != null ? parado : '-'}</td>
                          <td style={{ ...tdStyle, fontSize: '.78rem' }}>{p.nomeCliente || ('cli #' + (p.codigoCliente || '?'))}</td>
                          <td style={{ ...tdStyle, fontSize: '.72rem' }}><CelulaUsuario nome={p.criadoPorNome} login={p.criadoPorLogin} /></td>
                          <td style={{ ...tdStyle, fontSize: '.72rem' }}>{p.etapaNome || p.etapa || ''}</td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>{(p.itens || []).length}</td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtBRL(p.valorTotal)}</td>
                          <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button onClick={(e) => { e.stopPropagation(); abrirModal(p); }} disabled={!podeEncerrar} title={!podeEncerrarInformal ? 'Voce nao tem permissao para encerrar' : (!temItens ? 'pedido sem itens' : '')} style={{ padding: '3px 8px', fontSize: '.72rem', border: 'none', borderRadius: 4, cursor: podeEncerrar ? 'pointer' : 'not-allowed', background: podeEncerrar ? '#dc2626' : '#e2e8f0', color: podeEncerrar ? '#fff' : '#94a3b8' }}>Encerrar informal</button>
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
              <button onClick={confirmar} disabled={aplicando || !podeEncerrarInformal} title={!podeEncerrarInformal ? 'Voce nao tem permissao para encerrar' : ''} style={{ padding: '6px 14px', fontSize: '.82rem', background: podeEncerrarInformal ? '#dc2626' : '#e2e8f0', color: podeEncerrarInformal ? '#fff' : '#94a3b8', border: 'none', borderRadius: 6, cursor: !podeEncerrarInformal ? 'not-allowed' : (aplicando ? 'wait' : 'pointer'), opacity: aplicando ? 0.6 : 1 }}>Encerrar informalmente</button>
            </div>
          </div>
        </div>
      )}

      {/* Popup de detalhes (read-only) */}
      {detalheSel && (
        <div onClick={() => setDetalheSel(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 10, width: '100%', maxWidth: 760, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,.25)' }}>
            <div style={{ borderBottom: '1px solid #e2e8f0', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontWeight: 600, color: '#1e293b', fontSize: '.95rem', margin: 0 }}>Pedido #{detalheSel.numero || detalheSel.idPedido}</h2>
              <button onClick={() => setDetalheSel(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', lineHeight: 1, color: '#64748b', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: 18, overflowY: 'auto', fontSize: '.82rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 18px', marginBottom: 12, fontSize: '.76rem', color: '#475569' }}>
                <div>Cliente: <b>{detalheSel.nomeCliente || ('#' + (detalheSel.codigoCliente || '?'))}</b></div>
                <div>Etapa: <b>{detalheSel.etapaNome || detalheSel.etapa || '?'}</b></div>
                <div>Criado por: <b><CelulaUsuario nome={detalheSel.criadoPorNome} login={detalheSel.criadoPorLogin} /></b></div>
                <div>Alterado por: <b><CelulaUsuario nome={detalheSel.alteradoPorNome} login={detalheSel.alteradoPorLogin} /></b></div>
                <div>Inclusao: <b>{detalheSel.dataInclusao || '?'}</b></div>
                <div>Previsao: <b>{detalheSel.dataPrevisao || '?'}</b></div>
                <div>Dias parado na etapa: <b>{detalheSel.diasParadoEtapa != null ? detalheSel.diasParadoEtapa : '-'}</b></div>
                <div>Valor total: <b>{fmtBRL(detalheSel.valorTotal)}</b></div>
              </div>
              <h3 style={{ fontWeight: 600, color: '#334155', marginBottom: 4, fontSize: '.82rem' }}>Itens ({(detalheSel.itens || []).length})</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                <thead><tr>
                  <th style={{ ...thStyle, fontSize: '.62rem', padding: '4px 8px' }}>Codigo</th>
                  <th style={{ ...thStyle, fontSize: '.62rem', padding: '4px 8px' }}>Descricao</th>
                  <th style={{ ...thStyle, fontSize: '.62rem', padding: '4px 8px', textAlign: 'right' }}>Qtde</th>
                  <th style={{ ...thStyle, fontSize: '.62rem', padding: '4px 8px', textAlign: 'right' }}>Vlr unit</th>
                  <th style={{ ...thStyle, fontSize: '.62rem', padding: '4px 8px' }}>Local</th>
                </tr></thead>
                <tbody>
                  {(detalheSel.itens || []).length === 0 ? (
                    <tr><td colSpan={5} style={{ ...tdStyle, color: '#94a3b8' }}>(sem itens)</td></tr>
                  ) : (detalheSel.itens || []).map((it, i) => (
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
            </div>
            <div style={{ borderTop: '1px solid #e2e8f0', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => setDetalheSel(null)} style={{ padding: '6px 14px', fontSize: '.82rem', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 6, cursor: 'pointer', marginLeft: 'auto' }}>Fechar</button>
              {podeEncerrarInformal && (detalheSel.itens || []).length > 0 && (
                <button onClick={() => { const p = detalheSel; setDetalheSel(null); abrirModal(p); }} style={{ padding: '6px 14px', fontSize: '.82rem', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Encerrar informal</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
