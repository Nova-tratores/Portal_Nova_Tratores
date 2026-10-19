'use client';
import { Suspense } from 'react';
import Concorrencia from '@/components/inteligencia-vendas/Concorrencia';

export default function Page() {
  return <Suspense fallback={null}><Concorrencia /></Suspense>;
}
