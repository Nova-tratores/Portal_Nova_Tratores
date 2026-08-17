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
import { Settings, Flag, AlertTriangle, Pencil, Layers, CheckCircle } from 'lucide-react';

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
// `sinalizacao` = pseudo-coluna só-leitura: mostra ⚠ se o produto tem alguma célula sinalizada.
const COLS_FIXAS: Record<string, string> = {
  empresa: 'Empresa', codigo: 'Codigo', sinalizacao: 'Status', descricao: 'Descricao', qtd_estoque: 'Qtd Estoque', modelo: 'Modelo', marca: 'Marca',
};
const CHAVES_FIXAS = Object.keys(COLS_FIXAS);
function ehFixa(key: string): boolean { return key in COLS_FIXAS; }
function labelCol(key: string): string { return COLS_FIXAS[key] || key; }
// Ordem padrão pedida pelo usuário. As características casam com dados.colunas de forma
// case-insensitive (a Omie pode gravar #PRATELEIRA etc.); ver reconciliarOrdem.
const DEFAULT_ORDEM = ['empresa', 'codigo', 'sinalizacao', 'descricao', 'qtd_estoque', '#Prateleira', '#Andar', '#Andar2', '#Caixa', 'Sistema', 'Tipo:', 'marca', 'modelo'];
const ORDEM_KEY = (uid: string) => `carac-ordem-colunas-${uid}`;
const OCULTAS_KEY = (uid: string) => `carac-colunas-ocultas-${uid}`;
// Teto de linhas RENDERIZADAS na tabela (perf, sobretudo no tablet): a base tem ~9,6k
// pecas; renderizar tudo × ~13 colunas trava. CSV/PDF/Conferir continuam usando a lista
// completa (`linhas`); só a tabela mostra as primeiras N. Refina-se pelo filtro.
const MAX_LINHAS_RENDER = 500;
// chave da preferencia no Supabase (portal_ui_prefs): guarda { ordem, ocultas }
const CHAVE_PREF_COLUNAS = 'caracteristicas-colunas';

function normKey(s: string): string { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase(); }

// Filtro por coluna (caixinha do cabecalho): se o termo for puramente numerico
// (ex.: prateleira "3", caixa "01"), exige valor IDENTICO — assim "3" nao casa com
// "13"/"23". Para texto (ex.: "ROLAM"), mantem "contem" (substring), util em
// descricao/codigo/modelo. Ambos ignoram maiusculas/minusculas e espacos nas pontas.
function casaFiltroColuna(valorCelula: string, termo: string): boolean {
  const cel = valorCelula.trim().toLowerCase();
  const f = termo.trim().toLowerCase();
  if (f === '') return true;
  if (/^\d+$/.test(f)) return cel === f; // numero = exato
  return cel.includes(f);                // texto = contem
}

// Detecta telas touch/sem-hover (tablet) para mostrar a bandeira de sinalizar SEMPRE
// (no touch nao ha hover). Nao havia helper de touch no projeto — este e do zero.
function useIsTouch(): boolean {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(hover: none) and (pointer: coarse)');
    const upd = () => setTouch(mq.matches);
    upd();
    mq.addEventListener?.('change', upd);
    return () => mq.removeEventListener?.('change', upd);
  }, []);
  return touch;
}
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

