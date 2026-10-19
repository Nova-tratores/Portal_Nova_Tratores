'use client';
import { Suspense } from 'react';
import Indicacoes from '@/components/inteligencia-vendas/Indicacoes';

export default function Page() {
  return <Suspense fallback={null}><Indicacoes /></Suspense>;
}
