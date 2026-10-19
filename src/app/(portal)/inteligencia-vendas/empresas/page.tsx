'use client';
import { Suspense } from 'react';
import Empresas from '@/components/inteligencia-vendas/Empresas';

export default function Page() {
  return <Suspense fallback={null}><Empresas /></Suspense>;
}
