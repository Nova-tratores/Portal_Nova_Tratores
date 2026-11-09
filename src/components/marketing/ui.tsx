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
import {
  AlertTriangle, BarChart3, CalendarDays, ClipboardCheck, FileText, Gift, HandCoins, Handshake, Megaphone,
  Percent, Sprout, Store, Tent, TrendingUp, Users, Wallet, type LucideIcon,
} from 'lucide-react';
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

// ── Componentes (estilo POS NewPortal — docs/estilo-pos-newportal.md) ───────
/** Quadradinho do ícone: cor no ícone e no fundo clarinho, nunca numa faixa. */
export function IconeQuadrado({ cor = ROSA, tamanho = 32, children }: { cor?: string; tamanho?: number; children: React.ReactNode }) {
  return (
    <span
      style={{
        width: tamanho, height: tamanho, borderRadius: tamanho >= 40 ? 11 : 9, flex: 'none',
        display: 'grid', placeItems: 'center', color: cor,
        background: `color-mix(in srgb, ${cor} 9%, var(--portal-bg-card))`,
        border: `1px solid color-mix(in srgb, ${cor} 18%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}

export function Painel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  // Sem faixa colorida do lado: quem passava borderLeft perde a faixa aqui.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { borderLeft, ...resto } = style ?? {};
  return (
    <div
      className="mkt-card"
      style={{
        background: 'var(--portal-bg-card)',
        border: '1px solid var(--portal-border)',
        borderRadius: 16,
        padding: '16px 18px',
        ...resto,
      }}
    >
      {children}
    </div>
  );
}

export function Titulo({ children, acao, icone, cor }: { children: React.ReactNode; acao?: React.ReactNode; icone?: React.ReactNode; cor?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 500, color: 'var(--portal-text)', display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        {icone && <IconeQuadrado cor={cor}>{icone}</IconeQuadrado>}
        {children}
      </h3>
      {acao}
    </div>
  );
}

/** Etiqueta em pílula: texto na cor, fundo da cor a 10%. */
export function Selo({ texto, cor, titulo }: { texto: string; cor: string; titulo?: string }) {
  return (
    <span
      title={titulo}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 500,
        color: `color-mix(in srgb, ${cor} 85%, var(--portal-text))`,
        background: `color-mix(in srgb, ${cor} 10%, var(--portal-bg-card))`,
        border: `1px solid color-mix(in srgb, ${cor} 22%, transparent)`,
        whiteSpace: 'nowrap',
      }}
    >
      {texto}
    </span>
  );
}

const ICONE_TIPO: Record<string, LucideIcon> = {
  feira: Tent, dia_de_campo: Sprout, acao_loja: Store, patrocinio: Handshake,
  midia: Megaphone, brinde: Gift, outro: CalendarDays,
};

/** Ícone do tipo da ação (feira, dia de campo…) em quadradinho, na cor da situação. */
export function IconeTipoAcao({ tipo, cor, tamanho = 40 }: { tipo: string; cor: string; tamanho?: number }) {
  const Ico = ICONE_TIPO[tipo] ?? CalendarDays;
  return <IconeQuadrado cor={cor} tamanho={tamanho}><Ico size={tamanho >= 40 ? 18 : 16} /></IconeQuadrado>;
}

// Ícone do número pelo rótulo — assim todas as réguas do módulo ganham ícone
// sem mexer em cada tela.
function iconeDoKpi(rotulo: string) {
  const r = rotulo.toLowerCase();
  if (/apoio|recebido|receber|aprovado/.test(r)) return <HandCoins size={17} />;
  if (/receita|vend/.test(r)) return <TrendingUp size={17} />;
  if (/retorno/.test(r)) return <Percent size={17} />;
  if (/lead/.test(r)) return <Users size={17} />;
  if (/proposta|vinculad|aberto/.test(r)) return <FileText size={17} />;
  if (/relat|prazo|diverg/.test(r)) return <AlertTriangle size={17} />;
  if (/investido|custo|confirmado|previsto|lançamento|total/.test(r)) return <Wallet size={17} />;
  if (/respondid|enviado/.test(r)) return <ClipboardCheck size={17} />;
  if (/aç/.test(r)) return <Megaphone size={17} />;
  return <BarChart3 size={17} />;
}

/** Número grande com rótulo. `dica` explica o indicador quando ele é sutil. */
export function Kpi({
  rotulo, valor, dica, cor, alerta,
}: { rotulo: string; valor: string; dica?: string; cor?: string; alerta?: boolean }) {
  const c = cor || ROSA;
  return (
    <div
      title={dica}
      className="mkt-card mkt-kpi"
      style={{
        background: 'var(--portal-bg-card)',
        border: `1px solid ${alerta ? 'color-mix(in srgb, #dc2626 45%, var(--portal-border))' : 'var(--portal-border)'}`,
        borderRadius: 16,
        padding: '14px 16px',
        minWidth: 150,
        flex: '1 1 150px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <IconeQuadrado cor={c} tamanho={40}>{iconeDoKpi(rotulo)}</IconeQuadrado>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--portal-text-muted, #475569)' }}>{rotulo}</div>
        <div className="mkt-kpi-v" style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-.01em', fontVariantNumeric: 'tabular-nums', color: 'var(--portal-text)', marginTop: 1, whiteSpace: 'nowrap' }}>
          {valor}
        </div>
      </div>
    </div>
  );
}

export function Campo({
  label, children, ajuda, largura,
}: { label: string; children: React.ReactNode; ajuda?: string; largura?: string }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: largura ?? '1 1 200px', minWidth: 0 }}>
      <span style={{ fontSize: 13, color: 'var(--portal-text-muted, #475569)' }}>{label}</span>
      {children}
      {ajuda && <span style={{ fontSize: 12, color: 'var(--portal-text-muted, #64748b)' }}>{ajuda}</span>}
    </label>
  );
}

/** fontSize 16 é obrigatório: abaixo disso o iPhone dá zoom ao focar o campo. */
export const estiloInput: React.CSSProperties = {
  padding: '9px 12px',
  fontSize: 16,
  border: '1px solid var(--portal-border)',
  borderRadius: 10,
  background: 'var(--portal-bg-card)',
  color: 'var(--portal-text)',
  width: '100%',
  boxSizing: 'border-box',
};

/** Botão secundário com contorno (Editar, Lixeira…). */
export const estiloBotaoContorno: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 13px', fontSize: 13, fontWeight: 500,
  borderRadius: 10, border: '1px solid var(--portal-border)',
  background: 'var(--portal-bg-card)', color: 'var(--portal-text)', cursor: 'pointer',
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
        minHeight: 40,
        fontSize: 14,
        fontWeight: 500,
        color: '#111111', // legenda PRETA nos botões coloridos (padrão do portal no escuro)
        background: ROSA_CLARO,
        border: 'none',
        borderRadius: 11,
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
    <div style={{ margin: 16, padding: 16, borderRadius: 14, border: '1px solid #f59e0b', background: '#fffbeb', color: '#111111' }}>
      <span style={{ fontWeight: 500 }}>Banco ainda não preparado.</span>
      <div style={{ marginTop: 6, fontSize: 13 }}>
        As tabelas deste módulo não existem. Rode <code>sql/marketing-acoes.sql</code> no SQL Editor
        do Supabase e recarregue a página.
      </div>
    </div>
  );
}

export function Erro({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ margin: 16, padding: 14, borderRadius: 12, border: '1px solid #dc2626', background: '#fef2f2', color: '#111111', fontSize: 13 }}>
      {children}
    </div>
  );
}
