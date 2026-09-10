'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// MARKETING & EVENTOS — peças de UI compartilhadas pelas telas do módulo.
//
// Cores do módulo: rosa/magenta (#DB2777). O Comercial já é vermelho, então a
// faixa distingue sem brigar.
//
// ⚠️ Modo escuro: as regras globais remapeiam por seletor de atributo em cima do
// style inline, e React serializa hex->rgb (e `backgroundColor` vira
// `background-color:`). Por isso os brancos/pretos daqui usam #fefefe e #111111,
// que o dark NÃO converte, e o resto sai das vars do tema.
// =============================================================================
import { authHeaders } from '@/lib/auth/client';

export const ROSA = '#DB2777';
export const ROSA_CLARO = '#F472B6';
export const ROSA_ESCURO = '#9D174D';

// ── Fetch com token (todas as rotas do módulo exigem autenticação) ───────────
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

/**
 * Abre um arquivo servido por rota AUTENTICADA.
 *
 * Não dá pra usar <a href="/api/..."> : navegação de link não carrega o
 * cabeçalho Authorization (a sessão do portal é um JWT no navegador, não um
 * cookie), e a rota responde "Não autenticado". Então busca por fetch com o
 * token, transforma em blob e abre.
 *
 * A aba é aberta ANTES do await de propósito: depois dele o navegador já não
 * considera "gesto do usuário" e o bloqueador de pop-up barra. Se mesmo assim
 * vier bloqueada, cai pro download, que nunca é barrado.
 */
export async function abrirArquivoAutenticado(url: string, nomeArquivo: string): Promise<void> {
  const aba = window.open('', '_blank');
  try {
    const r = await fetch(url, { headers: await authHeaders(), cache: 'no-store' });
    if (!r.ok) {
      let msg = `Erro ${r.status}`;
      try { msg = (await r.json())?.error || msg; } catch { /* corpo não é JSON */ }
      aba?.close();
      throw new Error(msg);
    }
    const blob = await r.blob();
    const endereco = URL.createObjectURL(blob);

    if (aba && !aba.closed) {
      aba.location.href = endereco;
    } else {
      const link = document.createElement('a');
      link.href = endereco;
      link.download = nomeArquivo;
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
    // Só depois que a aba carregou; revogar na hora deixa a aba em branco.
    setTimeout(() => URL.revokeObjectURL(endereco), 60_000);
  } catch (e) {
    aba?.close();
    throw e;
  }
}

// ── Formatadores ─────────────────────────────────────────────────────────────
export function brl(v: number | null | undefined): string {
  return Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** '2026-07-10' -> '10/07/2026'. Não usa Date pra não escorregar de fuso. */
export function dataBR(iso: string | null | undefined): string {
  if (!iso) return '—';
  const s = String(iso).slice(0, 10);
  const [a, m, d] = s.split('-');
  return a && m && d ? `${d}/${m}/${a}` : s;
}

export function periodoBR(ini: string | null, fim: string | null): string {
  if (!ini && !fim) return 'Sem data';
  if (ini && fim && ini !== fim) return `${dataBR(ini)} a ${dataBR(fim)}`;
  return dataBR(ini || fim);
}

/** Percentual, ou travessão quando o indicador é indefinido (denominador 0). */
export function pct(v: number | null | undefined, casas = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return `${(v * 100).toFixed(casas)}%`;
}

/** ROI como multiplicador ("12,0x"), ou travessão. NUNCA "Infinity". */
export function multiplicador(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}x`;
}

/** Dias até a data (negativo = venceu). null quando não há data. */
export function diasAte(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const alvo = Date.parse(String(iso).slice(0, 10) + 'T00:00:00Z');
  const hoje = Date.parse(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  if (!Number.isFinite(alvo)) return null;
  return Math.round((alvo - hoje) / 86_400_000);
}

// ── Componentes ──────────────────────────────────────────────────────────────
export function Painel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: 'var(--portal-bg-card)',
        border: '1px solid var(--portal-border)',
        borderRadius: 4,
        padding: 16,
        boxShadow: '0 1px 2px var(--portal-shadow)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Titulo({ children, acao }: { children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--portal-text)' }}>{children}</h3>
      {acao}
    </div>
  );
}

export function Selo({ texto, cor, titulo }: { texto: string; cor: string; titulo?: string }) {
  return (
    <span
      title={titulo}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 9px',
        borderRadius: 3,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.2,
        color: '#111111',
        background: cor,
        whiteSpace: 'nowrap',
      }}
    >
      {texto}
    </span>
  );
}

/** Número grande com rótulo. `dica` explica o indicador quando ele é sutil. */
export function Kpi({
  rotulo, valor, dica, cor, alerta,
}: { rotulo: string; valor: string; dica?: string; cor?: string; alerta?: boolean }) {
  return (
    <div
      title={dica}
      style={{
        background: 'var(--portal-bg-card)',
        border: `1px solid ${alerta ? '#dc2626' : 'var(--portal-border)'}`,
        borderLeft: `3px solid ${cor || ROSA}`,
        borderRadius: 4,
        padding: '10px 14px',
        minWidth: 130,
        flex: '1 1 130px',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--portal-text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: 0.3 }}>
        {rotulo}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--portal-text)', marginTop: 2 }}>{valor}</div>
    </div>
  );
}

export function Campo({
  label, children, ajuda, largura,
}: { label: string; children: React.ReactNode; ajuda?: string; largura?: string }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: largura ?? '1 1 200px', minWidth: 0 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--portal-text)' }}>{label}</span>
      {children}
      {ajuda && <span style={{ fontSize: 11, color: 'var(--portal-text-muted, #64748b)' }}>{ajuda}</span>}
    </label>
  );
}

/** fontSize 16 é obrigatório: abaixo disso o iPhone dá zoom ao focar o campo. */
export const estiloInput: React.CSSProperties = {
  padding: '9px 10px',
  fontSize: 16,
  border: '1px solid var(--portal-border)',
  borderRadius: 3,
  background: 'var(--portal-bg-card)',
  color: 'var(--portal-text)',
  width: '100%',
  boxSizing: 'border-box',
};

export function BotaoRosa({
  children, onClick, disabled, title, tipo = 'button', style,
}: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean;
  title?: string; tipo?: 'button' | 'submit'; style?: React.CSSProperties;
}) {
  return (
    <button
      type={tipo}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        padding: '9px 16px',
        fontSize: 14,
        fontWeight: 700,
        color: '#111111', // legenda PRETA nos botões coloridos (padrão do portal no escuro)
        background: ROSA_CLARO,
        border: 'none',
        borderRadius: 3,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 28, textAlign: 'center', color: 'var(--portal-text-muted, #64748b)', fontSize: 13 }}>
      {children}
    </div>
  );
}

/** Aviso de migration pendente — o módulo avisa, o portal não quebra. */
export function AvisoMigracao() {
  return (
    <div style={{ margin: 16, padding: 16, borderRadius: 4, border: '1px solid #f59e0b', background: '#fffbeb', color: '#111111' }}>
      <strong>Banco ainda não preparado.</strong>
      <div style={{ marginTop: 6, fontSize: 13 }}>
        As tabelas deste módulo não existem. Rode <code>sql/marketing-acoes.sql</code> no SQL Editor
        do Supabase e recarregue a página.
      </div>
    </div>
  );
}

export function Erro({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ margin: 16, padding: 14, borderRadius: 4, border: '1px solid #dc2626', background: '#fef2f2', color: '#111111', fontSize: 13 }}>
      {children}
    </div>
  );
}
