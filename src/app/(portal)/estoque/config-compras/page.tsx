'use client';
// Config. de Compras: parâmetros do módulo de Sugestão de Compra.
//   - Aba Fornecedores: lead time, regularidade, ciclo, nível de serviço, mínimo.
//   - Aba Itens: fornecedor preferencial, override de lead, múltiplo de embalagem,
//     mínimo manual (exige motivo+validade), crítico, sob encomenda.
// Cascata do lead (item → fornecedor → padrão) é mostrada com a origem.
// Params são POR CONTA (nova/castro); sem modo "Todas".
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import { authHeaders } from '@/lib/auth/client';

const card: React.CSSProperties = { background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 18, marginBottom: 18, boxShadow: '0 1px 4px rgba(0,0,0,.04)' };
const inp: React.CSSProperties = { padding: '7px 10px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, background: '#fff', outline: 'none' };
const lbl: React.CSSProperties = { fontSize: '.66rem', fontWeight: 600, color: '#888', textTransform: 'uppercase', marginBottom: 3, display: 'block' };
const btn = (disabled?: boolean): React.CSSProperties => ({ padding: '8px 16px', background: disabled ? '#bbb' : '#0f766e', color: '#fff', border: 'none', borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 });
const th: React.CSSProperties = { background: '#fafafa', color: '#888', fontSize: '.64rem', textTransform: 'uppercase', letterSpacing: '.5px', padding: 9, textAlign: 'left', borderBottom: '1px solid #eee', fontWeight: 600 };
const td: React.CSSProperties = { padding: 9, borderBottom: '1px solid #f5f5f5', fontSize: '.8rem', color: '#444', verticalAlign: 'top' };
const tabBtn = (on: boolean): React.CSSProperties => ({ padding: '8px 16px', border: 'none', borderBottom: on ? '2px solid #0f766e' : '2px solid transparent', background: 'none', color: on ? '#0f766e' : '#888', fontWeight: 600, fontSize: '.85rem', cursor: 'pointer' });

interface FornParam { lead_time_declarado?: number | null; regularidade?: string; ciclo_dias?: number | null; nivel_servico_a?: number | null; nivel_servico_b?: number | null; nivel_servico_c?: number | null; pedido_minimo_valor?: number | null; ativo?: boolean }
interface FornRow { id: number; nome: string; cadastrado_na_conta: boolean; param: FornParam | null }
interface ItemParam { codigo_fornecedor_preferencial?: number | null; lead_time_override?: number | null; multiplo_embalagem?: number | null; minimo_manual?: number | null; minimo_manual_motivo?: string | null; minimo_manual_validade?: string | null; critico?: boolean; sob_encomenda?: boolean }
interface ItemRow { codigo: string; codigo_produto: number; descricao?: string; marca?: string; familia?: string; tipo?: string; estoque?: number; param: ItemParam | null; fornecedor_preferencial_nome: string | null; lead_efetivo: number; lead_origem: string }

export default function ConfigComprasPage() {
  const { userProfile } = useAuth();
  const { pode, loading: permLoading } = usePermissoes(userProfile?.id);
  const { contas } = useConta();

  const [aba, setAba] = useState<'fornecedores' | 'itens' | 'mais-vendidos'>('fornecedores');
  const [contaRaw, setConta] = useState('');
  const conta = (contaRaw || (contas[0]?.id ?? '')).toLowerCase();
  const [msg, setMsg] = useState<{ texto: string; tipo: 'ok' | 'err' } | null>(null);
  const podeEditar = pode('estoque', 'config-compras');

  if (!permLoading && userProfile && !pode('estoque', 'config-compras') && !pode('estoque', 'sugestao-compra')) return <SemPermissao />;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: '#333', marginBottom: 4, fontSize: '1.4rem', fontWeight: 700 }}>Config. de Compras</h1>
          <p style={{ color: '#888', fontSize: '.82rem' }}>Parâmetros de suprimento que alimentam a Sugestão de Compra. Sem config, o motor usa defaults.</p>
        </div>
        <div>
          <label style={lbl}>Conta</label>
          <select value={conta} onChange={(e) => setConta(e.target.value)} style={{ ...inp, width: 150 }}>
            {contas.map((c) => <option key={c.id} value={String(c.id).toLowerCase()}>{c.nome}</option>)}
          </select>
        </div>
      </div>
      <div style={{ margin: '10px 0 16px' }}>
        {pode('estoque', 'sugestao-compra') && <Link href="/estoque/sugestao-compra" style={{ color: '#0f766e', textDecoration: 'none', fontSize: '.82rem', fontWeight: 600 }}>← Sugestão de Compra</Link>}
      </div>

      {msg && <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: '.82rem', background: msg.tipo === 'ok' ? '#dcfce7' : '#fee2e2', color: msg.tipo === 'ok' ? '#166534' : '#991b1b' }}>{msg.texto}</div>}

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #eee', marginBottom: 16 }}>
        <button style={tabBtn(aba === 'fornecedores')} onClick={() => setAba('fornecedores')}>Fornecedores</button>
        <button style={tabBtn(aba === 'itens')} onClick={() => setAba('itens')}>Itens</button>
        <button style={tabBtn(aba === 'mais-vendidos')} onClick={() => setAba('mais-vendidos')}>Mais Vendidos</button>
      </div>

      {aba === 'fornecedores' && <AbaFornecedores conta={conta} podeEditar={podeEditar} setMsg={setMsg} />}
      {aba === 'itens' && <AbaItens conta={conta} podeEditar={podeEditar} setMsg={setMsg} />}
      {aba === 'mais-vendidos' && <AbaMaisVendidos conta={conta} setMsg={setMsg} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
function AbaFornecedores({ conta, podeEditar, setMsg }: { conta: string; podeEditar: boolean; setMsg: (m: { texto: string; tipo: 'ok' | 'err' }) => void }) {
  const [lista, setLista] = useState<FornRow[]>([]);
  const [busca, setBusca] = useState('');
  const [soConfig, setSoConfig] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    if (!conta) return;
    setCarregando(true);
    try {
      const r = await fetch(`/api/estoque/config-compras/fornecedores?conta=${conta}`, { headers: await authHeaders() });
      const d = await r.json();
      if (d.erro) setMsg({ texto: d.erro, tipo: 'err' }); else setLista(d.lista || []);
    } finally { setCarregando(false); }
  }, [conta, setMsg]);
  useEffect(() => { carregar(); }, [carregar]);

  const filtradas = lista
    .filter((f) => (!soConfig || f.param))
    .filter((f) => f.nome.toLowerCase().includes(busca.toLowerCase()))
    .slice(0, 300);

  return (
    <div style={card}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar fornecedor…" style={{ ...inp, width: 240 }} />
        <label style={{ fontSize: '.8rem', color: '#666', display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={soConfig} onChange={(e) => setSoConfig(e.target.checked)} /> só configurados</label>
        <span style={{ fontSize: '.75rem', color: '#aaa' }}>{carregando ? 'carregando…' : `${filtradas.length} de ${lista.length}`}</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{['Fornecedor', 'Lead', 'Regularidade', 'Ciclo', 'NS A/B/C', 'Pedido mín.', 'Ativo', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
        <tbody>
          {filtradas.length === 0 ? <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: '#bbb', padding: 20 }}>Nada encontrado</td></tr>
            : filtradas.map((f) => (
              editId === f.id
                ? <EditorFornecedor key={f.id} conta={conta} forn={f} onSalvo={() => { setEditId(null); carregar(); }} onCancel={() => setEditId(null)} setMsg={setMsg} />
                : <tr key={f.id}>
                    <td style={td}>{f.nome}{!f.cadastrado_na_conta && <span title="sem código Omie nesta conta" style={{ marginLeft: 6, fontSize: '.65rem', color: '#b45309' }}>⚠ sem Omie</span>}</td>
                    <td style={td}>{f.param?.lead_time_declarado ?? '—'}</td>
                    <td style={td}>{f.param?.regularidade ?? '—'}</td>
                    <td style={td}>{f.param?.ciclo_dias ?? '—'}</td>
                    <td style={td}>{f.param ? `${pct(f.param.nivel_servico_a)}/${pct(f.param.nivel_servico_b)}/${pct(f.param.nivel_servico_c)}` : '—'}</td>
                    <td style={td}>{f.param?.pedido_minimo_valor != null ? `R$ ${f.param.pedido_minimo_valor}` : '—'}</td>
                    <td style={td}>{f.param ? (f.param.ativo === false ? 'não' : 'sim') : '—'}</td>
                    <td style={td}>{podeEditar && <button onClick={() => setEditId(f.id)} style={linkBtn}>Editar</button>}</td>
                  </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

function EditorFornecedor({ conta, forn, onSalvo, onCancel, setMsg }: { conta: string; forn: FornRow; onSalvo: () => void; onCancel: () => void; setMsg: (m: { texto: string; tipo: 'ok' | 'err' }) => void }) {
  const p = forn.param || {};
  const [f, setF] = useState({
    lead_time_declarado: p.lead_time_declarado ?? '', regularidade: p.regularidade ?? 'regular', ciclo_dias: p.ciclo_dias ?? 15,
    nivel_servico_a: p.nivel_servico_a ?? '', nivel_servico_b: p.nivel_servico_b ?? '', nivel_servico_c: p.nivel_servico_c ?? '',
    pedido_minimo_valor: p.pedido_minimo_valor ?? '', ativo: p.ativo !== false,
  });
  const [saving, setSaving] = useState(false);
  const salvar = async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/estoque/config-compras/fornecedores', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ conta, codigo_fornecedor: forn.id, ...f }) });
      const d = await r.json();
      if (d.erro) { setMsg({ texto: d.erro, tipo: 'err' }); return; }
      setMsg({ texto: `Fornecedor ${forn.nome} salvo.`, tipo: 'ok' }); onSalvo();
    } finally { setSaving(false); }
  };
  return (
    <tr><td colSpan={8} style={{ ...td, background: '#f8fafc' }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <strong style={{ fontSize: '.85rem', width: '100%' }}>{forn.nome}</strong>
        <Campo label="Lead (dias)"><input type="number" value={f.lead_time_declarado} onChange={(e) => setF({ ...f, lead_time_declarado: e.target.value as unknown as number })} style={{ ...inp, width: 90 }} /></Campo>
        <Campo label="Regularidade"><select value={f.regularidade} onChange={(e) => setF({ ...f, regularidade: e.target.value })} style={{ ...inp, width: 150 }}><option value="regular">regular (15%)</option><option value="irregular">irregular (30%)</option><option value="muito_irregular">muito irregular (50%)</option></select></Campo>
        <Campo label="Ciclo (dias)"><input type="number" value={f.ciclo_dias} onChange={(e) => setF({ ...f, ciclo_dias: e.target.value as unknown as number })} style={{ ...inp, width: 80 }} /></Campo>
        <Campo label="NS A (0-1)"><input type="number" step="0.01" value={f.nivel_servico_a} onChange={(e) => setF({ ...f, nivel_servico_a: e.target.value as unknown as number })} style={{ ...inp, width: 80 }} /></Campo>
        <Campo label="NS B"><input type="number" step="0.01" value={f.nivel_servico_b} onChange={(e) => setF({ ...f, nivel_servico_b: e.target.value as unknown as number })} style={{ ...inp, width: 70 }} /></Campo>
        <Campo label="NS C"><input type="number" step="0.01" value={f.nivel_servico_c} onChange={(e) => setF({ ...f, nivel_servico_c: e.target.value as unknown as number })} style={{ ...inp, width: 70 }} /></Campo>
        <Campo label="Pedido mín. R$"><input type="number" value={f.pedido_minimo_valor} onChange={(e) => setF({ ...f, pedido_minimo_valor: e.target.value as unknown as number })} style={{ ...inp, width: 110 }} /></Campo>
        <label style={{ fontSize: '.8rem', display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> ativo</label>
        <button onClick={salvar} disabled={saving} style={btn(saving)}>Salvar</button>
        <button onClick={onCancel} style={linkBtn}>cancelar</button>
      </div>
    </td></tr>
  );
}

// ---------------------------------------------------------------------------
function AbaItens({ conta, podeEditar, setMsg }: { conta: string; podeEditar: boolean; setMsg: (m: { texto: string; tipo: 'ok' | 'err' }) => void }) {
  const [q, setQ] = useState('');
  const [lista, setLista] = useState<ItemRow[]>([]);
  const [editCp, setEditCp] = useState<number | null>(null);
  const [buscando, setBuscando] = useState(false);

  const buscar = useCallback(async () => {
    if (q.trim().length < 2) { setLista([]); return; }
    setBuscando(true);
    try {
      const r = await fetch(`/api/estoque/config-compras/itens?conta=${conta}&q=${encodeURIComponent(q.trim())}`, { headers: await authHeaders() });
      const d = await r.json();
      if (d.erro) setMsg({ texto: d.erro, tipo: 'err' }); else setLista(d.lista || []);
    } finally { setBuscando(false); }
  }, [q, conta, setMsg]);

  return (
    <div style={card}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar()} placeholder="Buscar por SKU ou descrição…" style={{ ...inp, width: 300 }} />
        <button onClick={buscar} style={btn()}>Buscar</button>
        {buscando && <span style={{ fontSize: '.75rem', color: '#aaa', alignSelf: 'center' }}>buscando…</span>}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{['SKU', 'Descrição', 'Tipo', 'Estoque', 'Lead efetivo', 'Fornecedor pref.', 'Múltiplo', 'Flags', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
        <tbody>
          {lista.length === 0 ? <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: '#bbb', padding: 20 }}>Busque um item</td></tr>
            : lista.map((it) => (
              editCp === it.codigo_produto
                ? <EditorItem key={it.codigo_produto} conta={conta} item={it} onSalvo={() => { setEditCp(null); buscar(); }} onCancel={() => setEditCp(null)} setMsg={setMsg} />
                : <tr key={it.codigo_produto}>
                    <td style={{ ...td, fontFamily: 'monospace' }}>{it.codigo}</td>
                    <td style={td}>{it.descricao || '—'}</td>
                    <td style={td}>{it.tipo || '—'}</td>
                    <td style={td}>{it.estoque ?? '—'}</td>
                    <td style={td}><strong>{it.lead_efetivo}d</strong> <span style={{ color: '#aaa', fontSize: '.7rem' }}>({it.lead_origem})</span></td>
                    <td style={td}>{it.fornecedor_preferencial_nome || '—'}</td>
                    <td style={td}>{it.param?.multiplo_embalagem ?? 1}</td>
                    <td style={td}>{it.param?.critico && <span title="crítico" style={{ color: '#dc2626', marginRight: 4 }}>crít</span>}{it.param?.sob_encomenda && <span title="sob encomenda" style={{ color: '#b45309' }}>enc</span>}{it.param?.minimo_manual != null && <span title="mínimo manual" style={{ color: '#0f766e' }}>mín</span>}</td>
                    <td style={td}>{podeEditar && <button onClick={() => setEditCp(it.codigo_produto)} style={linkBtn}>Editar</button>}</td>
                  </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

function EditorItem({ conta, item, onSalvo, onCancel, setMsg }: { conta: string; item: ItemRow; onSalvo: () => void; onCancel: () => void; setMsg: (m: { texto: string; tipo: 'ok' | 'err' }) => void }) {
  const p = item.param || {};
  const [f, setF] = useState({
    codigo_fornecedor_preferencial: p.codigo_fornecedor_preferencial ?? '', lead_time_override: p.lead_time_override ?? '',
    multiplo_embalagem: p.multiplo_embalagem ?? 1, minimo_manual: p.minimo_manual ?? '', minimo_manual_motivo: p.minimo_manual_motivo ?? '',
    minimo_manual_validade: p.minimo_manual_validade ?? '', critico: p.critico ?? false, sob_encomenda: p.sob_encomenda ?? false,
  });
  const [saving, setSaving] = useState(false);
  const salvar = async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/estoque/config-compras/itens', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ conta, codigo_produto: item.codigo_produto, ...f }) });
      const d = await r.json();
      if (d.erro) { setMsg({ texto: d.erro, tipo: 'err' }); return; }
      setMsg({ texto: `Item ${item.codigo} salvo.`, tipo: 'ok' }); onSalvo();
    } finally { setSaving(false); }
  };
  return (
    <tr><td colSpan={9} style={{ ...td, background: '#f8fafc' }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <strong style={{ fontSize: '.85rem', width: '100%' }}>{item.codigo} — {item.descricao}</strong>
        <Campo label="Cód. fornecedor pref. (id)"><input type="number" value={f.codigo_fornecedor_preferencial} onChange={(e) => setF({ ...f, codigo_fornecedor_preferencial: e.target.value as unknown as number })} style={{ ...inp, width: 150 }} placeholder="Fornecedores.id" /></Campo>
        <Campo label="Lead override (dias)"><input type="number" value={f.lead_time_override} onChange={(e) => setF({ ...f, lead_time_override: e.target.value as unknown as number })} style={{ ...inp, width: 120 }} /></Campo>
        <Campo label="Múltiplo embalagem"><input type="number" value={f.multiplo_embalagem} onChange={(e) => setF({ ...f, multiplo_embalagem: e.target.value as unknown as number })} style={{ ...inp, width: 110 }} /></Campo>
        <Campo label="Mínimo manual"><input type="number" value={f.minimo_manual} onChange={(e) => setF({ ...f, minimo_manual: e.target.value as unknown as number })} style={{ ...inp, width: 100 }} /></Campo>
        <Campo label="Motivo (se mínimo)"><input value={f.minimo_manual_motivo} onChange={(e) => setF({ ...f, minimo_manual_motivo: e.target.value })} style={{ ...inp, width: 180 }} /></Campo>
        <Campo label="Validade (se mínimo)"><input type="date" value={f.minimo_manual_validade ? String(f.minimo_manual_validade).slice(0, 10) : ''} onChange={(e) => setF({ ...f, minimo_manual_validade: e.target.value })} style={{ ...inp, width: 150 }} /></Campo>
        <label style={{ fontSize: '.8rem', display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.critico} onChange={(e) => setF({ ...f, critico: e.target.checked })} /> crítico (NS 98%)</label>
        <label style={{ fontSize: '.8rem', display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.sob_encomenda} onChange={(e) => setF({ ...f, sob_encomenda: e.target.checked })} /> sob encomenda</label>
        <button onClick={salvar} disabled={saving} style={btn(saving)}>Salvar</button>
        <button onClick={onCancel} style={linkBtn}>cancelar</button>
      </div>
    </td></tr>
  );
}

// ---------------------------------------------------------------------------
const ALERTA_COR: Record<string, { bg: string; label: string }> = {
  ja_era: { bg: '#dc2626', label: 'Já era' }, critico: { bg: '#ea580c', label: 'Crítico' },
  atencao: { bg: '#eab308', label: 'Atenção' }, ok: { bg: '#16a34a', label: 'OK' }, nao_comprar: { bg: '#94a3b8', label: 'Não comprar' },
};
interface ProdMV { sku: string; descricao?: string; tipo?: string; curva?: string; alerta?: string; estoque_atual?: number; em_transito?: number; minimo_efetivo?: number; prev_30?: number; qtd_sugerida?: number; valor_estimado?: number; qtd_12m?: number; faturamento_12m?: number; cmd?: number; codigo_produto_nova?: number | null; codigo_produto_castro?: number | null }
type Metrica = 'quantidade' | 'faturamento' | 'demanda';

function AbaMaisVendidos({ conta, setMsg }: { conta: string; setMsg: (m: { texto: string; tipo: 'ok' | 'err' }) => void }) {
  const [dados, setDados] = useState<{ quantidade: ProdMV[]; faturamento: ProdMV[]; demanda: ProdMV[]; intersecao: string[]; snapshot?: { gerado_em: string } } | null>(null);
  const [metrica, setMetrica] = useState<Metrica>('quantidade');
  const [carregando, setCarregando] = useState(true);
  const [detalhe, setDetalhe] = useState<ProdMV | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [gerando, setGerando] = useState(false);
  const [abertos, setAbertos] = useState<Array<{ id: number; fornecedor: string; n_itens: number }>>([]);
  const [destino, setDestino] = useState<'novo' | string>('novo');

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/estoque/config-compras/mais-vendidos', { headers: await authHeaders() });
        const d = await r.json();
        if (!d.erro) setDados(d);
      } finally { setCarregando(false); }
    })();
  }, []);
  // pedidos abertos da conta compradora (para "adicionar a um aberto")
  const carregarAbertos = useCallback(async (resetDestino = true) => {
    if (!conta) return;
    const r = await fetch(`/api/estoque/pedido-compra?conta=${conta}`, { headers: await authHeaders() });
    const d = await r.json();
    setAbertos(d.pedidos || []); if (resetDestino) setDestino('novo');
  }, [conta]);
  useEffect(() => { carregarAbertos(); }, [carregarAbertos]);

  const lista = dados ? dados[metrica] : [];
  const inter = new Set(dados?.intersecao ?? []);
  // mapa sku→produto (mescla as 3 listas) para exportar mesmo trocando a métrica
  const porSku = new Map<string, ProdMV>();
  for (const l of [dados?.quantidade ?? [], dados?.faturamento ?? [], dados?.demanda ?? []]) for (const p of l) if (!porSku.has(p.sku)) porSku.set(p.sku, p);
  const toggleSel = (sku: string) => setSel((s) => { const x = new Set(s); x.has(sku) ? x.delete(sku) : x.add(sku); return x; });

  const gerarPedido = async () => {
    const linhas = [...sel].map((sku) => {
      const p = porSku.get(sku); if (!p) return null;
      const cp = conta === 'castro' ? p.codigo_produto_castro : p.codigo_produto_nova;
      const q = n2(p.qtd_sugerida) > 0 ? n2(p.qtd_sugerida) : Math.max(1, Math.ceil(n2(p.prev_30)));
      const precoUnit = n2(p.qtd_sugerida) > 0 && n2(p.valor_estimado) > 0 ? n2(p.valor_estimado) / n2(p.qtd_sugerida) : 0;
      return cp != null ? { codigo_produto: cp, qtd_sugerida: n2(p.qtd_sugerida), qtd_pedida: q, preco_estimado: precoUnit } : null;
    }).filter((x): x is NonNullable<typeof x> => !!x);
    const fora = sel.size - linhas.length;
    if (linhas.length === 0) { setMsg({ texto: `Nenhum item selecionado existe na conta ${conta.toUpperCase()}.`, tipo: 'err' }); return; }
    setGerando(true);
    try {
      const url = destino === 'novo' ? '/api/estoque/pedido-compra' : `/api/estoque/pedido-compra/${destino}/itens`;
      const body = destino === 'novo' ? { conta, itens: linhas } : { itens: linhas };
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify(body) });
      const d = await r.json();
      if (d.erro) { setMsg({ texto: d.erro, tipo: 'err' }); return; }
      const foraMsg = fora ? `, ${fora} ignorados por não existir na conta` : '';
      setMsg({ texto: destino === 'novo' ? `Pedido #${d.id} criado (${d.itens} itens${foraMsg}). Veja em Sugestão de Compra → Pedidos abertos.` : `Adicionados ao pedido #${destino}: ${d.adicionados} novos, ${d.mesclados} mesclados${foraMsg}.`, tipo: 'ok' });
      setSel(new Set()); carregarAbertos(false);
    } finally { setGerando(false); }
  };
  const valorMetrica = (p: ProdMV) => metrica === 'quantidade' ? `${Math.round(n2(p.qtd_12m))} un` : metrica === 'faturamento' ? brl2(n2(p.faturamento_12m)) : `${n2(p.cmd).toFixed(2)}/d`;
  const tog = (m: Metrica, txt: string) => (
    <button onClick={() => setMetrica(m)} style={{ padding: '7px 14px', borderRadius: 8, border: metrica === m ? '1px solid #0f766e' : '1px solid #e2e2e2', background: metrica === m ? '#0f766e' : '#fff', color: metrica === m ? '#fff' : '#555', fontWeight: 600, fontSize: '.8rem', cursor: 'pointer' }}>{txt}</button>
  );

  return (
    <div style={card}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {tog('quantidade', 'Quantidade 12m')}{tog('faturamento', 'Faturamento 12m')}{tog('demanda', 'Demanda')}
        <span style={{ fontSize: '.72rem', color: '#aaa', marginLeft: 'auto' }}>{carregando ? 'carregando…' : `top ${lista.length}${dados?.snapshot ? ` · snapshot de ${new Date(dados.snapshot.gerado_em).toLocaleDateString('pt-BR')}` : ''}`}</span>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '6px 0 12px', fontSize: '.7rem', color: '#666' }}>
        {Object.entries(ALERTA_COR).map(([k, a]) => <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: a.bg, display: 'inline-block' }} />{a.label}</span>)}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>★ nas 3 listas</span>
      </div>
      {!carregando && lista.length === 0 && <div style={{ color: '#bbb', fontSize: '.82rem', padding: 10 }}>Sem dados. Gere o snapshot noturno (o job popula qtd/faturamento 12m).</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
        {lista.map((p) => {
          const a = ALERTA_COR[p.alerta || 'nao_comprar'] || ALERTA_COR.nao_comprar;
          const on = sel.has(p.sku);
          return (
            <div key={p.sku} title={`${p.sku} — ${p.descricao || ''}\n${a.label}`}
              style={{ position: 'relative', aspectRatio: '1', border: `2px solid ${on ? '#0f766e' : a.bg}`, borderRadius: 10, background: on ? '#f0fdfa' : '#fff', padding: 6, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', textAlign: 'left', overflow: 'hidden', boxShadow: on ? '0 0 0 2px #0f766e55' : 'none' }}>
              <span style={{ position: 'absolute', top: 4, right: 5, width: 12, height: 12, borderRadius: '50%', background: a.bg }} />
              <input type="checkbox" checked={on} onChange={() => toggleSel(p.sku)} title="selecionar para pedido" style={{ position: 'absolute', top: 4, left: 4, cursor: 'pointer' }} />
              <button onClick={() => setDetalhe(p)} style={{ all: 'unset', cursor: 'pointer', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingTop: 16 }}>
                <span style={{ fontSize: '.62rem', fontFamily: 'monospace', color: '#333', wordBreak: 'break-all', lineHeight: 1.1 }}>{inter.has(p.sku) && <span style={{ color: '#f59e0b' }}>★ </span>}{p.sku}</span>
                <span style={{ fontSize: '.56rem', color: '#888', lineHeight: 1.05 }}>{(p.descricao || '').slice(0, 24)}</span>
                <span style={{ fontSize: '.55rem', color: '#666' }}>prev30 <b>{Math.round(n2(p.prev_30))}</b> · est <b>{Math.round(n2(p.estoque_atual))}</b></span>
                <span style={{ fontSize: '.66rem', fontWeight: 700, color: a.bg }}>{valorMetrica(p)}</span>
              </button>
            </div>
          );
        })}
      </div>

      {sel.size > 0 && (
        <div style={{ position: 'sticky', bottom: 0, marginTop: 14, background: '#0f766e', color: '#fff', borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '.85rem', fontWeight: 600 }}>{sel.size} selecionados · comprar pela conta <b>{conta.toUpperCase()}</b></span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={destino} onChange={(e) => setDestino(e.target.value)} style={{ padding: '6px 8px', borderRadius: 6, border: 'none', fontSize: 13 }}>
              <option value="novo">Novo pedido</option>
              {abertos.map((p) => <option key={p.id} value={String(p.id)}>Pedido #{p.id} — {p.fornecedor} ({p.n_itens})</option>)}
            </select>
            <button onClick={gerarPedido} disabled={gerando} style={{ padding: '8px 16px', background: '#fff', color: '#0f766e', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '.82rem', cursor: gerando ? 'wait' : 'pointer' }}>{gerando ? 'Enviando…' : destino === 'novo' ? 'Gerar pedido' : 'Adicionar ao pedido'}</button>
          </div>
        </div>
      )}

      {detalhe && (
        <div onClick={() => setDetalhe(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 20, width: 'min(420px,94vw)' }}>
            <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1rem' }}>{detalhe.sku}</div>
            <div style={{ color: '#555', fontSize: '.85rem', margin: '4px 0 10px' }}>{detalhe.descricao}</div>
            {[['Tipo', detalhe.tipo || '—'], ['Curva', detalhe.curva || '—'], ['Alerta', (ALERTA_COR[detalhe.alerta || 'nao_comprar'] || ALERTA_COR.nao_comprar).label], ['Estoque atual', n2(detalhe.estoque_atual)], ['Mínimo', Math.round(n2(detalhe.minimo_efetivo))], ['Vendido 12m', `${Math.round(n2(detalhe.qtd_12m))} un`], ['Faturamento 12m', brl2(n2(detalhe.faturamento_12m))], ['Consumo/dia', n2(detalhe.cmd).toFixed(2)]].map(([k, v]) => (
              <div key={String(k)} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.82rem', padding: '3px 0', borderBottom: '1px solid #f5f5f5' }}><span style={{ color: '#888' }}>{k}</span><span style={{ fontWeight: 600 }}>{v}</span></div>
            ))}
            <button onClick={() => setDetalhe(null)} style={{ marginTop: 12, ...btn() }}>Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}
const n2 = (v: unknown): number => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const brl2 = (v: number): string => 'R$ ' + v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

// ---------------------------------------------------------------------------
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={lbl}>{label}</label>{children}</div>;
}
const linkBtn: React.CSSProperties = { padding: '4px 10px', background: '#fff', color: '#0f766e', border: '1px solid #0f766e', borderRadius: 6, cursor: 'pointer', fontSize: '.72rem', fontWeight: 600 };
function pct(v: number | null | undefined): string { return v == null ? '—' : `${Math.round(v * 100)}%`; }
