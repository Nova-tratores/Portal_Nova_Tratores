'use client';
// Inventario rotativo (curva ABC) - dashboard. Portado de inventario.ejs + public/inventario.js.
// CROSS-CONTA (global, por SKU) - NAO usa ContaSelector. Consome /api/ajustes/inventario/*.
// Padrao worker-ready: dispara POST /recalcular e faz POLLING de GET /recalcular/status a cada 3s.
import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';

// ---------- tipos do payload ----------
interface Produto {
  sku: string;
  descricao_produto?: string | null;
  classe_abc?: string | null;
  valor_consumo?: number | null;
  frequencia_dias?: number | null;
  frequencia_manual?: boolean;
  proxima_contagem?: string | null;
  ultima_contagem?: string | null;
  saldo_total?: number | null;
  ativo?: boolean;
  incluido_manual?: boolean;
}
interface ProdutosResp {
  produtos?: Produto[];
  resumo?: { A?: number; B?: number; C?: number; total?: number };
  erro?: string;
}
interface Ciclo {
  id: number | string;
  referencia?: string | null;
  tipo?: string | null;
  status?: string | null;
  capacidade?: number | null;
  criado_em?: string | null;
  criado_por?: string | null;
  fechado_em?: string | null;
}
interface Tarefa {
  id: number | string;
  ciclo_id: number | string;
  sku: string;
  descricao_produto?: string | null;
  classe_abc?: string | null;
  status?: string | null;
  freeze_em?: string | null;
  criado_em?: string | null;
}
interface RecalcResultado {
  totalSku?: number;
  porClasse?: { A?: number; B?: number; C?: number };
  janela?: { de?: string; ate?: string };
  frequencias?: { A?: number; B?: number; C?: number };
  capacidade?: number;
  tolerancia?: Record<string, number> | number | null;
}
interface RecalcStatus {
  rodando?: boolean;
  etapa?: string;
  inicio?: string;
  fim?: string;
  erro?: string;
  resultado?: RecalcResultado | null;
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
function isoToBR(iso?: string | null): string {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}
function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const thStyle: React.CSSProperties = { background: '#f8fafc', color: '#475569', fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.4px', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f1f5f9', color: '#334155', fontSize: '.82rem' };

const CLASSE_BG: Record<string, { bg: string; fg: string }> = {
  A: { bg: '#ffe4e6', fg: '#be123c' },
  B: { bg: '#fef3c7', fg: '#b45309' },
  C: { bg: '#f1f5f9', fg: '#475569' },
};
function BadgeClasse({ c }: { c?: string | null }) {
  if (!c) return <span style={{ color: '#94a3b8' }}>-</span>;
  const s = CLASSE_BG[c] || { bg: '#f1f5f9', fg: '#475569' };
  return <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: 4, fontSize: '.68rem', fontWeight: 600, background: s.bg, color: s.fg }}>{c}</span>;
}

