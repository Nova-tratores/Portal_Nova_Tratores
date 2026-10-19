'use client';
import { Suspense } from 'react';
import Oportunidades from '@/components/inteligencia-vendas/Oportunidades';

// Topo em mosaico (opção C da página de teste), tabela visual e ficha 360 — aprovado pelo José em 19/10/2026.
export default function Page() {
  return <Suspense fallback={null}><Oportunidades topo="C" /></Suspense>;
}
