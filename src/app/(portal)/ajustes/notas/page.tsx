'use client';
// Notas fiscais de saida (Fase 2). Portado de notas.ejs + public/notas.js.
// Busca NF-e de venda por numero ou por cliente e abre o DANFE PDF oficial da Omie.
import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';

// ---------- tipos ----------
interface Nota {
  numero?: string | null; serie?: string | null; nCodNF?: number | string | null;
  chaveNFe?: string | null; dataEmissao?: string | null; valorNF?: number;
  cancelada?: boolean; clienteCodigo?: number | string | null;
  clienteNome?: string | null; clienteDoc?: string | null; qtdeItens?: number;
}
interface NotasPayload { total?: number; notas?: Nota[]; erro?: string }

// ---------- helpers ----------
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmtBRL(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return '-';
  return brl.format(Number(n));
}
function fmtDoc(d?: string | null): string {
  const s = String(d == null ? '' : d).replace(/\D/g, '');
  if (s.length === 14) return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (s.length === 11) return s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return d || '-';
}
function isoDefault(offsetMeses: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offsetMeses);
  return d.toISOString().slice(0, 10);
}

const thStyle: React.CSSProperties = { background: '#f8fafc', color: '#475569', fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.4px', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f1f5f9', color: '#334155', fontSize: '.82rem' };

type Modo = 'numero' | 'cliente';