export default function InventarioPage() {
  const { userProfile } = useAuth();
  const { temAcesso, loading: permLoading } = usePermissoes(userProfile?.id);
  const criadoPor = userProfile?.nome || 'portal';

  // recalculo (worker-ready)
  const [rodando, setRodando] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [resultado, setResultado] = useState<RecalcResultado | null>(null);

  // produtos
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [resumo, setResumo] = useState<{ A?: number; B?: number; C?: number; total?: number }>({});
  const [busca, setBusca] = useState('');
  const [filtroClasse, setFiltroClasse] = useState('');
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [carregandoProd, setCarregandoProd] = useState(false);
  const [erroProd, setErroProd] = useState('');

  // ciclos / tarefas
  const [ciclos, setCiclos] = useState<Ciclo[]>([]);
  const [tarefasPorCiclo, setTarefasPorCiclo] = useState<Record<string, number>>({});
  const [cicloAberto, setCicloAberto] = useState<string | null>(null);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [carregandoTarefas, setCarregandoTarefas] = useState(false);

  // gerar ciclo
  const [capacidade, setCapacidade] = useState('');
  const [gerando, setGerando] = useState(false);

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buscaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; }
  }, []);

  // ---- Produtos -------------------------------------------------------------
  const carregarProdutos = useCallback(async () => {
    setCarregandoProd(true);
    setErroProd('');
    try {
      const p: string[] = [];
      if (filtroClasse) p.push('classe=' + filtroClasse);
      const b = busca.trim();
      if (b) p.push('busca=' + encodeURIComponent(b));
      if (!mostrarInativos) p.push('ativo=1');
      const r = await fetch('/api/ajustes/inventario/produtos' + (p.length ? '?' + p.join('&') : ''));
      const d = (await r.json()) as ProdutosResp;
      if (d.erro) { setErroProd(d.erro); setProdutos([]); return; }
      setProdutos(d.produtos || []);
      setResumo(d.resumo || {});
    } catch (ex) {
      setErroProd('erro de rede: ' + (ex as Error).message);
    } finally {
      setCarregandoProd(false);
    }
  }, [filtroClasse, busca, mostrarInativos]);

  // ---- Ciclos ---------------------------------------------------------------
  const carregarCiclos = useCallback(async () => {
    try {
      const [rc, rt] = await Promise.all([
        fetch('/api/ajustes/inventario/ciclos').then((r) => r.json()),
        fetch('/api/ajustes/inventario/tarefas').then((r) => r.json()),
      ]);
      const cs: Ciclo[] = rc.ciclos || [];
      const ts: Tarefa[] = rt.tarefas || [];
      const porCiclo: Record<string, number> = {};
      ts.forEach((t) => { const k = String(t.ciclo_id); porCiclo[k] = (porCiclo[k] || 0) + 1; });
      setCiclos(cs);
      setTarefasPorCiclo(porCiclo);
    } catch {
      // silencioso
    }
  }, []);

  const abrirTarefas = useCallback(async (cicloId: string) => {
    setCicloAberto(cicloId);
    setCarregandoTarefas(true);
    setTarefas([]);
    try {
      const r = await fetch('/api/ajustes/inventario/tarefas?ciclo=' + encodeURIComponent(cicloId));
      const d = await r.json();
      setTarefas(d.tarefas || []);
    } catch {
      setTarefas([]);
    } finally {
      setCarregandoTarefas(false);
    }
  }, []);

  // ---- Recalculo (worker-ready) ---------------------------------------------
  const pollStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/ajustes/inventario/recalcular/status');
      const st = (await r.json()) as RecalcStatus;
      if (st && st.rodando) {
        setRodando(true);
        setStatusMsg('recalculando... ' + (st.etapa || '') + (st.inicio ? ` (desde ${new Date(st.inicio).toLocaleTimeString('pt-BR')})` : ''));
        pollRef.current = setTimeout(pollStatus, 3000);
        return;
      }
      setRodando(false);
      if (st && st.erro) { setStatusMsg('Erro: ' + st.erro); return; }
      if (st && st.resultado) {
        const res = st.resultado;
        const pc = res.porClasse || {};
        setResultado(res);
        setStatusMsg(`Curva recalculada · ${fmtNum(res.totalSku)} SKUs (A:${pc.A ?? 0} B:${pc.B ?? 0} C:${pc.C ?? 0})${res.janela ? ` · janela ${res.janela.de || '?'} a ${res.janela.ate || '?'}` : ''}`);
      }
      carregarProdutos();
      carregarCiclos();
    } catch (ex) {
      setStatusMsg('erro de rede: ' + (ex as Error).message);
      pollRef.current = setTimeout(pollStatus, 5000);
    }
  }, [carregarProdutos, carregarCiclos]);

  const recalcular = useCallback(async () => {
    if (!confirm('Recalcular a curva ABC?\n\nIsso varre as DUAS contas (NF de saida + posicao de estoque) e demora bastante. Rode esporadicamente (ex.: 1x/mes).')) return;
    stopPoll();
    setRodando(true);
    setResultado(null);
    setStatusMsg('iniciando recalculo das duas contas...');
    try {
      const r = await fetch('/api/ajustes/inventario/recalcular', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ criadoPor }),
      });
      const d = await r.json();
      if (d && d.erro) { setStatusMsg(d.erro); setRodando(false); return; }
      pollRef.current = setTimeout(pollStatus, 3000);
    } catch (ex) {
      setStatusMsg('erro de rede: ' + (ex as Error).message);
      setRodando(false);
    }
  }, [criadoPor, pollStatus, stopPoll]);

  // ---- Gerar ciclo ----------------------------------------------------------
  const gerarCiclo = useCallback(async () => {
    if (!confirm('Gerar um ciclo de contagem agora? O freeze dos saldos roda em background.')) return;
    const cap = parseInt(capacidade, 10);
    setGerando(true);
    setStatusMsg('gerando ciclo + congelando saldos...');
    try {
      const r = await fetch('/api/ajustes/inventario/gerar-ciclo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ capacidade: isNaN(cap) ? undefined : cap, criadoPor }),
      });
      const d = await r.json();
      if (!d.ok) { setStatusMsg(d.erro || 'falha ao gerar ciclo'); return; }
      if (d.criadas === 0) { setStatusMsg(`Nenhuma contagem vencida para gerar (vencidos: ${fmtNum(d.totalVencidos)}).`); }
      else {
        const pc = d.porClasse || {};
        setStatusMsg(`Ciclo #${d.cicloId} criado · ${fmtNum(d.criadas)} tarefas (A:${pc.A ?? 0} B:${pc.B ?? 0} C:${pc.C ?? 0}) · congelando saldos em background...`);
      }
      await carregarCiclos();
      if (d.cicloId != null) abrirTarefas(String(d.cicloId));
    } catch (ex) {
      setStatusMsg('erro de rede: ' + (ex as Error).message);
    } finally {
      setGerando(false);
    }
  }, [capacidade, criadoPor, carregarCiclos, abrirTarefas]);

  // ---- Curadoria / frequencia ----------------------------------------------
  const toggleCuradoria = useCallback(async (sku: string, ativo: boolean) => {
    // otimista
    setProdutos((s) => s.map((p) => (p.sku === sku ? { ...p, ativo } : p)));
    try {
      const r = await fetch('/api/ajustes/inventario/curadoria', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku, ativo }),
      });
      const d = await r.json();
      if (!d.ok) { alert('Erro: ' + (d.erro || 'falha')); }
    } catch (ex) {
      alert('erro de rede: ' + (ex as Error).message);
    } finally {
      carregarProdutos();
    }
  }, [carregarProdutos]);

  const editarFrequencia = useCallback(async (sku: string, atual?: number | null) => {
    const v = prompt(`Frequencia de contagem (em dias) para o SKU ${sku}:`, atual != null ? String(atual) : '');
    if (v == null) return;
    const dias = parseInt(v, 10);
    if (!(dias > 0)) { alert('informe um numero de dias > 0'); return; }
    try {
      const r = await fetch('/api/ajustes/inventario/frequencia', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku, dias }),
      });
      const resp = await r.json();
      if (!resp.ok) { alert('Erro: ' + (resp.erro || 'falha')); return; }
      setStatusMsg(`frequencia do SKU ${sku} = ${dias}d (manual)`);
      carregarProdutos();
    } catch (ex) {
      alert('erro de rede: ' + (ex as Error).message);
    }
  }, [carregarProdutos]);

  // ---- Boot -----------------------------------------------------------------
  useEffect(() => {
    carregarProdutos();
    carregarCiclos();
    // checa se ja existe recalculo rodando
    fetch('/api/ajustes/inventario/recalcular/status')
      .then((r) => r.json())
      .then((st: RecalcStatus) => { if (st && st.rodando) { setRodando(true); pollRef.current = setTimeout(pollStatus, 3000); } else if (st && st.resultado) { setResultado(st.resultado); } })
      .catch(() => {});
    return () => stopPoll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // recarrega produtos ao mudar filtro/inativos
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { carregarProdutos(); }, [filtroClasse, mostrarInativos]);

  // busca com debounce
  const onBusca = useCallback((v: string) => {
    setBusca(v);
    if (buscaTimer.current) clearTimeout(buscaTimer.current);
    buscaTimer.current = setTimeout(() => carregarProdutos(), 350);
  }, [carregarProdutos]);

  if (!permLoading && userProfile && !temAcesso('ajustes')) return <SemPermissao />;

  const hoje = hojeISO();
  const vencidos = produtos.filter((p) => p.ativo && p.proxima_contagem && String(p.proxima_contagem) <= hoje).length;
  const freq = resultado?.frequencias;

  return (
    <div style={{ maxWidth: 1300, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Inventario rotativo (curva ABC)</h1>
          <p style={{ color: '#64748b', fontSize: '.82rem', maxWidth: 820 }}>
            Inventario <b>global</b>: o estoque fisico e&apos; unico, compartilhado por <b>NOVA + CASTRO</b>. Cada produto e&apos; identificado pelo <b>codigo da peca (SKU)</b> e a contagem fisica e&apos; conferida contra a <b>soma</b> dos saldos das duas contas. A contagem em si fica na aba <Link href="/ajustes/inventario/contagem" style={{ color: '#2563eb', textDecoration: 'underline' }}>Contagem</Link>.
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={recalcular} disabled={rodando} style={{ padding: '7px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: rodando ? 'wait' : 'pointer', opacity: rodando ? 0.5 : 1 }}>Recalcular curva ABC</button>
          <button onClick={() => { carregarProdutos(); carregarCiclos(); }} style={{ padding: '7px 14px', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: 'pointer' }}>Atualizar</button>
        </div>
      </div>

      <div style={{ margin: '6px 0 14px', display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '.8rem' }}>
        <Link href="/ajustes" style={{ color: '#dc2626', textDecoration: 'none', fontWeight: 600 }}>← Ajustes</Link>
        <Link href="/ajustes/inventario/contagem" style={{ color: '#dc2626', textDecoration: 'none', fontWeight: 600 }}>→ Contagem</Link>
        <Link href="/ajustes/relatorio-contagem" style={{ color: '#dc2626', textDecoration: 'none', fontWeight: 600 }}>→ Relatorio de contagem</Link>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: '.72rem' }}>
        <span style={{ padding: '3px 8px', borderRadius: 6, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>⚠ O recalculo varre as DUAS contas (NF de saida + posicao de estoque) — demora bastante. Rode esporadicamente (ex.: 1x/mes).</span>
        {freq && (
          <span style={{ padding: '3px 8px', borderRadius: 6, background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#475569' }}>Frequencias: A={fmtNum(freq.A)}d · B={fmtNum(freq.B)}d · C={fmtNum(freq.C)}d</span>
        )}
        {resultado?.capacidade != null && (
          <span style={{ padding: '3px 8px', borderRadius: 6, background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#475569' }}>Capacidade/dia: {fmtNum(resultado.capacidade)}</span>
        )}
        {resultado?.tolerancia != null && typeof resultado.tolerancia !== 'number' && (
          <span style={{ padding: '3px 8px', borderRadius: 6, background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#475569' }}>Tolerancia: {Object.entries(resultado.tolerancia).map(([k, v]) => `${k}=${v}`).join(' · ')}</span>
        )}
        {resultado?.tolerancia != null && typeof resultado.tolerancia === 'number' && (
          <span style={{ padding: '3px 8px', borderRadius: 6, background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#475569' }}>Tolerancia: {resultado.tolerancia}</span>
        )}
        <span style={{ marginLeft: 'auto', color: '#64748b' }}>{rodando ? `⏳ ${statusMsg}` : statusMsg}</span>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
        <Kpi label="SKUs no inventario" valor={fmtNum(resumo.total ?? produtos.length)} />
        <Kpi label="Classe A" valor={fmtNum(resumo.A)} cor="#be123c" />
        <Kpi label="Classe B" valor={fmtNum(resumo.B)} cor="#b45309" />
        <Kpi label="Classe C" valor={fmtNum(resumo.C)} cor="#475569" />
        <Kpi label="Contagens vencidas" valor={fmtNum(vencidos)} cor="#2563eb" />
      </div>

      {/* Ciclos */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 24 }}>
        <div style={{ borderBottom: '1px solid #e2e8f0', padding: '12px 16px', display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ fontWeight: 600, color: '#1e293b', fontSize: '.95rem', margin: 0 }}>Ciclos</h2>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <label style={{ fontSize: '.7rem', color: '#64748b' }}>Capacidade
              <input type="number" min="1" value={capacidade} onChange={(e) => setCapacidade(e.target.value)} placeholder="auto" style={{ display: 'block', width: 96, border: '1px solid #cbd5e1', borderRadius: 6, padding: '4px 8px', fontSize: '.82rem', marginTop: 2 }} />
            </label>
            <button onClick={gerarCiclo} disabled={gerando} title="Gera um ciclo manual agora (alem do automatico diario)" style={{ padding: '7px 14px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: gerando ? 'wait' : 'pointer', opacity: gerando ? 0.5 : 1 }}>Gerar ciclo agora</button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Ciclo</th>
                <th style={thStyle}>Referencia</th>
                <th style={thStyle}>Tipo</th>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Cap.</th>
                <th style={thStyle}>Criado em</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Tarefas</th>
              </tr>
            </thead>
            <tbody>
              {ciclos.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>Nenhum ciclo ainda. Recalcule a curva; o agendador gera 1 ciclo por dia util.</td></tr>
              ) : ciclos.map((c) => (
                <tr key={c.id} onClick={() => abrirTarefas(String(c.id))} style={{ borderTop: '1px solid #f1f5f9', cursor: 'pointer', background: String(c.id) === cicloAberto ? '#eff6ff' : undefined }}>
                  <td style={{ ...tdStyle, fontWeight: 600, color: '#2563eb' }}>#{c.id}</td>
                  <td style={tdStyle}>{c.referencia || '-'}</td>
                  <td style={tdStyle}>{c.tipo || '-'}</td>
                  <td style={tdStyle}>{c.status || '-'}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: '#64748b' }}>{c.capacidade != null ? c.capacidade : '-'}</td>
                  <td style={{ ...tdStyle, color: '#64748b' }}>{c.criado_em ? new Date(c.criado_em).toLocaleString('pt-BR') : '-'}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtNum(tarefasPorCiclo[String(c.id)] || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tarefas do ciclo selecionado */}
      {cicloAberto && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 24 }}>
          <div style={{ borderBottom: '1px solid #e2e8f0', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2 style={{ fontWeight: 600, color: '#1e293b', fontSize: '.95rem', margin: 0 }}>Tarefas do ciclo <span style={{ color: '#64748b' }}>#{cicloAberto}</span></h2>
            <button onClick={() => setCicloAberto(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#94a3b8', fontSize: '.82rem', cursor: 'pointer' }}>fechar</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Classe</th>
                  <th style={thStyle}>SKU</th>
                  <th style={thStyle}>Produto</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {carregandoTarefas ? (
                  <tr><td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>carregando...</td></tr>
                ) : tarefas.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>Sem tarefas.</td></tr>
                ) : tarefas.map((t) => (
                  <tr key={t.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={tdStyle}><BadgeClasse c={t.classe_abc} /></td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '.72rem' }}>{t.sku}</td>
                    <td style={tdStyle}>{t.descricao_produto || '(sem descricao)'}</td>
                    <td style={{ ...tdStyle, color: '#64748b' }}>{t.status || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Produtos */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }}>
        <div style={{ borderBottom: '1px solid #e2e8f0', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ fontWeight: 600, color: '#1e293b', fontSize: '.95rem', margin: 0 }}>Produtos do inventario</h2>
          <input type="text" value={busca} onChange={(e) => onBusca(e.target.value)} placeholder="buscar SKU ou descricao..." style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '5px 8px', fontSize: '.82rem', width: 256 }} />
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '.72rem', color: '#64748b', cursor: 'pointer' }} title="Inclui produtos removidos do inventario (ex.: maquinas) - aparecem esmaecidos">
            <input type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} /> Mostrar inativos
          </label>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: '.72rem' }}>
            <span style={{ color: '#64748b', marginRight: 4 }}>Classe:</span>
            {['', 'A', 'B', 'C'].map((cl) => (
              <button key={cl || 'todas'} onClick={() => setFiltroClasse(cl)} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: '.72rem', background: filtroClasse === cl ? '#cbd5e1' : '#f1f5f9', color: '#334155', fontWeight: filtroClasse === cl ? 600 : 400 }}>{cl || 'Todas'}</button>
            ))}
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Classe</th>
                <th style={thStyle}>SKU</th>
                <th style={thStyle}>Produto</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Valor consumo</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Saldo (NOVA+CASTRO)</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Freq. (d)</th>
                <th style={thStyle}>Proxima</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>No inventario</th>
              </tr>
            </thead>
            <tbody>
              {erroProd ? (
                <tr><td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: '#dc2626' }}>{erroProd}</td></tr>
              ) : carregandoProd && produtos.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Carregando…</td></tr>
              ) : produtos.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Nenhum produto. Clique em <b>Recalcular curva ABC</b> para classificar.</td></tr>
              ) : produtos.map((p) => {
                const vencido = !!(p.ativo && p.proxima_contagem && String(p.proxima_contagem) <= hoje);
                return (
                  <tr key={p.sku} style={{ borderTop: '1px solid #f1f5f9', opacity: p.ativo ? 1 : 0.5 }}>
                    <td style={tdStyle}><BadgeClasse c={p.classe_abc} /></td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '.72rem' }}>{p.sku}</td>
                    <td style={tdStyle}>
                      {p.descricao_produto || '(sem descricao)'}
                      {p.incluido_manual && <span style={{ marginLeft: 6, fontSize: '.62rem', padding: '1px 5px', borderRadius: 4, background: '#eff6ff', color: '#2563eb' }}>manual</span>}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtBRL(p.valor_consumo)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: Number(p.saldo_total) < 0 ? '#dc2626' : undefined, fontWeight: Number(p.saldo_total) < 0 ? 600 : undefined }}>{fmtNum(p.saldo_total, 2)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button onClick={() => editarFrequencia(p.sku, p.frequencia_dias)} title="editar frequencia" style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', textDecoration: 'underline', fontSize: '.82rem' }}>
                        {fmtNum(p.frequencia_dias)}{p.frequencia_manual ? <span style={{ color: '#2563eb' }} title="frequencia manual"> ✎</span> : ''}
                      </button>
                    </td>
                    <td style={{ ...tdStyle, color: vencido ? '#2563eb' : '#64748b', fontWeight: vencido ? 600 : undefined }}>{isoToBR(p.proxima_contagem)}{vencido ? ' · vencida' : ''}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <input type="checkbox" checked={!!p.ativo} onChange={(e) => toggleCuradoria(p.sku, e.target.checked)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, valor, cor }: { label: string; valor: string; cor?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
      <div style={{ fontSize: '.65rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.4px' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: 4, color: cor || '#1e293b' }}>{valor}</div>
    </div>
  );
}
