'use client';
import { Suspense } from 'react';
import Equipe from '@/components/inteligencia-vendas/Equipe';

export default function Page() {
  return <Suspense fallback={null}><Equipe /></Suspense>;
}
