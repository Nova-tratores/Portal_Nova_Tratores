'use client';
// Sistema de Comissão. Portado de /comissao (server.js) consumindo
// /api/estoque/comissao/*. 6 abas (Config, Pessoas, Regras, Serviços, Vendas,
// Custos) + Relatório consolidado.
import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';
import { fmtRS } from '@/components/estoque/ui';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const ABAS = ['Config', 'Pessoas', 'Regras', 'Serviços', 'Vendas', 'Custos', 'Relatório'] as const;
type Aba = typeof ABAS[number];

const thStyle: React.CSSProperties = { background: '#fafafa', color: '#888', fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.5px', padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #eee', fontWeight: 600, whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f5f5f5', color: '#444', fontSize: '.82rem' };
const inputStyle: React.CSSProperties = { padding: '7px 9px', border: '1px solid #e0e0e0', borderRadius: 7, fontSize: '.8rem', outline: 'none' };
const btnPrimary: React.CSSProperties = { padding: '8px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontSize: '.8rem', fontWeight: 600, cursor: 'pointer' };
const btnGhost: React.CSSProperties = { padding: '8px 14px', background: '#fff', color: '#666', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: '.78rem', fontWeight: 600, cursor: 'pointer' };
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#dc2626', fontSize: '.74rem', fontWeight: 600, cursor: 'pointer', padding: 0, textDecoration: 'underline' };

interface Pessoa { id: number; nome: string; tipo: string; bonificacao_pct: number; ativo: boolean }
interface Regra { id: number; dominio: string; categoria_match: string | null; familia_match: string | null; departamento_match: string | null; comissao_pct: number; prioridade: number; ativo: boolean }
interface Servico { id: number; os_numero: string; os_item_seq: number; data_emissao: string; cliente: string | null; descricao_servico: string; valor_liquido: number; vendedor_1: string | null; vendedor_2: string | null; divisao_fundo_pct: number; divisao_v1_pct: number; divisao_v2_pct: number; comissao_override_pct: number | null; comissao_final_pct: number | null; valor_total: number | null; valor_fundo: number | null; status: string }
interface VendaItem { venda_id: string; vendas_itens_id: number; data_pedido: string; numero_pedido: string; vendedor: string | null; cliente: string | null; produto_descricao: string; familia: string; valor_venda: number; cmc_total: number; comissao_pct: number; comissao_fonte: string; valor_comissao: number; margem_loja: number; status: string }
interface Custo { nome: string; tipo: string; salario: number; encargos: number; custos_extras: number; carro_aluguel: number; combustivel: number; manutencao: number; total_custo: number }
interface RelPessoa { vendedor: string; num_os: number; num_vendas: number; valor_total: number; comissao_total: number }

export default function ComissaoPage() {
  const { userProfile } = useAuth();
  const { temAcesso, loading: permLoading } = usePermissoes(userProfile?.id);
  const { conta, contaParam } = useConta();

  const now = new Date();
  const [aba, setAba] = useState<Aba>('Relatório');
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const [erro, setErro] = useState('');

  if (!permLoading && userProfile && !temAcesso('estoque')) return <SemPermissao />;

  const anos: number[] = [];
  for (let y = now.getFullYear(); y >= 2022; y--) anos.push(y);

  return (
    <div style={{ maxWidth: 1300, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: '#333', marginBottom: 4, fontSize: '1.4rem', fontWeight: 700 }}>Comissão</h1>
          <p style={{ color: '#888', fontSize: '.82rem', marginBottom: 0 }}>Serviços (OS), vendas de máquinas, regras, custos e relatório consolidado</p>
        </div>
        <ContaSelector />
      </div>

      <div style={{ margin: '14px 0', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Link href="/estoque/dashboard" style={{ color: '#dc2626', textDecoration: 'none', fontSize: '.82rem', fontWeight: 600 }}>← Dashboard</Link>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', borderBottom: '1px solid #eee', paddingBottom: 4 }}>
        {ABAS.map((a) => (
          <button key={a} onClick={() => { setAba(a); setErro(''); }}
            style={{ padding: '8px 14px', border: 'none', borderBottom: aba === a ? '2px solid #dc2626' : '2px solid transparent', background: 'none', color: aba === a ? '#dc2626' : '#888', fontSize: '.82rem', fontWeight: 600, cursor: 'pointer' }}>
            {a}
          </button>
        ))}
      </div>

      {(aba === 'Serviços' || aba === 'Vendas' || aba === 'Custos' || aba === 'Relatório') && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Sel label="Mês" value={mes} onChange={(v) => setMes(parseInt(v))} options={MESES.map((m, i) => ({ value: i + 1, label: m }))} />
          <Sel label="Ano" value={ano} onChange={(v) => setAno(parseInt(v))} options={anos.map((y) => ({ value: y, label: String(y) }))} />
        </div>
      )}

      {erro && <div style={{ color: '#dc2626', marginBottom: 12, fontSize: '.85rem' }}>{erro}</div>}

      {aba === 'Config' && <ConfigTab contaParam={contaParam} setErro={setErro} />}
      {aba === 'Pessoas' && <PessoasTab contaParam={contaParam} setErro={setErro} />}
      {aba === 'Regras' && <RegrasTab contaParam={contaParam} setErro={setErro} />}
      {aba === 'Serviços' && <ServicosTab contaParam={contaParam} mes={mes} ano={ano} setErro={setErro} />}
      {aba === 'Vendas' && <VendasTab contaParam={contaParam} mes={mes} ano={ano} setErro={setErro} />}
      {aba === 'Custos' && <CustosTab contaParam={contaParam} mes={mes} ano={ano} setErro={setErro} />}
      {aba === 'Relatório' && <RelatorioTab contaParam={contaParam} mes={mes} ano={ano} setErro={setErro} />}

      {conta === '' && <div style={{ fontSize: '.7rem', color: '#bbb', marginTop: 14 }}>Comissão usa a conta NOVA por padrão quando &quot;Todas&quot; está selecionada.</div>}
    </div>
  );
}

// ============================ Config ============================
function ConfigTab({ contaParam, setErro }: { contaParam: string; setErro: (s: string) => void }) {
  const [base, setBase] = useState('');
  const [salvo, setSalvo] = useState(false);
  const [, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      const r = await fetch(`/api/estoque/comissao/config?${contaParam.replace(/^&/, '')}`);
      const d = await r.json();
      if (d.erro) { setErro(d.erro); return; }
      setBase(String(d.comissao_base_pct_servicos ?? 15));
    } catch (ex) { setErro('Erro: ' + (ex as Error).message); }
    finally { setCarregando(false); }
  }, [contaParam, setErro]);
  useEffect(() => { void carregar(); }, [carregar]);

  const salvar = async () => {
    const r = await fetch(`/api/estoque/comissao/config?${contaParam.replace(/^&/, '')}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comissao_base_pct_servicos: parseFloat(base) || 0 }),
    });
    const d = await r.json();
    if (d.erro) { setErro(d.erro); return; }
    setSalvo(true); setTimeout(() => setSalvo(false), 2000);
  };

  return (
    <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 18, maxWidth: 420 }}>
      <label style={{ display: 'block', color: '#888', fontSize: '.7rem', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6, fontWeight: 600 }}>Comissão base de serviços (%)</label>
      <div style={{ display: 'flex', gap: 10 }}>
        <input value={base} onChange={(e) => setBase(e.target.value)} type="number" step="0.01" style={{ ...inputStyle, width: 120 }} />
        <button onClick={salvar} style={btnPrimary}>Salvar</button>
        {salvo && <span style={{ color: '#16a34a', fontSize: '.8rem', alignSelf: 'center' }}>Salvo ✓</span>}
      </div>
      <p style={{ color: '#999', fontSize: '.74rem', marginTop: 10 }}>Aplicada como base no cálculo de comissão de OS: base% × (1 + bônus/100).</p>
    </div>
  );
}

// ============================ Pessoas ============================
function PessoasTab({ contaParam, setErro }: { contaParam: string; setErro: (s: string) => void }) {
  const [items, setItems] = useState<Pessoa[]>([]);
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState('vendedor');
  const [bonus, setBonus] = useState('0');
  const [, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      const r = await fetch(`/api/estoque/comissao/pessoas?${contaParam.replace(/^&/, '')}`);
      const d = await r.json();
      if (d.erro) { setErro(d.erro); return; }
      setItems(d.items || []);
    } catch (ex) { setErro('Erro: ' + (ex as Error).message); }
    finally { setCarregando(false); }
  }, [contaParam, setErro]);
  useEffect(() => { void carregar(); }, [carregar]);

  const criar = async () => {
    if (!nome.trim()) return;
    const r = await fetch(`/api/estoque/comissao/pessoas?${contaParam.replace(/^&/, '')}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: nome.trim(), tipo, bonificacao_pct: parseFloat(bonus) || 0 }),
    });
    const d = await r.json();
    if (d.erro) { setErro(d.erro); return; }
    setNome(''); setBonus('0'); carregar();
  };
  const editar = async (p: Pessoa, campos: Partial<Pessoa>) => {
    const r = await fetch(`/api/estoque/comissao/pessoas/${p.id}?${contaParam.replace(/^&/, '')}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(campos),
    });
    const d = await r.json();
    if (d.erro) { setErro(d.erro); return; }
    carregar();
  };
  const excluir = async (p: Pessoa) => {
    if (!confirm(`Excluir ${p.nome}?`)) return;
    await fetch(`/api/estoque/comissao/pessoas/${p.id}?${contaParam.replace(/^&/, '')}`, { method: 'DELETE' });
    carregar();
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Field label="Nome"><input value={nome} onChange={(e) => setNome(e.target.value)} style={{ ...inputStyle, width: 200 }} /></Field>
        <Field label="Tipo">
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={inputStyle}>
            {['vendedor', 'motorista', 'tecnico', 'todos'].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Bônus %"><input value={bonus} onChange={(e) => setBonus(e.target.value)} type="number" step="0.01" style={{ ...inputStyle, width: 90 }} /></Field>
        <button onClick={criar} style={btnPrimary}>Adicionar</button>
      </div>
      <Tabela headers={['Nome', 'Tipo', 'Bônus %', 'Ativo', '']}>
        {items.map((p) => (
          <tr key={p.id}>
            <td style={tdStyle}>{p.nome}</td>
            <td style={tdStyle}>{p.tipo}</td>
            <td style={tdStyle}>
              <input defaultValue={p.bonificacao_pct} type="number" step="0.01" style={{ ...inputStyle, width: 80 }}
                onBlur={(e) => { const v = parseFloat(e.target.value) || 0; if (v !== p.bonificacao_pct) editar(p, { bonificacao_pct: v }); }} />
            </td>
            <td style={tdStyle}><input type="checkbox" checked={p.ativo} onChange={(e) => editar(p, { ativo: e.target.checked })} /></td>
            <td style={tdStyle}><button onClick={() => excluir(p)} style={linkBtn}>excluir</button></td>
          </tr>
        ))}
      </Tabela>
    </>
  );
}

// ============================ Regras ============================
function RegrasTab({ contaParam, setErro }: { contaParam: string; setErro: (s: string) => void }) {
  const [items, setItems] = useState<Regra[]>([]);
  const [form, setForm] = useState({ dominio: 'vendas_maquinas', categoria_match: '', familia_match: '', departamento_match: '', comissao_pct: '0', prioridade: '0' });
  const [, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      const r = await fetch(`/api/estoque/comissao/regras?${contaParam.replace(/^&/, '')}`);
      const d = await r.json();
      if (d.erro) { setErro(d.erro); return; }
      setItems(d.items || []);
    } catch (ex) { setErro('Erro: ' + (ex as Error).message); }
    finally { setCarregando(false); }
  }, [contaParam, setErro]);
  useEffect(() => { void carregar(); }, [carregar]);

  const criar = async () => {
    const r = await fetch(`/api/estoque/comissao/regras?${contaParam.replace(/^&/, '')}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, comissao_pct: parseFloat(form.comissao_pct) || 0, prioridade: parseInt(form.prioridade) || 0 }),
    });
    const d = await r.json();
    if (d.erro) { setErro(d.erro); return; }
    carregar();
  };
  const editar = async (g: Regra, campos: Partial<Regra>) => {
    const r = await fetch(`/api/estoque/comissao/regras/${g.id}?${contaParam.replace(/^&/, '')}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(campos),
    });
    const d = await r.json();
    if (d.erro) { setErro(d.erro); return; }
    carregar();
  };
  const excluir = async (g: Regra) => {
    if (!confirm('Excluir regra?')) return;
    await fetch(`/api/estoque/comissao/regras/${g.id}?${contaParam.replace(/^&/, '')}`, { method: 'DELETE' });
    carregar();
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Field label="Domínio">
          <select value={form.dominio} onChange={(e) => setForm({ ...form, dominio: e.target.value })} style={inputStyle}>
            <option value="vendas_maquinas">vendas_maquinas</option>
            <option value="servicos">servicos</option>
          </select>
        </Field>
        <Field label="Categoria"><input value={form.categoria_match} onChange={(e) => setForm({ ...form, categoria_match: e.target.value })} style={{ ...inputStyle, width: 120 }} /></Field>
        <Field label="Família"><input value={form.familia_match} onChange={(e) => setForm({ ...form, familia_match: e.target.value })} style={{ ...inputStyle, width: 120 }} /></Field>
        <Field label="Depto"><input value={form.departamento_match} onChange={(e) => setForm({ ...form, departamento_match: e.target.value })} style={{ ...inputStyle, width: 100 }} /></Field>
        <Field label="Com. %"><input value={form.comissao_pct} onChange={(e) => setForm({ ...form, comissao_pct: e.target.value })} type="number" step="0.01" style={{ ...inputStyle, width: 80 }} /></Field>
        <Field label="Prior."><input value={form.prioridade} onChange={(e) => setForm({ ...form, prioridade: e.target.value })} type="number" style={{ ...inputStyle, width: 70 }} /></Field>
        <button onClick={criar} style={btnPrimary}>Adicionar</button>
      </div>
      <Tabela headers={['Domínio', 'Categoria', 'Família', 'Depto', 'Com. %', 'Prior.', 'Ativo', '']}>
        {items.map((g) => (
          <tr key={g.id}>
            <td style={tdStyle}>{g.dominio}</td>
            <td style={tdStyle}>{g.categoria_match || '—'}</td>
            <td style={tdStyle}>{g.familia_match || '—'}</td>
            <td style={tdStyle}>{g.departamento_match || '—'}</td>
            <td style={tdStyle}>{g.comissao_pct}%</td>
            <td style={tdStyle}>{g.prioridade}</td>
            <td style={tdStyle}><input type="checkbox" checked={g.ativo} onChange={(e) => editar(g, { ativo: e.target.checked })} /></td>
            <td style={tdStyle}><button onClick={() => excluir(g)} style={linkBtn}>excluir</button></td>
          </tr>
        ))}
      </Tabela>
    </>
  );
}

// ============================ Serviços ============================
function ServicosTab({ contaParam, mes, ano, setErro }: { contaParam: string; mes: number; ano: number; setErro: (s: string) => void }) {
  const [items, setItems] = useState<Servico[]>([]);
  const [totais, setTotais] = useState<Record<string, number>>({});
  const [carregando, setCarregando] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    try {
      setCarregando(true);
      const r = await fetch(`/api/estoque/comissao/servicos?mes=${mes}&ano=${ano}${contaParam}`);
      const d = await r.json();
      if (d.erro) { setErro(d.erro); return; }
      setItems(d.items || []); setTotais(d.totais || {});
    } catch (ex) { setErro('Erro: ' + (ex as Error).message); }
    finally { setCarregando(false); }
  }, [contaParam, mes, ano, setErro]);
  useEffect(() => { void carregar(); }, [carregar]);

  const sync = async () => {
    setCarregando(true);
    const r = await fetch(`/api/estoque/comissao/servicos/sync?mes=${mes}&ano=${ano}${contaParam}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mes, ano }),
    });
    const d = await r.json();
    setCarregando(false);
    if (d.erro) { setErro(d.erro); return; }
    alert(`Sync OK: ${d.inserted} inseridas, ${d.skipped_ajustados} ajustadas mantidas`);
    carregar();
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <button onClick={sync} style={btnGhost} disabled={carregando}>{carregando ? 'Processando…' : 'Sincronizar OS do mês'}</button>
      </div>
      <Cards>
        <KCard label="OS" valor={String(totais.count ?? 0)} />
        <KCard label="Pendentes" valor={String(totais.pendentes ?? 0)} />
        <KCard label="V. Líquido" valor={fmtRS(totais.valor_liquido_total ?? 0)} />
        <KCard label="Comissão" valor={fmtRS(totais.comissao_total ?? 0)} />
        <KCard label="Fundo" valor={fmtRS(totais.fundo_total ?? 0)} />
      </Cards>
      {carregando && <div style={{ color: '#888', fontSize: '.85rem' }}>Carregando…</div>}
      <Tabela headers={['Emissão', 'OS', 'Cliente', 'Serviço', 'V. Líquido', 'V1', 'V2', 'Com. %', 'Comissão', 'Status', '']}>
        {items.map((s) => (
          <ServicoRow key={s.id} s={s} editando={editId === s.id} onEditar={() => setEditId(editId === s.id ? null : s.id)} contaParam={contaParam} onSalvo={() => { setEditId(null); carregar(); }} setErro={setErro} />
        ))}
      </Tabela>
    </>
  );
}

