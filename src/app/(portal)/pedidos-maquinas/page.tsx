'use client';
// Pedidos de Máquinas (módulo 'pedidos-maquinas', grupo Comercial) — o "PPV" das máquinas.
import { Suspense } from 'react';
import TelaPedidosMaquinas from '@/components/pedidos-maquinas/TelaPedidosMaquinas';

export default function PedidosMaquinasPage() {
  return (
    <Suspense fallback={null}>
      <TelaPedidosMaquinas />
    </Suspense>
  );
}
