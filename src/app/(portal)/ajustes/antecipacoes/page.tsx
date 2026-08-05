'use client';
// Antecipações (desconto de duplicatas). Lista os títulos a pagar da categoria
// "Pagamento de Empréstimos" (2.05.03), separando o DESCONTO DE DUPLICATA
// (integração Omie: Votorantim/ERG/OMIE FIDC — o PRINCIPAL da duplicata, não
// juro) dos empréstimos/serviços reais que caem na mesma categoria. Objetivo:
// enxergar o que da conta "Despesas Financeiras" é principal e o que é juro.
import { useState, useCallback, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';

// ---------- tipos ----------
interface Titulo {
  codigo_lancamento: number;
  conta_omie: string;
  fornecedor: string;
  valor: number;
  data_emissao: string | null;
  data_vencimento: string | null;
  data_previsao: string | null;
  status_titulo: string | null;
  numero_nf: string | null;
  chave_nfe: string | null;
  tipo_doc: string | null;
  numero_parcela: string | null;
  grupo: 'desconto' | 'outros';
}
interface Parceiro { nome: string; grupo: string; n: number; valor: number }
interface Payload {
  conta?: string; de?: string; ate?: string;
  titulos?: Titulo[];
  totais?: { desconto: { n: number; valor: number }; outros: { n: number; valor: number }; juros: { valor: number; indisponivel?: boolean } };
  porParceiro?: Parceiro[];
  erro?: string;
}

// ---------- helpers ----------
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmtBRL(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return '-';
  return brl.format(Number(n));
}
function fmtData(s?: string | null): string {
  if (!s) return '-';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}
function isoDefault(offsetMeses: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offsetMeses);
  return d.toISOString().slice(0, 10);
}
function inicioAno(): string {
  return new Date().toISOString().slice(0, 4) + '-01-01';
}
// Rótulo amigável do tipo de documento da Omie.
function tipoLabel(t?: string | null): string {
  if (!t) return '—';
  if (t === 'NFE') return 'NF-e';
  if (t === 'NFS' || t === 'NFSE') return 'NFS-e';
  if (t === 'BOL') return 'Boleto';
  if (t === 'CTE') return 'CT-e';
  if (t === '99999') return 'Outros';
  return t;
}

const thStyle: React.CSSProperties = { background: '#f8fafc', color: '#475569', fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.4px', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f1f5f9', color: '#334155', fontSize: '.82rem' };

type Filtro = 'desconto' | 'outros' | 'todos';

