'use client';
// Módulo Remessas (18/11/2026): lista, histórico e demonstração de máquina com prazo e renovação.
import { Suspense } from 'react';
import TelaRemessas from '@/components/remessas/TelaRemessas';

export default function RemessasPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Carregando…</div>}>
      <TelaRemessas />
    </Suspense>
  );
}
