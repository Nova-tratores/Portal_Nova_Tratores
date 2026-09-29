// Link antigo de assinatura do cheque → redireciona pro link de assinatura da
// OS (/assinar/<token>), que é o mesmo pra qualquer serviço.
import { redirect, notFound } from 'next/navigation';
import { buscarPorToken } from '@/lib/revisoes/cheque-db';
import { garantirAssinatura } from '@/lib/pos/assinatura-cliente-db';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let destino: string;
  try {
    const c = await buscarPorToken(token);
    const a = await garantirAssinatura(c.os_id);
    destino = `/assinar/${a.token}`;
  } catch {
    notFound();
  }
  redirect(destino);
}
