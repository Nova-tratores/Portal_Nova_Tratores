'use client';
// Boletos de fornecedor: os boletos agrupados registrados (status, parcelas,
// duplicatas, estornar/reaplicar) e as regras por fornecedor (quem cobra assim).
// Registrar um boleto é na Correção de contas (vista Lista, selecionar as
// duplicatas); pagar uma parcela é em Baixar contas.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';
import { authHeaders } from '@/lib/auth/client';
import { fmtBR } from '@/lib/ajustes/boletos-fornecedor';
import type { Boleto } from '@/components/ajustes/PainelBoletosBaixa';

interface BoletoFull extends Boleto {
  codigo_barras: string | null; data_emissao: string | null; valor_titulos: number; alinhar_vencimento: boolean; observacao: string | null; criado_por: string | null; created_at: string;
  titulos: Array<{ parcela_id: string; codigo_lancamento: number; numero_documento: string | null; valor_alocado: number; valor_titulo: number; principal: boolean; status: string; erro: string | null; snapshot_anterior: Record<string, string | null> | null; campos_novos: Record<string, string> | null }>;
}
interface Regra { id: string; conta_omie: string; codigo_cliente_fornecedor: number; nome: string; ativo: boolean; dias_tolerancia: number; tolerancia_valor: number; alinhar_vencimento: boolean }

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtBRL = (n: number) => brl.format(Number(n) || 0);
const STATUS_ROTULO: Record<string, [string, string, string]> = {
  pendente: ['Pendente', '#fef3c7', '#b45309'], registrado: ['Registrado', '#e0f2fe', '#0369a1'], parcial: ['Parcialmente pago', '#ede9fe', '#6d28d9'],
  pago: ['Pago', '#dcfce7', '#15803d'], cancelado: ['Estornado', '#f1f5f9', '#64748b'], erro_omie: ['Erro na Omie', '#fee2e2', '#b91c1c'],
};

