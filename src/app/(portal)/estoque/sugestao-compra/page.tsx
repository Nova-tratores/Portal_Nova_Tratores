'use client';
// Sugestão de Compra: lê o último snapshot noturno. Eixo = fornecedor; chips
// (AND) para recortar; seleção com soma no rodapé; painel de detalhe com a
// memória de cálculo (via /inspecao) e as barras de saída dos 12 meses.
import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { authHeaders } from '@/lib/auth/client';
import TabelaOrdenavel, { type ColunaDef } from '@/components/abastecimento/TabelaOrdenavel';

interface Item {
  sku: string; descricao?: string; marca?: string; familia?: string; tipo?: string;
  curva?: string; regime?: string; frequencia?: string; codigo_fornecedor?: number | null;
  codigo_produto_nova?: number | null; codigo_produto_castro?: number | null;
  estoque_nova?: number; estoque_castro?: number; estoque_atual?: number; em_transito?: number;
  minimo_efetivo?: number; estoque_seguranca?: number; demanda_45d?: number;
  prev_30?: number; prev_60?: number; prev_90?: number; qtd_sugerida?: number; valor_estimado?: number;
  alerta?: string; dias_ruptura_12m?: number; indice_sazonal_45d?: number; meses_com_saida_12m?: number;
  lead_time_usado?: number; nivel_servico?: number;
}
interface Forn { codigo_fornecedor: number | null; nome: string; n_itens: number }

const n = (v: unknown): number => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const brl = (v: number): string => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const tabBtn = (on: boolean): React.CSSProperties => ({ padding: '8px 16px', border: 'none', borderBottom: on ? '2px solid #0f766e' : '2px solid transparent', background: 'none', color: on ? '#0f766e' : '#888', fontWeight: 600, fontSize: '.85rem', cursor: 'pointer' });

const ALERTA: Record<string, { cor: string; bg: string; txt: string }> = {
  ja_era: { cor: '#991b1b', bg: '#fee2e2', txt: 'Já era' },
  critico: { cor: '#c2410c', bg: '#ffedd5', txt: 'Crítico' },
  atencao: { cor: '#a16207', bg: '#fef9c3', txt: 'Atenção' },
  ok: { cor: '#166534', bg: '#dcfce7', txt: 'OK' },
  nao_comprar: { cor: '#64748b', bg: '#f1f5f9', txt: 'Não comprar' },
};

const CHIPS: Array<{ key: string; label: string; test: (i: Item) => boolean }> = [
  { key: 'ja_era', label: 'Já era', test: (i) => i.alerta === 'ja_era' },
  { key: 'critico', label: 'Crítico', test: (i) => i.alerta === 'critico' },
  { key: 'atencao', label: 'Atenção', test: (i) => i.alerta === 'atencao' },
  { key: 'abaixo_min', label: 'Abaixo do mínimo', test: (i) => n(i.minimo_efetivo) > 0 && n(i.estoque_atual) + n(i.em_transito) < n(i.minimo_efetivo) },
  { key: 'zerado_dem', label: 'Zerado com demanda', test: (i) => n(i.estoque_atual) <= 0 && n(i.demanda_45d) > 0 },
  { key: 'sem_giro', label: 'Sem giro 12m', test: (i) => n(i.demanda_45d) === 0 && (n(i.estoque_nova) > 0 || n(i.estoque_castro) > 0) },
  { key: 'entrando_safra', label: 'Entrando na safra', test: (i) => n(i.indice_sazonal_45d) >= 1.15 },
  { key: 'saindo_safra', label: 'Saindo da safra', test: (i) => n(i.indice_sazonal_45d) > 0 && n(i.indice_sazonal_45d) <= 0.85 },
  { key: 'outro_patio', label: 'Tem no outro pátio', test: (i) => (n(i.estoque_nova) <= 0 && n(i.estoque_castro) > 0) || (n(i.estoque_castro) <= 0 && n(i.estoque_nova) > 0) },
  { key: 'sem_tipo', label: 'Sem tipo', test: (i) => !i.tipo || i.tipo === 'Sem tipo' },
];

