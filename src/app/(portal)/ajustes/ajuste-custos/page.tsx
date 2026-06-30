'use client';
// Ajuste de custos (CMC inicial). Portado de ajuste-custos.ejs.
// Consome /api/ajustes/ajuste-custos/{produtos,fornecedores,aplicar}.
import { useState, useCallback, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';

interface ProdutoCusto {
  codigoProduto: number;
  codigo?: string;
  descricao?: string;
  saldoTotal?: number;
  cmc?: number;
  codLocal?: number | null;
  ajustavel?: boolean;
  inativo?: boolean;
}
interface Fornecedor { id: number | string; nome: string }
interface LinhaStatus { ok: boolean; texto: string; aplicado?: boolean }

function fmtNum(n: number | null | undefined): string { return Number(n || 0).toLocaleString('pt-BR'); }
function fmtMoeda(n: number | null | undefined): string { return Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDataHora(iso?: string | null): string { if (!iso) return ''; const d = new Date(iso); return isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR'); }
function normNome(s?: string): string { return String(s ?? '').trim().toLowerCase(); }

const MAX_LINHAS = 500;
type SortCol = 'codigo' | 'descricao' | 'saldoTotal' | 'cmc' | null;

const thStyle: React.CSSProperties = { background: '#f8fafc', color: '#64748b', fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.4px', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f1f5f9', color: '#334155', fontSize: '.82rem' };
const inp: React.CSSProperties = { border: '1px solid #cbd5e1', borderRadius: 6, padding: '5px 8px', fontSize: '.82rem' };

export default function AjusteCustosPage() {
  const { userProfile } = useAuth();
  const { pode, loading: permLoading } = usePermissoes(userProfile?.id);
  const { conta, contaParam } = useConta();
  const criadoPor = userProfile?.nome || 'portal';

  const [produtos, setProdutos] = useState<ProdutoCusto[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [sinc, setSinc] = useState<string | null>(null);
  const [estado, setEstado] = useState('Carregando produtos…');
  const [carregado, setCarregado] = useState(false);

  const [busca, setBusca] = useState('');
  const [soSemCmc, setSoSemCmc] = useState(false);
  const [soAjustaveis, setSoAjustaveis] = useState(false);
  const [sortCol, setSortCol] = useState<SortCol>(null);
  const [sortDir, setSortDir] = useState(1);

  // estado por linha (chave = codigoProduto_codLocal)
  const [cmcEdit, setCmcEdit] = useState<Record<string, string>>({});
  const [fornEdit, setFornEdit] = useState<Record<string, string>>({});
  const [obsEdit, setObsEdit] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Record<string, LinhaStatus>>({});
  const [enviando, setEnviando] = useState<string | null>(null);

  const fornMap = useMemo(() => {
    const m: Record<string, number | string> = {};
    fornecedores.forEach((f) => { m[normNome(f.nome)] = f.id; });
    return m;
  }, [fornecedores]);

  const carregarFornecedores = useCallback(async () => {
    try {
      const r = await fetch(`/api/ajustes/ajuste-custos/fornecedores?${contaParam.replace(/^&/, '')}`);
      const d = await r.json();
      setFornecedores((d?.fornecedores || []) as Fornecedor[]);
    } catch { /* dropdown opcional */ }
  }, [contaParam]);

  const carregarProdutos = useCallback(async (force: boolean) => {
    setEstado(force ? 'Recarregando do Omie (pode levar alguns segundos)…' : 'Carregando produtos…');
    setCarregado(false);
    try {
      let qs = contaParam;
      if (force) qs += '&force=1';
      const r = await fetch(`/api/ajustes/ajuste-custos/produtos?${qs.replace(/^&/, '')}`);
      const d = await r.json();
      if (!r.ok || d.erro) { setEstado('Erro: ' + (d.erro || 'falha ao carregar')); return; }
      setProdutos((d.produtos || []) as ProdutoCusto[]);
      setSinc(d.sincronizadoEm || null);
      setStatus({});
      setCarregado(true);
    } catch (ex) {
      setEstado('Erro de rede: ' + (ex as Error).message);
    }
  }, [contaParam]);

  useEffect(() => {
    if (conta) {
      carregarFornecedores();
      carregarProdutos(false);
    } else {
      setProdutos([]);
      setCarregado(false);
      setEstado('Selecione uma conta específica (NOVA ou CASTRO) no menu acima.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conta]);

  const lista = useMemo(() => {
    const termo = normNome(busca);
    let out = produtos.filter((p) => {
      if (soSemCmc && Number(p.cmc || 0) > 0) return false;
      if (soAjustaveis && !p.ajustavel) return false;
      if (termo) {
        const alvo = normNome(`${p.codigo || ''} ${p.descricao || ''} ${p.codigoProduto || ''}`);
        if (!alvo.includes(termo)) return false;
      }
      return true;
    });
    if (sortCol) {
      const num = sortCol === 'saldoTotal' || sortCol === 'cmc';
      out = out.slice().sort((a, b) => {
        let r: number;
        if (num) {
          const va = Number((sortCol === 'saldoTotal' ? a.saldoTotal : a.cmc) || 0);
          const vb = Number((sortCol === 'saldoTotal' ? b.saldoTotal : b.cmc) || 0);
          r = va - vb;
        } else {
          const va = sortCol === 'codigo' ? String(a.codigo || ('#' + a.codigoProduto)) : String(a.descricao || '');
          const vb = sortCol === 'codigo' ? String(b.codigo || ('#' + b.codigoProduto)) : String(b.descricao || '');
          r = va.localeCompare(vb, 'pt-BR', { numeric: true, sensitivity: 'base' });
        }
        return r * sortDir;
      });
    }
    return out;
  }, [produtos, busca, soSemCmc, soAjustaveis, sortCol, sortDir]);

  const mostradas = lista.slice(0, MAX_LINHAS);

  const ordenar = useCallback((col: Exclude<SortCol, null>) => {
    setSortDir((dir) => (sortCol === col ? -dir : 1));
    setSortCol(col);
  }, [sortCol]);

  const enviar = useCallback(async (p: ProdutoCusto, rid: string) => {
    const novoCMC = parseFloat(String(cmcEdit[rid] ?? '').replace(',', '.'));
    if (!(novoCMC > 0)) { setStatus((s) => ({ ...s, [rid]: { ok: false, texto: 'informe um valor > 0' } })); return; }
    const fornNome = (fornEdit[rid] || '').trim();
    const fornId = fornNome ? (fornMap[normNome(fornNome)] || null) : null;
    setEnviando(rid);
    setStatus((s) => ({ ...s, [rid]: { ok: true, texto: 'enviando…' } }));
    try {
      const r = await fetch('/api/ajustes/ajuste-custos/aplicar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conta,
          codigoProduto: p.codigoProduto,
          codLocal: p.codLocal != null ? p.codLocal : null,
          novoCMC,
          descricao: p.descricao,
          fornecedorId: fornId,
          fornecedorNome: fornNome || null,
          obs: (obsEdit[rid] || '').trim() || null,
          criadoPor,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setStatus((s) => ({ ...s, [rid]: { ok: false, texto: d.erro || 'falha' } }));
        return;
      }
      const aplicado = d.cmcAplicado != null ? d.cmcAplicado : novoCMC;
      setStatus((s) => ({ ...s, [rid]: { ok: true, texto: d.duplicado ? 'já aplicado ✓' : 'aplicado ✓', aplicado: true } }));
      // atualiza CMC em memória pra o filtro "sem CMC" parar de listar
      setProdutos((prev) => prev.map((x) => (x.codigoProduto === p.codigoProduto ? { ...x, cmc: aplicado } : x)));
    } catch (ex) {
      setStatus((s) => ({ ...s, [rid]: { ok: false, texto: 'rede: ' + (ex as Error).message } }));
    } finally {
      setEnviando(null);
    }
  }, [cmcEdit, fornEdit, obsEdit, fornMap, conta, criadoPor]);

  if (!permLoading && userProfile && !pode('ajustes', 'ajuste-custos')) return <SemPermissao />;

  const seta = (col: Exclude<SortCol, null>) => sortCol !== col ? '⇅' : (sortDir === 1 ? '▲' : '▼');
  const aviso = lista.length > MAX_LINHAS ? ` — mostrando as primeiras ${MAX_LINHAS}, refine a busca para ver o resto` : '';

  return (
    <div style={{ maxWidth: 1300, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Ajuste de custos (CMC inicial)</h1>
          <p style={{ color: '#64748b', fontSize: '.82rem' }}>Lista produtos com saldo e CMC atual. Preencha o novo custo unitário (CMC), escolha o fornecedor (opcional) e envie — aplicado direto no Omie como ajuste de estoque (SLD).</p>
        </div>
        <div style={{ marginLeft: 'auto' }}><ContaSelector /></div>
      </div>

      <div style={{ margin: '0 0 14px', display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '.8rem' }}>
        <Link href="/ajustes" style={{ color: '#dc2626', textDecoration: 'none', fontWeight: 600 }}>← Dashboard</Link>
        <Link href="/ajustes/historico" style={{ color: '#dc2626', textDecoration: 'none', fontWeight: 600 }}>→ Histórico</Link>
      </div>

      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: '.75rem' }}>
        Só é possível ajustar produtos com saldo físico diferente de zero (o ajuste SLD precisa de quantidade). Produtos com saldo 0 aparecem desabilitados. O ajuste é aplicado no local de maior saldo do produto.
      </div>

      {conta === '' ? (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: 16, fontSize: '.85rem' }}>
          Esta página exige uma conta específica do Omie. Selecione <b>NOVA</b> ou <b>CASTRO</b> no menu acima.
        </div>
      ) : (
        <>
          {/* filtros */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 16 }}>
              <label style={{ flexGrow: 1, minWidth: 240 }}>
                <span style={{ display: 'block', fontSize: '.72rem', fontWeight: 500, color: '#475569', marginBottom: 4 }}>Buscar (código ou descrição)</span>
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="ex.: RP-1234 ou filtro de óleo" style={{ ...inp, width: '100%' }} />
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', paddingBottom: 6 }}>
                <input type="checkbox" checked={soSemCmc} onChange={(e) => setSoSemCmc(e.target.checked)} /> Só produtos sem CMC (CMC = 0)
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', paddingBottom: 6 }}>
                <input type="checkbox" checked={soAjustaveis} onChange={(e) => setSoAjustaveis(e.target.checked)} /> Só ajustáveis (com saldo)
              </label>
              <button onClick={() => carregarProdutos(true)} style={{ padding: '8px 14px', background: '#f1f5f9', color: '#334155', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: 'pointer' }}>Recarregar lista</button>
            </div>
            <div style={{ marginTop: 10, fontSize: '.72rem', color: '#64748b' }}>
              {carregado ? `${lista.length} de ${produtos.length} produto(s)${aviso}${sinc ? ' · dados sincronizados em ' + fmtDataHora(sinc) : ''}` : ''}
            </div>
          </div>

          {!carregado ? (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 24, fontSize: '.85rem', color: estado.startsWith('Erro') ? '#dc2626' : '#475569' }}>{estado}</div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => ordenar('codigo')}>Código {seta('codigo')}</th>
                      <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => ordenar('descricao')}>Descrição {seta('descricao')}</th>
                      <th style={{ ...thStyle, textAlign: 'right', cursor: 'pointer' }} onClick={() => ordenar('saldoTotal')}>Saldo {seta('saldoTotal')}</th>
                      <th style={{ ...thStyle, textAlign: 'right', cursor: 'pointer' }} onClick={() => ordenar('cmc')}>CMC atual {seta('cmc')}</th>
                      <th style={thStyle}>Novo CMC (R$)</th>
                      <th style={thStyle}>Fornecedor</th>
                      <th style={thStyle}>Observação</th>
                      <th style={thStyle}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {mostradas.length === 0 ? (
                      <tr><td colSpan={8} style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>Nenhum produto.</td></tr>
                    ) : mostradas.map((p) => {
                      const rid = `p${p.codigoProduto}_${p.codLocal != null ? p.codLocal : 'x'}`;
                      const st = status[rid];
                      const cmcTxt = st?.aplicado ? <span style={{ color: '#15803d', fontWeight: 500 }}>{fmtMoeda(p.cmc)}</span>
                        : Number(p.cmc || 0) > 0 ? fmtMoeda(p.cmc) : <span style={{ color: '#d97706' }}>sem CMC</span>;
                      const saldoCls = Number(p.saldoTotal || 0) < 0 ? '#dc2626' : '#334155';
                      if (!p.ajustavel) {
                        return (
                          <tr key={rid} style={{ background: '#f8fafc', color: '#94a3b8', borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ ...tdStyle, fontWeight: 500, whiteSpace: 'nowrap' }}>{p.codigo || ('#' + p.codigoProduto)}</td>
                            <td style={tdStyle}>{p.descricao || ''}</td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtNum(p.saldoTotal)}</td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>{Number(p.cmc || 0) > 0 ? fmtMoeda(p.cmc) : <span style={{ color: '#d97706' }}>sem CMC</span>}</td>
                            <td style={tdStyle} colSpan={4}><span style={{ fontSize: '.72rem' }}>Saldo 0 — não ajustável via SLD</span></td>
                          </tr>
                        );
                      }
                      return (
                        <tr key={rid} style={{ background: st?.aplicado ? '#f0fdf4' : undefined, borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ ...tdStyle, fontWeight: 500, whiteSpace: 'nowrap', color: '#1e293b' }}>{p.codigo || ('#' + p.codigoProduto)}</td>
                          <td style={{ ...tdStyle, color: '#475569' }}>{p.descricao || ''}</td>
                          <td style={{ ...tdStyle, textAlign: 'right', color: saldoCls }}>{fmtNum(p.saldoTotal)}</td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>{cmcTxt}</td>
                          <td style={tdStyle}>
                            <input type="number" step="0.0001" min="0" placeholder="0,00" value={cmcEdit[rid] ?? ''} disabled={st?.aplicado || enviando === rid}
                              onChange={(e) => setCmcEdit((s) => ({ ...s, [rid]: e.target.value }))}
                              onKeyDown={(e) => { if (e.key === 'Enter') enviar(p, rid); }}
                              style={{ ...inp, width: 110 }} />
                          </td>
                          <td style={tdStyle}>
                            <input list="dl-fornecedores" placeholder="(opcional)" value={fornEdit[rid] ?? ''} disabled={st?.aplicado || enviando === rid}
                              onChange={(e) => setFornEdit((s) => ({ ...s, [rid]: e.target.value }))} style={{ ...inp, width: 170 }} />
                          </td>
                          <td style={tdStyle}>
                            <input placeholder="(opcional)" value={obsEdit[rid] ?? ''} disabled={st?.aplicado || enviando === rid}
                              onChange={(e) => setObsEdit((s) => ({ ...s, [rid]: e.target.value }))} style={{ ...inp, width: 180 }} />
                          </td>
                          <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                            {st && <span style={{ fontSize: '.7rem', marginRight: 6, color: st.ok ? '#15803d' : '#dc2626' }}>{st.texto}</span>}
                            {!st?.aplicado && (
                              <button onClick={() => enviar(p, rid)} disabled={enviando === rid} style={{ padding: '5px 10px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.78rem', cursor: 'pointer', opacity: enviando === rid ? 0.6 : 1 }}>Enviar p/ CMC</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <datalist id="dl-fornecedores">
        {fornecedores.map((f) => <option key={f.id} value={f.nome} />)}
      </datalist>
    </div>
  );
}