function ServicoRow({ s, editando, onEditar, contaParam, onSalvo, setErro }: { s: Servico; editando: boolean; onEditar: () => void; contaParam: string; onSalvo: () => void; setErro: (m: string) => void }) {
  const [f, setF] = useState({ vendedor_1: s.vendedor_1 || '', vendedor_2: s.vendedor_2 || '', divisao_fundo_pct: String(s.divisao_fundo_pct ?? 0), divisao_v1_pct: String(s.divisao_v1_pct ?? 100), divisao_v2_pct: String(s.divisao_v2_pct ?? 0), comissao_override_pct: s.comissao_override_pct != null ? String(s.comissao_override_pct) : '', justificativa: '' });

  const salvar = async () => {
    const r = await fetch(`/api/estoque/comissao/servicos/ajuste?${contaParam.replace(/^&/, '')}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ os_numero: s.os_numero, os_item_seq: s.os_item_seq, vendedor_1: f.vendedor_1, vendedor_2: f.vendedor_2, divisao_fundo_pct: parseFloat(f.divisao_fundo_pct) || 0, divisao_v1_pct: parseFloat(f.divisao_v1_pct) || 0, divisao_v2_pct: parseFloat(f.divisao_v2_pct) || 0, comissao_override_pct: f.comissao_override_pct, justificativa: f.justificativa }),
    });
    const d = await r.json();
    if (d.erro) { setErro(d.erro); return; }
    onSalvo();
  };

  return (
    <>
      <tr>
        <td style={tdStyle}>{s.data_emissao}</td>
        <td style={tdStyle}>{s.os_numero}</td>
        <td style={tdStyle}>{s.cliente || '—'}</td>
        <td style={tdStyle}>{s.descricao_servico}</td>
        <td style={tdStyle}>{fmtRS(s.valor_liquido)}</td>
        <td style={tdStyle}>{s.vendedor_1 || '—'}</td>
        <td style={tdStyle}>{s.vendedor_2 || '—'}</td>
        <td style={tdStyle}>{s.comissao_final_pct ?? '—'}</td>
        <td style={tdStyle}>{fmtRS(s.valor_total)}</td>
        <td style={tdStyle}><span style={{ color: s.status === 'ajustado' ? '#16a34a' : '#999' }}>{s.status}</span></td>
        <td style={tdStyle}><button onClick={onEditar} style={linkBtn}>{editando ? 'fechar' : 'ajustar'}</button></td>
      </tr>
      {editando && (
        <tr><td colSpan={11} style={{ ...tdStyle, background: '#fafafa' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field label="Vendedor 1"><input value={f.vendedor_1} onChange={(e) => setF({ ...f, vendedor_1: e.target.value })} style={{ ...inputStyle, width: 140 }} /></Field>
            <Field label="Vendedor 2"><input value={f.vendedor_2} onChange={(e) => setF({ ...f, vendedor_2: e.target.value })} style={{ ...inputStyle, width: 140 }} /></Field>
            <Field label="Fundo %"><input value={f.divisao_fundo_pct} onChange={(e) => setF({ ...f, divisao_fundo_pct: e.target.value })} type="number" style={{ ...inputStyle, width: 70 }} /></Field>
            <Field label="V1 %"><input value={f.divisao_v1_pct} onChange={(e) => setF({ ...f, divisao_v1_pct: e.target.value })} type="number" style={{ ...inputStyle, width: 70 }} /></Field>
            <Field label="V2 %"><input value={f.divisao_v2_pct} onChange={(e) => setF({ ...f, divisao_v2_pct: e.target.value })} type="number" style={{ ...inputStyle, width: 70 }} /></Field>
            <Field label="Override %"><input value={f.comissao_override_pct} onChange={(e) => setF({ ...f, comissao_override_pct: e.target.value })} type="number" placeholder="auto" style={{ ...inputStyle, width: 80 }} /></Field>
            <Field label="Justificativa"><input value={f.justificativa} onChange={(e) => setF({ ...f, justificativa: e.target.value })} style={{ ...inputStyle, width: 200 }} /></Field>
            <button onClick={salvar} style={btnPrimary}>Salvar</button>
          </div>
        </td></tr>
      )}
    </>
  );
}

// ============================ Vendas ============================
function VendasTab({ contaParam, mes, ano, setErro }: { contaParam: string; mes: number; ano: number; setErro: (s: string) => void }) {
  const [items, setItems] = useState<VendaItem[]>([]);
  const [totais, setTotais] = useState<Record<string, number>>({});
  const [grupo, setGrupo] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setCarregando(true);
      const grupoP = grupo ? `&grupo=${grupo}` : '';
      const r = await fetch(`/api/estoque/comissao/vendas?mes=${mes}&ano=${ano}${grupoP}${contaParam}`);
      const d = await r.json();
      if (d.erro) { setErro(d.erro); return; }
      setItems(d.items || []); setTotais(d.totais || {});
    } catch (ex) { setErro('Erro: ' + (ex as Error).message); }
    finally { setCarregando(false); }
  }, [contaParam, mes, ano, grupo, setErro]);
  useEffect(() => { void carregar(); }, [carregar]);

  return (
    <>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'flex-end' }}>
        <Sel label="Grupo" value={grupo} onChange={setGrupo} options={[{ value: '', label: 'Todos' }, { value: 'maquinas', label: 'Máquinas' }, { value: 'pecas', label: 'Peças' }]} />
      </div>
      <Cards>
        <KCard label="Itens" valor={String(totais.count ?? 0)} />
        <KCard label="V. Venda" valor={fmtRS(totais.valor_venda_total ?? 0)} />
        <KCard label="Comissão" valor={fmtRS(totais.comissao_total ?? 0)} />
        <KCard label="Margem Loja" valor={fmtRS(totais.margem_loja_total ?? 0)} />
        <KCard label="CMC" valor={fmtRS(totais.cmc_total ?? 0)} />
      </Cards>
      {carregando && <div style={{ color: '#888', fontSize: '.85rem' }}>Carregando…</div>}
      <Tabela headers={['Pedido', 'Vendedor', 'Cliente', 'Produto', 'Família', 'V. Venda', 'CMC', 'Com. %', 'Comissão', 'Margem', 'Status', '']}>
        {items.map((v) => (
          <VendaRow key={v.venda_id} v={v} editando={editId === v.venda_id} onEditar={() => setEditId(editId === v.venda_id ? null : v.venda_id)} contaParam={contaParam} onSalvo={() => { setEditId(null); carregar(); }} setErro={setErro} />
        ))}
      </Tabela>
    </>
  );
}

function VendaRow({ v, editando, onEditar, contaParam, onSalvo, setErro }: { v: VendaItem; editando: boolean; onEditar: () => void; contaParam: string; onSalvo: () => void; setErro: (m: string) => void }) {
  const [f, setF] = useState({ comissao_override_pct: v.comissao_fonte === 'override' ? String(v.comissao_pct) : '', custos_extras: '0', desconto: '0', justificativa: '' });

  const salvar = async () => {
    const r = await fetch(`/api/estoque/comissao/vendas/ajuste?${contaParam.replace(/^&/, '')}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venda_id: v.venda_id, vendas_itens_id: v.vendas_itens_id, comissao_override_pct: f.comissao_override_pct, custos_extras: parseFloat(f.custos_extras) || 0, desconto: parseFloat(f.desconto) || 0, justificativa: f.justificativa }),
    });
    const d = await r.json();
    if (d.erro) { setErro(d.erro); return; }
    onSalvo();
  };

  return (
    <>
      <tr>
        <td style={tdStyle}>{v.numero_pedido}</td>
        <td style={tdStyle}>{v.vendedor || '—'}</td>
        <td style={tdStyle}>{v.cliente || '—'}</td>
        <td style={tdStyle}>{v.produto_descricao}</td>
        <td style={tdStyle}>{v.familia}</td>
        <td style={tdStyle}>{fmtRS(v.valor_venda)}</td>
        <td style={tdStyle}>{fmtRS(v.cmc_total)}</td>
        <td style={tdStyle}>{v.comissao_pct}% <span style={{ color: '#bbb', fontSize: '.65rem' }}>({v.comissao_fonte})</span></td>
        <td style={tdStyle}>{fmtRS(v.valor_comissao)}</td>
        <td style={tdStyle}>{fmtRS(v.margem_loja)}</td>
        <td style={tdStyle}><span style={{ color: v.status === 'ajustado' ? '#16a34a' : '#999' }}>{v.status}</span></td>
        <td style={tdStyle}><button onClick={onEditar} style={linkBtn}>{editando ? 'fechar' : 'ajustar'}</button></td>
      </tr>
      {editando && (
        <tr><td colSpan={12} style={{ ...tdStyle, background: '#fafafa' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field label="Override %"><input value={f.comissao_override_pct} onChange={(e) => setF({ ...f, comissao_override_pct: e.target.value })} type="number" placeholder="regra" style={{ ...inputStyle, width: 80 }} /></Field>
            <Field label="Custos extras"><input value={f.custos_extras} onChange={(e) => setF({ ...f, custos_extras: e.target.value })} type="number" style={{ ...inputStyle, width: 90 }} /></Field>
            <Field label="Desconto"><input value={f.desconto} onChange={(e) => setF({ ...f, desconto: e.target.value })} type="number" style={{ ...inputStyle, width: 90 }} /></Field>
            <Field label="Justificativa"><input value={f.justificativa} onChange={(e) => setF({ ...f, justificativa: e.target.value })} style={{ ...inputStyle, width: 220 }} /></Field>
            <button onClick={salvar} style={btnPrimary}>Salvar</button>
          </div>
        </td></tr>
      )}
    </>
  );
}

// ============================ Custos ============================
function CustosTab({ contaParam, mes, ano, setErro }: { contaParam: string; mes: number; ano: number; setErro: (s: string) => void }) {
  const [items, setItems] = useState<Custo[]>([]);
  const [totais, setTotais] = useState<Record<string, number>>({});
  const [, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      const r = await fetch(`/api/estoque/comissao/custos-vendedor?mes=${mes}&ano=${ano}${contaParam}`);
      const d = await r.json();
      if (d.erro) { setErro(d.erro); return; }
      setItems(d.items || []); setTotais(d.totais || {});
    } catch (ex) { setErro('Erro: ' + (ex as Error).message); }
    finally { setCarregando(false); }
  }, [contaParam, mes, ano, setErro]);
  useEffect(() => { void carregar(); }, [carregar]);

  const salvar = async (c: Custo, campos: Partial<Custo>) => {
    const r = await fetch(`/api/estoque/comissao/custos-vendedor?${contaParam.replace(/^&/, '')}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: c.nome, mes, ano, salario: c.salario, encargos: c.encargos, custos_extras: c.custos_extras, carro_aluguel: c.carro_aluguel, combustivel: c.combustivel, manutencao: c.manutencao, ...campos }),
    });
    const d = await r.json();
    if (d.erro) { setErro(d.erro); return; }
    carregar();
  };
  const copiar = async () => {
    const r = await fetch(`/api/estoque/comissao/custos-vendedor/copiar-mes-anterior?mes=${mes}&ano=${ano}${contaParam}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mes, ano }),
    });
    const d = await r.json();
    if (d.erro) { setErro(d.erro); return; }
    alert(`Copiadas ${d.copiadas} linhas${d.info ? ' — ' + d.info : ''}`);
    carregar();
  };

  const campos: Array<keyof Custo> = ['salario', 'encargos', 'custos_extras', 'carro_aluguel', 'combustivel', 'manutencao'];

  return (
    <>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <button onClick={copiar} style={btnGhost}>Copiar do mês anterior</button>
      </div>
      <Cards>
        <KCard label="Salário" valor={fmtRS(totais.salario ?? 0)} />
        <KCard label="Encargos" valor={fmtRS(totais.encargos ?? 0)} />
        <KCard label="Carro" valor={fmtRS(totais.total_carro ?? 0)} />
        <KCard label="Total" valor={fmtRS(totais.total_custo ?? 0)} />
      </Cards>
      <Tabela headers={['Nome', 'Tipo', 'Salário', 'Encargos', 'C. Extras', 'Carro', 'Combust.', 'Manut.', 'Total']}>
        {items.map((c) => (
          <tr key={c.nome}>
            <td style={tdStyle}>{c.nome}</td>
            <td style={tdStyle}>{c.tipo}</td>
            {campos.map((k) => (
              <td key={k} style={tdStyle}>
                <input defaultValue={Number(c[k] ?? 0)} type="number" step="0.01" style={{ ...inputStyle, width: 90 }}
                  onBlur={(e) => { const v = parseFloat(e.target.value) || 0; if (v !== Number(c[k] ?? 0)) salvar(c, { [k]: v } as Partial<Custo>); }} />
              </td>
            ))}
            <td style={{ ...tdStyle, fontWeight: 700 }}>{fmtRS(c.total_custo)}</td>
          </tr>
        ))}
      </Tabela>
    </>
  );
}

