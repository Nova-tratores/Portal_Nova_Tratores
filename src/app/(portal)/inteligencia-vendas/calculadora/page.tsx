'use client';
import { Suspense } from 'react';
import Calculadora from '@/components/inteligencia-vendas/Calculadora';

export default function Page() {
  return <Suspense fallback={null}><Calculadora /></Suspense>;
}
