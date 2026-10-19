'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// INTELIGÊNCIA DE VENDAS — peças de UI das telas do módulo.
// Comercial = vermelho. Brancos/pretos em #fefefe/#111111 (o modo escuro do
// portal remapeia #fff/#111827); o resto sai das vars do tema.
// =============================================================================
import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Loader2, AlertTriangle } from 'lucide-react';
import { authHeaders } from '@/lib/auth/client';

export const VERMELHO = '#DC2626';
export const VERMELHO_ESCURO = '#991B1B';
export const txt = 'var(--portal-text, #111111)';
export const mut = 'var(--portal-text-muted, #6b7280)';
export const borda = '1px solid var(--portal-border, #e5e7eb)';
export const fundoCard = 'var(--portal-bg-card, #fefefe)';
export const fundo2 = 'var(--portal-bg-secondary, #f3f4f6)';

export async function apiGet<T = any>(url: string): Promise<T> {
  const r = await fetch(url, { headers: await authHeaders(), cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j?.error || `Erro ${r.status}`), { status: r.status, corpo: j });
  return j as T;
}

export async function apiEnviar<T = any>(url: string, metodo: 'POST' | 'PATCH' | 'DELETE', corpo?: any): Promise<T> {
  const r = await fetch(url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j?.error || `Erro ${r.status}`), { status: r.status, corpo: j });
  return j as T;
}

// ── formatos ────────────────────────────────────────────────────────────────
export const brl = (n: number | null | undefined, casas = 0) =>
  n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: casas, minimumFractionDigits: casas });
export const num = (n: number | null | undefined, casas = 0) =>
  n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: casas });
export const compacto = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return `${num(n / 1e9, 1)} bi`;
  if (a >= 1e6) return `${num(n / 1e6, 1)} mi`;
  if (a >= 1e3) return `${num(n / 1e3, 0)} mil`;
  return num(n, 0);
};
export const dataBR = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return d ? `${d}/${m}/${a}` : '—';
};
export const pct = (n: number | null | undefined, casas = 1) => (n == null ? '—' : `${num(n * 100, casas)}%`);

// ── blocos ──────────────────────────────────────────────────────────────────
export function Pagina({ children }: { children: ReactNode }) {
  return <div style={{ padding: '18px clamp(12px, 2vw, 28px) 48px', width: '100%', boxSizing: 'border-box', minWidth: 0 }}>{children}</div>;
}

export function Cabecalho({ titulo, sub, acoes }: { titulo: string; sub?: ReactNode; acoes?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: txt, margin: 0 }}>{titulo}</h1>
        {sub && <div style={{ fontSize: 13, color: mut, marginTop: 3 }}>{sub}</div>}
      </div>
      {acoes && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{acoes}</div>}
    </div>
  );
}

