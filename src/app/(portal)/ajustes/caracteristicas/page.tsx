'use client';
// Caracteristicas por produto (Fase 3). Portado de caracteristicas.ejs + public/caracteristicas.js.
// Matriz cross-conta (NOVA + CASTRO): cada caracteristica da Omie vira uma coluna.
// Busca client-side, filtro por empresa, edicao inline (grava na Omie), sincronizacao
// worker-ready com polling, e "Sugestoes de Tipo" em lote. NAO usa ContaSelector.
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { authHeaders } from '@/lib/auth/client';

// ---------- tipos ----------
interface Produto {
  empresa: string; codigo_produto: number | string; codigo?: string; descricao?: string;
  modelo?: string; marca?: string; estoque?: number;
  caracteristicas?: Record<string, string>;
}
interface CaractPayload {
  produtos?: Produto[]; colunas?: string[]; total?: number; ultimaSync?: string | null;
  sync?: { rodando?: boolean; etapa?: string; erro?: string }; erro?: string;
}
interface StatusPayload { rodando?: boolean; etapa?: string; fim?: string; erro?: string; resumo?: string }
interface CatalogoPayload { catalogo?: Record<string, string[]>; porEmpresa?: Record<string, Record<string, string[]>> }
interface SugestaoItem {
  empresa: string; codigo_produto: number | string; codigo?: string; descricao?: string;
  sugestao?: string; candidatos?: string[];
}
interface SugestoesPayload { colTipo?: string; valores?: string[]; itens?: SugestaoItem[]; aviso?: string; erro?: string }

// ---------- helpers ----------
function fmtDataHora(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? String(iso) : d.toLocaleString('pt-BR');
}

const thStyle: React.CSSProperties = { background: '#f1f5f9', color: '#475569', fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.4px', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none', position: 'sticky', top: 0, zIndex: 1 };
const tdStyle: React.CSSProperties = { padding: '6px 10px', borderBottom: '1px solid #f1f5f9', color: '#334155', fontSize: '.8rem', verticalAlign: 'top' };
// filtros por coluna (segunda linha do cabecalho) — mesmo padrao de /ajustes/remessas
const thFiltroStyle: React.CSSProperties = { background: '#f8fafc', padding: '0 6px 6px', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 32, zIndex: 1 };
const filtroInput: React.CSSProperties = { width: '100%', minWidth: 60, border: '1px solid #cbd5e1', borderRadius: 4, padding: '3px 6px', fontSize: '.72rem', fontWeight: 400 };

// Colunas fixas (não editáveis): key -> rótulo. As demais colunas são características
// da Omie, cuja key é o próprio nome. `qtd_estoque` = saldo (produtos.estoque, só-leitura).
const COLS_FIXAS: Record<string, string> = {
  empresa: 'Empresa', codigo: 'Codigo', descricao: 'Descricao', qtd_estoque: 'Qtd Estoque', modelo: 'Modelo', marca: 'Marca',
};
const CHAVES_FIXAS = Object.keys(COLS_FIXAS);
function ehFixa(key: string): boolean { return key in COLS_FIXAS; }
function labelCol(key: string): string { return COLS_FIXAS[key] || key; }
// Ordem padrão pedida pelo usuário. As características casam com dados.colunas de forma
// case-insensitive (a Omie pode gravar #PRATELEIRA etc.); ver reconciliarOrdem.
const DEFAULT_ORDEM = ['empresa', 'codigo', 'descricao', 'qtd_estoque', '#Prateleira', '#Andar', '#Andar2', '#Caixa', 'Sistema', 'Tipo:', 'marca', 'modelo'];
const ORDEM_KEY = (uid: string) => `carac-ordem-colunas-${uid}`;

function normKey(s: string): string { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase(); }
// Reconcilia uma ordem "desejada" (pode ter casing diferente / chaves inexistentes) com as
// colunas realmente disponíveis: mantém as que existem (usando a chave REAL), na ordem
// desejada; anexa no fim as disponíveis que sobraram (colunas novas da Omie).
function reconciliarOrdem(desejada: string[], disponiveis: string[]): string[] {
  const restantes = new Map(disponiveis.map((k) => [normKey(k), k]));
  const out: string[] = [];
  for (const d of desejada) {
    const real = restantes.get(normKey(d));
    if (real !== undefined) { out.push(real); restantes.delete(normKey(d)); }
  }
  for (const k of restantes.values()) out.push(k);
  return out;
}

function EmpBadge({ empresa }: { empresa: string }) {
  const castro = empresa === 'CASTRO';
  return <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: '.68rem', background: castro ? '#f3e8ff' : '#e0f2fe', color: castro ? '#7e22ce' : '#0369a1' }}>{empresa}</span>;
}

