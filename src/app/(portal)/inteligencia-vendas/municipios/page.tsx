'use client';
import { Suspense } from 'react';
import Municipios from '@/components/inteligencia-vendas/Municipios';

export default function Page() {
  return <Suspense fallback={null}><Municipios /></Suspense>;
}
