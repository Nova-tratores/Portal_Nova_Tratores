'use client';
import { Suspense } from 'react';
import Retorno from '@/components/inteligencia-vendas/Retorno';

export default function Page() {
  return <Suspense fallback={null}><Retorno /></Suspense>;
}
