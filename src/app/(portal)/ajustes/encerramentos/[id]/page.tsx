'use client';
// Recibo de um encerramento informal. Portado de encerramento-detalhe.ejs.
// Consome /api/ajustes/encerramentos-informais/[id].
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';

interface ItemEnc {
  sku?: string | null; codigo?: string | null; descricao?: string | null; qtde?: number;
  valorUnit?: number | null; codLocal?: number | string | null; idAjuste?: number | string | null;
  idMovest?: number | string | null; erro?: string;
}
interface Encerramento {
  id?: number; numero_pedido?: string; id_pedido?: number; conta_omie?: string; criado_em?: string;
  nome_cliente?: string | null; codigo_cliente?: number | null; status?: string; razao?: string;
  erro?: string | null; itens?: ItemEnc[]; criado_por?: string;
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmtBRL(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return '-';
  return brl.format(Number(n));
}
function fmtDT(s?: string | null): string {
  if (!s) return '-';
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleString('pt-BR');
}

const thStyle: React.CSSProperties = { background: '#f8fafc', color: '#475569', fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.4px', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f1f5f9', color: '#334155', fontSize: '.82rem' };

function corStatus(s?: string): React.CSSProperties {
  return s === 'aplicado' ? { background: '#d1fae5', color: '#065f46' }
    : s === 'parcial' ? { background: '#fef3c7', color: '#92400e' }
    : s === 'erro' ? { background: '#fee2e2', color: '#991b1b' }
    : { background: '#f1f5f9', color: '#334155' };
}

export default function EncerramentoDetalhePage() {
  const { userProfile } = useAuth();
  const { temAcesso, loading: permLoading } = usePermissoes(userProfile?.id);
  const params = useParams();
  const id = Array.isArray(params?.id) ? params.id[0] : (params?.id as string | undefined);

  const [e, setE] = useState<Encerramento | null>(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async (encId: string) => {
    setCarregando(true);
    try {
      const r = await fetch(`/api/ajustes/encerramentos-informais/${encodeURIComponent(encId)}`);
      const d = await r.json();
      if (d.erro) setErro(d.erro); else setE(d);
    } catch (ex) {
      setErro('erro de rede: ' + (ex as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (id) carregar(id);
  }, [id, carregar]);

  if (!permLoading && userProfile && !temAcesso('ajustes:pedidos')) return <SemPermissao />;

  if (carregando) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Carregando…</div>;
  if (erro || !e) return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: 16 }}>Encerramento nao encontrado: {erro || 'sem dados'}</div>
      <div style={{ marginTop: 12 }}><Link href="/ajustes/pedidos" style={{ color: '#2563eb', textDecoration: 'none' }}>← voltar p/ Pedidos</Link></div>
    </div>
  );

  const itens = Array.isArray(e.itens) ? e.itens : [];
  const okN = itens.filter((i) => !i.erro).length;
  const errN = itens.length - okN;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Encerramento informal · pedido #{e.numero_pedido || '?'}</h1>
          <p style={{ color: '#64748b', fontSize: '.82rem' }}>Recibo da operacao. Log id {e.id} · gravado em {fmtDT(e.criado_em)}.</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link href="/ajustes/pedidos" style={{ padding: '7px 12px', background: '#e2e8f0', color: '#334155', borderRadius: 6, fontSize: '.82rem', textDecoration: 'none' }}>← voltar p/ Pedidos</Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: '.65rem', color: '#64748b', textTransform: 'uppercase' }}>Status</div>
          <div style={{ marginTop: 6 }}><span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 5, fontSize: '.85rem', fontWeight: 600, ...corStatus(e.status) }}>{(e.status || '?').toUpperCase()}</span></div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: '.65rem', color: '#64748b', textTransform: 'uppercase' }}>Conta</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 700, marginTop: 4 }}>{e.conta_omie || '-'}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: '.65rem', color: '#64748b', textTransform: 'uppercase' }}>Itens baixados</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 700, marginTop: 4 }}>{okN}/{itens.length}{errN ? <span style={{ color: '#b91c1c', fontSize: '.85rem', marginLeft: 4 }}>({errN} erro)</span> : null}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: '.65rem', color: '#64748b', textTransform: 'uppercase' }}>Cliente</div>
          <div style={{ fontSize: '.85rem', fontWeight: 500, marginTop: 6 }}>{e.nome_cliente || ('cli #' + (e.codigo_cliente || '?'))}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: '.65rem', color: '#64748b', textTransform: 'uppercase' }}>Pedido</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 700, marginTop: 4 }}>#{e.numero_pedido || '?'}</div>
          <div style={{ fontSize: '.62rem', color: '#94a3b8' }}>id {e.id_pedido}</div>
        </div>
      </div>

      {e.erro && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: '.82rem' }}><b>Erro registrado:</b> {e.erro}</div>}

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: '.65rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>Razao</div>
        <div style={{ fontSize: '.85rem', color: '#334155', whiteSpace: 'pre-wrap' }}>{e.razao || '(sem razao)'}</div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '8px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '.65rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.4px' }}>Itens baixados (saida de estoque tipo SAI motivo OPS)</div>
          <div style={{ fontSize: '.72rem', color: '#64748b' }}>{itens.length} linha(s)</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>SKU</th>
                <th style={thStyle}>Descricao</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Qtde</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Vlr unit</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Local</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Ajuste Omie</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Movimento</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {itens.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Sem itens registrados.</td></tr>
              ) : itens.map((it, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: it.erro ? '#fef2f2' : undefined }}>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '.72rem' }}>{it.sku || it.codigo || ''}</td>
                  <td style={{ ...tdStyle, fontSize: '.78rem' }}>{it.descricao || ''}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{it.qtde}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{it.valorUnit != null ? fmtBRL(it.valorUnit) : '-'}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontSize: '.72rem' }}>{it.codLocal || '-'}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'monospace', fontSize: '.72rem' }}>{it.idAjuste || '-'}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'monospace', fontSize: '.72rem' }}>{it.idMovest || '-'}</td>
                  <td style={{ ...tdStyle, fontSize: '.72rem' }}>{it.erro ? <span style={{ color: '#b91c1c' }}>ERRO: {it.erro}</span> : <span style={{ color: '#047857' }}>baixado</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 12, fontSize: '.72rem', color: '#64748b' }}>
        Cada movimento foi datado de {fmtDT(e.criado_em).slice(0, 10)} e aparece em <b>Movimentacao de estoque</b> do Omie com observacao referenciando o numero do pedido e a razao.
      </div>
    </div>
  );
}
