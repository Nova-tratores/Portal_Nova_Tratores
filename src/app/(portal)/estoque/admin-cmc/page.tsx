'use client';
// Admin CMC do módulo Estoque. Enriquecer CMC (loop + status), backfill do campo
// modelo (+ status) e debug das vendas com/sem CMC. Portado da tela /admin-cmc.
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';
import { fmtRS } from '@/components/estoque/ui';

interface LoopState { rodando?: boolean; processados?: number; enriquecidos?: number; semCMC?: number; erros?: number; ultimoLog?: string | null; finalizadoEm?: string | null; vazio?: boolean }
interface ModeloState { rodando?: boolean; pagina?: number; totalPaginas?: number; lidos?: number; atualizados?: number; semMatch?: number; erros?: number; ultimoLog?: string | null; finalizadoEm?: string | null; vazio?: boolean }
interface VendaCMC { numero_pedido?: string; data_pedido?: string; descricao?: string; codigo_produto?: string; quantidade?: number; valor_unitario?: number; valor_total?: number; cmc_unitario?: number }
interface VendasResp { erro?: string; vendas?: VendaCMC[]; total?: number; filtrado?: number; pagina?: number; resumo?: { total: number; comCmc: number; semCmc: number } }

const card: React.CSSProperties = { background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,.04)' };
const cardTitle: React.CSSProperties = { fontSize: '.7rem', color: '#888', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 600 };
const btn = (disabled?: boolean): React.CSSProperties => ({ background: disabled ? '#bbb' : '#dc2626', color: '#fff', border: 'none', padding: '10px 22px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer' });
const inp: React.CSSProperties = { padding: '9px 12px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, outline: 'none' };
const th: React.CSSProperties = { background: '#fafafa', color: '#888', fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.5px', padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #eee', fontWeight: 600, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f5f5f5', color: '#444', fontSize: '.8rem' };

export default function AdminCMCPage() {
  const { userProfile } = useAuth();
  const { temAcesso, loading: permLoading } = usePermissoes(userProfile?.id);
  const { conta, contaParam } = useConta();

  const [cmcState, setCmcState] = useState<LoopState | null>(null);
  const [modeloState, setModeloState] = useState<ModeloState | null>(null);
  const cmcPoll = useRef<ReturnType<typeof setInterval> | null>(null);
  const modeloPoll = useRef<ReturnType<typeof setInterval> | null>(null);

  const [vendas, setVendas] = useState<VendasResp | null>(null);
  const [filtro, setFiltro] = useState('todos');
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [carregando, setCarregando] = useState(false);

  const requireConta = conta || '';

  const pollCMC = useCallback(() => {
    if (cmcPoll.current) clearInterval(cmcPoll.current);
    cmcPoll.current = setInterval(async () => {
      const r = await fetch(`/api/estoque/admin/enriquecer-cmc-status${contaParam}`);
      const d = (await r.json()) as LoopState;
      setCmcState(d);
      if (!d.rodando && cmcPoll.current) { clearInterval(cmcPoll.current); cmcPoll.current = null; }
    }, 2000);
  }, [contaParam]);

  const pollModelo = useCallback(() => {
    if (modeloPoll.current) clearInterval(modeloPoll.current);
    modeloPoll.current = setInterval(async () => {
      const r = await fetch(`/api/estoque/backfill-modelo-status${contaParam}`);
      const d = (await r.json()) as ModeloState;
      setModeloState(d);
      if (!d.rodando && modeloPoll.current) { clearInterval(modeloPoll.current); modeloPoll.current = null; }
    }, 2000);
  }, [contaParam]);

  useEffect(() => () => { if (cmcPoll.current) clearInterval(cmcPoll.current); if (modeloPoll.current) clearInterval(modeloPoll.current); }, []);

  const iniciarCMC = useCallback(async () => {
    if (!requireConta) { alert('Selecione NOVA ou CASTRO'); return; }
    const r = await fetch(`/api/estoque/admin/enriquecer-cmc-loop${contaParam}`);
    const d = await r.json();
    if (d.erro) { setCmcState(d.estado || { rodando: false }); alert(d.erro); return; }
    setCmcState({ rodando: true, processados: 0 });
    pollCMC();
  }, [requireConta, contaParam, pollCMC]);

  const iniciarModelo = useCallback(async () => {
    const r = await fetch(`/api/estoque/backfill-modelo${contaParam}`);
    const d = await r.json();
    if (d.erro) { setModeloState(d.estado || { rodando: false }); alert(d.erro); return; }
    setModeloState({ rodando: true, pagina: 0 });
    pollModelo();
  }, [contaParam, pollModelo]);

  const carregarVendas = useCallback(async () => {
    if (!requireConta) { setVendas({ erro: 'Selecione NOVA ou CASTRO' }); return; }
    setCarregando(true);
    try {
      const r = await fetch(`/api/estoque/admin/vendas-cmc?pagina=${pagina}&filtro=${filtro}&busca=${encodeURIComponent(busca)}${contaParam}`);
      setVendas((await r.json()) as VendasResp);
    } finally {
      setCarregando(false);
    }
  }, [requireConta, pagina, filtro, busca, contaParam]);

  useEffect(() => { if (requireConta) carregarVendas(); }, [carregarVendas, requireConta]);

  if (!permLoading && userProfile && !temAcesso('estoque')) return <SemPermissao />;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: '#333', marginBottom: 4, fontSize: '1.4rem', fontWeight: 700 }}>Admin CMC</h1>
          <p style={{ color: '#888', fontSize: '.82rem' }}>Enriquecer CMC, backfill de modelo e auditoria de vendas</p>
        </div>
        <ContaSelector />
      </div>
      <div style={{ margin: '14px 0 18px', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Link href="/estoque/dashboard" style={{ color: '#dc2626', textDecoration: 'none', fontSize: '.82rem', fontWeight: 600 }}>← Dashboard</Link>
        <Link href="/estoque/admin" style={{ color: '#dc2626', textDecoration: 'none', fontSize: '.82rem', fontWeight: 600 }}>Admin</Link>
      </div>

      <div style={card}>
        <div style={cardTitle}>Enriquecer CMC (loop em background)</div>
        <button onClick={iniciarCMC} disabled={cmcState?.rodando} style={btn(cmcState?.rodando)}>{cmcState?.rodando ? 'Rodando…' : 'Iniciar enriquecimento'}</button>
        {cmcState && !cmcState.vazio && (
          <div style={{ marginTop: 12, fontSize: 13, color: '#444' }}>
            proc={cmcState.processados || 0} · enriquecidos={cmcState.enriquecidos || 0} · semCMC={cmcState.semCMC || 0} · erros={cmcState.erros || 0}
            {cmcState.finalizadoEm && !cmcState.rodando ? ' — finalizado' : ''}
            {cmcState.ultimoLog ? <div style={{ color: '#888', marginTop: 4 }}>{cmcState.ultimoLog}</div> : null}
          </div>
        )}
      </div>

      <div style={card}>
        <div style={cardTitle}>Backfill do campo modelo (produtos, global)</div>
        <button onClick={iniciarModelo} disabled={modeloState?.rodando} style={btn(modeloState?.rodando)}>{modeloState?.rodando ? 'Rodando…' : 'Iniciar backfill modelo'}</button>
        {modeloState && !modeloState.vazio && (
          <div style={{ marginTop: 12, fontSize: 13, color: '#444' }}>
            pag={modeloState.pagina || 0}/{modeloState.totalPaginas || 0} · lidos={modeloState.lidos || 0} · atualizados={modeloState.atualizados || 0} · semMatch={modeloState.semMatch || 0} · erros={modeloState.erros || 0}
            {modeloState.finalizadoEm && !modeloState.rodando ? ' — finalizado' : ''}
            {modeloState.ultimoLog ? <div style={{ color: '#888', marginTop: 4 }}>{modeloState.ultimoLog}</div> : null}
          </div>
        )}
      </div>

      <div style={card}>
        <div style={cardTitle}>Vendas com/sem CMC</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <select value={filtro} onChange={(e) => { setFiltro(e.target.value); setPagina(1); }} style={inp}>
            <option value="todos">Todos</option>
            <option value="com_cmc">Com CMC</option>
            <option value="sem_cmc">Sem CMC</option>
          </select>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { setPagina(1); carregarVendas(); } }} placeholder="descrição / pedido / código" style={{ ...inp, width: 240 }} />
          <button onClick={() => { setPagina(1); carregarVendas(); }} disabled={carregando} style={btn(carregando)}>Buscar</button>
        </div>
        {vendas?.erro && <div style={{ color: '#dc2626', fontSize: 13 }}>{vendas.erro}</div>}
        {vendas?.resumo && (
          <div style={{ fontSize: 13, color: '#888', marginBottom: 10 }}>
            Total {vendas.resumo.total} · com CMC {vendas.resumo.comCmc} · sem CMC {vendas.resumo.semCmc} {vendas.filtrado ? `· filtrado ${vendas.filtrado}` : ''}
          </div>
        )}
        {vendas?.vendas && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Pedido', 'Data', 'Descrição', 'Código', 'Qtd', 'Unit.', 'Total', 'CMC'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {vendas.vendas.map((v, i) => (
                  <tr key={i}>
                    <td style={td}>{v.numero_pedido}</td>
                    <td style={td}>{v.data_pedido}</td>
                    <td style={td}>{v.descricao}</td>
                    <td style={td}>{v.codigo_produto}</td>
                    <td style={td}>{v.quantidade}</td>
                    <td style={td}>{fmtRS(v.valor_unitario)}</td>
                    <td style={td}>{fmtRS(v.valor_total)}</td>
                    <td style={{ ...td, color: v.cmc_unitario ? '#16a34a' : '#dc2626' }}>{v.cmc_unitario ? fmtRS(v.cmc_unitario) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {vendas?.vendas && (
          <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center' }}>
            <button onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pagina <= 1} style={btn(pagina <= 1)}>← Anterior</button>
            <span style={{ fontSize: 13, color: '#888' }}>pág {pagina}</span>
            <button onClick={() => setPagina((p) => p + 1)} style={btn()}>Próxima →</button>
          </div>
        )}
      </div>
      {!requireConta && <div style={{ fontSize: '.7rem', color: '#bbb', marginTop: 10 }}>Selecione NOVA ou CASTRO para operar.</div>}
    </div>
  );
}