export default function BoletosFornecedorPage() {
  const { userProfile } = useAuth();
  const { pode, loading: permLoading } = usePermissoes(userProfile?.id);
  const { conta, contaParam } = useConta();
  const [aba, setAba] = useState<'boletos' | 'regras'>('boletos');
  const [filtro, setFiltro] = useState<'ativos' | 'todos'>('ativos');
  const [boletos, setBoletos] = useState<BoletoFull[]>([]);
  const [regras, setRegras] = useState<Regra[]>([]);
  const [status, setStatus] = useState('');
  const [semTabela, setSemTabela] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setStatus('carregando…');
    try {
      const r = await fetch(`/api/ajustes/boletos-fornecedor?status=${filtro}${contaParam}`, { headers: await authHeaders() });
      const d = await r.json();
      if (d.migracaoFaltando) { setSemTabela(true); setStatus(''); return; }
      if (d.erro) { setStatus('Erro: ' + d.erro); return; }
      setBoletos(d.boletos || []); setRegras(d.regras || []); setStatus('');
    } catch (ex) { setStatus('Erro de rede: ' + (ex as Error).message); }
  }, [filtro, contaParam]);
  useEffect(() => { const t = setTimeout(carregar, 0); return () => clearTimeout(t); }, [carregar, conta]);

  const acao = useCallback(async (b: BoletoFull, acao: 'estornar' | 'reaplicar') => {
    if (acao === 'estornar' && !confirm(`Estornar o boleto ${b.numero} de ${b.nome_fornecedor}? Cada duplicata volta ao vencimento/previsão/observação que tinha antes.`)) return;
    const motivo = acao === 'estornar' ? (prompt('Motivo do estorno (opcional):') || '') : '';
    setStatus(acao === 'estornar' ? 'estornando na Omie…' : 'reaplicando na Omie…');
    try {
      const r = await fetch(`/api/ajustes/boletos-fornecedor/${b.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ acao, motivo }) });
      const d = await r.json();
      setStatus(d.ok ? (acao === 'estornar' ? `estornado ✓ (${d.revertidos} duplicata(s))` : `reaplicado ✓ (${d.aplicados} aplicada(s))`) : 'Erro: ' + (d.erro || 'falha'));
      carregar();
    } catch (ex) { setStatus('Erro de rede: ' + (ex as Error).message); }
  }, [carregar]);

  if (!permLoading && userProfile && !pode('ajustes', 'boletos-fornecedor') && !pode('ajustes', 'correcao-contas') && !pode('ajustes', 'baixa-contas')) return <SemPermissao />;
  const podeEditar = pode('ajustes', 'boletos-fornecedor');

  return (
    <div className="est-page" style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <h1 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Boletos de fornecedor</h1>
          <p style={{ fontSize: '.78rem', color: '#64748b', margin: '4px 0 0' }}>
            Fornecedor que junta várias NFs num boleto parcelado (ex.: CAMBUCI). O boleto <b>reprograma</b> as duplicatas da NF na Omie (previsão/vencimento = parcela, observação com o nº) — nada de título manual nem baixa antes de pagar.
            Registrar: <Link href="/ajustes/correcao-contas" style={{ color: '#7c3aed' }}>Correção de contas</Link> → vista Lista → marcar as duplicatas. Pagar: <Link href="/ajustes/baixa-contas" style={{ color: '#7c3aed' }}>Baixar contas</Link> → Boletos de fornecedor.
          </p>
        </div>
        <ContaSelector />
      </div>
      <div style={{ margin: '6px 0 14px', fontSize: '.8rem' }}><Link href="/ajustes" style={{ color: '#dc2626', textDecoration: 'none', fontWeight: 600 }}>← Ajustes</Link></div>

      {semTabela ? (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: 16, fontSize: '.85rem' }}>
          As tabelas do boleto agrupado ainda não existem no banco. Aplique <code>sql/boletos-fornecedor.sql</code> no SQL Editor do Supabase.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            {(['boletos', 'regras'] as const).map((a) => (
              <button key={a} onClick={() => setAba(a)} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #cbd5e1', background: aba === a ? '#7c3aed' : '#fff', color: aba === a ? '#fff' : '#475569', fontSize: '.82rem', cursor: 'pointer' }}>{a === 'boletos' ? `Boletos (${boletos.length})` : `Regras por fornecedor (${regras.length})`}</button>
            ))}
            {aba === 'boletos' && (
              <select value={filtro} onChange={(e) => setFiltro(e.target.value as 'ativos' | 'todos')} style={{ ...inp, width: 'auto' }}>
                <option value="ativos">em andamento</option><option value="todos">todos</option>
              </select>
            )}
            <span style={{ fontSize: '.74rem', color: status.startsWith('Erro') ? '#dc2626' : '#64748b' }}>{status}</span>
          </div>

          {aba === 'boletos' && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8rem' }}>
                <thead><tr>{['Empresa', 'Fornecedor', 'Boleto', 'Data', 'Parcelas', 'Duplicatas', 'Valor', 'Situação', 'Por', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {boletos.length === 0 && <tr><td colSpan={10} style={{ ...td, textAlign: 'center', color: '#94a3b8', padding: 30 }}>Nenhum boleto {filtro === 'ativos' ? 'em andamento' : 'registrado'}.</td></tr>}
                  {boletos.map((b) => {
                    const [rot, bg, fg] = STATUS_ROTULO[b.status] || [b.status, '#f1f5f9', '#475569'];
                    const pagas = b.parcelas.filter((p) => p.status === 'paga').length;
                    const exp = aberto === b.id;
                    return [
                      <tr key={b.id} onClick={() => setAberto(exp ? null : b.id)} style={{ cursor: 'pointer', background: exp ? '#faf5ff' : undefined }}>
                        <td style={td}>{b.conta_omie}</td>
                        <td style={td}>{b.nome_fornecedor}</td>
                        <td style={{ ...td, fontFamily: 'monospace' }}>{b.numero}</td>
                        <td style={td}>{fmtBR(b.data_emissao) || fmtBR(b.created_at.slice(0, 10))}</td>
                        <td style={td}>{pagas}/{b.parcelas.length} pagas</td>
                        <td style={td}>{new Set(b.titulos.map((t) => t.codigo_lancamento)).size}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 500 }}>{fmtBRL(b.valor_total)}</td>
                        <td style={td}><span style={{ padding: '1px 8px', borderRadius: 4, fontSize: '.68rem', background: bg, color: fg }} title={b.erro || ''}>{rot}</span></td>
                        <td style={{ ...td, fontSize: '.7rem', color: '#64748b' }}>{b.criado_por || '-'}</td>
                        <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                          {podeEditar && (b.status === 'erro_omie' || b.status === 'pendente') && <button onClick={() => acao(b, 'reaplicar')} style={btnMini('#d97706')}>Reaplicar</button>}
                          {podeEditar && ['registrado', 'erro_omie', 'pendente'].includes(b.status) && <button onClick={() => acao(b, 'estornar')} style={btnMini('#dc2626')}>Estornar</button>}
                        </td>
                      </tr>,
                      exp && (
                        <tr key={b.id + '-det'}>
                          <td colSpan={10} style={{ ...td, background: '#faf5ff', padding: '8px 14px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 14 }}>
                              <div>
                                <div style={sub}>Parcelas</div>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.74rem' }}>
                                  <thead><tr><th style={th}>#</th><th style={th}>Vencimento</th><th style={th}>Valor</th><th style={th}>Situação</th></tr></thead>
                                  <tbody>{b.parcelas.map((p) => <tr key={p.id}><td style={td}>{p.numero}/{p.total}</td><td style={td}>{fmtBR(p.data_vencimento)}</td><td style={{ ...td, textAlign: 'right' }}>{fmtBRL(p.valor)}</td><td style={td}>{p.status === 'paga' ? `paga em ${fmtBR(p.pago_em)}` : p.status}</td></tr>)}</tbody>
                                </table>
                                {b.codigo_barras && <div style={{ fontSize: '.68rem', color: '#64748b', marginTop: 6, fontFamily: 'monospace' }}>{b.codigo_barras}</div>}
                                {b.observacao && <div style={{ fontSize: '.7rem', color: '#64748b', marginTop: 4 }}>{b.observacao}</div>}
                              </div>
                              <div>
                                <div style={sub}>Duplicatas ({fmtBRL(b.valor_titulos)})</div>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.74rem' }}>
                                  <thead><tr><th style={th}>Documento</th><th style={th}>Parcela</th><th style={th}>Alocado</th><th style={th}>Antes → depois</th><th style={th}>Situação</th></tr></thead>
                                  <tbody>{b.titulos.map((t) => {
                                    const p = b.parcelas.find((x) => x.id === t.parcela_id);
                                    return (
                                      <tr key={t.parcela_id + t.codigo_lancamento}>
                                        <td style={td}>{t.numero_documento || t.codigo_lancamento}</td>
                                        <td style={td}>{p ? `${p.numero}/${p.total}` : '-'}{t.principal ? '' : ' (parte)'}</td>
                                        <td style={{ ...td, textAlign: 'right' }}>{fmtBRL(t.valor_alocado)}</td>
                                        <td style={{ ...td, fontSize: '.68rem', color: '#64748b' }}>{t.principal && t.campos_novos ? `venc ${fmtBR(t.snapshot_anterior?.dataVencimento) || '?'} → ${fmtBR(t.campos_novos.dataVencimento) || '='} · prev → ${fmtBR(t.campos_novos.dataPrevisao)}` : ''}</td>
                                        <td style={{ ...td, fontSize: '.68rem', color: t.status === 'erro' ? '#dc2626' : '#475569' }} title={t.erro || ''}>{t.status}{t.erro ? ` — ${t.erro}` : ''}</td>
                                      </tr>
                                    );
                                  })}</tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ),
                    ];
                  })}
                </tbody>
              </table>
            </div>
          )}

          {aba === 'regras' && <Regras regras={regras} conta={conta} podeEditar={podeEditar} onMudou={carregar} />}
        </>
      )}
    </div>
  );
}

function Regras({ regras, conta, podeEditar, onMudou }: { regras: Regra[]; conta: string; podeEditar: boolean; onMudou: () => void }) {
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState<Array<{ codigo: number; nome: string; titulos: number }>>([]);
  const [sel, setSel] = useState<{ codigo: number; nome: string } | null>(null);
  const [dias, setDias] = useState('10');
  const [tol, setTol] = useState('1.00');
  const [alinhar, setAlinhar] = useState(true);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!conta || busca.trim().length < 2) { setAchados([]); return; }
      const r = await fetch(`/api/ajustes/boletos-fornecedor/regras?conta=${encodeURIComponent(conta)}&busca=${encodeURIComponent(busca)}`, { headers: await authHeaders() });
      const d = await r.json();
      setAchados(d.fornecedores || []);
    }, 400);
    return () => clearTimeout(t);
  }, [busca, conta]);

  const salvar = useCallback(async (r: Partial<Regra> & { codigoFornecedor: number; nome: string }) => {
    setStatus('salvando…');
    const res = await fetch('/api/ajustes/boletos-fornecedor/regras', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ id: r.id || null, conta: r.conta_omie || conta, codigoFornecedor: r.codigoFornecedor, nome: r.nome, ativo: r.ativo, diasTolerancia: r.dias_tolerancia, toleranciaValor: r.tolerancia_valor, alinharVencimento: r.alinhar_vencimento }),
    });
    const d = await res.json();
    setStatus(d.ok ? 'salvo ✓' : 'Erro: ' + (d.erro || 'falha'));
    if (d.ok) { setSel(null); setBusca(''); onMudou(); }
  }, [conta, onMudou]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: podeEditar ? '1.4fr 1fr' : '1fr', gap: 14 }}>
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8rem' }}>
          <thead><tr>{['Empresa', 'Fornecedor', 'Cód. Omie', 'Aguardando boleto após', 'Tolerância', 'Alinha venc.', 'Ativa'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {regras.length === 0 && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: '#94a3b8', padding: 30 }}>Nenhuma regra. A regra só muda tolerâncias e avisos — registrar boleto funciona para qualquer fornecedor.</td></tr>}
            {regras.map((r) => (
              <tr key={r.id}>
                <td style={td}>{r.conta_omie}</td><td style={td}>{r.nome}</td><td style={{ ...td, fontFamily: 'monospace', fontSize: '.72rem' }}>{r.codigo_cliente_fornecedor}</td>
                <td style={td}>{r.dias_tolerancia} dias</td><td style={td}>{fmtBRL(r.tolerancia_valor)}</td><td style={td}>{r.alinhar_vencimento ? 'sim' : 'só previsão'}</td>
                <td style={td}>{podeEditar ? <input type="checkbox" checked={r.ativo} onChange={(e) => salvar({ ...r, codigoFornecedor: r.codigo_cliente_fornecedor, ativo: e.target.checked })} /> : r.ativo ? 'sim' : 'não'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {podeEditar && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
          <div style={sub}>Nova regra · empresa <b>{conta || '(escolha NOVA ou CASTRO no topo)'}</b></div>
          <label style={lbl}>Fornecedor (busca nos títulos a pagar)</label>
          <input value={busca} onChange={(e) => { setBusca(e.target.value); setSel(null); }} placeholder="ex.: CAMBUCI" style={inp} disabled={!conta} />
          {achados.length > 0 && !sel && (
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, marginTop: 4, maxHeight: 160, overflow: 'auto' }}>
              {achados.map((a) => <div key={a.codigo} onClick={() => { setSel({ codigo: a.codigo, nome: a.nome }); setBusca(a.nome); }} style={{ padding: '5px 8px', fontSize: '.76rem', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}>{a.nome} <span style={{ color: '#94a3b8' }}>· {a.codigo} · {a.titulos} títulos</span></div>)}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            <div><label style={lbl}>Aguardando boleto após (dias)</label><input type="number" value={dias} onChange={(e) => setDias(e.target.value)} style={inp} /></div>
            <div><label style={lbl}>Tolerância de valor (R$)</label><input value={tol} onChange={(e) => setTol(e.target.value)} style={inp} /></div>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '.76rem', marginTop: 8 }}><input type="checkbox" checked={alinhar} onChange={(e) => setAlinhar(e.target.checked)} /> Alinhar o vencimento da duplicata à parcela (padrão)</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
            <button disabled={!sel} onClick={() => sel && salvar({ codigoFornecedor: sel.codigo, nome: sel.nome, ativo: true, dias_tolerancia: Number(dias) || 10, tolerancia_valor: Number(String(tol).replace(',', '.')) || 1, alinhar_vencimento: alinhar })} style={{ padding: '6px 12px', fontSize: '.82rem', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', background: '#7c3aed', opacity: sel ? 1 : 0.5 }}>Salvar regra</button>
            <span style={{ fontSize: '.72rem', color: status.startsWith('Erro') ? '#dc2626' : '#047857' }}>{status}</span>
          </div>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = { background: '#f8fafc', color: '#475569', fontSize: '.64rem', textTransform: 'uppercase', letterSpacing: '.4px', padding: '7px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '6px 10px', borderBottom: '1px solid #f1f5f9', color: '#334155', verticalAlign: 'top' };
const sub: React.CSSProperties = { fontSize: '.72rem', color: '#64748b', marginBottom: 6, fontWeight: 600 };
const lbl: React.CSSProperties = { display: 'block', fontSize: '.68rem', color: '#64748b', marginBottom: 2 };
const inp: React.CSSProperties = { width: '100%', border: '1px solid #cbd5e1', borderRadius: 6, padding: '5px 8px', fontSize: '.8rem', background: '#fff' };
const btnMini = (bg: string): React.CSSProperties => ({ padding: '3px 10px', background: bg, color: '#fff', border: 'none', borderRadius: 4, fontSize: '.7rem', cursor: 'pointer', marginLeft: 6 });
