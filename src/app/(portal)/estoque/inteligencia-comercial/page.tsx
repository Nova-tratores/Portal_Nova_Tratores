'use client';
// Inteligência Comercial: 3 abas (Compras / Clientes / Oportunidades-RFM) sobre
// /api/estoque/inteligencia-comercial. Tabelas com cabeçalho ordenável + filtro
// por coluna + export CSV. Todo o histórico, por conta (NOVA/CASTRO/Todas).
import { useState, useCallback, useEffect, useMemo, Fragment } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';
import { fmtRS } from '@/components/estoque/ui';

type Aba = 'compras' | 'clientes' | 'oportunidades';
const ABAS: Array<{ id: Aba; label: string }> = [
  { id: 'compras', label: 'Compras' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'oportunidades', label: 'Oportunidades (RFM)' },
];

type Tipo = 'texto' | 'num' | 'moeda' | 'data' | 'bool';
interface Col { key: string; label: string; tipo: Tipo; get: (r: Record<string, unknown>) => unknown }

const MAX_RENDER = 500;

const thStyle: React.CSSProperties = { background: '#fafafa', color: '#666', fontSize: '.64rem', textTransform: 'uppercase', letterSpacing: '.5px', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #eee', fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer', position: 'sticky', top: 0, zIndex: 2 };
const thFiltro: React.CSSProperties = { background: '#fff', padding: '4px 6px', borderBottom: '1px solid #eee', position: 'sticky', top: 30, zIndex: 2 };
const tdStyle: React.CSSProperties = { padding: '7px 10px', borderBottom: '1px solid #f5f5f5', color: '#444', fontSize: '.8rem', whiteSpace: 'nowrap' };
const filtroInput: React.CSSProperties = { width: '100%', padding: '4px 6px', border: '1px solid #e5e5e5', borderRadius: 6, fontSize: '.72rem', outline: 'none' };

const parseBR = (s: string): number => { const p = s.split('/'); return p.length === 3 ? new Date(+p[2], +p[1] - 1, +p[0]).getTime() : 0; };

// Filtro por coluna: termo numérico => igualdade exata; texto => substring; case-insensitive.
function casaFiltro(valor: unknown, termo: string): boolean {
  const t = termo.trim().toLowerCase();
  if (!t) return true;
  const v = String(valor ?? '').toLowerCase();
  if (/^\d+([.,]\d+)?$/.test(t)) { return v.replace(/\./g, '').replace(',', '.') === t.replace(',', '.') || v === t; }
  return v.includes(t);
}

function fmtCel(v: unknown, tipo: Tipo): string {
  if (tipo === 'moeda') return fmtRS(Number(v) || 0);
  if (tipo === 'bool') return v ? '✓' : '';
  if (tipo === 'num') return String(Number(v) || 0);
  return v == null ? '' : String(v);
}

function TabelaAnalise({ cols, rows, csvName, defaultSort, renderExpand, rowKey }: { cols: Col[]; rows: Array<Record<string, unknown>>; csvName: string; defaultSort?: { key: string; dir: number }; renderExpand?: (row: Record<string, unknown>) => React.ReactNode; rowKey?: (row: Record<string, unknown>) => string }) {
  const [sortKey, setSortKey] = useState(defaultSort?.key ?? cols[0].key);
  const [sortDir, setSortDir] = useState(defaultSort?.dir ?? 1);
  const [filtros, setFiltros] = useState<Record<string, string>>({});
  const [aberta, setAberta] = useState<string | null>(null);

  const colByKey = useMemo(() => Object.fromEntries(cols.map((c) => [c.key, c])), [cols]);

  const ordenar = useCallback((k: string) => {
    if (k === sortKey) setSortDir((d) => -d); else { setSortKey(k); setSortDir(1); }
  }, [sortKey]);

  const filtradas = useMemo(() => {
    const ativos = Object.entries(filtros).filter(([, v]) => v.trim());
    let out = rows;
    if (ativos.length) out = rows.filter((r) => ativos.every(([k, termo]) => casaFiltro(colByKey[k]?.get(r), termo)));
    const col = colByKey[sortKey];
    const arr = [...out].sort((a, b) => {
      const va = col.get(a), vb = col.get(b);
      let cmp: number;
      if (col.tipo === 'data') cmp = parseBR(String(va ?? '')) - parseBR(String(vb ?? ''));
      else if (col.tipo === 'num' || col.tipo === 'moeda' || col.tipo === 'bool') cmp = (Number(va) || 0) - (Number(vb) || 0);
      else cmp = String(va ?? '').localeCompare(String(vb ?? ''), 'pt-BR', { numeric: true, sensitivity: 'base' });
      return cmp * sortDir;
    });
    return arr;
  }, [rows, filtros, sortKey, sortDir, colByKey]);

  const exportarCSV = useCallback(() => {
    const linhas: string[] = [cols.map((c) => c.label).join(';')];
    const cell = (v: unknown, tipo: Tipo) => {
      if (tipo === 'moeda' || tipo === 'num') return String(Number(v) || 0).replace('.', ',');
      const s = tipo === 'bool' ? (v ? 'SIM' : '') : String(v ?? '');
      return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    filtradas.forEach((r) => linhas.push(cols.map((c) => cell(c.get(r), c.tipo)).join(';')));
    const blob = new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = csvName; a.click(); URL.revokeObjectURL(url);
  }, [filtradas, cols, csvName]);

  const visiveis = filtradas.slice(0, MAX_RENDER);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '.78rem', color: '#888' }}>{filtradas.length.toLocaleString('pt-BR')} linhas{filtradas.length > MAX_RENDER ? ` (mostrando ${MAX_RENDER})` : ''}</span>
        <button onClick={exportarCSV} disabled={!filtradas.length} style={{ marginLeft: 'auto', padding: '7px 14px', border: '1px solid #e0e0e0', background: '#fff', color: '#666', borderRadius: 8, fontSize: '.76rem', fontWeight: 600, cursor: 'pointer' }}>Exportar CSV</button>
      </div>
      <div style={{ overflowX: 'auto', maxHeight: '70vh', overflowY: 'auto', background: '#fff', border: '1px solid #eee', borderRadius: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>{cols.map((c) => (
              <th key={c.key} style={{ ...thStyle, textAlign: c.tipo === 'texto' ? 'left' : 'right' }} onClick={() => ordenar(c.key)} title="Clique para ordenar">
                {c.label}{sortKey === c.key ? (sortDir === 1 ? ' ▲' : ' ▼') : ''}
              </th>
            ))}</tr>
            <tr>{cols.map((c) => (
              <th key={c.key} style={thFiltro}>
                <input value={filtros[c.key] || ''} onChange={(e) => setFiltros((f) => ({ ...f, [c.key]: e.target.value }))} placeholder="filtrar" style={filtroInput} onClick={(e) => e.stopPropagation()} />
              </th>
            ))}</tr>
          </thead>
          <tbody>
            {visiveis.map((r, i) => {
              const k = rowKey ? rowKey(r) : String(i);
              const isOpen = renderExpand && aberta === k;
              return (
                <Fragment key={k}>
                  <tr onClick={renderExpand ? () => setAberta(isOpen ? null : k) : undefined} style={{ cursor: renderExpand ? 'pointer' : 'default', background: isOpen ? '#fff7f7' : undefined }}>
                    {cols.map((c) => (
                      <td key={c.key} style={{ ...tdStyle, textAlign: c.tipo === 'texto' ? 'left' : 'right', color: c.tipo === 'bool' && r[c.key] ? '#059669' : tdStyle.color, whiteSpace: c.key === 'fornecedores' || c.key === 'produtos_top' ? 'normal' : 'nowrap', maxWidth: c.key === 'fornecedores' || c.key === 'produtos_top' ? 340 : undefined }}>
                        {c.key === cols[0].key && renderExpand ? <span style={{ color: '#dc2626', marginRight: 6 }}>{isOpen ? '▼' : '▶'}</span> : null}
                        {fmtCel(c.get(r), c.tipo)}
                      </td>
                    ))}
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={cols.length} style={{ padding: 0, background: '#fafafa', borderBottom: '1px solid #eee' }}>
                        {renderExpand!(r)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ===== Definições de colunas por aba =====
const COLS_COMPRAS: Col[] = [
  { key: 'sku', label: 'SKU', tipo: 'texto', get: (r) => r.sku },
  { key: 'descricao', label: 'Descrição', tipo: 'texto', get: (r) => r.descricao },
  { key: 'qtd_total', label: 'Qtd comprada', tipo: 'num', get: (r) => r.qtd_total },
  { key: 'valor_total', label: 'Valor total', tipo: 'moeda', get: (r) => r.valor_total },
  { key: 'n_fornecedores', label: 'Nº fornec.', tipo: 'num', get: (r) => r.n_fornecedores },
  { key: 'fornecedores', label: 'Fornecedores', tipo: 'texto', get: (r) => r.fornecedores },
  { key: 'n_notas', label: 'Nº NFs', tipo: 'num', get: (r) => r.n_notas },
  { key: 'ultima_compra', label: 'Última compra', tipo: 'data', get: (r) => r.ultima_compra },
  { key: 'vinculado', label: 'Vinculado', tipo: 'bool', get: (r) => r.vinculado },
];

const COLS_CLIENTES: Col[] = [
  { key: 'nome', label: 'Cliente', tipo: 'texto', get: (r) => r.nome },
  { key: 'conta', label: 'Conta', tipo: 'texto', get: (r) => r.conta },
  { key: 'n_vendas', label: 'Nº vendas', tipo: 'num', get: (r) => r.n_vendas },
  { key: 'n_produtos', label: 'Nº produtos', tipo: 'num', get: (r) => r.n_produtos },
  { key: 'qtd_total', label: 'Qtd total', tipo: 'num', get: (r) => r.qtd_total },
  { key: 'valor_total', label: 'Valor total', tipo: 'moeda', get: (r) => r.valor_total },
  { key: 'ultima_venda', label: 'Última venda', tipo: 'data', get: (r) => r.ultima_venda },
  { key: 'produtos_top', label: 'Produtos vendidos (top)', tipo: 'texto', get: (r) => r.produtos_top },
  { key: 'codigo_cliente', label: 'Cód.', tipo: 'texto', get: (r) => r.codigo_cliente },
];

const COLS_OPORT: Col[] = [
  { key: 'na_hora', label: 'Na hora?', tipo: 'bool', get: (r) => r.na_hora },
  { key: 'sku', label: 'SKU', tipo: 'texto', get: (r) => r.sku },
  { key: 'descricao', label: 'Descrição', tipo: 'texto', get: (r) => r.descricao },
  { key: 'estoque', label: 'Estoque', tipo: 'num', get: (r) => r.estoque },
  { key: 'ultima_venda', label: 'Última venda', tipo: 'data', get: (r) => r.ultima_venda },
  { key: 'dias_desde_ultima', label: 'Dias s/ vender', tipo: 'num', get: (r) => r.dias_desde_ultima },
  { key: 'intervalo_medio', label: 'Interv. médio (d)', tipo: 'num', get: (r) => r.intervalo_medio },
  { key: 'n_vendas', label: 'Nº vendas', tipo: 'num', get: (r) => r.n_vendas },
  { key: 'qtd_vendida', label: 'Qtd vendida', tipo: 'num', get: (r) => r.qtd_vendida },
  { key: 'faturamento', label: 'Faturamento', tipo: 'moeda', get: (r) => r.faturamento },
  { key: 'rfm', label: 'RFM', tipo: 'num', get: (r) => r.rfm },
];

// Toggle segmentado Peças / Máquinas / Ambos (re-segmenta a aba Clientes).
type Grupo = 'ambos' | 'pecas' | 'maquinas';
function ToggleGrupo({ grupo, onChange }: { grupo: Grupo; onChange: (g: Grupo) => void }) {
  const opts: Array<[Grupo, string]> = [['pecas', 'Peças'], ['maquinas', 'Máquinas'], ['ambos', 'Ambos']];
  return (
    <div style={{ display: 'flex', border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden' }}>
      {opts.map(([g, label]) => (
        <button key={g} onClick={() => onChange(g)} style={{ padding: '7px 16px', border: 'none', background: grupo === g ? '#111' : '#fff', color: grupo === g ? '#fff' : '#555', fontSize: '.78rem', fontWeight: 600, cursor: 'pointer' }}>{label}</button>
      ))}
    </div>
  );
}

interface Motivo { id: number; nome: string }
interface UltimoContato { resultado: string; motivo: string | null; observacao: string | null; autor_nome: string | null; data: string }
interface ClienteProduto { codigo_cliente: string; conta: string; nome: string; telefone: string; n_compras: number; qtd: number; valor: number; ultima_compra: string | null; ultimo_contato: UltimoContato | null }
type Resultado = 'vendeu' | 'nao_vendeu' | 'sem_resposta';
const LABEL_RESULTADO: Record<Resultado, { txt: string; cor: string }> = {
  vendeu: { txt: 'Vendeu', cor: '#059669' },
  nao_vendeu: { txt: 'Não vendeu', cor: '#dc2626' },
  sem_resposta: { txt: 'Sem resposta', cor: '#b45309' },
};

// Painel expandido de uma oportunidade (produto): clientes que compraram + CRM.
function ExpandOportunidade({ produto, contaParam, motivos, autor }: {
  produto: { codigo_produto: string; sku: string; descricao: string };
  contaParam: string; motivos: Motivo[]; autor: { id: string; nome: string };
}) {
  const [dados, setDados] = useState<ClienteProduto[] | null>(null);
  const [erro, setErro] = useState('');
  const [formCli, setFormCli] = useState<string | null>(null); // 'CONTA|cod' com form aberto
  const [resultado, setResultado] = useState<Resultado>('vendeu');
  const [motivoId, setMotivoId] = useState<number | ''>('');
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      const r = await fetch(`/api/estoque/inteligencia-comercial/clientes-produto?produto=${encodeURIComponent(produto.codigo_produto)}${contaParam}`);
      const d = await r.json();
      if (d.erro) { setErro(d.erro); return; }
      setDados(d.itens || []);
    } catch (ex) { setErro('Erro: ' + (ex as Error).message); }
  }, [produto.codigo_produto, contaParam]);

  useEffect(() => { carregar(); }, [carregar]);

  const abrirForm = (cli: ClienteProduto) => {
    setFormCli(cli.conta + '|' + cli.codigo_cliente);
    setResultado('vendeu'); setMotivoId(''); setObs('');
  };

  const salvar = async (cli: ClienteProduto) => {
    if (resultado === 'nao_vendeu' && !motivoId) { alert('Escolha o motivo.'); return; }
    setSalvando(true);
    try {
      const r = await fetch(`/api/estoque/inteligencia-comercial/contatos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo_produto: produto.codigo_produto, sku: produto.sku, descricao_produto: produto.descricao,
          codigo_cliente: cli.codigo_cliente, conta_omie: cli.conta, cliente_nome: cli.nome,
          resultado, motivo_id: resultado === 'nao_vendeu' ? Number(motivoId) : null, observacao: obs || null,
          autor_id: autor.id, autor_nome: autor.nome,
        }),
      });
      const d = await r.json();
      if (d.erro) { alert('Erro: ' + d.erro); return; }
      setFormCli(null);
      await carregar();
    } catch (ex) { alert('Erro: ' + (ex as Error).message); }
    finally { setSalvando(false); }
  };

  const cel: React.CSSProperties = { padding: '6px 10px', fontSize: '.78rem', color: '#444', borderBottom: '1px solid #f0f0f0', whiteSpace: 'nowrap' };
  const th2: React.CSSProperties = { padding: '6px 10px', fontSize: '.62rem', textTransform: 'uppercase', color: '#999', letterSpacing: '.5px', textAlign: 'left', fontWeight: 700 };

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={{ fontSize: '.8rem', fontWeight: 700, color: '#333', marginBottom: 8 }}>Clientes que compraram {produto.sku} — {produto.descricao}</div>
      {erro && <div style={{ color: '#dc2626', fontSize: '.78rem', marginBottom: 6 }}>{erro}</div>}
      {!dados && !erro && <div style={{ color: '#888', fontSize: '.78rem' }}>Carregando clientes…</div>}
      {dados && dados.length === 0 && <div style={{ color: '#888', fontSize: '.78rem' }}>Nenhum cliente com compra deste produto.</div>}
      {dados && dados.length > 0 && (
        <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #eee', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Cliente', 'Telefone', 'Nº compras', 'Última compra', 'Valor', 'Último contato', 'Ação'].map((h) => <th key={h} style={th2}>{h}</th>)}</tr></thead>
            <tbody>
              {dados.slice(0, 200).map((cli) => {
                const chave = cli.conta + '|' + cli.codigo_cliente;
                const uc = cli.ultimo_contato;
                const badge = uc ? LABEL_RESULTADO[(uc.resultado as Resultado)] : null;
                return (
                  <Fragment key={chave}>
                    <tr>
                      <td style={cel}>{cli.nome}{cli.conta ? <span style={{ color: '#bbb' }}> · {cli.conta}</span> : null}</td>
                      <td style={cel}>{cli.telefone || '—'}</td>
                      <td style={{ ...cel, textAlign: 'right' }}>{cli.n_compras}</td>
                      <td style={cel}>{cli.ultima_compra || '—'}</td>
                      <td style={{ ...cel, textAlign: 'right' }}>{fmtRS(cli.valor)}</td>
                      <td style={cel}>{badge ? <span style={{ color: badge.cor, fontWeight: 600 }}>{badge.txt}{uc?.motivo ? ` (${uc.motivo})` : ''}<span style={{ color: '#bbb', fontWeight: 400 }}> · {uc?.data?.slice(0, 10)}{uc?.autor_nome ? ' · ' + uc.autor_nome : ''}</span></span> : <span style={{ color: '#ccc' }}>—</span>}</td>
                      <td style={cel}><button onClick={() => abrirForm(cli)} style={{ background: 'none', border: '1px solid #dc2626', color: '#dc2626', borderRadius: 6, padding: '3px 10px', fontSize: '.72rem', fontWeight: 600, cursor: 'pointer' }}>Registrar</button></td>
                    </tr>
                    {formCli === chave && (
                      <tr>
                        <td colSpan={7} style={{ background: '#fff7f7', padding: '10px 14px', borderBottom: '1px solid #eee' }}>
                          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                            {(Object.keys(LABEL_RESULTADO) as Resultado[]).map((res) => (
                              <label key={res} style={{ fontSize: '.78rem', color: '#444', display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}>
                                <input type="radio" checked={resultado === res} onChange={() => setResultado(res)} /> {LABEL_RESULTADO[res].txt}
                              </label>
                            ))}
                            {resultado === 'nao_vendeu' && (
                              <select value={motivoId} onChange={(e) => setMotivoId(e.target.value ? Number(e.target.value) : '')} style={{ padding: '6px 10px', border: '1px solid #e0e0e0', borderRadius: 6, fontSize: '.78rem' }}>
                                <option value="">Motivo…</option>
                                {motivos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                              </select>
                            )}
                            <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="observação (opcional)" style={{ flex: 1, minWidth: 180, padding: '6px 10px', border: '1px solid #e0e0e0', borderRadius: 6, fontSize: '.78rem' }} />
                            <button disabled={salvando} onClick={() => salvar(cli)} style={{ padding: '6px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.76rem', fontWeight: 600, cursor: 'pointer' }}>{salvando ? 'Salvando…' : 'Salvar'}</button>
                            <button onClick={() => setFormCli(null)} style={{ padding: '6px 12px', background: 'none', color: '#888', border: '1px solid #e0e0e0', borderRadius: 6, fontSize: '.76rem', cursor: 'pointer' }}>Cancelar</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function InteligenciaComercialPage() {
  const { userProfile } = useAuth();
  const { pode, loading: permLoading } = usePermissoes(userProfile?.id);
  const { conta, contaParam } = useConta();

  const [aba, setAba] = useState<Aba>('compras');
  const [dados, setDados] = useState<Record<Aba, Array<Record<string, unknown>> | null>>({ compras: null, clientes: null, oportunidades: null });
  const [meta, setMeta] = useState<Record<string, unknown>>({});
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [grupo, setGrupo] = useState<Grupo>('ambos');
  const [motivos, setMotivos] = useState<Motivo[]>([]);
  const [exportando, setExportando] = useState(false);

  const carregar = useCallback(async (ab: Aba) => {
    setCarregando(true); setErro('');
    try {
      const gp = ab === 'clientes' && grupo !== 'ambos' ? `&grupo=${grupo}` : '';
      const r = await fetch(`/api/estoque/inteligencia-comercial?aba=${ab}${gp}${contaParam}`);
      const d = await r.json();
      if (d.erro) { setErro(d.erro); return; }
      setDados((prev) => ({ ...prev, [ab]: d.itens || [] }));
      setMeta(d);
    } catch (ex) {
      setErro('Erro: ' + (ex as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [contaParam, grupo]);

  // Motivos do CRM (para o <select> do form de contato).
  useEffect(() => { fetch('/api/estoque/inteligencia-comercial/contatos').then((r) => r.json()).then((d) => setMotivos(d.motivos || [])).catch(() => {}); }, []);
  // Recarrega ao trocar de aba/conta (invalida cache local ao mudar conta).
  useEffect(() => { setDados({ compras: null, clientes: null, oportunidades: null }); }, [contaParam]);
  // Trocar o grupo invalida a aba Clientes (re-segmenta).
  useEffect(() => { setDados((p) => ({ ...p, clientes: null })); }, [grupo]);
  useEffect(() => { if (dados[aba] == null) carregar(aba); /* eslint-disable-next-line */ }, [aba, contaParam, grupo]);

  const exportarOportunidades = useCallback(async () => {
    setExportando(true);
    try {
      const r = await fetch(`/api/estoque/inteligencia-comercial?aba=export-oportunidades${contaParam}`);
      const d = await r.json();
      if (d.erro) { alert('Erro: ' + d.erro); return; }
      const rows = (d.itens || []) as Array<Record<string, unknown>>;
      const cell = (v: unknown) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
      const linhas = [['SKU', 'Descrição', 'Estoque', 'Conta', 'Cliente', 'Telefone', 'Nº compras', 'Qtd', 'Valor', 'Última compra'].join(';')];
      rows.forEach((x) => linhas.push([x.sku, x.descricao, x.estoque, x.conta, x.cliente, x.telefone, x.n_compras, String(x.qtd ?? '').replace('.', ','), String(x.valor ?? '').replace('.', ','), x.ultima_compra].map(cell).join(';')));
      const blob = new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `oportunidades${conta ? '-' + conta : ''}.csv`; a.click(); URL.revokeObjectURL(url);
    } catch (ex) { alert('Erro: ' + (ex as Error).message); } finally { setExportando(false); }
  }, [contaParam, conta]);

  if (!permLoading && userProfile && !pode('estoque', 'inteligencia-comercial')) return <SemPermissao />;

  const rows = dados[aba] || [];
  const cols = aba === 'compras' ? COLS_COMPRAS : aba === 'clientes' ? COLS_CLIENTES : COLS_OPORT;
  const csvName = `inteligencia-${aba}${conta ? '-' + conta : ''}.csv`;

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: '#333', marginBottom: 4, fontSize: '1.4rem', fontWeight: 700 }}>Inteligência Comercial</h1>
          <p style={{ color: '#888', fontSize: '.82rem', marginBottom: 0 }}>Compras por produto · Clientes · Oportunidades (RFM) — histórico desde 11/2022</p>
        </div>
        <ContaSelector />
      </div>

      <div style={{ margin: '14px 0', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Link href="/estoque" style={{ color: '#dc2626', textDecoration: 'none', fontSize: '.82rem', fontWeight: 600 }}>← Busca</Link>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {ABAS.map((a) => (
          <button key={a.id} onClick={() => setAba(a.id)} style={{ padding: '9px 18px', border: '1px solid ' + (aba === a.id ? '#dc2626' : '#e0e0e0'), background: aba === a.id ? '#dc2626' : '#fff', color: aba === a.id ? '#fff' : '#666', borderRadius: 999, fontSize: '.82rem', fontWeight: 600, cursor: 'pointer' }}>
            {a.label}
          </button>
        ))}
      </div>

      {aba === 'clientes' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '.72rem', color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 700 }}>Segmento</span>
          <ToggleGrupo grupo={grupo} onChange={setGrupo} />
        </div>
      )}

      {aba === 'oportunidades' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
          {typeof meta.na_hora === 'number' && !carregando && (
            <span style={{ fontSize: '.8rem', color: '#059669', fontWeight: 600 }}>
              {Number(meta.na_hora)} {Number(meta.na_hora) === 1 ? 'produto está' : 'produtos estão'} na hora de vender. Clique numa linha para ver os clientes e registrar o contato.
            </span>
          )}
          <button onClick={exportarOportunidades} disabled={exportando} style={{ marginLeft: 'auto', padding: '7px 14px', border: '1px solid #e0e0e0', background: '#fff', color: '#666', borderRadius: 8, fontSize: '.76rem', fontWeight: 600, cursor: 'pointer' }}>
            {exportando ? 'Gerando…' : 'Exportar oportunidades (lista de ligação)'}
          </button>
        </div>
      )}

      {erro && <div style={{ color: '#dc2626', marginBottom: 12, fontSize: '.85rem' }}>{erro}</div>}
      {carregando && <div style={{ color: '#888', fontSize: '.85rem', padding: '20px 0' }}>Calculando… (varre todo o histórico, pode levar alguns segundos)</div>}

      {!carregando && !erro && (
        <TabelaAnalise
          cols={cols}
          rows={rows}
          csvName={csvName}
          defaultSort={aba === 'oportunidades' ? { key: 'na_hora', dir: -1 } : { key: 'valor_total', dir: -1 }}
          rowKey={aba === 'oportunidades' ? (r) => String(r.codigo_produto) : aba === 'clientes' ? (r) => String(r.conta) + '|' + String(r.codigo_cliente) : (r) => String(r.chave ?? r.sku)}
          renderExpand={aba === 'oportunidades' ? (r) => (
            <ExpandOportunidade
              produto={{ codigo_produto: String(r.codigo_produto), sku: String(r.sku), descricao: String(r.descricao) }}
              contaParam={contaParam}
              motivos={motivos}
              autor={{ id: userProfile?.id || '', nome: userProfile?.nome || '' }}
            />
          ) : undefined}
        />
      )}
      {conta === '' && <div style={{ fontSize: '.7rem', color: '#bbb', marginTop: 10 }}>Modo Todas (NOVA + CASTRO)</div>}
    </div>
  );
}
