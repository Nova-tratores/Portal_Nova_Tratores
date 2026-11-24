// Página PÚBLICA do consórcio no evento (Supersafra) — destino do QR code do estande.
// Fica FORA de (portal): sem menu, sem login. Quase sempre aberta no celular, no sol, com internet fraca.
// Com ?estande=1 vira o modo do vendedor no tablet (pede o nome de quem cadastrou e volta para a ficha).
import type { Metadata } from 'next';
import PaginaConsorcio from './PaginaConsorcio';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Consórcio Mahindra — Nova Tratores',
  description: 'Simule a parcela do seu Mahindra sem juros e concorra ao sorteio do evento.',
  robots: { index: false, follow: false },
};

export default async function ConsorcioEventoPage({
  params, searchParams,
}: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  return <PaginaConsorcio slug={slug} estande={sp.estande === '1'} />;
}