export default function SugestaoCompraPage() {
  const { userProfile } = useAuth();
  const { pode, loading: permLoading } = usePermissoes(userProfile?.id);

  const [view, setView] = useState<'sugestoes' | 'pedidos'>('sugestoes');
  const [itens, setItens] = useState<Item[]>([]);
  const [forns, setForns] = useState<Forn[]>([]);
  const [geradoEm, setGeradoEm] = useState<string | null>(null);
  const [snapshotId, setSnapshotId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [fornSel, setFornSel] = useState<string>('*'); // '*' = todos, '' = não definido, ou id
  const [chipsOn, setChipsOn] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [detalhe, setDetalhe] = useState<{ sku: string; curva?: string } | null>(null);
  const [contaPedido, setContaPedido] = useState<'nova' | 'castro'>('nova');
  const [gerando, setGerando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; tipo: 'ok' | 'err' } | null>(null);

  useEffect(() => {
    (async () => {
      setCarregando(true);
      try {
        const r = await fetch('/api/estoque/sugestao-compra', { headers: await authHeaders() });
        const d = await r.json();
        if (d.erro) { setCarregando(false); return; }
        setItens(d.itens || []); setForns(d.fornecedores || []);
        setGeradoEm(d.snapshot?.gerado_em ?? null); setSnapshotId(d.snapshot?.id ?? null);
      } finally { setCarregando(false); }
    })();
  }, []);

  const gerarPedido = useCallback(async () => {
    const escolhidos = itens.filter((i) => sel.has(i.sku));
    const linhas = escolhidos.map((i) => {
      const cp = contaPedido === 'nova' ? i.codigo_produto_nova : i.codigo_produto_castro;
      const q = n(i.qtd_sugerida);
      const precoUnit = q > 0 ? n(i.valor_estimado) / q : 0;
      return cp != null ? { codigo_produto: cp, qtd_sugerida: q, qtd_pedida: q, preco_estimado: precoUnit } : null;
    }).filter((x): x is NonNullable<typeof x> => !!x);
    const foraDaConta = escolhidos.length - linhas.length;
    if (linhas.length === 0) { setMsg({ texto: `Nenhum item selecionado existe na conta ${contaPedido.toUpperCase()}.`, tipo: 'err' }); return; }
    setGerando(true);
    try {
      const codForn = fornSel !== '*' && fornSel !== '' ? Number(fornSel) : null;
      const r = await fetch('/api/estoque/pedido-compra', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ conta: contaPedido, codigo_fornecedor: codForn, snapshot_id: snapshotId, itens: linhas }),
      });
      const d = await r.json();
      if (d.erro) { setMsg({ texto: d.erro, tipo: 'err' }); return; }
      setMsg({ texto: `Pedido #${d.id} criado (${d.itens} itens${foraDaConta ? `, ${foraDaConta} ignorados por não existir na conta` : ''}).`, tipo: 'ok' });
      setSel(new Set()); setView('pedidos');
    } finally { setGerando(false); }
  }, [itens, sel, contaPedido, fornSel, snapshotId]);

  // recorte por fornecedor
  const porForn = useMemo(() => {
    if (fornSel === '*') return itens;
    if (fornSel === '') return itens.filter((i) => i.codigo_fornecedor == null);
    return itens.filter((i) => String(i.codigo_fornecedor) === fornSel);
  }, [itens, fornSel]);

  // contagem de cada chip DENTRO do recorte por fornecedor
  const contagemChips = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of CHIPS) m[c.key] = porForn.filter(c.test).length;
    return m;
  }, [porForn]);

  // aplica chips (AND)
  const filtradas = useMemo(() => {
    if (chipsOn.size === 0) return porForn;
    const ativos = CHIPS.filter((c) => chipsOn.has(c.key));
    return porForn.filter((i) => ativos.every((c) => c.test(i)));
  }, [porForn, chipsOn]);

  const toggleChip = (k: string) => setChipsOn((s) => { const x = new Set(s); x.has(k) ? x.delete(k) : x.add(k); return x; });
  const toggleSel = useCallback((sku: string) => setSel((s) => { const x = new Set(s); x.has(sku) ? x.delete(sku) : x.add(sku); return x; }), []);

  const totalSel = useMemo(() => {
    let q = 0, v = 0;
    for (const i of filtradas) if (sel.has(i.sku)) { q += n(i.qtd_sugerida); v += n(i.valor_estimado); }
    return { itens: sel.size, qtd: q, valor: v };
  }, [filtradas, sel]);

  const colunas: ColunaDef<Item>[] = useMemo(() => [
    { chave: 'sel', titulo: '', valor: (i) => (sel.has(i.sku) ? 1 : 0), render: (i) => <input type="checkbox" checked={sel.has(i.sku)} onChange={() => toggleSel(i.sku)} /> },
    { chave: 'sku', titulo: 'SKU', valor: (i) => i.sku, render: (i) => <span style={{ fontFamily: 'monospace', fontSize: '.72rem' }}>{i.sku}</span> },
    { chave: 'descricao', titulo: 'Descrição', valor: (i) => i.descricao ?? '', render: (i) => <span title={i.descricao}>{(i.descricao || '').slice(0, 42)}</span> },
    { chave: 'tipo', titulo: 'Tipo', valor: (i) => i.tipo ?? '', render: (i) => i.tipo || '—' },
    { chave: 'curva', titulo: 'Curva', valor: (i) => i.curva ?? '', render: (i) => <b>{i.curva}</b> },
    { chave: 'regime', titulo: 'Regime', valor: (i) => i.regime ?? '', render: (i) => <span style={{ fontSize: '.68rem', color: '#888' }}>{i.regime}</span> },
    { chave: 'estoque', titulo: 'Estoque', direita: true, valor: (i) => n(i.estoque_atual), render: (i) => <span title={`nova ${n(i.estoque_nova)} · castro ${n(i.estoque_castro)}`}>{n(i.estoque_atual)}</span> },
    { chave: 'transito', titulo: 'Trânsito', direita: true, valor: (i) => n(i.em_transito), render: (i) => n(i.em_transito) || '—' },
    { chave: 'minimo', titulo: 'Mínimo', direita: true, valor: (i) => n(i.minimo_efetivo), render: (i) => Math.round(n(i.minimo_efetivo)) },
    { chave: 'prev', titulo: 'Prev 30·60·90', direita: true, valor: (i) => n(i.prev_30), render: (i) => <span style={{ fontSize: '.7rem' }}>{Math.round(n(i.prev_30))}·{Math.round(n(i.prev_60))}·{Math.round(n(i.prev_90))}</span> },
    { chave: 'sugestao', titulo: 'Sugestão', direita: true, valor: (i) => n(i.qtd_sugerida), render: (i) => <b style={{ color: n(i.qtd_sugerida) > 0 ? '#0f766e' : '#bbb' }}>{n(i.qtd_sugerida)}</b> },
    { chave: 'valor', titulo: 'Valor est.', direita: true, valor: (i) => n(i.valor_estimado), render: (i) => brl(n(i.valor_estimado)) },
    { chave: 'alerta', titulo: 'Alerta', valor: (i) => i.alerta ?? '', render: (i) => { const a = ALERTA[i.alerta || 'nao_comprar'] || ALERTA.nao_comprar; return <span style={{ padding: '2px 7px', borderRadius: 10, fontSize: '.66rem', fontWeight: 600, background: a.bg, color: a.cor }}>{a.txt}</span>; } },
    { chave: 'det', titulo: '', valor: () => '', render: (i) => <button onClick={() => setDetalhe({ sku: i.sku, curva: i.curva })} style={{ padding: '3px 8px', background: '#fff', color: '#0f766e', border: '1px solid #0f766e', borderRadius: 6, cursor: 'pointer', fontSize: '.7rem', fontWeight: 600 }}>ver</button> },
  ], [sel, toggleSel]);

  if (!permLoading && userProfile && !pode('estoque', 'sugestao-compra')) return <SemPermissao />;

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: '#333', marginBottom: 4, fontSize: '1.4rem', fontWeight: 700 }}>Sugestão de Compra</h1>
          <p style={{ color: '#888', fontSize: '.82rem' }}>Reposição de peças calculada — consolidada NOVA + CASTRO. {geradoEm ? `Snapshot de ${new Date(geradoEm).toLocaleString('pt-BR')}.` : ''}</p>
        </div>
        {pode('estoque', 'config-compras') && <Link href="/estoque/config-compras" style={{ color: '#0f766e', textDecoration: 'none', fontSize: '.82rem', fontWeight: 600 }}>⚙ Config. de Compras</Link>}
      </div>

      {/* abas */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #eee', margin: '14px 0 12px' }}>
        <button onClick={() => setView('sugestoes')} style={tabBtn(view === 'sugestoes')}>Sugestões</button>
        <button onClick={() => setView('pedidos')} style={tabBtn(view === 'pedidos')}>Pedidos abertos</button>
      </div>

      {msg && <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: '.82rem', background: msg.tipo === 'ok' ? '#dcfce7' : '#fee2e2', color: msg.tipo === 'ok' ? '#166534' : '#991b1b' }}>{msg.texto}</div>}

      {view === 'pedidos' && <AbaPedidos />}

      {view === 'sugestoes' && <>
      {/* eixo fornecedor */}
      <div style={{ margin: '14px 0 10px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '.72rem', fontWeight: 600, color: '#888', textTransform: 'uppercase' }}>Fornecedor</label>
        <select value={fornSel} onChange={(e) => { setFornSel(e.target.value); setSel(new Set()); }} style={{ padding: '7px 10px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, minWidth: 240 }}>
          <option value="*">Todos ({itens.length})</option>
          {forns.map((f) => <option key={String(f.codigo_fornecedor)} value={f.codigo_fornecedor == null ? '' : String(f.codigo_fornecedor)}>{f.nome} ({f.n_itens})</option>)}
        </select>
        {forns.length <= 1 && <span style={{ fontSize: '.72rem', color: '#b45309' }}>⚠ fornecedores ainda não atribuídos — defina em Config. de Compras.</span>}
      </div>

      {/* chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {CHIPS.map((c) => {
          const on = chipsOn.has(c.key); const q = contagemChips[c.key] || 0;
          return (
            <button key={c.key} onClick={() => toggleChip(c.key)} style={{
              padding: '5px 11px', borderRadius: 16, fontSize: '.74rem', fontWeight: 600, cursor: 'pointer',
              border: on ? '1px solid #0f766e' : '1px solid #e2e2e2', background: on ? '#0f766e' : '#fff', color: on ? '#fff' : (q ? '#444' : '#bbb'),
            }}>{c.label} <span style={{ opacity: .8 }}>{q}</span></button>
          );
        })}
        {chipsOn.size > 0 && <button onClick={() => setChipsOn(new Set())} style={{ padding: '5px 11px', borderRadius: 16, fontSize: '.74rem', border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer' }}>limpar</button>}
      </div>

      <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 14, boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
        <TabelaOrdenavel<Item> colunas={colunas} linhas={filtradas} chaveLinha={(i) => i.sku} carregando={carregando} />
      </div>

      {/* rodapé de seleção */}
      {totalSel.itens > 0 && (
        <div style={{ position: 'sticky', bottom: 0, marginTop: 12, background: '#0f766e', color: '#fff', borderRadius: 10, padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontSize: '.85rem', fontWeight: 600 }}>{totalSel.itens} itens · {totalSel.qtd} un · {brl(totalSel.valor)}</span>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '.75rem', opacity: .9 }}>Comprar pela conta</span>
            <select value={contaPedido} onChange={(e) => setContaPedido(e.target.value as 'nova' | 'castro')} style={{ padding: '5px 8px', borderRadius: 6, border: 'none', fontSize: 13 }}>
              <option value="nova">NOVA</option>
              <option value="castro">CASTRO</option>
            </select>
            <button onClick={gerarPedido} disabled={gerando} style={{ padding: '8px 16px', background: '#fff', color: '#0f766e', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '.82rem', cursor: gerando ? 'wait' : 'pointer' }}>{gerando ? 'Gerando…' : 'Gerar pedido'}</button>
          </div>
        </div>
      )}
      </>}

      {detalhe && <PainelDetalhe sku={detalhe.sku} curva={detalhe.curva} onFechar={() => setDetalhe(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
interface Inspecao {
  sku: string; consolidado?: { memoria?: Array<{ rotulo: string; valor: string | number; origem?: string }>; qtd_sugerida?: number; alerta?: string };
  por_conta?: Record<string, { serie12m?: Array<{ ano: number; mes: number; demanda: number; diasNoMes: number; diasComSaldoPositivo: number }>; tipo?: string; estoque?: number; cmd_diario?: number; demanda_45d?: number; indice_sazonal_aplicavel?: boolean }>;
}

function PainelDetalhe({ sku, curva, onFechar }: { sku: string; curva?: string; onFechar: () => void }) {
  const [dados, setDados] = useState<Inspecao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const qc = curva ? `&curva=${encodeURIComponent(curva)}` : '';
        const r = await fetch(`/api/estoque/sugestao-compra/inspecao?sku=${encodeURIComponent(sku)}${qc}`, { headers: await authHeaders() });
        const d = await r.json();
        if (d.erro) setErro(d.erro); else setDados(d);
      } catch (e) { setErro((e as Error).message); }
    })();
  }, [sku, curva]);

  return (
    <div onClick={onFechar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(560px, 96vw)', height: '100%', background: '#fff', overflowY: 'auto', padding: 20, boxShadow: '-4px 0 20px rgba(0,0,0,.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#333', fontFamily: 'monospace' }}>{sku}</h2>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#888' }}>×</button>
        </div>
        {erro && <div style={{ color: '#991b1b', fontSize: '.82rem' }}>{erro}</div>}
        {!dados && !erro && <div style={{ color: '#888', fontSize: '.82rem' }}>Calculando ao vivo…</div>}
        {dados && (
          <>
            {Object.entries(dados.por_conta || {}).map(([conta, pc]) => (
              <div key={conta} style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: '.8rem', fontWeight: 700, color: '#0f766e', textTransform: 'uppercase', marginBottom: 6 }}>{conta} · {pc.tipo} {pc.indice_sazonal_aplicavel && <span style={{ color: '#b45309', fontSize: '.7rem' }}>· sazonal</span>}</h3>
                <div style={{ fontSize: '.75rem', color: '#666', marginBottom: 6 }}>estoque {n(pc.estoque)} · cmd {pc.cmd_diario}/dia · demanda 45d {pc.demanda_45d}</div>
                <BarrasSaida serie={pc.serie12m || []} />
              </div>
            ))}
            <h3 style={{ fontSize: '.8rem', fontWeight: 700, color: '#333', margin: '14px 0 6px' }}>Memória de cálculo (consolidado)</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {(dados.consolidado?.memoria || []).map((m, k) => (
                  <tr key={k}>
                    <td style={{ padding: '4px 6px', fontSize: '.76rem', color: '#666', borderBottom: '1px solid #f5f5f5' }}>{m.rotulo}{m.origem && <span style={{ color: '#aaa' }}> · {m.origem}</span>}</td>
                    <td style={{ padding: '4px 6px', fontSize: '.78rem', color: '#333', fontWeight: 600, textAlign: 'right', borderBottom: '1px solid #f5f5f5' }}>{m.valor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 10, padding: 10, background: '#f0fdfa', borderRadius: 8, fontSize: '.82rem', color: '#0f766e', fontWeight: 700 }}>Sugestão: {dados.consolidado?.qtd_sugerida ?? '—'} un · {dados.consolidado?.alerta}</div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
interface Pedido { id: number; conta_omie: string; status: string; data_pedido?: string; fornecedor: string; n_itens: number; qtd_pedida: number; qtd_recebida: number; dias_aberto: number }

function AbaPedidos() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [receberId, setReceberId] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch('/api/estoque/pedido-compra', { headers: await authHeaders() });
      const d = await r.json();
      setPedidos(d.pedidos || []);
    } finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const abrirPDF = async (id: number) => {
    const r = await fetch(`/api/estoque/pedido-compra/${id}/pdf`, { headers: await authHeaders() });
    if (!r.ok) return;
    const blob = await r.blob();
    window.open(URL.createObjectURL(blob), '_blank');
  };

  const th: React.CSSProperties = { background: '#fafafa', color: '#888', fontSize: '.64rem', textTransform: 'uppercase', padding: 9, textAlign: 'left', borderBottom: '1px solid #eee', fontWeight: 600 };
  const td: React.CSSProperties = { padding: 9, borderBottom: '1px solid #f5f5f5', fontSize: '.8rem', color: '#444' };
  return (
    <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 14, boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
      {carregando ? <div style={{ color: '#888', fontSize: '.82rem', padding: 10 }}>Carregando…</div>
        : pedidos.length === 0 ? <div style={{ color: '#bbb', fontSize: '.82rem', padding: 10 }}>Nenhum pedido aberto. Gere um a partir das Sugestões.</div>
          : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Pedido', 'Conta', 'Fornecedor', 'Data', 'Itens', 'Pedida × Recebida', 'Dias', 'Status', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {pedidos.map((p) => (
                  <tr key={p.id}>
                    <td style={{ ...td, fontWeight: 700 }}>#{p.id}</td>
                    <td style={td}>{String(p.conta_omie).toUpperCase()}</td>
                    <td style={td}>{p.fornecedor}</td>
                    <td style={td}>{p.data_pedido ? new Date(p.data_pedido).toLocaleDateString('pt-BR') : '—'}</td>
                    <td style={td}>{p.n_itens}</td>
                    <td style={td}>{p.qtd_pedida} × {p.qtd_recebida}</td>
                    <td style={td}>{p.dias_aberto}{p.dias_aberto > 60 && <span title="aberto há mais de 60 dias" style={{ marginLeft: 4, color: '#dc2626', fontWeight: 700 }}>!</span>}</td>
                    <td style={td}><span style={{ fontSize: '.68rem', padding: '2px 7px', borderRadius: 10, background: '#f1f5f9', color: '#475569' }}>{p.status}</span></td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      <button onClick={() => abrirPDF(p.id)} style={{ padding: '4px 10px', background: '#fff', color: '#0f766e', border: '1px solid #0f766e', borderRadius: 6, cursor: 'pointer', fontSize: '.72rem', fontWeight: 600, marginRight: 6 }}>PDF</button>
                      {p.status !== 'concluido' && <button onClick={() => setReceberId(p.id)} style={{ padding: '4px 10px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '.72rem', fontWeight: 600 }}>Receber</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>}
      {receberId && <ModalReceber pedidoId={receberId} onFechar={() => setReceberId(null)} onRecebido={() => { setReceberId(null); setCarregando(true); carregar(); }} />}
    </div>
  );
}

interface ItemPedido { id: number; sku: string; descricao: string; qtd_pedida: number; qtd_recebida: number; status_linha: string }

function ModalReceber({ pedidoId, onFechar, onRecebido }: { pedidoId: number; onFechar: () => void; onRecebido: () => void }) {
  const [itens, setItens] = useState<ItemPedido[]>([]);
  const [receb, setReceb] = useState<Record<number, string>>({});
  const [data, setData] = useState<string>(new Date().toISOString().slice(0, 10));
  const [nf, setNf] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/estoque/pedido-compra/${pedidoId}`, { headers: await authHeaders() });
      const d = await r.json();
      if (d.erro) { setErro(d.erro); return; }
      setItens(d.itens || []);
      // default: quantidade restante por item
      const init: Record<number, string> = {};
      for (const it of d.itens || []) { const resta = n(it.qtd_pedida) - n(it.qtd_recebida); if (resta > 0) init[it.id] = String(resta); }
      setReceb(init);
    })();
  }, [pedidoId]);

  const confirmar = async () => {
    const linhas = Object.entries(receb).map(([pid, q]) => ({ pedido_item_id: Number(pid), qtd_vinculada: Number(q), data_entrada_estoque: data, id_receb: nf.trim() ? Number(nf.replace(/\D/g, '')) : null }))
      .filter((l) => l.qtd_vinculada > 0);
    if (linhas.length === 0) { setErro('informe ao menos uma quantidade recebida'); return; }
    setSalvando(true);
    try {
      const r = await fetch(`/api/estoque/pedido-compra/${pedidoId}/receber`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ itens: linhas }) });
      const d = await r.json();
      if (d.erro) { setErro(d.erro); return; }
      onRecebido();
    } finally { setSalvando(false); }
  };

  const td: React.CSSProperties = { padding: 7, borderBottom: '1px solid #f5f5f5', fontSize: '.78rem', color: '#444' };
  return (
    <div onClick={onFechar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: 40 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(680px, 96vw)', maxHeight: '86vh', overflowY: 'auto', background: '#fff', borderRadius: 12, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Receber pedido #{pedidoId}</h2>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#888' }}>×</button>
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <div><label style={{ fontSize: '.68rem', color: '#888', display: 'block' }}>Data de entrada</label><input type="date" value={data} onChange={(e) => setData(e.target.value)} style={{ padding: '6px 8px', border: '1px solid #e0e0e0', borderRadius: 6 }} /></div>
          <div><label style={{ fontSize: '.68rem', color: '#888', display: 'block' }}>NF (opcional)</label><input value={nf} onChange={(e) => setNf(e.target.value)} placeholder="nº da nota" style={{ padding: '6px 8px', border: '1px solid #e0e0e0', borderRadius: 6, width: 140 }} /></div>
        </div>
        {erro && <div style={{ color: '#991b1b', fontSize: '.8rem', marginBottom: 8 }}>{erro}</div>}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['SKU', 'Descrição', 'Pedida', 'Já receb.', 'Receber agora'].map((h, i) => <th key={i} style={{ ...td, fontSize: '.64rem', color: '#888', textTransform: 'uppercase', fontWeight: 600 }}>{h}</th>)}</tr></thead>
          <tbody>
            {itens.map((it) => (
              <tr key={it.id}>
                <td style={{ ...td, fontFamily: 'monospace', fontSize: '.72rem' }}>{it.sku}</td>
                <td style={td}>{(it.descricao || '').slice(0, 40)}</td>
                <td style={td}>{n(it.qtd_pedida)}</td>
                <td style={td}>{n(it.qtd_recebida)}</td>
                <td style={td}><input type="number" value={receb[it.id] ?? ''} onChange={(e) => setReceb({ ...receb, [it.id]: e.target.value })} style={{ width: 80, padding: '4px 6px', border: '1px solid #e0e0e0', borderRadius: 6 }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
          <button onClick={onFechar} style={{ padding: '8px 16px', background: 'none', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', color: '#666' }}>Cancelar</button>
          <button onClick={confirmar} disabled={salvando} style={{ padding: '8px 18px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: salvando ? 'wait' : 'pointer' }}>{salvando ? 'Salvando…' : 'Confirmar recebimento'}</button>
        </div>
      </div>
    </div>
  );
}

function BarrasSaida({ serie }: { serie: Array<{ ano: number; mes: number; demanda: number; diasNoMes: number; diasComSaldoPositivo: number }> }) {
  const max = Math.max(1, ...serie.map((s) => s.demanda));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 54 }}>
      {serie.map((s, k) => {
        const rompeu = s.diasComSaldoPositivo < s.diasNoMes; // teve ruptura no mês
        return (
          <div key={k} title={`${String(s.mes).padStart(2, '0')}/${s.ano}: ${s.demanda}${rompeu ? ' (ruptura)' : ''}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
            <div style={{ width: '100%', height: `${(s.demanda / max) * 100}%`, minHeight: s.demanda > 0 ? 2 : 0, background: rompeu ? '#f59e0b' : '#0f766e', borderRadius: '2px 2px 0 0' }} />
            <span style={{ fontSize: '.55rem', color: '#bbb' }}>{s.mes}</span>
          </div>
        );
      })}
    </div>
  );
}
