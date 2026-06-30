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

// ---------- tipos ----------
interface Produto {
  empresa: string; codigo_produto: number | string; codigo?: string; descricao?: string;
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
  const [status, setStatus] = useState('');
  const [statusTipo, setStatusTipo] = useState<'ok' | 'erro' | 'info'>('info');
  const [rodando, setRodando] = useState(false);
  const [sort, setSort] = useState<{ key: string | null; dir: number }>({ key: null, dir: 1 });

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
    if (sort.key) {
      const key = sort.key;
      arr = arr.slice().sort((a, b) => valCol(a, key).localeCompare(valCol(b, key), 'pt-BR', { numeric: true, sensitivity: 'base' }) * sort.dir);
    }
    return arr;
  }, [dados.produtos, filtro, empFiltro, sort, valCol]);

  const ordenarPor = useCallback((key: string) => {
    setSort((s) => s.key === key ? { key, dir: -s.dir } : { key, dir: 1 });
  }, []);

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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
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
    const cols = ['empresa', 'codigo', 'descricao', ...(dados.colunas || [])];
    const labels = ['Empresa', 'Codigo', 'Descricao', ...(dados.colunas || [])];
    const cell = (v: string) => /[",;\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    const rows = [labels.map(cell).join(';')];
    linhas.forEach((p) => rows.push(cols.map((c) => cell(valCol(p, c))).join(';')));
    const blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'caracteristicas-produtos.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, [dados.colunas, linhas, valCol]);

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

  const colunas = dados.colunas || [];
  const totalProdutos = (dados.produtos || []).length;
  const statusColor = statusTipo === 'erro' ? '#dc2626' : statusTipo === 'ok' ? '#047857' : '#64748b';

  return (
    <div style={{ maxWidth: 1500, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Caracteristicas por produto</h1>
        <p style={{ color: '#64748b', fontSize: '.82rem', maxWidth: 900 }}>
          Matriz das <b>duas empresas</b> (NOVA + CASTRO): cada caracteristica da Omie vira uma coluna. So produtos ativos com pelo menos uma caracteristica. <b>Clique numa celula</b> para editar (grava na Omie). Os dados vem da ultima <b>sincronizacao</b>.
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
        <button onClick={sincronizar} disabled={rodando} style={{ padding: '7px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: rodando ? 'wait' : 'pointer', opacity: rodando ? 0.5 : 1 }}>{rodando ? 'Sincronizando…' : 'Sincronizar agora'}</button>
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
                {([['empresa', 'Empresa'], ['codigo', 'Codigo'], ['descricao', 'Descricao']] as [string, string][]).map(([k, lbl]) => (
                  <th key={k} onClick={() => ordenarPor(k)} style={thStyle}>{lbl}{sort.key === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>
                ))}
                {colunas.map((c) => (
                  <th key={c} onClick={() => ordenarPor(c)} style={thStyle}>{c}{sort.key === c ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.length === 0 ? (
                <tr><td colSpan={3 + colunas.length} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8', padding: 30 }}>Nenhum produto bate com o filtro.</td></tr>
              ) : linhas.map((p) => (
                <tr key={`${p.empresa}:${p.codigo_produto}`} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={tdStyle}><EmpBadge empresa={p.empresa} /></td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '.72rem' }}>{p.codigo || '-'}</td>
                  <td style={tdStyle}>{p.descricao || '-'}</td>
                  {colunas.map((col) => {
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
    if (!confirm(`Aplicar "${colTipo}" em ${itens.length} produto(s) na Omie?`)) return;
    setAplicando(true);
    const CHUNK = 20, total = itens.length;
    let aplicados = 0, falhas = 0, bloqueado = false, primeiraFalha = '';
    for (let i = 0; i < total && !bloqueado; i += CHUNK) {
      const lote = itens.slice(i, i + CHUNK);
      setProg(`aplicando ${Math.min(i + lote.length, total)}/${total} na Omie...`);
      try {
        const r = await fetch('/api/ajustes/caracteristicas/aplicar-tipo', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome: colTipo, itens: lote }),
        });
        const res = await r.json();
        if (res.erro) { primeiraFalha = res.erro; bloqueado = true; break; }
        aplicados += res.aplicados || 0;
        (res.resultados || []).filter((x: { ok?: boolean }) => !x.ok).forEach((x: { erro?: string }) => { falhas++; if (!primeiraFalha) primeiraFalha = x.erro || ''; });
        if (res.bloqueado) bloqueado = true;
      } catch (ex) {
        primeiraFalha = 'rede: ' + (ex as Error).message; bloqueado = true; break;
      }
    }
    let msg = `Aplicados ${aplicados}/${total}`;
    if (bloqueado) msg += ' · interrompido (Omie bloqueou / erro) — tente o restante em instantes';
    if (falhas) msg += ` · ${falhas} falha(s)${primeiraFalha ? ': ' + primeiraFalha.slice(0, 120) : ''}`;
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