export default function NotasPage() {
  const { userProfile } = useAuth();
  const { temAcesso, loading: permLoading } = usePermissoes(userProfile?.id);
  const { conta, contaParam } = useConta();

  const [modo, setModo] = useState<Modo>('numero');
  const [numero, setNumero] = useState('');
  const [numeroAte, setNumeroAte] = useState('');
  const [cliente, setCliente] = useState('');
  const [de, setDe] = useState(isoDefault(-3));
  const [ate, setAte] = useState(isoDefault(0));

  const [dados, setDados] = useState<NotasPayload | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [erro, setErro] = useState('');
  const [danfeId, setDanfeId] = useState<string | null>(null);

  const executar = useCallback(async (qsExtra: string) => {
    if (!conta) return;
    setCarregando(true);
    setErro('');
    setDados(null);
    try {
      const qs = contaParam.replace(/^&/, '') + qsExtra;
      const r = await fetch(`/api/ajustes/notas/buscar?${qs}`);
      const d = (await r.json()) as NotasPayload;
      if (d.erro) { setErro(d.erro); return; }
      setDados(d);
      setStatusMsg('');
    } catch (ex) {
      setErro('Erro de rede: ' + (ex as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [conta, contaParam]);

  const buscarPorNumero = useCallback(() => {
    const num = numero.trim();
    if (!num) { setErro('Informe o numero da NF.'); return; }
    let qs = '&modo=numero&numero=' + encodeURIComponent(num);
    if (numeroAte.trim()) qs += '&numeroAte=' + encodeURIComponent(numeroAte.trim());
    setStatusMsg('buscando NF(s) no Omie...');
    executar(qs);
  }, [numero, numeroAte, executar]);

  const buscarPorCliente = useCallback(() => {
    let qs = '&modo=cliente';
    if (cliente.trim()) qs += '&cliente=' + encodeURIComponent(cliente.trim());
    if (de) qs += '&de=' + encodeURIComponent(de);
    if (ate) qs += '&ate=' + encodeURIComponent(ate);
    setStatusMsg('buscando NFs no Omie... (a janela pode levar 1-2 min)');
    executar(qs);
  }, [cliente, de, ate, executar]);

  const abrirDanfe = useCallback(async (n: Nota) => {
    if (n.nCodNF == null || n.nCodNF === '') return;
    const key = String(n.nCodNF);
    setDanfeId(key);
    try {
      const qs = contaParam.replace(/^&/, '') + '&nCodNF=' + encodeURIComponent(String(n.nCodNF));
      const r = await fetch(`/api/ajustes/notas/danfe?${qs}`);
      const d = await r.json();
      if (d.url) window.open(d.url, '_blank');
      else alert('Nao foi possivel obter o DANFE: ' + (d.erro || 'sem URL'));
    } catch (ex) {
      alert('Erro ao obter DANFE: ' + (ex as Error).message);
    } finally {
      setDanfeId(null);
    }
  }, [contaParam]);

  if (!permLoading && userProfile && !temAcesso('ajustes:notas')) return <SemPermissao />;

  const tabStyle = (ativo: boolean): React.CSSProperties => ({
    padding: '8px 16px', fontSize: '.85rem', fontWeight: 500, background: 'none', border: 'none',
    borderBottom: ativo ? '2px solid #2563eb' : '2px solid transparent',
    color: ativo ? '#1d4ed8' : '#64748b', cursor: 'pointer',
  });
  const notas = dados?.notas || [];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Notas fiscais de saida</h1>
          <p style={{ color: '#64748b', fontSize: '.82rem', maxWidth: 720 }}>
            Conta <b>{conta ? conta.toUpperCase() : '—'}</b> · Busque NF-e de venda por <b>numero</b> ou por <b>cliente</b> e abra/imprima o <b>DANFE</b> oficial (PDF da Omie).
          </p>
        </div>
        <div style={{ marginLeft: 'auto' }}><ContaSelector /></div>
      </div>

      <div style={{ margin: '6px 0 14px', display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '.8rem' }}>
        <Link href="/ajustes" style={{ color: '#dc2626', textDecoration: 'none', fontWeight: 600 }}>← Ajustes</Link>
      </div>

      {conta === '' ? (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: 16, fontSize: '.85rem' }}>
          Esta tela precisa de uma conta especifica. Selecione <b>NOVA</b> ou <b>CASTRO</b> no menu acima.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e2e8f0', marginBottom: 16 }}>
            <button onClick={() => setModo('numero')} style={tabStyle(modo === 'numero')}>Por numero</button>
            <button onClick={() => setModo('cliente')} style={tabStyle(modo === 'cliente')}>Por cliente</button>
          </div>

          {modo === 'numero' ? (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '.65rem', color: '#64748b', marginBottom: 2 }}>Numero da NF</label>
                  <input type="text" inputMode="numeric" placeholder="ex: 12345" value={numero} onChange={(e) => setNumero(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscarPorNumero()} style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.82rem', width: 160 }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '.65rem', color: '#64748b', marginBottom: 2 }}>Ate (intervalo, opcional)</label>
                  <input type="text" inputMode="numeric" placeholder="ex: 12350" value={numeroAte} onChange={(e) => setNumeroAte(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscarPorNumero()} style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.82rem', width: 160 }} />
                </div>
                <button onClick={buscarPorNumero} disabled={carregando} style={{ padding: '7px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: carregando ? 'wait' : 'pointer', opacity: carregando ? 0.6 : 1 }}>Buscar</button>
                <span style={{ fontSize: '.72rem', color: '#94a3b8' }}>Deixe &quot;Ate&quot; vazio para buscar so um numero.</span>
              </div>
            </div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <label style={{ display: 'block', fontSize: '.65rem', color: '#64748b', marginBottom: 2 }}>Cliente (nome ou CNPJ/CPF)</label>
                  <input type="text" placeholder="ex: JOAO DA SILVA ou 12345678000199" value={cliente} onChange={(e) => setCliente(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscarPorCliente()} style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.82rem', width: '100%' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '.65rem', color: '#64748b', marginBottom: 2 }}>Emissao de</label>
                  <input type="date" value={de} onChange={(e) => setDe(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscarPorCliente()} style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.82rem' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '.65rem', color: '#64748b', marginBottom: 2 }}>Ate</label>
                  <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscarPorCliente()} style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.82rem' }} />
                </div>
                <button onClick={buscarPorCliente} disabled={carregando} style={{ padding: '7px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: carregando ? 'wait' : 'pointer', opacity: carregando ? 0.6 : 1 }}>Buscar</button>
              </div>
              <p style={{ fontSize: '.72rem', color: '#94a3b8', marginTop: 8 }}>Nome faz busca parcial (contem). CNPJ/CPF completo usa filtro exato na Omie. Sem texto, lista todas as NFs da janela.</p>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: '.72rem' }}>
            <span style={{ color: '#64748b' }}>{carregando ? 'Carregando…' : statusMsg}</span>
            {dados && <span style={{ marginLeft: 'auto', color: '#64748b' }}>{notas.length} nota(s) encontrada(s)</span>}
          </div>

          {erro && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '.82rem' }}>{erro}</div>}

          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            {!dados ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: '.85rem' }}>Informe um numero ou um cliente e clique em <b>Buscar</b>.</div>
            ) : notas.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: '.85rem' }}>Nenhuma NF encontrada para os filtros informados.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>NF / serie</th>
                      <th style={thStyle}>Emissao</th>
                      <th style={thStyle}>Cliente</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Valor</th>
                      <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>DANFE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notas.map((n, i) => {
                      const temDanfe = n.nCodNF != null && n.nCodNF !== '';
                      const key = String(n.nCodNF);
                      return (
                        <tr key={i} style={{ borderTop: '1px solid #f1f5f9', opacity: n.cancelada ? 0.6 : 1 }}>
                          <td style={{ ...tdStyle, fontWeight: 500 }}>{n.numero || '-'}{n.serie && <span style={{ color: '#94a3b8', fontSize: '.72rem' }}> / {n.serie}</span>}</td>
                          <td style={{ ...tdStyle, color: '#475569' }}>{n.dataEmissao || '-'}</td>
                          <td style={tdStyle}>
                            {n.clienteNome || '-'}
                            <div style={{ fontSize: '.7rem', color: '#94a3b8', fontFamily: 'monospace' }}>{fmtDoc(n.clienteDoc)}</div>
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtBRL(n.valorNF)}</td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>
                            {n.cancelada
                              ? <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '.68rem', background: '#fee2e2', color: '#b91c1c' }}>CANCELADA</span>
                              : <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '.68rem', background: '#d1fae5', color: '#047857' }}>OK</span>}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>
                            {temDanfe ? (
                              <button onClick={() => abrirDanfe(n)} disabled={danfeId === key} style={{ padding: '5px 12px', fontSize: '.72rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: danfeId === key ? 'wait' : 'pointer', opacity: danfeId === key ? 0.6 : 1 }}>
                                {danfeId === key ? 'abrindo...' : 'DANFE / imprimir'}
                              </button>
                            ) : (
                              <span style={{ fontSize: '.72rem', color: '#94a3b8' }} title="NF sem codigo interno (nCodNF)">sem DANFE</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