export default function CaracteristicasPage() {
  const { userProfile } = useAuth();
  const { pode, loading: permLoading } = usePermissoes(userProfile?.id);
  const criadoPor = userProfile?.nome || 'portal';

  const [dados, setDados] = useState<CaractPayload>({ produtos: [], colunas: [], ultimaSync: null });
  const [filtro, setFiltro] = useState('');
  const [empFiltro, setEmpFiltro] = useState('');
  const [filtros, setFiltros] = useState<Record<string, string>>({}); // filtro por coluna (cabecalho)
  const [status, setStatus] = useState('');
  const [statusTipo, setStatusTipo] = useState<'ok' | 'erro' | 'info'>('info');
  const [rodando, setRodando] = useState(false);
  // Ordenacao de linhas em ate 2 niveis: [0]=principal, [1]=secundaria (desempate).
  // Clique = define/inverte a principal (limpa a secundaria); Shift+clique = 2o criterio.
  const [sorts, setSorts] = useState<{ key: string; dir: number }[]>([]);

  // ordem das colunas (reordenavel no desktop, salva por usuario no localStorage)
  const [ordemColunas, setOrdemColunas] = useState<string[]>([]);
  const ordemCarregadaRef = useRef(false);
  const [dragCol, setDragCol] = useState<string | null>(null);

  // edicao inline
  const [editando, setEditando] = useState<{ empresa: string; cp: string; col: string } | null>(null);
  const [editVal, setEditVal] = useState('');
  const [salvandoCelula, setSalvandoCelula] = useState<string | null>(null);

  // catalogo (valores validos por empresa) carregado lazy
  const catalogoRef = useRef<{ uniao: Record<string, string[]>; porEmpresa: Record<string, Record<string, string[]>> } | null>(null);

  // modal de sugestoes de tipo
  const [sugestoes, setSugestoes] = useState<SugestoesPayload | null>(null);

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setMsg = useCallback((texto: string, tipo: 'ok' | 'erro' | 'info' = 'info') => { setStatus(texto); setStatusTipo(tipo); }, []);

  const carregar = useCallback(async () => {
    setMsg('carregando dados...', 'info');
    try {
      const r = await fetch('/api/ajustes/caracteristicas');
      const d = (await r.json()) as CaractPayload;
      if (d.erro) { setMsg('Erro: ' + d.erro, 'erro'); return; }
      setDados(d);
      if (d.sync?.rodando) { setRodando(true); }
      else if (d.sync?.erro) { setMsg('Ultima sync falhou: ' + d.sync.erro, 'erro'); setRodando(false); }
      else { setMsg('', 'info'); setRodando(false); }
    } catch (ex) {
      setMsg('Erro de rede: ' + (ex as Error).message, 'erro');
    }
  }, [setMsg]);

  const poll = useCallback(() => {
    const tick = async () => {
      try {
        const r = await fetch('/api/ajustes/caracteristicas/status');
        const st = (await r.json()) as StatusPayload;
        if (st.rodando) {
          setRodando(true);
          setMsg('sincronizando: ' + (st.etapa || '...'), 'info');
          pollRef.current = setTimeout(tick, 3000);
        } else {
          setRodando(false);
          if (st.erro) setMsg('Erro na sync: ' + st.erro, 'erro');
          else setMsg('Sincronizacao concluida.', 'ok');
          carregar();
        }
      } catch {
        pollRef.current = setTimeout(tick, 4000);
      }
    };
    tick();
  }, [carregar, setMsg]);

  useEffect(() => {
    carregar();
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // dispara o polling quando a sync entra em estado "rodando"
  useEffect(() => {
    if (rodando) { if (pollRef.current) clearTimeout(pollRef.current); poll(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rodando]);

  const sincronizar = useCallback(async () => {
    if (!confirm('Sincronizar caracteristicas com a Omie? Pode levar alguns minutos por empresa.')) return;
    setRodando(true);
    setMsg('iniciando sincronizacao...', 'info');
    try {
      const r = await fetch('/api/ajustes/caracteristicas/sincronizar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ criadoPor }),
      });
      const d = await r.json();
      if (d.erro && !d.rodando && !d.jaRodando) { setMsg('Erro: ' + d.erro, 'erro'); setRodando(false); return; }
      // worker-ready: poll do status (o useEffect de `rodando` ja dispara o poll)
    } catch (ex) {
      setMsg('Erro de rede: ' + (ex as Error).message, 'erro'); setRodando(false);
    }
  }, [criadoPor, setMsg]);

  const ensureCatalogo = useCallback(async () => {
    if (catalogoRef.current) return catalogoRef.current;
    try {
      const r = await fetch('/api/ajustes/caracteristicas/catalogo');
      const d = (await r.json()) as CatalogoPayload;
      catalogoRef.current = { uniao: d.catalogo || {}, porEmpresa: d.porEmpresa || {} };
    } catch {
      catalogoRef.current = { uniao: {}, porEmpresa: {} };
    }
    return catalogoRef.current;
  }, []);

  // empresas distintas (para o filtro)
  const empresas = useMemo(() => Array.from(new Set((dados.produtos || []).map((p) => p.empresa))).sort(), [dados.produtos]);

  const valCol = useCallback((p: Produto, col: string): string => {
    if (col === 'empresa') return p.empresa || '';
    if (col === 'codigo') return p.codigo || '';
    if (col === 'descricao') return p.descricao || '';
    if (col === 'qtd_estoque') return p.estoque != null ? String(p.estoque) : '';
    if (col === 'modelo') return p.modelo || '';
    if (col === 'marca') return p.marca || '';
    return (p.caracteristicas && p.caracteristicas[col]) || '';
  }, []);

  const linhas = useMemo(() => {
    const termo = filtro.trim().toLowerCase();
    let arr = dados.produtos || [];
    if (empFiltro) arr = arr.filter((p) => p.empresa === empFiltro);
    if (termo) {
      arr = arr.filter((p) =>
        String(p.codigo || '').toLowerCase().includes(termo) ||
        String(p.descricao || '').toLowerCase().includes(termo) ||
        String(p.empresa || '').toLowerCase().includes(termo));
    }
    // filtros por coluna (cabecalho): AND entre colunas com valor
    const ativos = Object.entries(filtros).filter(([, v]) => v && v.trim() !== '');
    if (ativos.length) {
      arr = arr.filter((p) =>
        ativos.every(([col, v]) => valCol(p, col).toLowerCase().includes(v.trim().toLowerCase())));
    }
    if (sorts.length) {
      arr = arr.slice().sort((a, b) => {
        for (const { key, dir } of sorts) {
          const c = valCol(a, key).localeCompare(valCol(b, key), 'pt-BR', { numeric: true, sensitivity: 'base' }) * dir;
          if (c !== 0) return c;
        }
        return 0;
      });
    }
    return arr;
  }, [dados.produtos, filtro, empFiltro, filtros, sorts, valCol]);

  // Clique normal: define a coluna como criterio PRINCIPAL (inverte se ja for) e limpa a
  // secundaria. Shift+clique: adiciona/inverte como 2o criterio (desempate), max 2 niveis.
  const ordenarPor = useCallback((key: string, secundario = false) => {
    setSorts((s) => {
      if (secundario) {
        const idx = s.findIndex((x) => x.key === key);
        if (idx >= 0) { const novo = s.slice(); novo[idx] = { key, dir: -novo[idx].dir }; return novo; }
        if (s.length === 0) return [{ key, dir: 1 }];
        return [s[0], { key, dir: 1 }]; // no maximo 2 niveis; substitui a secundaria
      }
      if (s.length === 1 && s[0].key === key) return [{ key, dir: -s[0].dir }];
      return [{ key, dir: 1 }];
    });
  }, []);
  const sortInfo = useCallback((key: string): { pos: number; dir: number } | null => {
    const idx = sorts.findIndex((x) => x.key === key);
    return idx < 0 ? null : { pos: idx, dir: sorts[idx].dir };
  }, [sorts]);

  // ---- ordem das colunas ----
  const todasChaves = useMemo(() => [...CHAVES_FIXAS, ...(dados.colunas || [])], [dados.colunas]);

  // Carrega a ordem salva (uma vez) e reconcilia com as colunas disponiveis sempre que
  // novas caracteristicas aparecem. Usa updater para nao depender de `ordemColunas` nas deps.
  useEffect(() => {
    const uid = userProfile?.id;
    if (!uid) return;
    setOrdemColunas((atual) => {
      let base = atual;
      if (!ordemCarregadaRef.current) {
        ordemCarregadaRef.current = true;
        let salva: string[] | null = null;
        try { const raw = localStorage.getItem(ORDEM_KEY(uid)); if (raw) salva = JSON.parse(raw); } catch { /* ignore */ }
        base = Array.isArray(salva) && salva.length ? salva : DEFAULT_ORDEM;
      }
      const rec = reconciliarOrdem(base, todasChaves);
      return rec.length === atual.length && rec.every((k, i) => k === atual[i]) ? atual : rec;
    });
  }, [userProfile?.id, todasChaves]);

  // Persiste a ordem quando muda (so depois de carregada, para nao apagar a salva).
  useEffect(() => {
    const uid = userProfile?.id;
    if (!uid || !ordemCarregadaRef.current || ordemColunas.length === 0) return;
    try { localStorage.setItem(ORDEM_KEY(uid), JSON.stringify(ordemColunas)); } catch { /* ignore */ }
  }, [userProfile?.id, ordemColunas]);

  // Move `origem` para antes de `destino` (drag & drop de cabecalhos).
  const moverColuna = useCallback((origem: string, destino: string) => {
    if (origem === destino) return;
    setOrdemColunas((arr) => {
      const from = arr.indexOf(origem);
      if (from < 0) return arr;
      const novo = arr.slice();
      novo.splice(from, 1);
      const to = novo.indexOf(destino);
      if (to < 0) return arr;
      novo.splice(to, 0, origem);
      return novo;
    });
  }, []);

  const restaurarOrdem = useCallback(() => {
    setOrdemColunas(reconciliarOrdem(DEFAULT_ORDEM, [...CHAVES_FIXAS, ...(dados.colunas || [])]));
  }, [dados.colunas]);

  // ---- edicao inline ----
  const [editOpts, setEditOpts] = useState<string[]>([]);
  const abrirEdicao = useCallback(async (p: Produto, col: string) => {
    const atual = (p.caracteristicas && p.caracteristicas[col]) || '';
    setEditando({ empresa: p.empresa, cp: String(p.codigo_produto), col });
    setEditVal(atual);
    const cat = await ensureCatalogo();
    const empCat = cat.porEmpresa[p.empresa] || null;
    const permit = (empCat && empCat[col]) || cat.uniao[col] || [];
    setEditOpts(permit);
  }, [ensureCatalogo]);

  const salvarCelula = useCallback(async (empresa: string, cp: string, col: string, valor: string) => {
    const cellKey = `${empresa}:${cp}:${col}`;
    setEditando(null);
    setSalvandoCelula(cellKey);
    try {
      const r = await fetch('/api/ajustes/caracteristicas/produto', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ empresa, codigo_produto: cp, nome: col, conteudo: valor }),
      });
      const d = await r.json();
      if (d.erro) { setMsg('Erro ao gravar: ' + d.erro, 'erro'); return; }
      setDados((prev) => {
        const produtos = (prev.produtos || []).map((p) => {
          if (p.empresa === empresa && String(p.codigo_produto) === cp) {
            return { ...p, caracteristicas: { ...(p.caracteristicas || {}), [col]: d.conteudo } };
          }
          return p;
        });
        const colunas = (prev.colunas || []).includes(col) ? prev.colunas : [...(prev.colunas || []), col];
        return { ...prev, produtos, colunas };
      });
      setMsg(`Gravado: ${col} = "${d.conteudo}"`, 'ok');
    } catch (ex) {
      setMsg('Erro de rede: ' + (ex as Error).message, 'erro');
    } finally {
      setSalvandoCelula(null);
    }
  }, [setMsg]);

  const commitEdicao = useCallback((p: Produto) => {
    if (!editando) return;
    const atual = (p.caracteristicas && p.caracteristicas[editando.col]) || '';
    const { empresa, cp, col } = editando;
    if (editVal === atual) { setEditando(null); return; }
    salvarCelula(empresa, cp, col, editVal);
  }, [editando, editVal, salvarCelula]);

  // ---- CSV ----
  const exportarCSV = useCallback(() => {
    const cols = ordemColunas.length ? ordemColunas : todasChaves;
    const cell = (v: string) => /[",;\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    const rows = [cols.map((c) => cell(labelCol(c))).join(';')];
    linhas.forEach((p) => rows.push(cols.map((c) => cell(valCol(p, c))).join(';')));
    const blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'caracteristicas-produtos.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, [ordemColunas, todasChaves, linhas, valCol]);

  // ---- PDF (colunas-chave, respeita filtros e ordenacao atuais) ----
  const gerandoPdfRef = useRef(false);
  const gerarPDF = useCallback(async () => {
    if (gerandoPdfRef.current) return;
    gerandoPdfRef.current = true;
    try {
      const { default: JsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      // Todas as colunas da tela, na ordem escolhida pelo usuario.
      const cols: { key: string; label: string }[] = (ordemColunas.length ? ordemColunas : todasChaves).map((c) => ({ key: c, label: labelCol(c) }));
      const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      doc.setFontSize(14); doc.setTextColor(220, 38, 38); doc.setFont('helvetica', 'bold');
      doc.text('Nova Tratores — Caracteristicas por produto', 14, 16);
      doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(110);
      const resumoFiltros: string[] = [];
      if (empFiltro) resumoFiltros.push(`Empresa: ${empFiltro}`);
      if (filtro.trim()) resumoFiltros.push(`Busca: "${filtro.trim()}"`);
      Object.entries(filtros).forEach(([k, v]) => { if (v && v.trim()) resumoFiltros.push(`${k}: "${v.trim()}"`); });
      const info = [
        `${linhas.length} produto(s)` + (resumoFiltros.length ? ` · filtros: ${resumoFiltros.join(' · ')}` : ' · sem filtros'),
        `Gerado em ${new Date().toLocaleString('pt-BR')}`,
      ];
      info.forEach((t, i) => doc.text(t, 14, 23 + i * 4));
      // Descricao = 'auto' absorve o restante e quebra linha; as demais recebem
      // larguras calculadas p/ o somatorio caber na largura util (A4 paisagem ~281mm
      // com 8mm de margem), independentemente de quantas caracteristicas existam.
      const usavel = doc.internal.pageSize.getWidth() - 16; // margens 8 + 8
      const fixaChave: Record<string, number> = { empresa: 16, codigo: 24, qtd_estoque: 18, modelo: 26, marca: 30 };
      const reservaChave = Object.values(fixaChave).reduce((a, b) => a + b, 0);
      const dinamicas = cols.filter((c) => c.key !== 'descricao' && fixaChave[c.key] == null);
      const descMin = 40; // largura minima reservada p/ a Descricao
      const espacoDin = Math.max(0, usavel - reservaChave - descMin);
      const larguraDin = dinamicas.length ? Math.max(8, Math.min(22, espacoDin / dinamicas.length)) : 0;
      const columnStyles: Record<number, { cellWidth: number | 'auto' }> = {};
      cols.forEach((c, i) => {
        if (c.key === 'descricao') columnStyles[i] = { cellWidth: 'auto' };
        else if (fixaChave[c.key] != null) columnStyles[i] = { cellWidth: fixaChave[c.key] };
        else columnStyles[i] = { cellWidth: larguraDin };
      });
      const fonte = cols.length > 10 ? 6 : 7; // encolhe quando ha muitas colunas
      autoTable(doc, {
        startY: 23 + info.length * 4 + 2,
        head: [cols.map((c) => c.label)],
        body: linhas.map((p) => cols.map((c) => valCol(p, c.key) || '-')),
        styles: { fontSize: fonte, cellPadding: 1.5, overflow: 'linebreak' },
        headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105], fontStyle: 'bold' },
        columnStyles,
        theme: 'grid',
        margin: { left: 8, right: 8 },
      });
      // rodape "Pagina X de Y" (mesmo padrao de src/lib/abastecimento/pdf.ts)
      const totalPag = doc.getNumberOfPages();
      for (let i = 1; i <= totalPag; i++) {
        doc.setPage(i);
        doc.setFontSize(8); doc.setTextColor(150);
        doc.text(`Pagina ${i} de ${totalPag}`, doc.internal.pageSize.getWidth() - 14, doc.internal.pageSize.getHeight() - 6, { align: 'right' });
      }
      doc.save('caracteristicas-produtos.pdf');
    } catch (ex) {
      setMsg('Erro ao gerar PDF: ' + (ex as Error).message, 'erro');
    } finally {
      gerandoPdfRef.current = false;
    }
  }, [ordemColunas, todasChaves, linhas, valCol, empFiltro, filtro, filtros, setMsg]);

  // ---- sugestoes de tipo ----
  const abrirSugestoes = useCallback(async () => {
    setMsg('buscando sugestoes...', 'info');
    try {
      const r = await fetch('/api/ajustes/caracteristicas/sugestoes-tipo');
      const d = (await r.json()) as SugestoesPayload;
      if (d.erro) { setMsg('Erro: ' + d.erro, 'erro'); return; }
      setMsg('', 'info');
      if (d.aviso && (!d.itens || !d.itens.length)) { setMsg(d.aviso, 'info'); return; }
      if (!d.itens || !d.itens.length) { setMsg(`Nenhum produto com "${d.colTipo || 'Tipo:'}" vazio que case com a descricao.`, 'ok'); return; }
      setSugestoes(d);
    } catch (ex) {
      setMsg('Erro de rede: ' + (ex as Error).message, 'erro');
    }
  }, [setMsg]);

  if (!permLoading && userProfile && !pode('ajustes', 'caracteristicas')) return <SemPermissao />;

  const colsRender = ordemColunas.length ? ordemColunas : todasChaves;
  const totalProdutos = (dados.produtos || []).length;
  const statusColor = statusTipo === 'erro' ? '#dc2626' : statusTipo === 'ok' ? '#047857' : '#64748b';

  return (
    <div style={{ maxWidth: 1500, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Caracteristicas por produto</h1>
        <p style={{ color: '#64748b', fontSize: '.82rem', maxWidth: 900 }}>
          Matriz das <b>duas empresas</b> (NOVA + CASTRO): cada caracteristica da Omie vira uma coluna. Todas as <b>peças ativas</b> (inclusive as sem nenhuma caracteristica, para o &quot;Sugerir Tipo:&quot; alcancar todas). <b>Clique numa celula</b> para editar (grava na Omie). Os dados vem da ultima <b>sincronizacao</b>.
        </p>
      </div>

      <div style={{ margin: '6px 0 14px', display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '.8rem' }}>
        <Link href="/ajustes" style={{ color: '#dc2626', textDecoration: 'none', fontWeight: 600 }}>← Ajustes</Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label style={{ display: 'block', fontSize: '.65rem', color: '#64748b', marginBottom: 2 }}>Filtrar (codigo, descricao ou empresa)</label>
          <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="ex: POLIA, RP-0060, CASTRO..." style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.82rem' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '.65rem', color: '#64748b', marginBottom: 2 }}>Empresa</label>
          <select value={empFiltro} onChange={(e) => setEmpFiltro(e.target.value)} style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.82rem', background: '#fff' }}>
            <option value="">Todas</option>
            {empresas.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <button onClick={abrirSugestoes} disabled={rodando} style={{ padding: '7px 14px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: 'pointer', opacity: rodando ? 0.5 : 1 }} title="Sugere o Tipo: para produtos com o campo vazio">Sugerir Tipo:</button>
        <button onClick={exportarCSV} style={{ padding: '7px 14px', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: 'pointer' }}>Exportar CSV</button>
        <button onClick={gerarPDF} title="Gera um PDF (A4 paisagem) com todas as colunas da tela, respeitando os filtros e a ordenacao" style={{ padding: '7px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: 'pointer' }}>Gerar PDF</button>
        <button onClick={sincronizar} disabled={rodando} style={{ padding: '7px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: rodando ? 'wait' : 'pointer', opacity: rodando ? 0.5 : 1 }}>{rodando ? 'Sincronizando…' : 'Sincronizar agora'}</button>
        <button onClick={restaurarOrdem} title="Volta as colunas para a ordem padrao" style={{ padding: '7px 14px', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: 'pointer' }}>Restaurar ordem</button>
      </div>

      <div style={{ marginBottom: 8, fontSize: '.72rem', color: '#94a3b8' }}>
        Arraste o <b>⠿</b> no cabecalho para reordenar colunas (salvo neste navegador). Clique no titulo para ordenar; <b>Shift+clique</b> adiciona um 2o criterio (desempate).
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: '.75rem' }}>
        <span style={{ color: statusColor }}>{rodando && status ? `⏳ ${status}` : status}</span>
        <span style={{ marginLeft: 'auto', color: '#64748b' }}>
          Ultima sincronizacao: <b>{fmtDataHora(dados.ultimaSync)}</b>
          {totalProdutos > 0 && <> · {linhas.length} de {totalProdutos} produto(s)</>}
        </span>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'auto', maxHeight: '72vh' }}>
        {totalProdutos === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
            {rodando ? 'Sincronizando com a Omie…' : <>Nenhum dado ainda. Clique em <b>Sincronizar agora</b> para varrer a Omie.</>}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {colsRender.map((k) => {
                  const si = sortInfo(k);
                  return (
                    <th key={k} draggable
                      onDragStart={(e) => { setDragCol(k); e.dataTransfer.setData('text/plain', k); e.dataTransfer.effectAllowed = 'move'; }}
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                      onDrop={(e) => { e.preventDefault(); const origem = e.dataTransfer.getData('text/plain') || dragCol; if (origem) moverColuna(origem, k); setDragCol(null); }}
                      onDragEnd={() => setDragCol(null)}
                      style={{ ...thStyle, cursor: 'default', background: dragCol === k ? '#e0f2fe' : thStyle.background }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span title="Arraste para reordenar" onClick={(e) => e.stopPropagation()} style={{ cursor: 'grab', color: '#94a3b8' }}>⠿</span>
                        <span onClick={(e) => ordenarPor(k, e.shiftKey)} title="Clique = ordenar · Shift+clique = 2o criterio" style={{ cursor: 'pointer' }}>
                          {labelCol(k)}{si ? (si.dir > 0 ? ' ▲' : ' ▼') : ''}
                          {si && sorts.length > 1 && <sup style={{ fontSize: '.6rem', color: '#2563eb' }}>{si.pos + 1}</sup>}
                        </span>
                      </span>
                    </th>
                  );
                })}
              </tr>
              <tr>
                {colsRender.map((k) => (
                  <th key={k} style={thFiltroStyle}>
                    <input value={filtros[k] || ''} onChange={(e) => setFiltros((f) => ({ ...f, [k]: e.target.value }))}
                      placeholder="filtrar…" style={filtroInput} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.length === 0 ? (
                <tr><td colSpan={colsRender.length} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8', padding: 30 }}>Nenhum produto bate com o filtro.</td></tr>
              ) : linhas.map((p) => (
                <tr key={`${p.empresa}:${p.codigo_produto}`} style={{ borderTop: '1px solid #f1f5f9' }}>
                  {colsRender.map((col) => {
                    if (col === 'empresa') return <td key={col} style={tdStyle}><EmpBadge empresa={p.empresa} /></td>;
                    if (col === 'codigo') return <td key={col} style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '.72rem' }}>{p.codigo || '-'}</td>;
                    if (col === 'descricao') return <td key={col} style={tdStyle}>{p.descricao || '-'}</td>;
                    if (col === 'qtd_estoque') return <td key={col} style={{ ...tdStyle, textAlign: 'right', fontWeight: 500, color: (p.estoque ?? 0) < 0 ? '#dc2626' : (p.estoque ? '#334155' : '#cbd5e1') }}>{p.estoque != null ? p.estoque : '-'}</td>;
                    if (col === 'modelo') return <td key={col} style={{ ...tdStyle, color: p.modelo ? '#334155' : '#cbd5e1' }}>{p.modelo || '-'}</td>;
                    if (col === 'marca') return <td key={col} style={{ ...tdStyle, color: p.marca ? '#334155' : '#cbd5e1' }}>{p.marca || '-'}</td>;
                    // caracteristica (editavel)
                    const cellKey = `${p.empresa}:${p.codigo_produto}:${col}`;
                    const v = (p.caracteristicas || {})[col] || '';
                    const emEdicao = editando && editando.empresa === p.empresa && editando.cp === String(p.codigo_produto) && editando.col === col;
                    if (salvandoCelula === cellKey) return <td key={col} style={{ ...tdStyle, color: '#94a3b8' }}>gravando…</td>;
                    if (emEdicao) {
                      return (
                        <td key={col} style={tdStyle}>
                          {editOpts.length ? (
                            <select autoFocus value={editVal} onChange={(e) => setEditVal(e.target.value)} onBlur={() => commitEdicao(p)}
                              onKeyDown={(e) => { if (e.key === 'Enter') commitEdicao(p); else if (e.key === 'Escape') setEditando(null); }}
                              style={{ width: '100%', border: '1px solid #60a5fa', borderRadius: 4, padding: '2px 4px', fontSize: '.78rem' }}>
                              <option value="" />
                              {editOpts.map((o) => <option key={o} value={o}>{o}</option>)}
                              {editVal && !editOpts.includes(editVal) && <option value={editVal}>{editVal} (atual)</option>}
                            </select>
                          ) : (
                            <input autoFocus value={editVal} onChange={(e) => setEditVal(e.target.value)} onBlur={() => commitEdicao(p)}
                              onKeyDown={(e) => { if (e.key === 'Enter') commitEdicao(p); else if (e.key === 'Escape') setEditando(null); }}
                              style={{ width: '100%', border: '1px solid #60a5fa', borderRadius: 4, padding: '2px 4px', fontSize: '.78rem' }} />
                          )}
                        </td>
                      );
                    }
                    return (
                      <td key={col} onClick={() => abrirEdicao(p, col)} title="Clique para editar"
                        style={{ ...tdStyle, cursor: 'pointer', color: v ? '#334155' : '#cbd5e1' }}>{v || '-'}</td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {sugestoes && (
        <ModalSugestoes d={sugestoes} onClose={() => setSugestoes(null)} onAplicado={(msg) => { setSugestoes(null); setMsg(msg, 'ok'); carregar(); }} />
      )}
    </div>
  );
}

// ---------- modal de sugestoes de tipo ----------
interface LinhaSug { item: SugestaoItem; valor: string; marcado: boolean; multi: boolean }

function ModalSugestoes({ d, onClose, onAplicado }: { d: SugestoesPayload; onClose: () => void; onAplicado: (msg: string) => void }) {
  const valores = d.valores || [];
  const colTipo = d.colTipo || 'Tipo:';
  const init: LinhaSug[] = (d.itens || []).map((it) => {
    const cand = it.candidatos || [];
    const multi = cand.length > 1;
    const unico = cand.length === 1;
    const sel = it.sugestao || (unico ? cand[0] : '');
    return { item: it, valor: sel, marcado: !!sel, multi };
  });
  const [linhas, setLinhas] = useState<LinhaSug[]>(init);
  const [prog, setProg] = useState('');
  const [aplicando, setAplicando] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const nMulti = init.filter((l) => l.multi).length;

  const setValor = (i: number, v: string) => setLinhas((s) => s.map((l, idx) => idx === i ? { ...l, valor: v, marcado: !!v } : l));
  const setMarcado = (i: number, m: boolean) => setLinhas((s) => s.map((l, idx) => idx === i ? { ...l, marcado: m } : l));
  const marcarTodas = (on: boolean) => setLinhas((s) => s.map((l) => ({ ...l, marcado: on && !!l.valor })));

  const aplicar = useCallback(async () => {
    const itens = linhas.filter((l) => l.marcado && l.valor).map((l) => ({ empresa: l.item.empresa, codigo_produto: l.item.codigo_produto, valor: l.valor }));
    if (!itens.length) { setProg('Marque ao menos um item com valor.'); return; }
    if (!confirm(`Aplicar "${colTipo}" em ${itens.length} produto(s) na Omie?\n\nSe a Omie bloquear no meio, o sistema espera e retoma sozinho — deixe esta janela aberta ate o fim.`)) return;
    setAplicando(true);
    const CHUNK = 20, total = itens.length;
    const MAX_ESPERAS_SEGUIDAS = 8; // desiste se a Omie bloquear varias vezes sem nenhum progresso
    let aplicados = 0, falhas = 0, abortado = false, primeiraFalha = '', esperasSeguidas = 0;
    let fila = itens.slice();
    while (fila.length && !abortado) {
      const lote = fila.slice(0, CHUNK);
      setProg(`aplicando na Omie... ${aplicados}/${total} feitos, ${fila.length} na fila`);
      try {
        const r = await fetch('/api/ajustes/caracteristicas/aplicar-tipo', {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
          body: JSON.stringify({ nome: colTipo, itens: lote }),
        });
        const res = await r.json();
        if (res.erro) { primeiraFalha = res.erro; abortado = true; break; }
        aplicados += res.aplicados || 0;
        (res.resultados || []).filter((x: { ok?: boolean }) => !x.ok).forEach((x: { erro?: string }) => { falhas++; if (!primeiraFalha) primeiraFalha = x.erro || ''; });
        // itens que o servidor nao chegou a aplicar (bloqueio da Omie) voltam pro inicio da fila
        fila = [...(res.pendentes || []), ...fila.slice(lote.length)];
        if (res.bloqueado) {
          if ((res.aplicados || 0) > 0) esperasSeguidas = 0;
          esperasSeguidas++;
          if (esperasSeguidas > MAX_ESPERAS_SEGUIDAS) { primeiraFalha = 'Omie continua bloqueada apos varias esperas'; abortado = true; break; }
          const seg = Math.min(Math.max(Number(res.aguardarSegundos) || 60, 15), 300);
          for (let s = seg; s > 0; s--) {
            setProg(`Omie bloqueou temporariamente — retomando em ${s}s (${aplicados}/${total} feitos, ${fila.length} na fila; nao feche)`);
            await new Promise((ok) => setTimeout(ok, 1000));
          }
        } else {
          esperasSeguidas = 0;
        }
      } catch (ex) {
        primeiraFalha = 'rede: ' + (ex as Error).message; abortado = true; break;
      }
    }
    let msg = `Aplicados ${aplicados}/${total}`;
    if (abortado) msg += ` · interrompido${primeiraFalha ? ' (' + primeiraFalha.slice(0, 120) + ')' : ''} — clique em "Sugerir Tipo:" para retomar o restante`;
    if (falhas) msg += ` · ${falhas} falha(s)${primeiraFalha && !abortado ? ': ' + primeiraFalha.slice(0, 120) : ''}`;
    onAplicado(msg);
  }, [linhas, colTipo, onAplicado]);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 10, width: '100%', maxWidth: 820, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,.25)' }}>
        <div style={{ borderBottom: '1px solid #e2e8f0', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontWeight: 600, color: '#1e293b', fontSize: '.95rem', margin: 0 }}>Sugerir &quot;{colTipo}&quot;</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', lineHeight: 1, color: '#64748b', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: '8px 18px', fontSize: '.72rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span><b>{linhas.length}</b> produto(s) com o campo vazio cuja descricao casa com um valor possivel.{nMulti ? <> <b style={{ color: '#b45309' }}>{nMulti}</b> tem mais de uma opcao (em amarelo) — escolha uma.</> : null}</span>
          <button onClick={() => marcarTodas(true)} style={{ marginLeft: 'auto', fontSize: '.72rem', padding: '3px 8px', background: '#f1f5f9', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Marcar todas</button>
          <button onClick={() => marcarTodas(false)} style={{ fontSize: '.72rem', padding: '3px 8px', background: '#f1f5f9', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Desmarcar</button>
        </div>
        <div style={{ padding: '0 18px', overflowY: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8rem' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#f1f5f9' }}>
              <tr>
                <th style={{ ...thStyle, position: 'static' }} />
                <th style={{ ...thStyle, position: 'static' }}>Codigo</th>
                <th style={{ ...thStyle, position: 'static' }}>Empresa</th>
                <th style={{ ...thStyle, position: 'static' }}>Descricao</th>
                <th style={{ ...thStyle, position: 'static' }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => {
                const op = (l.item.candidatos && l.item.candidatos.length ? l.item.candidatos : valores);
                return (
                  <tr key={`${l.item.empresa}:${l.item.codigo_produto}`} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ ...tdStyle, textAlign: 'center' }}><input type="checkbox" checked={l.marcado} onChange={(e) => setMarcado(i, e.target.checked)} /></td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '.72rem', whiteSpace: 'nowrap' }}>{l.item.codigo || ''}</td>
                    <td style={tdStyle}><EmpBadge empresa={l.item.empresa} /></td>
                    <td style={{ ...tdStyle, fontSize: '.74rem' }}>{l.item.descricao || ''}</td>
                    <td style={tdStyle}>
                      <select value={l.valor} onChange={(e) => setValor(i, e.target.value)}
                        style={{ width: '100%', border: '1px solid ' + (l.multi ? '#fbbf24' : '#cbd5e1'), background: l.multi ? '#fffbeb' : '#fff', borderRadius: 4, padding: '2px 4px', fontSize: '.78rem' }}>
                        <option value="">{l.multi ? '— escolha —' : ''}</option>
                        {op.map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ borderTop: '1px solid #e2e8f0', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '.72rem', color: '#475569', marginRight: 'auto' }}>{prog}</span>
          <button onClick={onClose} disabled={aplicando} style={{ padding: '6px 12px', fontSize: '.82rem', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={aplicar} disabled={aplicando} style={{ padding: '6px 12px', fontSize: '.82rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', opacity: aplicando ? 0.5 : 1 }}>Aplicar selecionados</button>
        </div>
      </div>
    </div>
  );
}