// Modal "Seletor de Colunas" (estilo Omie): ocultar/mostrar e arrastar a ordem.
// Trabalha num RASCUNHO local — so aplica ao clicar "Aplicar"; "Cancelar" descarta.
function SeletorColunas({ ordem, ocultas, onAplicar, onCancelar }: {
  ordem: string[]; ocultas: string[];
  onAplicar: (ordem: string[], ocultas: string[]) => void; onCancelar: () => void;
}) {
  const [draftOrdem, setDraftOrdem] = useState<string[]>(ordem);
  const [draftOcultas, setDraftOcultas] = useState<Set<string>>(new Set(ocultas));
  const [drag, setDrag] = useState<string | null>(null);
  const isTouch = useIsTouch(); // no touch: sem drag (rouba a rolagem) — usar ▲▼
  const visiveisCount = draftOrdem.filter((k) => !draftOcultas.has(k)).length;
  // reordena por 1 passo (alternativa ao arrastar, essencial no touch)
  const moverPasso = (k: string, dir: number) => setDraftOrdem((arr) => {
    const i = arr.indexOf(k); const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return arr;
    const novo = arr.slice(); [novo[i], novo[j]] = [novo[j], novo[i]]; return novo;
  });

  const toggle = (k: string) => setDraftOcultas((s) => {
    const n = new Set(s);
    if (n.has(k)) { n.delete(k); return n; }
    if (visiveisCount <= 1) return s; // nao deixa ocultar a ultima coluna visivel
    n.add(k); return n;
  });
  const mover = (origem: string, destino: string) => {
    if (origem === destino) return;
    setDraftOrdem((arr) => {
      const from = arr.indexOf(origem); if (from < 0) return arr;
      const novo = arr.slice(); novo.splice(from, 1);
      const to = novo.indexOf(destino); if (to < 0) return arr;
      novo.splice(to, 0, origem);
      // evita re-render se a ordem nao mudou (dragenter repetido no mesmo alvo)
      return novo.length === arr.length && novo.every((x, i) => x === arr[i]) ? arr : novo;
    });
  };

  return (
    <div onClick={onCancelar} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 8, width: 400, maxWidth: '94vw', maxHeight: '82vh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 44px rgba(0,0,0,.28)' }}>
        <div style={{ background: '#94a3b8', color: '#fff', padding: '8px 14px', borderRadius: '8px 8px 0 0', fontWeight: 600, fontSize: '.85rem' }}>Seletor de Colunas</div>
        <div style={{ padding: '4px 14px 8px', fontSize: '.7rem', color: '#94a3b8' }}>{isTouch ? <>Use <b>▲▼</b> para reordenar.</> : <>Arraste o <b>⠿</b> para reordenar.</>} Toque em <b>Ocultar/Mostrar</b> para ligar/desligar a coluna. Role a lista para ver todas.</div>
        <div style={{ overflow: 'auto', WebkitOverflowScrolling: 'touch', padding: '2px 0', flex: 1 }}>
          {draftOrdem.map((k, i) => {
            const oculta = draftOcultas.has(k);
            return (
              <div key={k} draggable={!isTouch}
                onDragStart={isTouch ? undefined : (e) => { setDrag(k); e.dataTransfer.effectAllowed = 'move'; }}
                onDragEnter={isTouch ? undefined : () => { if (drag && drag !== k) mover(drag, k); }}
                onDragOver={isTouch ? undefined : (e) => e.preventDefault()}
                onDrop={isTouch ? undefined : (e) => e.preventDefault()}
                onDragEnd={isTouch ? undefined : () => setDrag(null)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', borderBottom: '1px solid #f1f5f9', background: drag === k ? '#e0f2fe' : '#fff', cursor: isTouch ? 'default' : 'grab' }}>
                {isTouch ? (
                  <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 0.9 }}>
                    <button onClick={() => moverPasso(k, -1)} disabled={i === 0} title="Subir" style={{ background: 'none', border: 'none', color: i === 0 ? '#e2e8f0' : '#64748b', cursor: 'pointer', fontSize: '.9rem', padding: '0 2px' }}>▲</button>
                    <button onClick={() => moverPasso(k, 1)} disabled={i === draftOrdem.length - 1} title="Descer" style={{ background: 'none', border: 'none', color: i === draftOrdem.length - 1 ? '#e2e8f0' : '#64748b', cursor: 'pointer', fontSize: '.9rem', padding: '0 2px' }}>▼</button>
                  </span>
                ) : (
                  <span title="Arraste para reordenar" style={{ color: '#cbd5e1' }}>⠿</span>
                )}
                <button onClick={() => toggle(k)} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '.8rem', width: 62, textAlign: 'left', padding: 0 }}>
                  {oculta ? 'Mostrar' : 'Ocultar'}
                </button>
                <span style={{ fontSize: '.85rem', color: oculta ? '#94a3b8' : '#334155', textDecoration: oculta ? 'line-through' : 'none' }}>{labelCol(k)}</span>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '10px 14px', borderTop: '1px solid #e2e8f0' }}>
          <button onClick={() => onAplicar(draftOrdem, Array.from(draftOcultas))} style={{ padding: '6px 18px', background: '#e2e8f0', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '.82rem', cursor: 'pointer' }}>Aplicar</button>
          <button onClick={onCancelar} style={{ padding: '6px 18px', background: '#fff', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '.82rem', cursor: 'pointer' }}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

function EmpBadge({ empresa }: { empresa: string }) {
  const castro = empresa === 'CASTRO';
  return <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: '.68rem', background: castro ? '#f3e8ff' : '#e0f2fe', color: castro ? '#7e22ce' : '#0369a1' }}>{empresa}</span>;
}

