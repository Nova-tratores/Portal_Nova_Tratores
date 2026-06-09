'use client';
// Peças de UI compartilhadas pelas páginas do módulo Estoque.
import type { ReactNode } from 'react';

export function fmtRS(v: number | string | null | undefined): string {
  if (v === undefined || v === null || v === 'N/D') return 'N/D';
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isNaN(n) ? String(v) : 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function Card({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 18, marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
      <h2 style={{ color: '#dc2626', marginBottom: 12, fontSize: '.95rem', fontWeight: 700, borderBottom: '1px solid #f5f5f5', paddingBottom: 8 }}>
        {titulo}
      </h2>
      {children}
    </div>
  );
}

export function InfoGrid({ children }: { children: ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>{children}</div>;
}

export function InfoItem({ label, valor, tom }: { label: string; valor: ReactNode; tom?: 'h' | 'r' }) {
  const cor = tom === 'h' ? '#16a34a' : tom === 'r' ? '#dc2626' : '#333';
  const v = valor === undefined || valor === null || valor === 'N/D' ? 'N/D' : valor;
  return (
    <div style={{ background: '#fafafa', padding: 10, borderRadius: 8, border: '1px solid #f0f0f0' }}>
      <label style={{ display: 'block', color: '#888', fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 2, fontWeight: 600 }}>
        {label}
      </label>
      <div style={{ fontSize: '.88rem', fontWeight: 600, color: cor }}>{v}</div>
    </div>
  );
}

export function VendaCard({ periodo, qtd, label, atual }: { periodo: string; qtd: number; label: string; atual?: boolean }) {
  return (
    <div
      style={{
        background: atual ? '#fef2f2' : '#fafafa',
        border: `1px solid ${atual ? '#fca5a5' : '#eee'}`,
        borderRadius: 10,
        padding: 14,
        textAlign: 'center',
      }}
    >
      <div style={{ color: '#888', fontSize: '.6rem', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: '1.35rem', fontWeight: 700, color: atual ? '#dc2626' : '#333' }}>{qtd}</div>
      <div style={{ fontSize: '.68rem', color: '#aaa', marginTop: 3 }}>{periodo}</div>
    </div>
  );
}
