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

type Aba = 'compras' | 'clientes' | 'oportunidades' | 'sugestoes-sazonais' | 'sugestoes-produto';
const ABAS: Array<{ id: Aba; label: string }> = [
  { id: 'compras', label: 'Compras' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'oportunidades', label: 'Oportunidades (RFM)' },
  { id: 'sugestoes-sazonais', label: 'Sugestões (sazonal)' },
  { id: 'sugestoes-produto', label: 'Sugestões por produto' },
];

type Tipo = 'texto' | 'num' | 'moeda' | 'data' | 'bool';
// `get` devolve o valor usado para ordenar/filtrar/CSV; `fmt` (opcional) só troca
// a exibição na célula (ex.: status numérico -> "Na época"), sem afetar a ordenação.
interface Col { key: string; label: string; tipo: Tipo; get: (r: Record<string, unknown>) => unknown; fmt?: (r: Record<string, unknown>) => string }

const MAX_RENDER = 500;

const thStyle: React.CSSProperties = { background: '#fafafa', color: '#666', fontSize: '.64rem', textTransform: 'uppercase', letterSpacing: '.5px', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #eee', fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer', position: 'sticky', top: 0, zIndex: 2 };
const thFiltro: React.CSSProperties = { background: '#fff', padding: '4px 6px', borderBottom: '1px solid #eee', position: 'sticky', top: 30, zIndex: 2 };
const tdStyle: React.CSSProperties = { padding: '7px 10px', borderBottom: '1px solid #f5f5f5', color: '#444', fontSize: '.8rem', whiteSpace: 'nowrap' };
const filtroInput: React.CSSProperties = { width: '100%', padding: '4px 6px', border: '1px solid #e5e5e5', borderRadius: 6, fontSize: '.72rem', outline: 'none' };

const parseBR = (s: string): number => { const p = s.split('/'); return p.length === 3 ? new Date(+p[2], +p[1] - 1, +p[0]).getTime() : 0; };

// Filtro por coluna:
//   - operador (>, >=, <, <=, =) + número => comparação numérica (ex.: ">100", "<=5");
//   - termo numérico puro => igualdade exata;
//   - texto => substring; case-insensitive.
function casaFiltro(valor: unknown, termo: string): boolean {
  const t = termo.trim().toLowerCase();
  if (!t) return true;
  // Operador no início do termo → compara o valor numérico da célula.
  const op = t.match(/^(>=|<=|>|<|=)\s*(-?\d+(?:[.,]\d+)?)$/);
  if (op) {
    const alvo = parseFloat(op[2].replace(',', '.'));
    const nv = Number(valor);
    if (!Number.isFinite(nv) || !Number.isFinite(alvo)) return false;
    switch (op[1]) {
      case '>': return nv > alvo;
      case '>=': return nv >= alvo;
      case '<': return nv < alvo;
      case '<=': return nv <= alvo;
      default: return nv === alvo; // '='
    }
  }
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
                <input
                  value={filtros[c.key] || ''}
                  onChange={(e) => setFiltros((f) => ({ ...f, [c.key]: e.target.value }))}
                  placeholder={c.tipo === 'num' || c.tipo === 'moeda' ? 'ex: >100' : 'filtrar'}
                  title={c.tipo === 'num' || c.tipo === 'moeda' ? 'Use operadores: >100, >=100, <100, <=100, =100 — ou digite um valor exato' : 'Filtrar por texto'}
                  style={filtroInput}
                  onClick={(e) => e.stopPropagation()}
                />
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
                        {c.fmt ? c.fmt(r) : fmtCel(c.get(r), c.tipo)}
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

const STATUS_ORD: Record<string, number> = { na_epoca: 0, chegando: 1, fora: 2 };
function fmtStatusSazonal(r: Record<string, unknown>): string {
  const st = String(r.status);
  const dias = r.dias_para_epoca == null ? null : Number(r.dias_para_epoca);
  const ja = r.ja_comprou_ciclo ? ' · já comprou' : '';
  if (st === 'na_epoca') return '🟢 Na época' + ja;
  if (st === 'chegando') return `🟡 Chega em ~${dias} d` + ja;
  return dias != null ? `⚪ Em ${dias} d` : '⚪ Fora';
}

const COLS_SUGESTOES: Col[] = [
  { key: 'cliente', label: 'Cliente', tipo: 'texto', get: (r) => r.cliente },
  { key: 'telefone', label: 'Telefone', tipo: 'texto', get: (r) => r.telefone },
  { key: 'grupo', label: 'Grupo (peça)', tipo: 'texto', get: (r) => r.grupo },
  { key: 'status', label: 'Quando', tipo: 'num', get: (r) => STATUS_ORD[String(r.status)] ?? 9, fmt: fmtStatusSazonal },
  { key: 'mes_tipico', label: 'Mês típico', tipo: 'texto', get: (r) => r.mes_tipico },
  { key: 'janela_label', label: 'Janela', tipo: 'texto', get: (r) => r.janela_label },
  { key: 'concentracao', label: 'Concentração', tipo: 'num', get: (r) => r.concentracao, fmt: (r) => Math.round(Number(r.concentracao) * 100) + '%' },
  { key: 'anos_recorrencia', label: 'Anos', tipo: 'num', get: (r) => r.anos_recorrencia },
  { key: 'n_compras', label: 'Nº compras', tipo: 'num', get: (r) => r.n_compras },
  { key: 'valor_total', label: 'Valor total', tipo: 'moeda', get: (r) => r.valor_total },
  { key: 'ultima_compra', label: 'Última compra', tipo: 'data', get: (r) => r.ultima_compra },
];

const COLS_SUGESTOES_PRODUTO: Col[] = [
  { key: 'grupo', label: 'Grupo (peça)', tipo: 'texto', get: (r) => r.grupo },
  // Status só faz sentido quando o PRODUTO tem época no agregado; senão "—".
  { key: 'status', label: 'Quando (produto)', tipo: 'num', get: (r) => (r.sazonal ? STATUS_ORD[String(r.status)] ?? 9 : 9), fmt: (r) => (r.sazonal ? fmtStatusSazonal(r) : '—') },
  { key: 'mes_tipico', label: 'Mês típico', tipo: 'texto', get: (r) => r.mes_tipico || '—' },
  { key: 'janela_label', label: 'Janela', tipo: 'texto', get: (r) => r.janela_label || '—' },
  { key: 'concentracao', label: 'Concentração', tipo: 'num', get: (r) => r.concentracao, fmt: (r) => Math.round(Number(r.concentracao) * 100) + '%' },
  { key: 'n_clientes_epoca', label: 'Clientes na época', tipo: 'num', get: (r) => r.n_clientes_epoca },
  { key: 'n_clientes', label: 'Nº clientes', tipo: 'num', get: (r) => r.n_clientes },
  { key: 'n_vendas', label: 'Nº vendas', tipo: 'num', get: (r) => r.n_vendas },
  { key: 'valor_total', label: 'Valor total', tipo: 'moeda', get: (r) => r.valor_total },
  { key: 'ultima_venda', label: 'Última venda', tipo: 'data', get: (r) => r.ultima_venda },
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

interface AlvoContato { codigo_produto: string; sku: string; descricao: string; codigo_cliente: string; conta: string; cliente_nome: string; ultimo_contato: UltimoContato | null }

// Botão + form inline + badge para registrar um contato do CRM (POST /contatos).
// Estado próprio por instância — usado no expand de Sugestões e no expand por cliente.
function RegistrarContato({ alvo, motivos, autor, dica }: { alvo: AlvoContato; motivos: Motivo[]; autor: { id: string; nome: string }; dica?: string }) {
  const [aberto, setAberto] = useState(false);
  const [resultado, setResultado] = useState<Resultado>('vendeu');
  const [motivoId, setMotivoId] = useState<number | ''>('');
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [ultimo, setUltimo] = useState<UltimoContato | null>(alvo.ultimo_contato);

  const salvar = async () => {
    if (resultado === 'nao_vendeu' && !motivoId) { alert('Escolha o motivo.'); return; }
    setSalvando(true);
    try {
      const r = await fetch(`/api/estoque/inteligencia-comercial/contatos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo_produto: alvo.codigo_produto, sku: alvo.sku, descricao_produto: alvo.descricao,
          codigo_cliente: alvo.codigo_cliente, conta_omie: alvo.conta, cliente_nome: alvo.cliente_nome,
          resultado, motivo_id: resultado === 'nao_vendeu' ? Number(motivoId) : null, observacao: obs || null,
          autor_id: autor.id, autor_nome: autor.nome,
        }),
      });
      const d = await r.json();
      if (d.erro) { alert('Erro: ' + d.erro); return; }
      setUltimo({ resultado, motivo: resultado === 'nao_vendeu' ? (motivos.find((m) => m.id === Number(motivoId))?.nome || null) : null, observacao: obs || null, autor_nome: autor.nome, data: new Date().toISOString() });
      setAberto(false); setObs(''); setMotivoId('');
    } catch (ex) { alert('Erro: ' + (ex as Error).message); }
    finally { setSalvando(false); }
  };

  const badge = ultimo ? LABEL_RESULTADO[(ultimo.resultado as Resultado)] : null;

  if (!aberto) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={() => setAberto(true)} style={{ background: 'none', border: '1px solid #dc2626', color: '#dc2626', borderRadius: 6, padding: '5px 14px', fontSize: '.76rem', fontWeight: 600, cursor: 'pointer' }}>{ultimo ? 'Atualizar contato' : 'Registrar contato'}</button>
        {badge && <span style={{ fontSize: '.74rem' }}>último: <span style={{ color: badge.cor, fontWeight: 600 }}>{badge.txt}{ultimo?.motivo ? ` (${ultimo.motivo})` : ''}</span><span style={{ color: '#bbb' }}> · {ultimo?.data?.slice(0, 10)}{ultimo?.autor_nome ? ' · ' + ultimo.autor_nome : ''}</span></span>}
      </div>
    );
  }
  return (
    <div style={{ background: '#fff7f7', padding: '10px 14px', borderRadius: 8, border: '1px solid #eee' }}>
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
        <button disabled={salvando} onClick={salvar} style={{ padding: '6px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.76rem', fontWeight: 600, cursor: 'pointer' }}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        <button onClick={() => setAberto(false)} style={{ padding: '6px 12px', background: 'none', color: '#888', border: '1px solid #e0e0e0', borderRadius: 6, fontSize: '.76rem', cursor: 'pointer' }}>Cancelar</button>
      </div>
      {dica && <div style={{ fontSize: '.68rem', color: '#aaa', marginTop: 6 }}>{dica}</div>}
    </div>
  );
}

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

interface SugestaoSku { codigo_produto: string; sku: string; descricao: string; n_compras: number; qtd: number; valor: number; ultima_compra: string | null }

// Painel expandido de uma sugestão sazonal (cliente × grupo): peças específicas
// que o cliente costuma comprar + registrar contato (contra a peça representativa).
function ExpandSugestao({ row, motivos, autor }: {
  row: Record<string, unknown>; motivos: Motivo[]; autor: { id: string; nome: string };
}) {
  const skus = (row.skus as SugestaoSku[] | undefined) || [];
  const rep = { codigo_produto: String(row.representante_codigo_produto || ''), sku: String(row.representante_sku || ''), descricao: String(row.representante_descricao || '') };
  const cel: React.CSSProperties = { padding: '6px 10px', fontSize: '.78rem', color: '#444', borderBottom: '1px solid #f0f0f0', whiteSpace: 'nowrap' };
  const th2: React.CSSProperties = { padding: '6px 10px', fontSize: '.62rem', textTransform: 'uppercase', color: '#999', letterSpacing: '.5px', textAlign: 'left', fontWeight: 700 };

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={{ fontSize: '.8rem', fontWeight: 700, color: '#333', marginBottom: 4 }}>
        {String(row.cliente || '')} · costuma comprar <span style={{ color: '#dc2626' }}>{String(row.grupo)}</span> em {String(row.mes_tipico)} (janela {String(row.janela_label)})
      </div>
      <div style={{ fontSize: '.74rem', color: '#888', marginBottom: 10 }}>
        {String(row.telefone) || 'sem telefone'} · {String(row.anos_recorrencia)} anos comprando · {Math.round(Number(row.concentracao) * 100)}% concentrado na janela
      </div>

      {skus.length > 0 && (
        <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #eee', borderRadius: 8, marginBottom: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Peça (SKU)', 'Descrição', 'Nº compras', 'Qtd', 'Valor', 'Última compra'].map((h) => <th key={h} style={th2}>{h}</th>)}</tr></thead>
            <tbody>
              {skus.slice(0, 100).map((s) => (
                <tr key={s.codigo_produto}>
                  <td style={cel}>{s.sku}</td>
                  <td style={{ ...cel, whiteSpace: 'normal', maxWidth: 340 }}>{s.descricao}</td>
                  <td style={{ ...cel, textAlign: 'right' }}>{s.n_compras}</td>
                  <td style={{ ...cel, textAlign: 'right' }}>{s.qtd}</td>
                  <td style={{ ...cel, textAlign: 'right' }}>{fmtRS(s.valor)}</td>
                  <td style={cel}>{s.ultima_compra || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RegistrarContato
        alvo={{ ...rep, codigo_cliente: String(row.codigo_cliente || ''), conta: String(row.conta || ''), cliente_nome: String(row.cliente || ''), ultimo_contato: (row.ultimo_contato as UltimoContato | null) || null }}
        motivos={motivos}
        autor={autor}
        dica={`O contato é registrado na peça principal (${rep.sku}) deste grupo.`}
      />
    </div>
  );
}

interface GrupoCliente {
  grupo: string; is_tipo: boolean; sazonal: boolean; mes_tipico: string | null; janela_label: string | null;
  concentracao: number; anos_recorrencia: number; n_compras: number; qtd_total: number; valor_total: number;
  ultima_compra: string | null; status: string; dias_para_epoca: number | null; ja_comprou_ciclo: boolean;
  representante_codigo_produto: string; representante_sku: string; representante_descricao: string;
  ultimo_contato: UltimoContato | null; skus: SugestaoSku[];
}

// Painel expandido de um CLIENTE (aba Clientes): os tipos de peça que ele compra
// por época — sazonais primeiro (com "na época?"), depois os demais tipos — cada um
// abrindo os SKUs específicos + registrar contato. Fonte: /sugestoes-cliente.
function ExpandClienteSugestoes({ row, contaParam, motivos, autor }: {
  row: Record<string, unknown>; contaParam: string; motivos: Motivo[]; autor: { id: string; nome: string };
}) {
  const codCliente = String(row.codigo_cliente || '');
  const clienteNome = String(row.nome || '');
  const [dados, setDados] = useState<GrupoCliente[] | null>(null);
  const [erro, setErro] = useState('');
  const [verOutros, setVerOutros] = useState(false);

  useEffect(() => {
    let vivo = true;
    setErro('');
    fetch(`/api/estoque/inteligencia-comercial/sugestoes-cliente?cliente=${encodeURIComponent(codCliente)}${contaParam}`)
      .then((r) => r.json())
      .then((d) => { if (!vivo) return; if (d.erro) setErro(d.erro); else setDados(d.itens || []); })
      .catch((ex) => { if (vivo) setErro('Erro: ' + (ex as Error).message); });
    return () => { vivo = false; };
  }, [codCliente, contaParam]);

  const sazonais = (dados || []).filter((g) => g.sazonal);
  const outros = (dados || []).filter((g) => !g.sazonal);

  const cardStyle: React.CSSProperties = { background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: '10px 12px', marginBottom: 8 };
  const cel: React.CSSProperties = { padding: '5px 8px', fontSize: '.74rem', color: '#555', whiteSpace: 'nowrap' };
  const th2: React.CSSProperties = { padding: '5px 8px', fontSize: '.6rem', textTransform: 'uppercase', color: '#aaa', letterSpacing: '.5px', textAlign: 'left', fontWeight: 700 };

  const renderGrupo = (g: GrupoCliente) => (
    <div key={g.representante_codigo_produto + g.grupo} style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontWeight: 700, color: '#333', fontSize: '.82rem' }}>{g.grupo}</span>
        {g.sazonal && <span style={{ fontSize: '.74rem' }}>{fmtStatusSazonal(g as unknown as Record<string, unknown>)}</span>}
        {g.sazonal && <span style={{ fontSize: '.72rem', color: '#888' }}>· {g.mes_tipico} (janela {g.janela_label}) · {Math.round(g.concentracao * 100)}% · {g.anos_recorrencia} anos</span>}
        <span style={{ fontSize: '.72rem', color: '#aaa', marginLeft: 'auto' }}>{g.n_compras} compras · {fmtRS(g.valor_total)} · última {g.ultima_compra || '—'}</span>
      </div>
      {g.skus.length > 0 && (
        <div style={{ overflowX: 'auto', marginBottom: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Peça (SKU)', 'Descrição', 'Nº compras', 'Valor', 'Última'].map((h) => <th key={h} style={th2}>{h}</th>)}</tr></thead>
            <tbody>
              {g.skus.slice(0, 50).map((s) => (
                <tr key={s.codigo_produto}>
                  <td style={cel}>{s.sku}</td>
                  <td style={{ ...cel, whiteSpace: 'normal', maxWidth: 320 }}>{s.descricao}</td>
                  <td style={{ ...cel, textAlign: 'right' }}>{s.n_compras}</td>
                  <td style={{ ...cel, textAlign: 'right' }}>{fmtRS(s.valor)}</td>
                  <td style={cel}>{s.ultima_compra || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <RegistrarContato
        alvo={{ codigo_produto: g.representante_codigo_produto, sku: g.representante_sku, descricao: g.representante_descricao, codigo_cliente: codCliente, conta: String(row.conta || ''), cliente_nome: clienteNome, ultimo_contato: g.ultimo_contato }}
        motivos={motivos}
        autor={autor}
        dica={`O contato é registrado na peça principal (${g.representante_sku}) deste grupo.`}
      />
    </div>
  );

  return (
    <div style={{ padding: '12px 16px' }}>
      {erro && <div style={{ color: '#dc2626', fontSize: '.78rem', marginBottom: 6 }}>{erro}</div>}
      {!dados && !erro && <div style={{ color: '#888', fontSize: '.78rem' }}>Analisando o histórico de {clienteNome}…</div>}
      {dados && (
        <>
          <div style={{ fontSize: '.8rem', fontWeight: 700, color: '#333', marginBottom: 8 }}>
            {sazonais.length > 0
              ? `${sazonais.length} ${sazonais.length === 1 ? 'tipo sazonal detectado' : 'tipos sazonais detectados'} para ${clienteNome}`
              : `Sem padrão sazonal claro para ${clienteNome}`}
          </div>
          {sazonais.map(renderGrupo)}
          {outros.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <button onClick={() => setVerOutros((v) => !v)} style={{ background: 'none', border: '1px solid #e0e0e0', color: '#666', borderRadius: 6, padding: '5px 12px', fontSize: '.74rem', fontWeight: 600, cursor: 'pointer' }}>
                {verOutros ? 'Ocultar' : 'Ver'} outros {outros.length} {outros.length === 1 ? 'tipo comprado' : 'tipos comprados'} (sem época definida)
              </button>
              {verOutros && <div style={{ marginTop: 8 }}>{outros.map(renderGrupo)}</div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface ClienteGrupo {
  codigo_cliente: string; conta: string; cliente: string; telefone: string;
  n_compras: number; qtd: number; valor: number; ultima_compra: string | null;
  sazonal: boolean; status: string; dias_para_epoca: number | null; ja_comprou_ciclo: boolean;
  mes_tipico: string | null; janela_label: string | null; concentracao: number; anos_recorrencia: number;
  representante_codigo_produto: string; representante_sku: string; representante_descricao: string;
  ultimo_contato: UltimoContato | null;
}

// Painel expandido de um GRUPO/Tipo (aba "Sugestões por produto"): os clientes que
// compram aquele grupo, com o status sazonal de cada um + registrar contato.
// Fonte: /clientes-grupo (por Tipo ou por SKU).
function ExpandProdutoClientes({ row, contaParam, motivos, autor }: {
  row: Record<string, unknown>; contaParam: string; motivos: Motivo[]; autor: { id: string; nome: string };
}) {
  const isTipo = !!row.is_tipo;
  const param = String(row.tipo_param || '');
  const grupo = String(row.grupo || '');
  const [dados, setDados] = useState<ClienteGrupo[] | null>(null);
  const [erro, setErro] = useState('');
  const [soEpoca, setSoEpoca] = useState(true);

  useEffect(() => {
    let vivo = true;
    setErro('');
    const q = isTipo ? `tipo=${encodeURIComponent(param)}` : `produto=${encodeURIComponent(param)}`;
    fetch(`/api/estoque/inteligencia-comercial/clientes-grupo?${q}${contaParam}`)
      .then((r) => r.json())
      .then((d) => { if (!vivo) return; if (d.erro) setErro(d.erro); else setDados(d.itens || []); })
      .catch((ex) => { if (vivo) setErro('Erro: ' + (ex as Error).message); });
    return () => { vivo = false; };
  }, [isTipo, param, contaParam]);

  const noEpoca = (c: ClienteGrupo) => c.sazonal && (c.status === 'na_epoca' || c.status === 'chegando') && !c.ja_comprou_ciclo;
  const lista = (dados || []).filter((c) => !soEpoca || noEpoca(c));

  const cel: React.CSSProperties = { padding: '6px 10px', fontSize: '.78rem', color: '#444', borderBottom: '1px solid #f0f0f0', whiteSpace: 'nowrap' };
  const th2: React.CSSProperties = { padding: '6px 10px', fontSize: '.62rem', textTransform: 'uppercase', color: '#999', letterSpacing: '.5px', textAlign: 'left', fontWeight: 700 };

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={{ fontSize: '.8rem', fontWeight: 700, color: '#333', marginBottom: 4 }}>
        Clientes que compram <span style={{ color: '#dc2626' }}>{grupo}</span>
        {row.sazonal ? <span style={{ color: '#888', fontWeight: 400 }}> · vende em {String(row.mes_tipico)} (janela {String(row.janela_label)})</span> : null}
      </div>
      {erro && <div style={{ color: '#dc2626', fontSize: '.78rem', marginBottom: 6 }}>{erro}</div>}
      {!dados && !erro && <div style={{ color: '#888', fontSize: '.78rem' }}>Carregando clientes…</div>}
      {dados && (
        <>
          <label style={{ fontSize: '.74rem', color: '#555', display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', marginBottom: 8 }}>
            <input type="checkbox" checked={soEpoca} onChange={(e) => setSoEpoca(e.target.checked)} /> Só clientes na época/chegando ({(dados || []).filter(noEpoca).length})
          </label>
          {lista.length === 0 ? (
            <div style={{ color: '#888', fontSize: '.78rem' }}>{soEpoca ? 'Nenhum cliente na época agora. Desmarque para ver todos.' : 'Nenhum cliente.'}</div>
          ) : (
            <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #eee', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Cliente', 'Telefone', 'Quando', 'Mês típico', 'Nº compras', 'Valor', 'Última', 'Ação'].map((h) => <th key={h} style={th2}>{h}</th>)}</tr></thead>
                <tbody>
                  {lista.slice(0, 200).map((c) => (
                    <tr key={c.conta + '|' + c.codigo_cliente}>
                      <td style={{ ...cel, whiteSpace: 'normal', maxWidth: 260 }}>{c.cliente}{c.conta ? <span style={{ color: '#bbb' }}> · {c.conta}</span> : null}</td>
                      <td style={cel}>{c.telefone || '—'}</td>
                      <td style={cel}>{c.sazonal ? fmtStatusSazonal(c as unknown as Record<string, unknown>) : <span style={{ color: '#ccc' }}>sem padrão</span>}</td>
                      <td style={cel}>{c.mes_tipico || '—'}</td>
                      <td style={{ ...cel, textAlign: 'right' }}>{c.n_compras}</td>
                      <td style={{ ...cel, textAlign: 'right' }}>{fmtRS(c.valor)}</td>
                      <td style={cel}>{c.ultima_compra || '—'}</td>
                      <td style={cel}>
                        <RegistrarContato
                          alvo={{ codigo_produto: c.representante_codigo_produto, sku: c.representante_sku, descricao: c.representante_descricao, codigo_cliente: c.codigo_cliente, conta: c.conta, cliente_nome: c.cliente, ultimo_contato: c.ultimo_contato }}
                          motivos={motivos}
                          autor={autor}
                          dica={`Registrado na peça ${c.representante_sku} que ${c.cliente} costuma comprar.`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function InteligenciaComercialPage() {
  const { userProfile } = useAuth();
  const { pode, loading: permLoading } = usePermissoes(userProfile?.id);
  const { conta, contaParam } = useConta();

  const [aba, setAba] = useState<Aba>('compras');
  const [dados, setDados] = useState<Record<Aba, Array<Record<string, unknown>> | null>>({ compras: null, clientes: null, oportunidades: null, 'sugestoes-sazonais': null, 'sugestoes-produto': null });
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
  useEffect(() => { setDados({ compras: null, clientes: null, oportunidades: null, 'sugestoes-sazonais': null, 'sugestoes-produto': null }); }, [contaParam]);
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
  const cols = aba === 'compras' ? COLS_COMPRAS : aba === 'clientes' ? COLS_CLIENTES : aba === 'sugestoes-sazonais' ? COLS_SUGESTOES : aba === 'sugestoes-produto' ? COLS_SUGESTOES_PRODUTO : COLS_OPORT;
  const csvName = `inteligencia-${aba}${conta ? '-' + conta : ''}.csv`;

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: '#333', marginBottom: 4, fontSize: '1.4rem', fontWeight: 700 }}>Inteligência Comercial</h1>
          <p style={{ color: '#888', fontSize: '.82rem', marginBottom: 0 }}>Compras · Clientes · Oportunidades (RFM) · Sugestões sazonais (por cliente e por produto) — histórico desde 11/2022</p>
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
          <span style={{ fontSize: '.75rem', color: '#059669', fontWeight: 600 }}>Clique num cliente para ver os tipos de peça que ele compra por época (sugestão de venda) e registrar o contato.</span>
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

      {aba === 'sugestoes-sazonais' && !carregando && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
          {rows.length > 0 && (() => {
            const n = rows.filter((r) => r.status !== 'fora' && !r.ja_comprou_ciclo).length;
            return (
              <span style={{ fontSize: '.8rem', color: '#059669', fontWeight: 600 }}>
                {n} {n === 1 ? 'sugestão está' : 'sugestões estão'} na época ou chegando. Clique numa linha para ver as peças e registrar o contato.
              </span>
            );
          })()}
          <span style={{ fontSize: '.72rem', color: '#aaa' }}>Padrão detectado por cliente × grupo de peça (Tipo, ex.: “Discos”; sem Tipo cai no SKU). Requer ≥2 anos comprando na mesma época.</span>
        </div>
      )}

      {aba === 'sugestoes-produto' && !carregando && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
          {rows.length > 0 && (() => {
            const n = rows.filter((r) => Number(r.n_clientes_epoca) > 0).length;
            return (
              <span style={{ fontSize: '.8rem', color: '#059669', fontWeight: 600 }}>
                {n} {n === 1 ? 'grupo de peça tem' : 'grupos de peça têm'} clientes na época de comprar. Clique numa linha para ver os clientes e registrar o contato.
              </span>
            );
          })()}
          <span style={{ fontSize: '.72rem', color: '#aaa' }}>Por Tipo de peça (ex.: “Discos”; sem Tipo cai no SKU): época de venda do produto + clientes que compram, marcando quem está na época.</span>
        </div>
      )}

      {erro && <div style={{ color: '#dc2626', marginBottom: 12, fontSize: '.85rem' }}>{erro}</div>}
      {carregando && <div style={{ color: '#888', fontSize: '.85rem', padding: '20px 0' }}>Calculando… (varre todo o histórico, pode levar alguns segundos)</div>}

      {!carregando && !erro && (
        <TabelaAnalise
          cols={cols}
          rows={rows}
          csvName={csvName}
          defaultSort={aba === 'oportunidades' ? { key: 'na_hora', dir: -1 } : aba === 'sugestoes-sazonais' ? { key: 'status', dir: 1 } : aba === 'sugestoes-produto' ? { key: 'n_clientes_epoca', dir: -1 } : { key: 'valor_total', dir: -1 }}
          rowKey={aba === 'oportunidades' ? (r) => String(r.codigo_produto) : aba === 'sugestoes-sazonais' ? (r) => String(r.conta) + '|' + String(r.codigo_cliente) + '|' + String(r.grupo) : aba === 'sugestoes-produto' ? (r) => String(r.is_tipo) + '|' + String(r.tipo_param) : aba === 'clientes' ? (r) => String(r.conta) + '|' + String(r.codigo_cliente) : (r) => String(r.chave ?? r.sku)}
          renderExpand={aba === 'oportunidades' ? (r) => (
            <ExpandOportunidade
              produto={{ codigo_produto: String(r.codigo_produto), sku: String(r.sku), descricao: String(r.descricao) }}
              contaParam={contaParam}
              motivos={motivos}
              autor={{ id: userProfile?.id || '', nome: userProfile?.nome || '' }}
            />
          ) : aba === 'sugestoes-sazonais' ? (r) => (
            <ExpandSugestao row={r} motivos={motivos} autor={{ id: userProfile?.id || '', nome: userProfile?.nome || '' }} />
          ) : aba === 'clientes' ? (r) => (
            <ExpandClienteSugestoes row={r} contaParam={contaParam} motivos={motivos} autor={{ id: userProfile?.id || '', nome: userProfile?.nome || '' }} />
          ) : aba === 'sugestoes-produto' ? (r) => (
            <ExpandProdutoClientes row={r} contaParam={contaParam} motivos={motivos} autor={{ id: userProfile?.id || '', nome: userProfile?.nome || '' }} />
          ) : undefined}
        />
      )}
      {conta === '' && <div style={{ fontSize: '.7rem', color: '#bbb', marginTop: 10 }}>Modo Todas (NOVA + CASTRO)</div>}
    </div>
  );
}
