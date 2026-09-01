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

  const [aba, setAba] = useState<'fornecedores' | 'itens'>('fornecedores');
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
      </div>

      {aba === 'fornecedores'
        ? <AbaFornecedores conta={conta} podeEditar={podeEditar} setMsg={setMsg} />
        : <AbaItens conta={conta} podeEditar={podeEditar} setMsg={setMsg} />}
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
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={lbl}>{label}</label>{children}</div>;
}
const linkBtn: React.CSSProperties = { padding: '4px 10px', background: '#fff', color: '#0f766e', border: '1px solid #0f766e', borderRadius: 6, cursor: 'pointer', fontSize: '.72rem', fontWeight: 600 };
function pct(v: number | null | undefined): string { return v == null ? '—' : `${Math.round(v * 100)}%`; }
