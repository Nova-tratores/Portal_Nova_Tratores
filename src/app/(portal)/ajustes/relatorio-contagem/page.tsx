'use client';
// Relatorio de contagem (por conta). Portado de relatorio-contagem.ejs.
// POR CONTA -> usa ContaSelector. Le da ultima varredura de estoque negativo;
// se nao houver (semVarredura), avisa pra rodar a varredura antes (link /ajustes/negativos).
// Consome GET /api/ajustes/relatorio-contagem. Export CSV gerado client-side.
import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';

// ---------- tipos do payload ----------
interface OutraEmpresa { conta?: string | null; contaLabel?: string | null; saldo?: number | null; cmc?: number | null }
interface Linha {
  codigoProduto?: number | null;
  codigo?: string | null;
  codigoIntegracao?: string | null;
  descricao?: string | null;
  localNome?: string | null;
  saldoSistema?: number | null;
  cmc?: number | null;
  suspeitaEmpresaErrada?: boolean;
  outraEmpresa?: OutraEmpresa | null;
}
interface RelatorioResp {
  contaLabel?: string;
  total?: number;
  linhas?: Linha[];
  semVarredura?: boolean;
  erro?: string;
}

// ---------- helpers ----------
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 });
function fmtBRL(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return '-';
  return brl.format(Number(n));
}
function fmtNum(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return '-';
  return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 4 });
}
// CSV: escapa aspas/; e envolve em aspas quando necessario
function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (/[";\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

const thStyle: React.CSSProperties = { background: '#f8fafc', color: '#475569', fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.4px', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f1f5f9', color: '#334155', fontSize: '.82rem' };

export default function RelatorioContagemPage() {
  const { userProfile } = useAuth();
  const { pode, loading: permLoading } = usePermissoes(userProfile?.id);
  const { conta, contaParam } = useConta();

  const [codigos, setCodigos] = useState('');
  const [dados, setDados] = useState<RelatorioResp | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    if (!conta) { setDados(null); return; }
    setCarregando(true);
    setErro('');
    try {
      let qs = contaParam.replace(/^&/, '');
      const c = codigos.trim();
      if (c) qs += (qs ? '&' : '') + 'codigos=' + encodeURIComponent(c);
      const r = await fetch(`/api/ajustes/relatorio-contagem?${qs}`);
      const d = (await r.json()) as RelatorioResp;
      if (d.erro) { setErro(d.erro); setDados(null); return; }
      setDados(d);
    } catch (ex) {
      setErro('erro de rede: ' + (ex as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [conta, contaParam, codigos]);

  // auto-carrega ao montar/trocar conta
  useEffect(() => {
    if (conta) carregar();
    else setDados(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conta]);

  const exportarCSV = useCallback(() => {
    if (!dados || !dados.linhas) return;
    const contaLabel = dados.contaLabel || conta;
    const headers = ['codigo', 'cod_integracao', 'descricao', 'conta', 'local', 'saldo_sistema', 'cmc', 'contagem_fisica', 'obs'];
    const rows = dados.linhas.map((l) => {
      const obs = l.suspeitaEmpresaErrada
        ? `suspeita: tem ${l.outraEmpresa?.saldo ?? ''} na ${l.outraEmpresa?.contaLabel ?? ''}`
        : '';
      return [
        l.codigo || l.codigoProduto || '',
        l.codigoIntegracao || '',
        l.descricao || '',
        contaLabel,
        l.localNome || '',
        l.saldoSistema != null ? l.saldoSistema : '',
        l.cmc != null ? l.cmc : '',
        '', // contagem_fisica em branco para preencher no papel/planilha
        obs,
      ];
    });
    const csv = [headers, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
    // BOM para o Excel reconhecer UTF-8
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-contagem-${contaLabel}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [dados, conta]);

  if (!permLoading && userProfile && !pode('ajustes', 'inventario')) return <SemPermissao />;

  const linhas = dados?.linhas || [];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Relatorio de contagem de estoque</h1>
          <p style={{ color: '#64748b', fontSize: '.82rem', maxWidth: 760 }}>
            Conta <b>{conta ? conta.toUpperCase() : '—'}</b>. Folha para a contagem fisica: lista o saldo de sistema da ultima varredura por produto/local. Linhas em amarelo = suspeita de faturamento na empresa errada (conferir nas duas empresas).
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', fontSize: '.65rem', color: '#64748b', marginBottom: 2 }}>Codigos (opcional, separados por virgula)</label>
            <input type="text" value={codigos} onChange={(e) => setCodigos(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && carregar()} placeholder="todos os negativos da varredura" style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.82rem', width: 280 }} />
          </div>
          <button onClick={carregar} disabled={carregando || !conta} style={{ padding: '7px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: carregando ? 'wait' : 'pointer', opacity: carregando || !conta ? 0.5 : 1 }}>Gerar</button>
          <button onClick={exportarCSV} disabled={!linhas.length} style={{ padding: '7px 14px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: linhas.length ? 'pointer' : 'not-allowed', opacity: linhas.length ? 1 : 0.5 }}>Exportar CSV</button>
          <ContaSelector />
        </div>
      </div>

      <div style={{ margin: '6px 0 14px', display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '.8rem' }}>
        <Link href="/ajustes/inventario" style={{ color: '#dc2626', textDecoration: 'none', fontWeight: 600 }}>← Inventario rotativo</Link>
        <Link href="/ajustes/negativos" style={{ color: '#dc2626', textDecoration: 'none', fontWeight: 600 }}>→ Estoque negativo</Link>
      </div>

      {erro && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '.82rem' }}>{erro}</div>}

      {!conta ? (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: 16, fontSize: '.85rem' }}>
          Esta tela e&apos; por conta. Selecione <b>NOVA</b> ou <b>CASTRO</b> no menu acima.
        </div>
      ) : carregando ? (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 32, textAlign: 'center', color: '#94a3b8' }}>Carregando…</div>
      ) : dados?.semVarredura ? (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: 16, fontSize: '.85rem' }}>
          Nenhuma varredura de estoque encontrada para esta conta. Rode a varredura de estoque negativo primeiro em <Link href="/ajustes/negativos" style={{ color: '#b45309', textDecoration: 'underline', fontWeight: 600 }}>Estoque negativo</Link> e volte aqui.
        </div>
      ) : (
        <>
          <div style={{ fontSize: '.78rem', color: '#64748b', marginBottom: 10 }}>
            {dados?.contaLabel || conta} · {fmtNum(dados?.total ?? linhas.length)} linha(s). Linhas em amarelo = suspeita de faturamento na empresa errada.
          </div>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Codigo</th>
                    <th style={thStyle}>Cod. integracao</th>
                    <th style={thStyle}>Descricao</th>
                    <th style={thStyle}>Conta</th>
                    <th style={thStyle}>Local</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Saldo sistema</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>CMC</th>
                    <th style={thStyle}>Contagem fisica</th>
                    <th style={thStyle}>Obs</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.length === 0 ? (
                    <tr><td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Nenhum produto selecionado (ou nenhum encontrado na ultima varredura).</td></tr>
                  ) : linhas.map((l, i) => {
                    const susp = !!l.suspeitaEmpresaErrada;
                    return (
                      <tr key={i} style={{ borderTop: '1px solid #f1f5f9', background: susp ? '#fef9c3' : undefined }}>
                        <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '.72rem' }}>{l.codigo || l.codigoProduto || ''}</td>
                        <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '.72rem' }}>{l.codigoIntegracao || ''}</td>
                        <td style={tdStyle}>
                          {l.descricao || ''}
                          {susp && (
                            <span style={{ marginLeft: 6, fontSize: '.62rem', padding: '1px 5px', borderRadius: 4, background: '#f59e0b', color: '#fff' }}>
                              suspeita: tem {l.outraEmpresa?.saldo ?? '?'} na {l.outraEmpresa?.contaLabel ?? 'outra empresa'}
                            </span>
                          )}
                        </td>
                        <td style={tdStyle}>{dados?.contaLabel || conta}</td>
                        <td style={tdStyle}>{l.localNome || ''}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtNum(l.saldoSistema)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtBRL(l.cmc)}</td>
                        <td style={{ ...tdStyle, width: 90, color: '#cbd5e1' }}>&nbsp;</td>
                        <td style={{ ...tdStyle, width: 160 }}>&nbsp;</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
