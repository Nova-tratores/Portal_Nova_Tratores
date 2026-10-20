'use client';
// Prospecção (José, 20/10/2026): a Jornada com o Tratorilson como atalho e, embaixo, os módulos
// completos do caminho escolhido (Carteira, Recuperar, Novos clientes, Território).
import { Suspense } from 'react';
import ProspeccaoPagina from '@/components/inteligencia-vendas/ProspeccaoPagina';

export default function Page() {
  return <Suspense fallback={null}><ProspeccaoPagina /></Suspense>;
}