export default function AntecipacoesPage() {
  const { userProfile } = useAuth();
  const { pode, loading: permLoading } = usePermissoes(userProfile?.id);
  const { conta, contaParam } = useConta();

  const [de, setDe] = useState(inicioAno());
  const [ate, setAte] = useState(isoDefault(0));
  const [dados, setDados] = useState<Payload | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('desconto');
  const [busca, setBusca] = useState('');
  const [copiado, setCopiado] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      let qs = `de=${encodeURIComponent(de)}&ate=${encodeURIComponent(ate)}${contaParam}`;
      const r = await fetch(`/api/ajustes/antecipacoes?${qs}`);
      const d = (await r.json()) as Payload;
      if (d.erro) { setErro(d.erro); setDados(null); return; }
      setDados(d);
    } catch (ex) {
      setErro('Erro de rede: ' + (ex as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [de, ate, contaParam]);

  // Recarrega ao montar e ao trocar de conta.
  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [conta]);

  const titulos = dados?.titulos || [];
  const t = dados?.totais;

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return titulos.filter((x) => {
      if (filtro !== 'todos' && x.grupo !== filtro) return false;
      if (!termo) return true;
      return (
        x.fornecedor.toLowerCase().includes(termo) ||
        (x.numero_nf || '').toLowerCase().includes(termo) ||
        (x.chave_nfe || '').toLowerCase().includes(termo)
      );
    });
  }, [titulos, filtro, busca]);

  const somaFiltrada = useMemo(() => filtrados.reduce((s, x) => s + x.valor, 0), [filtrados]);
  const parceirosFiltro = useMemo(
    () => (dados?.porParceiro || []).filter((p) => filtro === 'todos' || p.grupo === filtro),
    [dados, filtro],
  );

  const copiarChave = useCallback((cod: number, chave: string) => {
    navigator.clipboard?.writeText(chave).then(() => {
      setCopiado(cod);
      setTimeout(() => setCopiado((c) => (c === cod ? null : c)), 1500);
    }).catch(() => {});
  }, []);

  const exportarCSV = useCallback(() => {
    const sep = ';';
    const cab = ['Grupo', 'Conta', 'Emissão', 'Fornecedor/Parceiro', 'Tipo doc', 'Nº nota', 'Chave NF-e', 'Parcela', 'Vencimento', 'Previsão', 'Status', 'Valor'];
    const linhas = filtrados.map((x) => [
      x.grupo === 'desconto' ? 'Desconto de duplicata' : 'Empréstimo/outros',
      x.conta_omie, fmtData(x.data_emissao), x.fornecedor, tipoLabel(x.tipo_doc),
      x.numero_nf || '', x.chave_nfe || '', x.numero_parcela || '',
      fmtData(x.data_vencimento), fmtData(x.data_previsao), x.status_titulo || '',
      String(x.valor).replace('.', ','),
    ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(sep));
    const csv = '﻿' + [cab.join(sep), ...linhas].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `antecipacoes_${dados?.conta || 'todas'}_${de}_a_${ate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtrados, dados, de, ate]);

  if (!permLoading && userProfile && !pode('ajustes', 'antecipacoes')) return <SemPermissao />;

  return (
    <div style={{ maxWidth: 1300, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 6 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Antecipações — desconto de duplicatas</h1>
          <p style={{ color: '#64748b', fontSize: '.82rem', maxWidth: 720 }}>
            Títulos a pagar da categoria <b>Pagamento de Empréstimos</b>. O <b>desconto de duplicata</b> (integração Omie) é o
            <b> principal</b> da nota antecipada — não é juro; por isso infla &quot;Despesas Financeiras&quot; na DRE. Os juros
            aparecem à parte (KPI &quot;Juros de antecipação&quot;).
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', fontSize: '.65rem', color: '#64748b', marginBottom: 2 }}>De (emissão)</label>
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && carregar()} style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.82rem' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '.65rem', color: '#64748b', marginBottom: 2 }}>Até</label>
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && carregar()} style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.82rem' }} />
          </div>
          <button onClick={carregar} disabled={carregando} style={{ padding: '7px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: carregando ? 'wait' : 'pointer', opacity: carregando ? 0.5 : 1 }}>{carregando ? 'Carregando…' : 'Buscar'}</button>
          <ContaSelector />
        </div>
      </div>

      <div style={{ margin: '6px 0 14px', fontSize: '.8rem' }}>
        <Link href="/dre-financeiro/movimentos" style={{ color: '#dc2626', textDecoration: 'none', fontWeight: 600 }}>→ Movimentações de CC · aba &quot;Antecipações&quot; (juros/líquido por operação)</Link>
      </div>

      {erro && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '.82rem' }}>{erro}</div>}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        <Kpi label="Desconto de duplicata (principal)" valor={fmtBRL(t?.desconto.valor)} sub={`${t?.desconto.n ?? 0} títulos`} cor="#0f766e" destaque />
        <Kpi label="Empréstimos / outros" valor={fmtBRL(t?.outros.valor)} sub={`${t?.outros.n ?? 0} títulos`} cor="#b45309" />
        <Kpi label="Juros de antecipação" valor={t?.juros.indisponivel ? '—' : fmtBRL(t?.juros.valor)} sub={t?.juros.indisponivel ? 'sem dados de CC' : 'pagos no período (CC)'} cor="#b91c1c" />
        <Kpi label="Total da categoria" valor={fmtBRL((t?.desconto.valor || 0) + (t?.outros.valor || 0))} sub="Pagamento de Empréstimos" />
      </div>

      {/* Filtro de grupo + busca + export */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
          {([['desconto', 'Desconto de duplicata'], ['outros', 'Empréstimos/outros'], ['todos', 'Todos']] as [Filtro, string][]).map(([k, lbl]) => (
            <button key={k} onClick={() => setFiltro(k)} style={{ padding: '6px 12px', fontSize: '.78rem', border: 'none', cursor: 'pointer', background: filtro === k ? '#1e293b' : '#fff', color: filtro === k ? '#fff' : '#475569', fontWeight: filtro === k ? 600 : 400 }}>{lbl}</button>
          ))}
        </div>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar fornecedor, nº da nota ou chave…" style={{ flex: '1 1 240px', border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 10px', fontSize: '.82rem', minWidth: 200 }} />
        <span style={{ fontSize: '.78rem', color: '#64748b' }}>{filtrados.length} títulos · <b>{fmtBRL(somaFiltrada)}</b></span>
        <button onClick={exportarCSV} disabled={!filtrados.length} style={{ padding: '6px 12px', fontSize: '.78rem', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 6, cursor: filtrados.length ? 'pointer' : 'not-allowed', color: '#334155' }}>Exportar CSV</button>
      </div>

      {/* Breakdown por parceiro */}
      {parceirosFiltro.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {parceirosFiltro.slice(0, 12).map((p) => (
            <button key={p.grupo + p.nome} onClick={() => setBusca(p.nome)} title="Filtrar por este parceiro" style={{ display: 'inline-flex', gap: 6, alignItems: 'baseline', padding: '4px 10px', borderRadius: 999, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: '.74rem' }}>
              <span style={{ color: '#334155', fontWeight: 500 }}>{p.nome}</span>
              <span style={{ color: '#0f766e', fontWeight: 600 }}>{fmtBRL(p.valor)}</span>
              <span style={{ color: '#94a3b8' }}>({p.n})</span>
            </button>
          ))}
        </div>
      )}

      {/* Tabela */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Emissão</th>
                <th style={thStyle}>Conta</th>
                <th style={thStyle}>Fornecedor / Parceiro</th>
                <th style={thStyle}>Origem (nota)</th>
                <th style={thStyle}>Parcela</th>
                <th style={thStyle}>Vencimento</th>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {carregando ? (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Carregando…</td></tr>
              ) : filtrados.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Nenhum título nesse filtro/período.</td></tr>
              ) : (
                filtrados.map((x) => (
                  <tr key={x.codigo_lancamento} style={{ borderBottom: '1px solid #f1f5f9', background: x.grupo === 'desconto' ? '#f0fdfa' : undefined }}>
                    <td style={tdStyle}>{fmtData(x.data_emissao)}</td>
                    <td style={tdStyle}><span style={{ fontSize: '.72rem', fontWeight: 600, color: '#475569' }}>{x.conta_omie}</span></td>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 500 }}>{x.fornecedor}</div>
                      {x.grupo === 'desconto'
                        ? <span style={{ display: 'inline-block', marginTop: 2, padding: '1px 6px', borderRadius: 4, fontSize: '.62rem', background: '#ccfbf1', color: '#0f766e' }}>desconto de duplicata</span>
                        : <span style={{ display: 'inline-block', marginTop: 2, padding: '1px 6px', borderRadius: 4, fontSize: '.62rem', background: '#fef3c7', color: '#92400e' }}>empréstimo/outros</span>}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontSize: '.72rem', color: '#475569' }}>
                        <b>{tipoLabel(x.tipo_doc)}</b>{x.numero_nf ? ` nº ${x.numero_nf}` : ''}
                      </div>
                      {x.chave_nfe && (
                        <button onClick={() => copiarChave(x.codigo_lancamento, x.chave_nfe!)} title="Copiar chave NF-e" style={{ marginTop: 2, fontFamily: 'monospace', fontSize: '.62rem', color: '#64748b', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                          {copiado === x.codigo_lancamento ? '✓ copiada' : `${x.chave_nfe.slice(0, 8)}…${x.chave_nfe.slice(-6)} ⧉`}
                        </button>
                      )}
                    </td>
                    <td style={{ ...tdStyle, fontSize: '.72rem', color: '#64748b' }}>{x.numero_parcela || '—'}</td>
                    <td style={tdStyle}>{fmtData(x.data_vencimento)}</td>
                    <td style={{ ...tdStyle, fontSize: '.72rem' }}>
                      <span style={{ color: /PAGO/i.test(x.status_titulo || '') ? '#047857' : '#b45309' }}>{x.status_titulo || '—'}</span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{fmtBRL(x.valor)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {filtrados.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={7} style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: '#475569' }}>Total ({filtrados.length})</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{fmtBRL(somaFiltrada)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, valor, sub, cor, destaque }: { label: string; valor: string; sub?: string; cor?: string; destaque?: boolean }) {
  return (
    <div style={{ background: '#fff', border: destaque ? `1px solid ${cor || '#0f766e'}` : '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
      <div style={{ fontSize: '.62rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.4px' }}>{label}</div>
      <div style={{ fontSize: '1.35rem', fontWeight: 700, marginTop: 4, color: cor || '#1e293b' }}>{valor}</div>
      {sub && <div style={{ fontSize: '.68rem', color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