export function Kpi({ rotulo, valor, sub, cor = VERMELHO, ativo, onClick }: {
  rotulo: string; valor: ReactNode; sub?: ReactNode; cor?: string; ativo?: boolean; onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      style={{
        background: fundoCard, border: ativo ? `2px solid ${cor}` : borda, borderLeft: `4px solid ${cor}`, borderRadius: 10,
        padding: '10px 14px', minWidth: 0, cursor: onClick ? 'pointer' : 'default', boxShadow: ativo ? `0 0 0 3px ${cor}22` : 'none',
      }}
    >
      <div style={{ fontSize: 12, color: mut, fontWeight: 600 }}>{rotulo}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: txt, lineHeight: 1.2, marginTop: 2 }}>{valor}</div>
      {sub && <div style={{ fontSize: 12, color: mut, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function GradeKpi({ children, min = 170 }: { children: ReactNode; min?: number }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(min(${min}px, 100%), 1fr))`, gap: 10, marginBottom: 14 }}>{children}</div>;
}

export function Painel({ titulo, children, acoes, style }: { titulo?: ReactNode; children: ReactNode; acoes?: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: fundoCard, border: borda, borderRadius: 10, padding: 14, minWidth: 0, ...style }}>
      {(titulo || acoes) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: txt }}>{titulo}</div>
          {acoes}
        </div>
      )}
      {children}
    </div>
  );
}

export function Selo({ children, cor = '#475569', title }: { children: ReactNode; cor?: string; title?: string }) {
  return (
    <span title={title} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, fontSize: 11.5, fontWeight: 700,
      color: cor, background: `${cor}18`, border: `1px solid ${cor}55`, whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

export function Botao({ children, onClick, cheio, cor = VERMELHO, disabled, title }: {
  children: ReactNode; onClick?: () => void; cheio?: boolean; cor?: string; disabled?: boolean; title?: string;
}) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 8, fontSize: 13, fontWeight: 700,
        border: `1px solid ${cor}`, background: cheio ? cor : 'transparent', color: cheio ? '#fefefe' : cor,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1, whiteSpace: 'nowrap',
      }}
    >{children}</button>
  );
}

export const estiloInput: CSSProperties = {
  padding: '7px 9px', borderRadius: 8, border: borda, background: 'var(--portal-bg-input, #fefefe)', color: txt, fontSize: 13, minWidth: 0,
};

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: mut, fontSize: 14 }}>
      <Loader2 size={22} className="animate-spin" style={{ display: 'inline-block', marginBottom: 8 }} />
      <div>{texto}</div>
    </div>
  );
}

export function Aviso({ children, cor = '#B45309' }: { children: ReactNode; cor?: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 8, border: `1px solid ${cor}55`, background: `${cor}12`, color: txt, fontSize: 13, marginBottom: 12 }}>
      <AlertTriangle size={16} color={cor} style={{ flexShrink: 0, marginTop: 1 }} />
      <div>{children}</div>
    </div>
  );
}

export function AvisoMigracao() {
  return <Aviso>Esta parte precisa da migration <b>sql/inteligencia-vendas.sql</b>. Rode no SQL Editor do Supabase e recarregue a página.</Aviso>;
}

// ── balão de explicação ─────────────────────────────────────────────────────
/** Balão ao passar o mouse (ou tocar). Fica por cima de tudo: a rolagem da tabela não corta. */
export function Dica({ conteudo, children, largura = 340 }: { conteudo: ReactNode; children: ReactNode; largura?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; cima: boolean } | null>(null);
  const abrir = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const x = Math.max(8, Math.min(window.innerWidth - largura - 8, r.left + r.width / 2 - largura / 2));
    const cima = r.bottom + 260 > window.innerHeight && r.top > 260;
    setPos({ x, y: cima ? r.top - 8 : r.bottom + 8, cima });
  };
  return (
    <span ref={ref} onMouseEnter={abrir} onMouseLeave={() => setPos(null)} onClick={(e) => { e.stopPropagation(); if (pos) setPos(null); else abrir(); }}
      style={{ display: 'inline-flex', alignItems: 'center', cursor: 'help' }}>
      {children}
      {pos && typeof document !== 'undefined' && createPortal(
        <span role="tooltip" className="iv-dica" style={{ left: pos.x, top: pos.y, width: largura, transform: pos.cima ? 'translateY(-100%)' : undefined }}>
          <style>{'.iv-dica{position:fixed;z-index:10000;background:#111111;color:#fefefe;border-radius:12px;padding:12px 14px;font-size:13.5px;line-height:1.5;font-weight:500;text-align:left;white-space:normal;box-shadow:0 14px 34px rgba(0,0,0,.28);pointer-events:none;animation:ivDica .16s ease both}@keyframes ivDica{from{opacity:0;margin-top:4px}}'}</style>
          {conteudo}
        </span>, document.body)}
    </span>
  );
}

// ── tabela ordenável ────────────────────────────────────────────────────────
export interface Coluna<T> {
  id: string;
  rotulo: string;
  valor: (l: T) => string | number | null | undefined; // pra ordenar e exportar
  render?: (l: T) => ReactNode;
  direita?: boolean;
  largura?: number | string;
  csv?: boolean;
  /** explicação do que a coluna mostra (balão no ⓘ do cabeçalho) */
  legenda?: ReactNode;
}

export function Tabela<T>({ linhas, colunas, chave, onLinha, ordemInicial, max = 500, vazio = 'Nada encontrado.', animar, rolarPagina }: {
  linhas: T[]; colunas: Coluna<T>[]; chave: (l: T) => string; onLinha?: (l: T) => void;
  ordemInicial?: { id: string; dir: 'asc' | 'desc' }; max?: number; vazio?: string;
  /** muda quando o filtro muda: as linhas entram de novo, uma a uma */
  animar?: string;
  /** sem rolagem própria: a lista desce junto com a página */
  rolarPagina?: boolean;
}) {
  const [ordem, setOrdem] = useState(ordemInicial ?? null);
  const [limite, setLimite] = useState(max);
  const ordenadas = useMemo(() => {
    if (!ordem) return linhas;
    const col = colunas.find((c) => c.id === ordem.id);
    if (!col) return linhas;
    const m = ordem.dir === 'asc' ? 1 : -1;
    return [...linhas].sort((a, b) => {
      const va = col.valor(a), vb = col.valor(b);
      if (va == null || va === '') return 1;
      if (vb == null || vb === '') return -1;
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR')) * m;
    });
  }, [linhas, colunas, ordem]);

  const th: CSSProperties = {
    padding: '8px 9px', fontSize: 12, fontWeight: 700, color: 'var(--portal-text-secondary, #374151)', background: fundo2,
    borderBottom: borda, whiteSpace: 'nowrap', position: 'sticky', top: 0, cursor: 'pointer', userSelect: 'none', zIndex: 1,
  };
  const td: CSSProperties = { padding: '7px 9px', fontSize: 13, color: txt, borderBottom: borda, verticalAlign: 'top' };

  return (
    <div style={{ ...(rolarPagina ? { overflowX: 'auto' } : { overflow: 'auto', maxHeight: '70vh' }), border: borda, borderRadius: 10, background: fundoCard }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {colunas.map((c) => {
              const ativa = ordem?.id === c.id;
              return (
                <th key={c.id} style={{ ...th, textAlign: c.direita ? 'right' : 'left', width: c.largura }}
                  title="Clique para ordenar"
                  aria-sort={ativa ? (ordem!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  onClick={() => setOrdem(ativa ? { id: c.id, dir: ordem!.dir === 'asc' ? 'desc' : 'asc' } : { id: c.id, dir: c.direita ? 'desc' : 'asc' })}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {c.rotulo}
                    {c.legenda && <Dica conteudo={c.legenda}><i className="fas fa-circle-info" style={{ fontSize: 11.5, opacity: .55 }} /></Dica>}
                    {ativa ? (ordem!.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={11} style={{ opacity: 0.35 }} />}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody key={animar}>
          {ordenadas.slice(0, limite).map((l, i) => (
            <tr key={chave(l)} onClick={onLinha ? () => onLinha(l) : undefined} style={{ cursor: onLinha ? 'pointer' : 'default', animationDelay: animar !== undefined && i < 25 ? `${i * 28}ms` : undefined }}
              className={`${onLinha ? 'hover:bg-black/5' : ''} ${animar !== undefined ? 'iv-lin-tab' : ''}`}>
              {colunas.map((c) => (
                <td key={c.id} style={{ ...td, textAlign: c.direita ? 'right' : 'left' }}>{c.render ? c.render(l) : (c.valor(l) ?? '—')}</td>
              ))}
            </tr>
          ))}
          {ordenadas.length === 0 && (
            <tr><td colSpan={colunas.length} style={{ ...td, textAlign: 'center', color: mut, padding: 28 }}>{vazio}</td></tr>
          )}
        </tbody>
      </table>
      {ordenadas.length > limite && (
        <div style={{ padding: 10, textAlign: 'center' }}>
          <Botao onClick={() => setLimite(limite + max)}>Mostrar mais ({ordenadas.length - limite} restantes)</Botao>
        </div>
      )}
    </div>
  );
}

/** CSV no padrão do portal: ';' + BOM (abre certo no Excel). */
export function baixarCSV<T>(nome: string, linhas: T[], colunas: Coluna<T>[]) {
  const cols = colunas.filter((c) => c.csv !== false);
  const esc = (v: unknown) => {
    const s = v == null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const corpo = [cols.map((c) => esc(c.rotulo)).join(';'), ...linhas.map((l) => cols.map((c) => esc(c.valor(l))).join(';'))].join('\r\n');
  const blob = new Blob(['﻿' + corpo], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export function BotaoCSV<T>({ nome, linhas, colunas }: { nome: string; linhas: T[]; colunas: Coluna<T>[] }) {
  return <Botao onClick={() => baixarCSV(nome, linhas, colunas)} title="Baixar a lista filtrada"><Download size={14} /> CSV</Botao>;
}

export function tempoDesde(ms: number | null | undefined): string {
  if (!ms) return '';
  const min = Math.round((Date.now() - ms) / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  return `há ${Math.round(min / 60)} h`;
}
