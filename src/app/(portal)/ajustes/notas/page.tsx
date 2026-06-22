'use client';
// Notas fiscais de saida (Fase 2). Portado de notas.ejs + public/notas.js.
// Busca NF-e de venda por numero ou por cliente e abre o DANFE PDF oficial da Omie.
import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';

// ---------- tipos ----------
interface Nota {
  tipo?: 'produto' | 'servico'; numero?: string | null; serie?: string | null; nCodNF?: number | string | null;
  chaveNFe?: string | null; dataEmissao?: string | null; valorNF?: number;
  cancelada?: boolean; clienteCodigo?: number | string | null;
  clienteNome?: string | null; clienteDoc?: string | null; qtdeItens?: number;
}
interface NotasPayload { total?: number; notas?: Nota[]; erro?: string; aviso?: string | null }
interface ClienteSug { codigo: number | string; nome: string; doc?: string | null }

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
type TipoFiltro = 'todas' | 'produto' | 'servico';

export default function NotasPage() {
  const { userProfile } = useAuth();
  const { temAcesso, loading: permLoading } = usePermissoes(userProfile?.id);
  const { conta, contaParam } = useConta();

  const [modo, setModo] = useState<Modo>('numero');
  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>('todas');
  const [numero, setNumero] = useState('');
  const [numeroAte, setNumeroAte] = useState('');
  const [cliente, setCliente] = useState('');
  const [clienteCodigo, setClienteCodigo] = useState<string | null>(null);
  const [de, setDe] = useState(isoDefault(-12));
  const [ate, setAte] = useState(isoDefault(0));

  const [dados, setDados] = useState<NotasPayload | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [erro, setErro] = useState('');
  const [danfeId, setDanfeId] = useState<string | null>(null);

  // ---- autocomplete de clientes (le do Supabase) ----
  const [sugestoes, setSugestoes] = useState<ClienteSug[]>([]);
  const [showSug, setShowSug] = useState(false);
  const buscaIdRef = useRef(0);

  useEffect(() => {
    // não sugere quando já há um cliente selecionado (código fixado) ou termo curto
    if (!conta || clienteCodigo || cliente.trim().length < 2) { setSugestoes([]); return; }
    const termo = cliente.trim();
    const id = ++buscaIdRef.current;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/ajustes/notas/clientes?conta=${encodeURIComponent(conta)}&q=${encodeURIComponent(termo)}`);
        const d = await r.json();
        if (id !== buscaIdRef.current) return; // resposta obsoleta
        setSugestoes(Array.isArray(d.clientes) ? d.clientes : []);
        setShowSug(true);
      } catch { /* ignora */ }
    }, 300);
    return () => clearTimeout(t);
  }, [cliente, clienteCodigo, conta]);

  const selecionarCliente = useCallback((c: ClienteSug) => {
    setCliente(c.nome);
    setClienteCodigo(String(c.codigo));
    setSugestoes([]);
    setShowSug(false);
  }, []);

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
    let qs = '&modo=numero&tipo=' + tipoFiltro + '&numero=' + encodeURIComponent(num);
    if (numeroAte.trim()) qs += '&numeroAte=' + encodeURIComponent(numeroAte.trim());
    setStatusMsg('buscando…');
    executar(qs);
  }, [numero, numeroAte, tipoFiltro, executar]);

  const buscarPorCliente = useCallback(() => {
    setShowSug(false);
    let qs = '&modo=cliente&tipo=' + tipoFiltro;
    if (clienteCodigo) qs += '&clienteCodigo=' + encodeURIComponent(clienteCodigo);
    else if (cliente.trim()) qs += '&cliente=' + encodeURIComponent(cliente.trim());
    // janela só vale quando NÃO é cliente específico (servidor ignora p/ código/doc)
    if (de) qs += '&de=' + encodeURIComponent(de);
    if (ate) qs += '&ate=' + encodeURIComponent(ate);
    setStatusMsg('buscando…');
    executar(qs);
  }, [cliente, clienteCodigo, de, ate, tipoFiltro, executar]);

  const abrirDanfe = useCallback(async (n: Nota) => {
    if (n.nCodNF == null || n.nCodNF === '') return;
    const key = (n.tipo || 'produto') + ':' + String(n.nCodNF);
    setDanfeId(key);
    try {
      const qs = contaParam.replace(/^&/, '') + '&tipo=' + (n.tipo || 'produto') + '&nCodNF=' + encodeURIComponent(String(n.nCodNF));
      const r = await fetch(`/api/ajustes/notas/danfe?${qs}`);
      const d = await r.json();
      if (d.url) window.open(d.url, '_blank');
      else alert('Nao foi possivel obter o PDF: ' + (d.erro || 'sem URL'));
    } catch (ex) {
      alert('Erro ao obter PDF: ' + (ex as Error).message);
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
            Conta <b>{conta ? conta.toUpperCase() : '—'}</b> · Busque <b>NF-e de venda</b> e <b>NFS-e de servico</b> por <b>numero</b> ou por <b>cliente</b> e abra/imprima o documento oficial (PDF da Omie).
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
                <div style={{ flex: 1, minWidth: 220, position: 'relative' }}>
                  <label style={{ display: 'block', fontSize: '.65rem', color: '#64748b', marginBottom: 2 }}>Cliente (nome ou CNPJ/CPF)</label>
                  <input
                    type="text"
                    placeholder="comece a digitar o nome do cliente..."
                    value={cliente}
                    autoComplete="off"
                    onChange={(e) => { setCliente(e.target.value); setClienteCodigo(null); }}
                    onFocus={() => { if (sugestoes.length) setShowSug(true); }}
                    onBlur={() => setTimeout(() => setShowSug(false), 150)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { setShowSug(false); buscarPorCliente(); } else if (e.key === 'Escape') setShowSug(false); }}
                    style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.82rem', width: '100%' }}
                  />
                  {clienteCodigo && (
                    <span style={{ position: 'absolute', right: 8, top: 26, fontSize: '.62rem', color: '#16a34a', fontWeight: 600 }}>✓ cod {clienteCodigo}</span>
                  )}
                  {showSug && sugestoes.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, marginTop: 2, maxHeight: 280, overflowY: 'auto', boxShadow: '0 6px 18px rgba(0,0,0,.08)' }}>
                      {sugestoes.map((c) => (
                        <button
                          key={String(c.codigo)}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); selecionarCliente(c); }}
                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', border: 'none', borderBottom: '1px solid #f1f5f9', background: '#fff', cursor: 'pointer', fontSize: '.8rem' }}
                        >
                          <span style={{ color: '#1e293b' }}>{c.nome}</span>
                          <span style={{ marginLeft: 8, fontSize: '.68rem', color: '#94a3b8', fontFamily: 'monospace' }}>{fmtDoc(c.doc)}</span>
                        </button>
                      ))}
                    </div>
                  )}
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
              <p style={{ fontSize: '.72rem', color: '#94a3b8', marginTop: 8 }}>Selecione um cliente da lista para ver <b>todas</b> as notas dele (ignora o periodo). Digitando nome/CNPJ sem selecionar, filtra dentro do periodo. As notas vem do nosso banco (sync do Omie).</p>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: '.72rem' }}>
            <label style={{ color: '#64748b' }}>Tipo:</label>
            <select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value as TipoFiltro)} style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '4px 8px', fontSize: '.72rem' }}>
              <option value="todas">Todas (NF-e + NFS-e)</option>
              <option value="produto">Somente NF-e (produto)</option>
              <option value="servico">Somente NFS-e (servico)</option>
            </select>
            <span style={{ color: '#64748b', marginLeft: 8 }}>{carregando ? 'Carregando…' : statusMsg}</span>
            {dados && <span style={{ marginLeft: 'auto', color: '#64748b' }}>{notas.length} nota(s) encontrada(s)</span>}
          </div>

          {dados?.aviso && <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: '8px 14px', marginBottom: 12, fontSize: '.78rem' }}>{dados.aviso}</div>}

          {erro && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '.82rem' }}>{erro}</div>}

          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            {!dados ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: '.85rem' }}>Informe um numero ou um cliente e clique em <b>Buscar</b>.</div>
            ) : notas.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: '.85rem' }}>Nenhuma nota encontrada para os filtros informados.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Tipo</th>
                      <th style={thStyle}>Numero / serie</th>
                      <th style={thStyle}>Emissao</th>
                      <th style={thStyle}>Cliente</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Valor</th>
                      <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Documento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notas.map((n, i) => {
                      const ehServico = n.tipo === 'servico';
                      const temDoc = n.nCodNF != null && n.nCodNF !== '';
                      const key = (n.tipo || 'produto') + ':' + String(n.nCodNF);
                      return (
                        <tr key={i} style={{ borderTop: '1px solid #f1f5f9', opacity: n.cancelada ? 0.6 : 1 }}>
                          <td style={tdStyle}>
                            {ehServico
                              ? <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '.68rem', background: '#ede9fe', color: '#6d28d9' }}>NFS-e</span>
                              : <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '.68rem', background: '#dbeafe', color: '#1d4ed8' }}>NF-e</span>}
                          </td>
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
                            {temDoc ? (
                              <button onClick={() => abrirDanfe(n)} disabled={danfeId === key} style={{ padding: '5px 12px', fontSize: '.72rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: danfeId === key ? 'wait' : 'pointer', opacity: danfeId === key ? 0.6 : 1 }}>
                                {danfeId === key ? 'abrindo...' : (ehServico ? 'NFS-e / imprimir' : 'DANFE / imprimir')}
                              </button>
                            ) : (
                              <span style={{ fontSize: '.72rem', color: '#94a3b8' }} title="nota sem codigo interno (nCodNF)">sem PDF</span>
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