// ============================ Relatório ============================
function RelatorioTab({ contaParam, mes, ano, setErro }: { contaParam: string; mes: number; ano: number; setErro: (s: string) => void }) {
  const [dominio, setDominio] = useState('ambos');
  const [data, setData] = useState<{ por_vendedor: RelPessoa[]; totais: Record<string, number> } | null>(null);
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setCarregando(true);
      const r = await fetch(`/api/estoque/comissao/relatorio?mes=${mes}&ano=${ano}&dominio=${dominio}${contaParam}`);
      const d = await r.json();
      if (d.erro) { setErro(d.erro); return; }
      setData(d);
    } catch (ex) { setErro('Erro: ' + (ex as Error).message); }
    finally { setCarregando(false); }
  }, [contaParam, mes, ano, dominio, setErro]);
  useEffect(() => { void carregar(); }, [carregar]);

  return (
    <>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'flex-end' }}>
        <Sel label="Domínio" value={dominio} onChange={setDominio} options={[{ value: 'ambos', label: 'Ambos' }, { value: 'servicos', label: 'Serviços' }, { value: 'vendas', label: 'Vendas' }]} />
      </div>
      {data && (
        <Cards>
          <KCard label="Pessoas" valor={String(data.totais.num_pessoas ?? 0)} />
          <KCard label="Valor total" valor={fmtRS(data.totais.valor_total ?? 0)} />
          <KCard label="Comissão total" valor={fmtRS(data.totais.comissao_total ?? 0)} />
          <KCard label="Fundo" valor={fmtRS(data.totais.fundo_total ?? 0)} />
        </Cards>
      )}
      {carregando && <div style={{ color: '#888', fontSize: '.85rem' }}>Carregando…</div>}
      <Tabela headers={['Vendedor', 'OS', 'Vendas', 'Valor', 'Comissão']}>
        {(data?.por_vendedor || []).map((p) => (
          <tr key={p.vendedor}>
            <td style={tdStyle}>{p.vendedor}</td>
            <td style={tdStyle}>{p.num_os}</td>
            <td style={tdStyle}>{p.num_vendas}</td>
            <td style={tdStyle}>{fmtRS(p.valor_total)}</td>
            <td style={{ ...tdStyle, fontWeight: 700, color: '#dc2626' }}>{fmtRS(p.comissao_total)}</td>
          </tr>
        ))}
      </Tabela>
    </>
  );
}

// ============================ Shared UI ============================
function Tabela({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #eee', borderRadius: 12 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{headers.map((h, i) => <th key={i} style={thStyle}>{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Cards({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>{children}</div>;
}

function KCard({ label, valor }: { label: string; valor: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: '12px 18px', minWidth: 120 }}>
      <div style={{ color: '#888', fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#333' }}>{valor}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', color: '#888', fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3, fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  );
}

function Sel({ label, value, onChange, options }: { label: string; value: string | number; onChange: (v: string) => void; options: Array<{ value: string | number; label: string }> }) {
  return (
    <div>
      <label style={{ display: 'block', color: '#888', fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3, fontWeight: 600 }}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ padding: '9px 12px', border: '1px solid #e0e0e0', background: '#fff', color: '#333', borderRadius: 8, fontSize: '.82rem', outline: 'none' }}>
        {options.map((o) => <option key={String(o.value)} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
