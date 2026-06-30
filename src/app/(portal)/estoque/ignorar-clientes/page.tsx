'use client';
// Ignorar Clientes: CRUD de CNPJs que não devem contabilizar (vendas entre
// lojas, devoluções, transferências). Portado da tela /ignorar-clientes.
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';

interface Registro { id: number; conta_omie: string; cnpj: string; nome?: string; nota?: string; created_at?: string }

function mascaraCnpj(v: string): string {
  return v
    .replace(/\D/g, '')
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
    .slice(0, 18);
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 18, marginBottom: 18, boxShadow: '0 1px 4px rgba(0,0,0,.04)' };
const inp: React.CSSProperties = { padding: '8px 12px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, background: '#fff', outline: 'none' };
const lbl: React.CSSProperties = { fontSize: '.7rem', fontWeight: 600, color: '#888', textTransform: 'uppercase', marginBottom: 4, display: 'block' };
const btn = (disabled?: boolean): React.CSSProperties => ({ padding: '9px 18px', background: disabled ? '#bbb' : '#dc2626', color: '#fff', border: 'none', borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 });
const th: React.CSSProperties = { background: '#fafafa', color: '#888', fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.5px', padding: 10, textAlign: 'left', borderBottom: '1px solid #eee', fontWeight: 600 };
const td: React.CSSProperties = { padding: 10, borderBottom: '1px solid #f5f5f5', fontSize: '.82rem', color: '#444' };

export default function IgnorarClientesPage() {
  const { userProfile } = useAuth();
  const { pode, loading: permLoading } = usePermissoes(userProfile?.id);
  const { contas } = useConta();

  const [lista, setLista] = useState<Registro[]>([]);
  const [cnpj, setCnpj] = useState('');
  const [nome, setNome] = useState('');
  const [nota, setNota] = useState('');
  const [contaFormRaw, setContaForm] = useState('');
  const [filtroConta, setFiltroConta] = useState('');
  const [msg, setMsg] = useState<{ texto: string; tipo: 'ok' | 'err' } | null>(null);

  // conta do formulário: a selecionada OU a primeira disponível (derivada, sem setState em effect)
  const contaForm = contaFormRaw || (contas[0] ? contas[0].id : '');

  const carregar = useCallback(() => {
    const q = filtroConta ? `?conta=${filtroConta}` : '';
    fetch(`/api/estoque/ignorar-clientes${q}`)
      .then((r) => r.json())
      .then((d) => setLista(d.lista || []))
      .catch((ex) => setMsg({ texto: 'Erro: ' + (ex as Error).message, tipo: 'err' }));
  }, [filtroConta]);

  useEffect(() => { carregar(); }, [carregar]);

  const adicionar = useCallback(async () => {
    const limpo = cnpj.replace(/\D/g, '');
    if (limpo.length !== 14) { setMsg({ texto: 'CNPJ inválido (14 dígitos)', tipo: 'err' }); return; }
    if (!contaForm) { setMsg({ texto: 'Selecione a conta', tipo: 'err' }); return; }
    const r = await fetch('/api/estoque/ignorar-clientes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cnpj: limpo, nome, nota, conta_omie: contaForm }),
    });
    const d = await r.json();
    if (d.erro) { setMsg({ texto: d.erro, tipo: 'err' }); return; }
    setMsg({ texto: 'CNPJ adicionado.', tipo: 'ok' });
    setCnpj(''); setNome(''); setNota('');
    carregar();
  }, [cnpj, nome, nota, contaForm, carregar]);

  const remover = useCallback(async (id: number) => {
    const r = await fetch(`/api/estoque/ignorar-clientes/${id}`, { method: 'DELETE' });
    const d = await r.json();
    if (d.erro) { setMsg({ texto: d.erro, tipo: 'err' }); return; }
    setMsg({ texto: 'Removido.', tipo: 'ok' });
    carregar();
  }, [carregar]);

  if (!permLoading && userProfile && !pode('estoque', 'ignorar-clientes')) return <SemPermissao />;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: '#333', marginBottom: 4, fontSize: '1.4rem', fontWeight: 700 }}>Ignorar Clientes</h1>
          <p style={{ color: '#888', fontSize: '.82rem' }}>CNPJs que NÃO devem contabilizar em vendas, notas, dashboard e relatórios.</p>
        </div>
        <ContaSelector />
      </div>
      <div style={{ margin: '14px 0 18px', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {pode('estoque', 'dashboard') && (<Link href="/estoque/dashboard" style={{ color: '#dc2626', textDecoration: 'none', fontSize: '.82rem', fontWeight: 600 }}>← Dashboard</Link>)}
        {pode('estoque', 'notas-entrada') && (<Link href="/estoque/notas-entrada" style={{ color: '#dc2626', textDecoration: 'none', fontSize: '.82rem', fontWeight: 600 }}>Notas de Entrada</Link>)}
      </div>

      {msg && <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: '.82rem', background: msg.tipo === 'ok' ? '#dcfce7' : '#fee2e2', color: msg.tipo === 'ok' ? '#166534' : '#991b1b' }}>{msg.texto}</div>}

      <div style={card}>
        <h3 style={{ fontSize: '.9rem', fontWeight: 700, marginBottom: 12, color: '#444' }}>Adicionar CNPJ</h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 160 }}><label style={lbl}>CNPJ</label><input value={cnpj} onChange={(e) => setCnpj(mascaraCnpj(e.target.value))} placeholder="00.000.000/0000-00" maxLength={18} style={{ ...inp, width: '100%' }} /></div>
          <div style={{ flex: 1, minWidth: 160 }}><label style={lbl}>Nome (opcional)</label><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Razão social" style={{ ...inp, width: '100%' }} /></div>
          <div style={{ flex: 1, minWidth: 160 }}><label style={lbl}>Nota</label><input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Motivo" style={{ ...inp, width: '100%' }} /></div>
          <div style={{ flex: '0 0 140px' }}><label style={lbl}>Conta</label><select value={contaForm} onChange={(e) => setContaForm(e.target.value)} style={{ ...inp, width: '100%' }}>{contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
          <button onClick={adicionar} style={btn()}>Adicionar</button>
        </div>
      </div>

      <div style={card}>
        <h3 style={{ fontSize: '.9rem', fontWeight: 700, marginBottom: 12, color: '#444' }}>Lista atual</h3>
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Filtrar conta</label>
          <select value={filtroConta} onChange={(e) => setFiltroConta(e.target.value)} style={{ ...inp, width: 160 }}>
            <option value="">Todas</option>
            {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['Conta', 'CNPJ', 'Nome', 'Nota', 'Adicionado', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {lista.length === 0 ? (
              <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: '#bbb', padding: 24 }}>Nenhum CNPJ ignorado</td></tr>
            ) : lista.map((r) => (
              <tr key={r.id}>
                <td style={td}><span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: '.7rem', fontWeight: 600, background: '#fef2f2', color: '#dc2626' }}>{r.conta_omie}</span></td>
                <td style={td}>{mascaraCnpj(r.cnpj || '')}</td>
                <td style={td}>{r.nome || '—'}</td>
                <td style={td}>{r.nota || '—'}</td>
                <td style={td}>{r.created_at ? new Date(r.created_at).toLocaleDateString('pt-BR') : '—'}</td>
                <td style={td}><button onClick={() => remover(r.id)} style={{ padding: '5px 10px', background: '#fff', color: '#dc2626', border: '1px solid #dc2626', borderRadius: 6, cursor: 'pointer', fontSize: '.75rem', fontWeight: 600 }}>Remover</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
