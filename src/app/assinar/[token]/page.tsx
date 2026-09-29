// PÚBLICO: página onde o CLIENTE assina a OS pelo celular (link mandado por
// WhatsApp). Fora de (portal): sem login. Serve pra qualquer OS; na de
// revisão a assinatura vai também pro cheque de revisão.
import type { Metadata } from 'next';
import AssinarOS from '@/components/assinatura/AssinarOS';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Assinatura do cliente — Nova Tratores',
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AssinarOS token={token} />;
}
