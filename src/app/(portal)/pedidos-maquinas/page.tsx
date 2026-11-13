'use client';
// Pedidos de Máquinas mudou para uma aba de /propostas (13/11/2026). Este endereço só
// redireciona, levando o pedido aberto (?id=PVM-… → ?pvm=), a vista e a proposta.
import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function Redireciona() {
  const router = useRouter();
  const sp = useSearchParams();
  useEffect(() => {
    const u = new URLSearchParams({ aba: 'pedidos' });
    const pvm = sp.get('pvm') || sp.get('id');
    if (pvm) u.set('pvm', pvm);
    const vista = sp.get('vista') || sp.get('aba');
    if (vista && vista !== 'quadro') u.set('vista', vista);
    const prop = sp.get('proposta');
    if (prop) u.set('proposta', prop);
    router.replace(`/propostas?${u}`);
  }, [router, sp]);
  return null;
}

export default function PedidosMaquinasPage() {
  return <Suspense fallback={null}><Redireciona /></Suspense>;
}
