'use client';
// Saude mensal: KPIs de correcoes de CMC + alertas + encerramentos informais.
// Portado de saude-mensal.ejs. Consome /api/ajustes/saude-mensal.
import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';

interface TopProduto { codigo: string; descricao: string; count: number; valorEstim: number }
interface Kpis {
  totalCorrAplic?: number; totalCorrRevert?: number; totalCorrErro?: number; valorCorrigido?: number;
  porOrigem?: Record<string, number>; topProdutos?: TopProduto[]; totalEnc?: number;
  encOk?: number; encParcial?: number; encErro?: number; alertasTotal?: number; alertasNaoLidos?: number;
  alertasPorTipo?: Record<string, number>;
}
interface MesOpt { v: string; nome: string }
interface Payload {
  conta?: string | null; mesSelecionado?: string; nomeMes?: string; meses?: MesOpt[]; kpis?: Kpis; erro?: string | null;
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmtBRL(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return '-';
  return brl.format(Number(n));
}
function fmtNum(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return '-';
  return Number(n).toLocaleString('pt-BR');
}

const thStyle: React.CSSProperties = { background: '#f8fafc', color: '#475569', fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.4px', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f1f5f9', color: '#334155', fontSize: '.82rem' };

function Kpi({ label, valor, cor }: { label: string; valor: string; cor?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
      <div style={{ fontSize: '.65rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.4px' }}>{label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: 4, color: cor || '#1e293b' }}>{valor}</div>
    </div>
  );
}

export default function SaudeMensalPage() {
  const { userProfile } = useAuth();
  const { temAcesso, loading: permLoading } = usePermissoes(userProfile?.id);
  const { conta, contaParam } = useConta();

  function mesAtual(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  const [mes, setMes] = useState(mesAtual());
  const [dados, setDados] = useState<Payload | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  const buscar = useCallback(async () => {
    setCarregando(true); setErro('');
    try {
      let qs = `mes=${encodeURIComponent(mes)}`;
      if (contaParam) qs += contaParam;
      const r = await fetch(`/api/ajustes/saude-mensal?${qs}`);
      const d = (await r.json()) as Payload;
      if (d.erro && !d.kpis) { setErro(d.erro); return; }
      setDados(d);
      if (d.erro) setErro(d.erro);
    } catch (ex) {
      setErro('erro de rede: ' + (ex as Error).message);
    } finally { setCarregando(false); }
  }, [mes, contaParam]);

  useEffect(() => {
    buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conta, mes]);

  if (!permLoading && userProfile && !temAcesso('ajustes:saude-mensal')) return <SemPermissao />;

  const k = dados?.kpis;
  const meses = dados?.meses || [];
  const origens = k?.porOrigem ? Object.entries(k.porOrigem) : [];
  const tipos = k?.alertasPorTipo ? Object.entries(k.alertasPorTipo) : [];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Saude mensal</h1>
          <p style={{ color: '#64748b', fontSize: '.82rem' }}>Conta <b>{conta ? conta.toUpperCase() : 'Todas'}</b> · {dados?.nomeMes || '—'}</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', fontSize: '.65rem', color: '#64748b', marginBottom: 2 }}>Mes</label>
            <select value={mes} onChange={(e) => setMes(e.target.value)} style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.82rem' }}>
              {(meses.length ? meses : [{ v: mes, nome: dados?.nomeMes || mes }]).map((m) => (
                <option key={m.v} value={m.v}>{m.nome}</option>
              ))}
            </select>
          </div>
          <ContaSelector />
        </div>
      </div>

      <div style={{ marginBottom: 12, fontSize: '.8rem' }}>
        <Link href="/ajustes/pedidos" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>← voltar p/ Pedidos</Link>
      </div>

      {erro && <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '.82rem' }}>{erro}</div>}

      {carregando && !dados ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Carregando…</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
            <Kpi label="Correcoes aplicadas" valor={fmtNum(k?.totalCorrAplic)} cor="#047857" />
            <Kpi label="Revertidas" valor={fmtNum(k?.totalCorrRevert)} cor="#b45309" />
            <Kpi label="Com erro" valor={fmtNum(k?.totalCorrErro)} cor="#b91c1c" />
            <Kpi label="Valor corrigido (estim.)" valor={fmtBRL(k?.valorCorrigido)} />
            <Kpi label="Encerramentos informais" valor={fmtNum(k?.totalEnc)} />
            <Kpi label="Alertas (nao lidos)" valor={`${fmtNum(k?.alertasTotal)} (${fmtNum(k?.alertasNaoLidos)})`} cor="#b45309" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            {/* Encerramentos */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
              <h2 style={{ fontSize: '.9rem', fontWeight: 700, color: '#1e293b', marginBottom: 10 }}>Encerramentos informais</h2>
              <div style={{ display: 'flex', gap: 16, fontSize: '.82rem' }}>
                <div><span style={{ color: '#047857', fontWeight: 700, fontSize: '1.1rem' }}>{fmtNum(k?.encOk)}</span> <span style={{ color: '#64748b' }}>aplicados</span></div>
                <div><span style={{ color: '#b45309', fontWeight: 700, fontSize: '1.1rem' }}>{fmtNum(k?.encParcial)}</span> <span style={{ color: '#64748b' }}>parciais</span></div>
                <div><span style={{ color: '#b91c1c', fontWeight: 700, fontSize: '1.1rem' }}>{fmtNum(k?.encErro)}</span> <span style={{ color: '#64748b' }}>com erro</span></div>
              </div>
            </div>

            {/* Correcoes por origem */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
              <h2 style={{ fontSize: '.9rem', fontWeight: 700, color: '#1e293b', marginBottom: 10 }}>Correcoes por origem</h2>
              {origens.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: '.82rem' }}>(nenhuma)</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {origens.map(([o, n]) => (
                    <div key={o} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.82rem' }}>
                      <span style={{ color: '#475569' }}>{o}</span><b>{fmtNum(n)}</b>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Alertas por tipo */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
              <h2 style={{ fontSize: '.9rem', fontWeight: 700, color: '#1e293b', marginBottom: 10 }}>Alertas por tipo</h2>
              {tipos.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: '.82rem' }}>(nenhum)</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {tipos.map(([t, n]) => (
                    <div key={t} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.82rem' }}>
                      <span style={{ color: '#475569' }}>{t}</span><b>{fmtNum(n)}</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Top produtos corrigidos */}
          <div style={{ marginTop: 18, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '8px 14px', borderBottom: '1px solid #e2e8f0', fontSize: '.65rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.4px' }}>Top produtos corrigidos (por valor estimado)</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Codigo</th>
                    <th style={thStyle}>Descricao</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Correcoes</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Valor estimado</th>
                  </tr>
                </thead>
                <tbody>
                  {(k?.topProdutos || []).length === 0 ? (
                    <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Nenhuma correcao aplicada no mes.</td></tr>
                  ) : (k!.topProdutos!).map((p) => (
                    <tr key={p.codigo} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '.72rem' }}>{p.codigo}</td>
                      <td style={{ ...tdStyle, fontSize: '.78rem' }}>{p.descricao || ''}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtNum(p.count)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtBRL(p.valorEstim)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
