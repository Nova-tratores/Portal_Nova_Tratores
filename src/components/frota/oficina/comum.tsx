'use client';
// Peças comuns das telas da oficina da frota: janela, botões e o tipo da OS
// que a rota /api/frota/oficina devolve.
import type { CSSProperties, ReactNode } from 'react';
import { X } from 'lucide-react';
import { AZUL_FROTA } from '@/components/frota/ui';
import { fetchAuth } from '@/lib/auth/client';
import type { OsFrota } from '@/lib/frota/oficina-server';

export type { OsFrota };
export interface VeiculoOpcao { placa: string; descricao: string }

export async function postOficina(body: Record<string, unknown>): Promise<{ ok?: boolean; error?: string; [k: string]: unknown }> {
  const r = await fetchAuth('/api/frota/oficina', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok && !j.error) j.error = `Falha (${r.status}).`;
  return j;
}

export const botao = (tipo: 'primario' | 'secundario' | 'perigo' = 'secundario'): CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '9px 14px', minHeight: 40, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', borderRadius: 0,
  border: tipo === 'secundario' ? '1px solid var(--portal-border)' : 'none',
  background: tipo === 'primario' ? AZUL_FROTA : tipo === 'perigo' ? '#b91c1c' : 'var(--portal-bg-input)',
  color: tipo === 'secundario' ? 'var(--portal-text)' : '#fefefe',
});

export const campo: CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '9px 10px', fontSize: 14, borderRadius: 0,
  border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)',
};

export const rotulo: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, fontWeight: 700, color: 'var(--portal-text-secondary)' };

export function Janela({ titulo, onFechar, children, largura = 560, rodape }: {
  titulo: ReactNode; onFechar: () => void; children: ReactNode; largura?: number; rodape?: ReactNode;
}) {
  return (
    <div role="dialog" aria-modal="true" onClick={onFechar}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 12px', overflowY: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} className="frota-modal-in"
        style={{ width: '100%', maxWidth: largura, background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderTop: `4px solid ${AZUL_FROTA}`, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--portal-text)', flex: 1, minWidth: 0 }}>{titulo}</h2>
          <button type="button" onClick={onFechar} aria-label="Fechar" style={{ ...botao(), minHeight: 32, padding: 6 }}><X size={16} /></button>
        </div>
        {children}
        {rodape && <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>{rodape}</div>}
      </div>
    </div>
  );
}

export const fmtKm = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n).toLocaleString('pt-BR')} km`);
export const fmtData = (iso: string | null | undefined) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('pt-BR') : '—');
export const fmtDataHora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
export const fmtReais = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
