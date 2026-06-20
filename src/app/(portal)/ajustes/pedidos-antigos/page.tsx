'use client';
// Pedidos abertos ha mais de X dias, consolidado NOVA + CASTRO, agrupado por
// criador. Portado de pedidos-antigos.ejs. Consome /api/ajustes/pedidos-antigos.
import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';

interface Pedido {
  numero?: string | null; contaLabel?: string; dataInclusao?: string | null; diasAberto?: number | null;
  nomeCliente?: string | null; codigoCliente?: number | null; etapa?: string | null; etapaNome?: string | null;
  criadoPorNome?: string | null; criadoPorLogin?: string | null; valorTotal?: number; itens?: unknown[];
}
interface Payload { diasMin?: number; total?: number; pedidos?: Pedido[]; erro?: string }

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmtBRL(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return '-';
  return brl.format(Number(n));
}

const thStyle: React.CSSProperties = { background: '#f8fafc', color: '#475569', fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.4px', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f1f5f9', color: '#334155', fontSize: '.82rem' };

export default function PedidosAntigosPage() {
  const { userProfile } = useAuth();
  const { temAcesso, loading: permLoading } = usePermissoes(userProfile?.id);

  const [dias, setDias] = useState(15);
  const [dados, setDados] = useState<Payload | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  const buscar = useCallback(async () => {
    setCarregando(true); setErro('');
    try {
      const r = await fetch(`/api/ajustes/pedidos-antigos?dias=${encodeURIComponent(dias)}`);
      const d = (await r.json()) as Payload;
      if (d.erro) { setErro(d.erro); return; }
      setDados(d);
    } catch (ex) {
      setErro('erro de rede: ' + (ex as Error).message);
    } finally { setCarregando(false); }
  }, [dias]);

  // busca inicial (apenas no mount; recargas posteriores via botao Atualizar)
  useEffect(() => {
    buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!permLoading && userProfile && !temAcesso('ajustes')) return <SemPermissao />;

  const peds = dados?.pedidos || [];
  // agrupa por criador (lista ja vem ordenada por criador)
  const grupos: { nome: string; itens: Pedido[] }[] = [];
  for (const p of peds) {
    const nome = p.criadoPorNome || p.criadoPorLogin || '(?)';
    let g = grupos.find((x) => x.nome === nome);
    if (!g) { g = { nome, itens: [] }; grupos.push(g); }
    g.itens.push(p);
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Pedidos abertos ha mais de {dias} dias</h1>
          <p style={{ color: '#64748b', fontSize: '.82rem' }}>Consolidado <b>NOVA + CASTRO</b>, agrupado por criador. {dados ? `${dados.total ?? peds.length} pedido(s).` : ''}</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', fontSize: '.65rem', color: '#64748b', marginBottom: 2 }}>Min. dias em aberto</label>
            <input type="number" min={1} value={dias} onChange={(e) => setDias(Math.max(1, parseInt(e.target.value, 10) || 1))} style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.82rem', width: 90 }} />
          </div>
          <button onClick={buscar} disabled={carregando} style={{ padding: '7px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: 'pointer', opacity: carregando ? 0.5 : 1 }}>{carregando ? 'Carregando…' : 'Atualizar'}</button>
          <a href={`/api/ajustes/pedidos-antigos?dias=${dias}&fmt=csv`} style={{ padding: '7px 12px', background: '#f1f5f9', color: '#334155', borderRadius: 6, fontSize: '.82rem', textDecoration: 'none' }}>CSV</a>
          <a href={`/api/ajustes/pedidos-antigos?dias=${dias}&fmt=pdf`} target="_blank" rel="noreferrer" style={{ padding: '7px 12px', background: '#f1f5f9', color: '#334155', borderRadius: 6, fontSize: '.82rem', textDecoration: 'none' }}>PDF</a>
        </div>
      </div>

      <div style={{ marginBottom: 12, fontSize: '.8rem' }}>
        <Link href="/ajustes/pedidos" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>← voltar p/ Pedidos</Link>
      </div>

      {erro && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '.82rem' }}>{erro}</div>}

      {!dados ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Carregando…</div>
      ) : peds.length === 0 ? (
        <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', borderRadius: 8, padding: 16, fontSize: '.85rem' }}>Nenhum pedido aberto ha mais de {dias} dias. 🎉</div>
      ) : (
        grupos.map((g) => (
          <div key={g.nome} style={{ marginBottom: 18 }}>
            <h2 style={{ fontSize: '.95rem', fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>{g.nome} <span style={{ fontWeight: 400, color: '#64748b', fontSize: '.8rem' }}>({g.itens.length} pedido{g.itens.length === 1 ? '' : 's'})</span></h2>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Inclusao</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Dias</th>
                      <th style={thStyle}>Conta</th>
                      <th style={thStyle}>Pedido</th>
                      <th style={thStyle}>Cliente</th>
                      <th style={thStyle}>Etapa</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Itens</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.itens.map((p, i) => {
                      const corDias = (p.diasAberto || 0) >= 30 ? { color: '#b91c1c', fontWeight: 600 } : (p.diasAberto || 0) >= 15 ? { color: '#b45309' } : {};
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ ...tdStyle, fontSize: '.72rem' }}>{p.dataInclusao || ''}</td>
                          <td style={{ ...tdStyle, textAlign: 'right', ...corDias }}>{p.diasAberto != null ? p.diasAberto : '-'}</td>
                          <td style={{ ...tdStyle, fontSize: '.72rem' }}>{p.contaLabel || ''}</td>
                          <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{p.numero || '?'}</td>
                          <td style={{ ...tdStyle, fontSize: '.78rem' }}>{p.nomeCliente || ('cli #' + (p.codigoCliente || '?'))}</td>
                          <td style={{ ...tdStyle, fontSize: '.72rem' }}>{p.etapaNome || p.etapa || ''}</td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>{(p.itens || []).length}</td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtBRL(p.valorTotal)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