// Engrenagem (F1): botao com menu de "Colunas" e "Restaurar ordem". Fecha ao clicar fora
// (overlay transparente). Nao ha Dropdown reutilizavel no projeto, entao e inline.
function MenuEngrenagem({ ocultasCount, onColunas, onRestaurar }: {
  ocultasCount: number; onColunas: () => void; onRestaurar: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const item: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '9px 14px', fontSize: '.82rem', color: '#334155', cursor: 'pointer', whiteSpace: 'nowrap' };
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setAberto((v) => !v)} title="Opcoes de colunas (mostrar/ocultar, reordenar, restaurar)"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: 'pointer' }}>
        <Settings size={16} />
        {ocultasCount > 0 && <span style={{ background: '#2563eb', color: '#fff', borderRadius: 8, fontSize: '.62rem', padding: '0 5px', lineHeight: '15px' }}>{ocultasCount}</span>}
      </button>
      {aberto && (
        <>
          <div onClick={() => setAberto(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 28px rgba(0,0,0,.18)', zIndex: 41, minWidth: 190, overflow: 'hidden' }}>
            <button style={item} onClick={() => { setAberto(false); onColunas(); }}>
              Colunas{ocultasCount ? ` (${ocultasCount} oculta${ocultasCount > 1 ? 's' : ''})` : ''}…
            </button>
            <button style={{ ...item, borderTop: '1px solid #f1f5f9' }} onClick={() => { setAberto(false); onRestaurar(); }}>
              Restaurar ordem
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Controle "Ordenar por" (F2): edita o MESMO estado `sorts` usado pelo clique no cabecalho,
// entao os dois ficam em sincronia. Ate 2 niveis (principal + desempate).
function ControleOrdenacao({ cols, sorts, setSorts }: {
  cols: { key: string; label: string }[];
  sorts: { key: string; dir: number }[];
  setSorts: React.Dispatch<React.SetStateAction<{ key: string; dir: number }[]>>;
}) {
  const p = sorts[0]; const s = sorts[1];
  const sel: React.CSSProperties = { border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.82rem', background: '#fff' };
  const setPrincipal = (key: string) => setSorts((arr) => {
    if (!key) return [];
    const dir = arr[0]?.key === key ? arr[0].dir : 1;
    const sec = arr[1];
    return sec && sec.key !== key ? [{ key, dir }, sec] : [{ key, dir }];
  });
  const setDirP = (dir: number) => setSorts((arr) => (arr.length ? [{ ...arr[0], dir }, ...arr.slice(1)] : arr));
  const setSecundario = (key: string) => setSorts((arr) => {
    if (!arr.length) return arr;
    if (!key) return arr.slice(0, 1);
    const dir = arr[1]?.key === key ? arr[1].dir : 1;
    return [arr[0], { key, dir }];
  });
  const setDirS = (dir: number) => setSorts((arr) => (arr.length > 1 ? [arr[0], { ...arr[1], dir }] : arr));
  return (
    <div>
      <label style={{ display: 'block', fontSize: '.65rem', color: '#64748b', marginBottom: 2 }}>Ordenar por</label>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={p?.key || ''} onChange={(e) => setPrincipal(e.target.value)} style={sel} title="Coluna principal de ordenacao">
          <option value="">— nenhuma —</option>
          {cols.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <select value={p ? String(p.dir) : '1'} onChange={(e) => setDirP(Number(e.target.value))} disabled={!p} style={{ ...sel, opacity: p ? 1 : 0.5 }}>
          <option value="1">Crescente</option>
          <option value="-1">Decrescente</option>
        </select>
        {p && (
          <>
            <span style={{ fontSize: '.72rem', color: '#94a3b8' }}>desempate:</span>
            <select value={s?.key || ''} onChange={(e) => setSecundario(e.target.value)} style={sel} title="2o criterio (desempate)">
              <option value="">— nenhum —</option>
              {cols.filter((c) => c.key !== p.key).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <select value={s ? String(s.dir) : '1'} onChange={(e) => setDirS(Number(e.target.value))} disabled={!s} style={{ ...sel, opacity: s ? 1 : 0.5 }}>
              <option value="1">Crescente</option>
              <option value="-1">Decrescente</option>
            </select>
          </>
        )}
      </div>
    </div>
  );
}

// Modo "Conferir" (flashcard, touch-first): percorre o DECK (conjunto filtrado) um produto por vez.
// Em cada card da p/ Sinalizar (⚠) ou Corrigir (✎) cada caracteristica visivel; "Confere" so avanca.
// Congela a ORDEM dos produtos ao abrir (nao remexe se um flag/edicao mudar a ordenacao), mas le os
// DADOS frescos do deck (map por chave). Reusa toggle/salvar/valCol/ensureCatalogo do pai.
function ModalFlashcard({ deck, colsCarac, valCol, sinalizadas, okProdutos, onToggleSinal, onConfere, ensureCatalogo, onSalvar, onClose }: {
  deck: Produto[];
  colsCarac: string[];
  valCol: (p: Produto, col: string) => string;
  sinalizadas: Set<string>;
  okProdutos: Set<string>;
  onToggleSinal: (p: Produto, col: string) => void;
  onConfere: (p: Produto) => void;
  ensureCatalogo: () => Promise<{ uniao: Record<string, string[]>; porEmpresa: Record<string, Record<string, string[]>> }>;
  onSalvar: (empresa: string, cp: string, col: string, valor: string) => Promise<void>;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [edit, setEdit] = useState<{ col: string; valor: string; opts: string[] } | null>(null);
  const chaveDe = (p: Produto) => `${p.empresa}|${p.codigo_produto}`;
  const [ordem] = useState<string[]>(() => deck.map(chaveDe));           // ordem congelada
  const mapa = useMemo(() => { const m = new Map<string, Produto>(); deck.forEach((p) => m.set(chaveDe(p), p)); return m; }, [deck]); // dados frescos
  const total = ordem.length;
  const p = mapa.get(ordem[Math.min(idx, total - 1)]);

  const ir = useCallback((delta: number) => { setEdit(null); setIdx((i) => Math.max(0, Math.min(total - 1, i + delta))); }, [total]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') ir(1);
      else if (e.key === 'ArrowLeft') ir(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ir, onClose]);

  const abrirEdit = useCallback(async (prod: Produto, col: string) => {
    const atual = valCol(prod, col);
    const cat = await ensureCatalogo();
    const empCat = cat.porEmpresa[prod.empresa] || null;
    const opts = (empCat && empCat[col]) || cat.uniao[col] || [];
    setEdit({ col, valor: atual, opts });
  }, [valCol, ensureCatalogo]);
  const salvar = useCallback(async (prod: Produto) => {
    if (!edit) return;
    if (edit.valor !== valCol(prod, edit.col)) await onSalvar(prod.empresa, String(prod.codigo_produto), edit.col, edit.valor);
    setEdit(null);
  }, [edit, valCol, onSalvar]);

  const btn: React.CSSProperties = { padding: '12px 18px', borderRadius: 10, fontSize: '1rem', fontWeight: 600, border: 'none', cursor: 'pointer' };
  const naFrente = idx >= total - 1;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: 560, maxWidth: '96vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 16px 50px rgba(0,0,0,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid #e2e8f0' }}>
          <b style={{ fontSize: '.92rem', color: '#1e293b' }}>Conferir</b>
          <span style={{ fontSize: '.78rem', color: '#64748b' }}>{Math.min(idx + 1, total)} / {total}</span>
          <button onClick={onClose} title="Fechar (Esc)" style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: '1.5rem', color: '#94a3b8', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ overflow: 'auto', padding: '14px 16px', flex: 1 }}>
          {!p ? (
            <div style={{ color: '#94a3b8', fontSize: '.9rem', padding: '20px 0', textAlign: 'center' }}>Este item saiu do filtro atual. Use ‹ / › para continuar.</div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                <EmpBadge empresa={p.empresa} />
                <span style={{ fontFamily: 'monospace', fontSize: '.85rem', color: '#334155' }}>{p.codigo || '-'}</span>
                {okProdutos.has(`${p.empresa}:${p.codigo_produto}`) && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, background: '#dcfce7', color: '#16a34a', fontSize: '.72rem', fontWeight: 600 }}><CheckCircle size={13} /> conferido</span>
                )}
              </div>
              <div style={{ fontSize: '1.05rem', fontWeight: 600, color: '#1e293b', marginBottom: 12 }}>{p.descricao || '(sem descricao)'}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {colsCarac.map((col) => {
                  const val = valCol(p, col);
                  const sinal = sinalizadas.has(`${p.empresa}:${p.codigo_produto}:${col}`);
                  const emEdit = edit?.col === col;
                  return (
                    <div key={col} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: sinal ? '#ffedd5' : '#f8fafc', border: '1px solid #eef2f7' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '.66rem', textTransform: 'uppercase', letterSpacing: '.4px', color: '#94a3b8' }}>{labelCol(col)}</div>
                        {emEdit ? (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                            {edit.opts.length ? (
                              <select autoFocus value={edit.valor} onChange={(e) => setEdit({ ...edit, valor: e.target.value })} style={{ border: '1px solid #60a5fa', borderRadius: 6, padding: '6px 8px', fontSize: '.9rem' }}>
                                <option value="" />
                                {edit.opts.map((o) => <option key={o} value={o}>{o}</option>)}
                                {edit.valor && !edit.opts.includes(edit.valor) && <option value={edit.valor}>{edit.valor} (atual)</option>}
                              </select>
                            ) : (
                              <input autoFocus value={edit.valor} onChange={(e) => setEdit({ ...edit, valor: e.target.value })} style={{ border: '1px solid #60a5fa', borderRadius: 6, padding: '6px 8px', fontSize: '.9rem', minWidth: 140 }} />
                            )}
                            <button onClick={() => salvar(p)} style={{ ...btn, padding: '6px 12px', fontSize: '.82rem', background: '#059669', color: '#fff' }}>Salvar</button>
                            <button onClick={() => setEdit(null)} style={{ ...btn, padding: '6px 12px', fontSize: '.82rem', background: '#e2e8f0', color: '#334155' }}>Cancelar</button>
                          </div>
                        ) : (
                          <div style={{ fontSize: '1rem', color: val ? '#1e293b' : '#cbd5e1', marginTop: 2 }}>{val || '—'}</div>
                        )}
                      </div>
                      {!emEdit && (
                        <>
                          <button onClick={() => onToggleSinal(p, col)} title={sinal ? 'Remover sinalizacao' : 'Sinalizar (pendencia)'}
                            style={{ ...btn, padding: '10px 12px', background: sinal ? '#ea580c' : '#fff', color: sinal ? '#fff' : '#ea580c', border: `1px solid ${sinal ? '#ea580c' : '#fed7aa'}` }}>
                            <Flag size={16} style={{ verticalAlign: 'middle' }} />
                          </button>
                          <button onClick={() => abrirEdit(p, col)} title="Corrigir valor"
                            style={{ ...btn, padding: '10px 12px', background: '#fff', color: '#2563eb', border: '1px solid #bfdbfe' }}>
                            <Pencil size={16} style={{ verticalAlign: 'middle' }} />
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
                {colsCarac.length === 0 && <div style={{ color: '#94a3b8', fontSize: '.85rem' }}>Nenhuma caracteristica visivel. Ative colunas na engrenagem.</div>}
              </div>
            </>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderTop: '1px solid #e2e8f0' }}>
          <button onClick={() => ir(-1)} disabled={idx === 0} style={{ ...btn, padding: '12px 14px', background: '#e2e8f0', color: '#334155', opacity: idx === 0 ? 0.5 : 1 }}>‹</button>
          <button onClick={() => ir(1)} disabled={naFrente} style={{ ...btn, padding: '12px 14px', background: '#f1f5f9', color: '#64748b', opacity: naFrente ? 0.4 : 1 }}>Pular</button>
          <div style={{ flex: 1, textAlign: 'center', fontSize: '.8rem', color: '#64748b' }}>{Math.min(idx + 1, total)} de {total}</div>
          {naFrente
            ? <button onClick={() => { if (p) onConfere(p); onClose(); }} style={{ ...btn, background: '#16a34a', color: '#fff' }}>Confere e conclui ✓</button>
            : <button onClick={() => { if (p) onConfere(p); ir(1); }} style={{ ...btn, background: '#16a34a', color: '#fff' }}>Confere ✓ ›</button>}
        </div>
      </div>
    </div>
  );
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
  const [dragCol, setDragCol] = useState<string | null>(null);
  // colunas ocultas + modal "Seletor de Colunas"
  const [colunasOcultas, setColunasOcultas] = useState<string[]>([]);
  const [seletorAberto, setSeletorAberto] = useState(false);
  const [flashAberto, setFlashAberto] = useState(false); // modo "Conferir" (flashcard)
  const isTouch = useIsTouch();                          // tablet: bandeira sempre visivel
  // prefs de colunas (ordem + ocultas): carregadas do Supabase, com fallback localStorage.
  const prefsCarregadasRef = useRef(false);            // trava o loader async (roda 1x)
  const baseOrdemRef = useRef<string[] | null>(null);  // ordem-base carregada (pre-reconciliacao)
  const [prefsProntas, setPrefsProntas] = useState(false);
  const [dadosCarregado, setDadosCarregado] = useState(false); // dados (e colunas de caract.) ja chegaram

  // Sinalizacao (pendencia) COMPARTILHADA por celula. Chave: `${empresa}:${codigo_produto}:${coluna}`.
  const [sinalizadas, setSinalizadas] = useState<Set<string>>(new Set());
  const [sinalMeta, setSinalMeta] = useState<Record<string, { nome?: string; quando?: string }>>({});
  const [hoverCell, setHoverCell] = useState<string | null>(null);
  // Marca "OK / conferido" COMPARTILHADA por PRODUTO. Chave: `${empresa}:${codigo_produto}`.
  const [okProdutos, setOkProdutos] = useState<Set<string>>(new Set());
  const [okMeta, setOkMeta] = useState<Record<string, { nome?: string; quando?: string }>>({});

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
      setDadosCarregado(true); // libera a reconciliacao da ordem com o conjunto COMPLETO de colunas
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

  // Produtos com >=1 celula sinalizada (para pintar a linha e a coluna "Sinalizacao").
  // A chave de celula e `${emp}:${cp}:${col}`; o `col` pode conter ':' (ex.: "Tipo:"),
  // entao a chave de produto vai ate o 2o ':'.
  const produtosSinalizados = useMemo(() => {
    const s = new Set<string>();
    sinalizadas.forEach((k) => {
      const a = k.indexOf(':'); const b = k.indexOf(':', a + 1);
      s.add(b < 0 ? k : k.slice(0, b));
    });
    return s;
  }, [sinalizadas]);

  // Carrega as sinalizacoes (compartilhadas) uma vez.
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/ajustes/caracteristicas/sinalizar');
        if (!r.ok) return;
        const d = await r.json();
        if (!Array.isArray(d.sinalizacoes)) return;
        const set = new Set<string>();
        const meta: Record<string, { nome?: string; quando?: string }> = {};
        for (const x of d.sinalizacoes) {
          const key = `${x.empresa}:${x.codigo_produto}:${x.coluna}`;
          set.add(key);
          meta[key] = { nome: x.sinalizado_nome, quando: x.criado_em };
        }
        setSinalizadas(set); setSinalMeta(meta);
      } catch { /* ignore */ }
    })();
  }, []);

  // Liga/desliga a sinalizacao de uma celula (otimista + POST; reverte em erro).
  const alternarSinalizacao = useCallback(async (p: Produto, col: string) => {
    const key = `${p.empresa}:${p.codigo_produto}:${col}`;
    const prodKey = `${p.empresa}:${p.codigo_produto}`;
    const novo = !sinalizadas.has(key);
    setSinalizadas((s) => { const n = new Set(s); if (novo) n.add(key); else n.delete(key); return n; });
    // excludencia: sinalizar remove o "OK" do produto (a rota tambem persiste isso)
    if (novo) setOkProdutos((s) => { if (!s.has(prodKey)) return s; const n = new Set(s); n.delete(prodKey); return n; });
    try {
      const r = await fetch('/api/ajustes/caracteristicas/sinalizar', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ empresa: p.empresa, codigo_produto: p.codigo_produto, coluna: col, sinalizar: novo }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.erro || 'falha');
      setSinalMeta((m) => { const n = { ...m }; if (novo) n[key] = { nome: d.sinalizado_nome }; else delete n[key]; return n; });
    } catch (ex) {
      setSinalizadas((s) => { const n = new Set(s); if (novo) n.delete(key); else n.add(key); return n; }); // reverte
      setMsg('Erro ao sinalizar: ' + (ex as Error).message, 'erro');
    }
  }, [sinalizadas, setMsg]);

  // Tooltip da coluna "Sinalizacao": lista as caracteristicas sinalizadas do produto + quem/quando.
  const tooltipSinal = useCallback((prodKey: string): string => {
    const partes = Array.from(sinalizadas)
      .filter((k) => k.startsWith(prodKey + ':'))
      .map((k) => {
        const col = k.slice(prodKey.length + 1);
        const m = sinalMeta[k];
        const quem = m?.nome ? ` — ${m.nome}` : '';
        const quando = m?.quando ? ` (${fmtDataHora(m.quando)})` : '';
        return `${col}${quem}${quando}`;
      });
    return partes.length ? `Sinalizado: ${partes.join('; ')}` : '';
  }, [sinalizadas, sinalMeta]);

  // ---- Marca "OK / conferido" por produto (par positivo da sinalizacao) ----
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/ajustes/caracteristicas/ok');
        if (!r.ok) return;
        const d = await r.json();
        if (!Array.isArray(d.ok)) return;
        const set = new Set<string>();
        const meta: Record<string, { nome?: string; quando?: string }> = {};
        for (const x of d.ok) {
          const key = `${x.empresa}:${x.codigo_produto}`;
          set.add(key);
          meta[key] = { nome: x.conferido_nome, quando: x.conferido_em };
        }
        setOkProdutos(set); setOkMeta(meta);
      } catch { /* ignore */ }
    })();
  }, []);

  // Marca/desmarca o "OK" de um produto (otimista + POST; reverte em erro). Ao LIGAR,
  // apaga as pendencias do produto (excludencia; a rota tambem persiste isso).
  const marcarOk = useCallback(async (p: Produto, valor: boolean) => {
    const prodKey = `${p.empresa}:${p.codigo_produto}`;
    if (okProdutos.has(prodKey) === valor) return; // sem mudanca
    setOkProdutos((s) => { const n = new Set(s); if (valor) n.add(prodKey); else n.delete(prodKey); return n; });
    if (valor) {
      setSinalizadas((s) => { const n = new Set(s); Array.from(n).forEach((k) => { if (k.startsWith(prodKey + ':')) n.delete(k); }); return n; });
    }
    try {
      const r = await fetch('/api/ajustes/caracteristicas/ok', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ empresa: p.empresa, codigo_produto: p.codigo_produto, ok: valor }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.erro || 'falha');
      setOkMeta((m) => { const n = { ...m }; if (valor) n[prodKey] = { nome: d.conferido_nome, quando: new Date().toISOString() }; else delete n[prodKey]; return n; });
    } catch (ex) {
      setOkProdutos((s) => { const n = new Set(s); if (valor) n.delete(prodKey); else n.add(prodKey); return n; }); // reverte
      setMsg('Erro ao marcar OK: ' + (ex as Error).message, 'erro');
    }
  }, [okProdutos, setMsg]);
  const alternarOk = useCallback((p: Produto) => { marcarOk(p, !okProdutos.has(`${p.empresa}:${p.codigo_produto}`)); }, [marcarOk, okProdutos]);

  const valCol = useCallback((p: Produto, col: string): string => {
    if (col === 'empresa') return p.empresa || '';
    if (col === 'codigo') return p.codigo || '';
    if (col === 'sinalizacao') { const pk = `${p.empresa}:${p.codigo_produto}`; return okProdutos.has(pk) ? 'OK' : produtosSinalizados.has(pk) ? 'Pendente' : ''; }
    if (col === 'descricao') return p.descricao || '';
    if (col === 'qtd_estoque') return p.estoque != null ? String(p.estoque) : '';
    if (col === 'modelo') return p.modelo || '';
    if (col === 'marca') return p.marca || '';
    return (p.caracteristicas && p.caracteristicas[col]) || '';
  }, [produtosSinalizados, okProdutos]);

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
        ativos.every(([col, v]) => casaFiltroColuna(valCol(p, col), v)));
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

  // Colunas efetivamente visiveis (ordem escolhida menos as ocultas). Usada na tabela,
  // no CSV e no PDF para tudo respeitar o "Seletor de Colunas".
  const colsVisiveis = useMemo(
    () => (ordemColunas.length ? ordemColunas : todasChaves).filter((k) => !colunasOcultas.includes(k)),
    [ordemColunas, todasChaves, colunasOcultas],
  );

  // Carrega as preferencias de colunas (ordem + ocultas) do Supabase, com fallback
  // para o localStorage (offline / primeira vez). Roda uma vez por usuario.
  // NAO usa flag de "cancelado": no StrictMode (dev) o efeito monta/desmonta/monta e
  // o ref ja evita fetch duplicado; descartar o resultado deixaria prefsProntas em
  // false para sempre (o save nunca dispararia). setState pos-unmount e no-op no React 18+.
  useEffect(() => {
    const uid = userProfile?.id;
    if (!uid || prefsCarregadasRef.current) return;
    prefsCarregadasRef.current = true;
    (async () => {
      let ordem: string[] | null = null;
      let ocultas: string[] | null = null;
      try {
        const r = await fetch(`/api/perfil/ui-prefs?user_id=${encodeURIComponent(uid)}&chave=${CHAVE_PREF_COLUNAS}`);
        if (r.ok) {
          const d = await r.json();
          if (d?.valor && typeof d.valor === 'object') {
            if (Array.isArray(d.valor.ordem)) ordem = d.valor.ordem.map(String);
            if (Array.isArray(d.valor.ocultas)) ocultas = d.valor.ocultas.map(String);
          }
        }
      } catch { /* usa fallback local */ }
      // fallback: cache local (tambem cobre o modo offline)
      if (!ordem) { try { const raw = localStorage.getItem(ORDEM_KEY(uid)); if (raw) { const a = JSON.parse(raw); if (Array.isArray(a)) ordem = a; } } catch { /* ignore */ } }
      if (!ocultas) { try { const raw = localStorage.getItem(OCULTAS_KEY(uid)); if (raw) { const a = JSON.parse(raw); if (Array.isArray(a)) ocultas = a; } } catch { /* ignore */ } }
      baseOrdemRef.current = ordem && ordem.length ? ordem : DEFAULT_ORDEM;
      setColunasOcultas(ocultas || []);
      setPrefsProntas(true);
    })();
  }, [userProfile?.id]);

  // Reconcilia a ordem salva com as colunas disponiveis. So roda depois que os DADOS
  // chegaram (dadosCarregado): antes disso, todasChaves so tem as colunas fixas e as
  // caracteristicas (#PRATELEIRA, #ANDAR...) seriam reanexadas no fim, perdendo a
  // posicao salva. Preserva reordenacoes ja feitas (base = estado atual quando ja existe).
  useEffect(() => {
    if (!prefsProntas || !dadosCarregado) return;
    setOrdemColunas((atual) => {
      const base = atual.length ? atual : (baseOrdemRef.current ?? DEFAULT_ORDEM);
      const rec = reconciliarOrdem(base, todasChaves);
      return rec.length === atual.length && rec.every((k, i) => k === atual[i]) ? atual : rec;
    });
  }, [prefsProntas, dadosCarregado, todasChaves]);

  // Cache local imediato (o Supabase e gravado com debounce logo abaixo). So depois
  // que os dados chegaram, para nunca gravar uma ordem parcial (sem caracteristicas).
  useEffect(() => {
    const uid = userProfile?.id;
    if (!uid || !prefsProntas || !dadosCarregado) return;
    try {
      if (ordemColunas.length) localStorage.setItem(ORDEM_KEY(uid), JSON.stringify(ordemColunas));
      localStorage.setItem(OCULTAS_KEY(uid), JSON.stringify(colunasOcultas));
    } catch { /* ignore */ }
  }, [userProfile?.id, prefsProntas, dadosCarregado, ordemColunas, colunasOcultas]);

  // Salva no Supabase (debounce) para a preferencia valer em qualquer navegador.
  useEffect(() => {
    const uid = userProfile?.id;
    if (!uid || !prefsProntas || !dadosCarregado || ordemColunas.length === 0) return;
    const t = setTimeout(async () => {
      try {
        await fetch('/api/perfil/ui-prefs', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
          body: JSON.stringify({ user_id: uid, chave: CHAVE_PREF_COLUNAS, valor: { ordem: ordemColunas, ocultas: colunasOcultas } }),
        });
      } catch { /* offline: fica so o cache local */ }
    }, 700);
    return () => clearTimeout(t);
  }, [userProfile?.id, prefsProntas, dadosCarregado, ordemColunas, colunasOcultas]);

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
    setColunasOcultas([]);
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
    const cols = colsVisiveis;
    const cell = (v: string) => /[",;\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    const rows = [cols.map((c) => cell(labelCol(c))).join(';')];
    linhas.forEach((p) => rows.push(cols.map((c) => cell(valCol(p, c))).join(';')));
    const blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'caracteristicas-produtos.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, [colsVisiveis, linhas, valCol]);

  // ---- PDF (colunas-chave, respeita filtros e ordenacao atuais) ----
  const gerandoPdfRef = useRef(false);
  const gerarPDF = useCallback(async () => {
    if (gerandoPdfRef.current) return;
    gerandoPdfRef.current = true;
    try {
      const { default: JsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      // Todas as colunas da tela, na ordem escolhida pelo usuario.
      const cols: { key: string; label: string }[] = colsVisiveis.map((c) => ({ key: c, label: labelCol(c) }));
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
  }, [colsVisiveis, linhas, valCol, empFiltro, filtro, filtros, setMsg]);

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

  const colsRender = colsVisiveis;
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
        <ControleOrdenacao cols={colsVisiveis.map((c) => ({ key: c, label: labelCol(c) }))} sorts={sorts} setSorts={setSorts} />
        <button onClick={abrirSugestoes} disabled={rodando} style={{ padding: '7px 14px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: 'pointer', opacity: rodando ? 0.5 : 1 }} title="Sugere o Tipo: para produtos com o campo vazio">Sugerir Tipo:</button>
        <button onClick={exportarCSV} style={{ padding: '7px 14px', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: 'pointer' }}>Exportar CSV</button>
        <button onClick={gerarPDF} title="Gera um PDF (A4 paisagem) com todas as colunas da tela, respeitando os filtros e a ordenacao" style={{ padding: '7px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: 'pointer' }}>Gerar PDF</button>
        <button onClick={sincronizar} disabled={rodando} style={{ padding: '7px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: rodando ? 'wait' : 'pointer', opacity: rodando ? 0.5 : 1 }}>{rodando ? 'Sincronizando…' : 'Sincronizar agora'}</button>
        <button onClick={() => setFlashAberto(true)} disabled={linhas.length === 0} title="Conferir um produto por vez (bom no tablet): sinalizar/corrigir cada caracteristica"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: linhas.length === 0 ? 'not-allowed' : 'pointer', opacity: linhas.length === 0 ? 0.5 : 1 }}>
          <Layers size={15} /> Conferir
        </button>
        <MenuEngrenagem ocultasCount={colunasOcultas.length} onColunas={() => setSeletorAberto(true)} onRestaurar={restaurarOrdem} />
      </div>

      {flashAberto && (
        <ModalFlashcard
          deck={linhas}
          colsCarac={colsVisiveis.filter((c) => !ehFixa(c))}
          valCol={valCol}
          sinalizadas={sinalizadas}
          okProdutos={okProdutos}
          onToggleSinal={alternarSinalizacao}
          onConfere={(p) => marcarOk(p, true)}
          ensureCatalogo={ensureCatalogo}
          onSalvar={salvarCelula}
          onClose={() => setFlashAberto(false)}
        />
      )}

      {seletorAberto && (
        <SeletorColunas
          ordem={ordemColunas.length ? ordemColunas : todasChaves}
          ocultas={colunasOcultas}
          onAplicar={(o, oc) => {
            setOrdemColunas(o);
            setColunasOcultas(oc);
            // coluna oculta nao deve filtrar/ordenar "invisivelmente"
            const ocSet = new Set(oc);
            setFiltros((f) => { const n = { ...f }; oc.forEach((k) => delete n[k]); return n; });
            setSorts((s) => s.filter((x) => !ocSet.has(x.key)));
            setSeletorAberto(false);
          }}
          onCancelar={() => setSeletorAberto(false)}
        />
      )}

      <div style={{ marginBottom: 8, fontSize: '.72rem', color: '#94a3b8' }}>
        Arraste o <b>⠿</b> no cabecalho para reordenar colunas, ou use o botao <b>Colunas</b> para escolher quais mostrar (tudo salvo neste navegador). Clique no titulo para ordenar; <b>Shift+clique</b> adiciona um 2o criterio (desempate).
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
                      title="Número = valor exato (3 não traz 13/23); texto = contém" placeholder="filtrar…" style={filtroInput} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.length === 0 ? (
                <tr><td colSpan={colsRender.length} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8', padding: 30 }}>Nenhum produto bate com o filtro.</td></tr>
              ) : linhas.slice(0, MAX_LINHAS_RENDER).map((p) => {
                const prodKey = `${p.empresa}:${p.codigo_produto}`;
                const temFlag = produtosSinalizados.has(prodKey);
                const temOk = okProdutos.has(prodKey);
                return (
                <tr key={prodKey} style={{ borderTop: '1px solid #f1f5f9', background: temFlag ? '#fef9c3' : (temOk ? '#dcfce7' : undefined) }}>
                  {colsRender.map((col) => {
                    if (col === 'empresa') return <td key={col} style={tdStyle}><EmpBadge empresa={p.empresa} /></td>;
                    if (col === 'codigo') return <td key={col} style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '.72rem' }}>{p.codigo || '-'}</td>;
                    if (col === 'sinalizacao') return (
                      <td key={col} onClick={() => alternarOk(p)} style={{ ...tdStyle, textAlign: 'center', cursor: 'pointer' }}
                        title={temOk ? (okMeta[prodKey]?.nome ? `Conferido — ${okMeta[prodKey]?.nome}${okMeta[prodKey]?.quando ? ` (${fmtDataHora(okMeta[prodKey]?.quando)})` : ''} · clique p/ desmarcar` : 'Conferido · clique p/ desmarcar') : (temFlag ? `${tooltipSinal(prodKey)} · clique p/ marcar OK (limpa a pendencia)` : 'Marcar como OK (conferido)')}>
                        {temOk
                          ? <CheckCircle size={16} color="#16a34a" style={{ verticalAlign: 'middle' }} />
                          : temFlag
                            ? <AlertTriangle size={15} color="#ea580c" style={{ verticalAlign: 'middle' }} />
                            : <Flag size={13} color="#cbd5e1" style={{ verticalAlign: 'middle' }} />}
                      </td>
                    );
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
                    const sinal = sinalizadas.has(cellKey);
                    // no touch (tablet) nao ha hover: mostra a bandeira sempre.
                    const mostrarBandeira = hoverCell === cellKey || sinal || isTouch;
                    return (
                      <td key={col} onClick={() => abrirEdicao(p, col)} title="Clique para editar"
                        onMouseEnter={() => setHoverCell(cellKey)} onMouseLeave={() => setHoverCell((h) => (h === cellKey ? null : h))}
                        style={{ ...tdStyle, cursor: 'pointer', position: 'relative', paddingRight: 26, background: sinal ? '#ffedd5' : undefined, color: v ? '#334155' : '#cbd5e1' }}>
                        {v || '-'}
                        {mostrarBandeira && (
                          <button onClick={(e) => { e.stopPropagation(); alternarSinalizacao(p, col); }}
                            title={sinal ? 'Remover sinalizacao' : 'Sinalizar (marcar pendencia nesta caracteristica)'}
                            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 4, background: 'none', border: 'none', cursor: 'pointer' }}>
                            <Flag size={13} color={sinal ? '#ea580c' : '#94a3b8'} fill={sinal ? '#ea580c' : 'none'} />
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
                );
              })}
              {linhas.length > MAX_LINHAS_RENDER && (
                <tr>
                  <td colSpan={colsRender.length} style={{ ...tdStyle, textAlign: 'center', color: '#64748b', background: '#f8fafc', padding: '12px 10px' }}>
                    Mostrando as primeiras <b>{MAX_LINHAS_RENDER}</b> de <b>{linhas.length}</b> peças. Refine o filtro (empresa/coluna) ou use <b>Conferir</b> para percorrer todas.
                  </td>
                </tr>
              )}
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
