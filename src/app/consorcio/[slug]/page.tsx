// Página PÚBLICA de DIVULGAÇÃO do consórcio no evento (Supersafra) — Instagram, WhatsApp, QR code.
// Fica FORA de (portal): sem menu, sem login. Quase sempre aberta no celular.
// 24/11/2026 (José): ela só ATRAI (contagem, local, oferta, botão para o vendedor). A ficha do cliente é
// preenchida pelo vendedor em OUTRA página: /consorcio/<slug>/vendedor. O link antigo ?estande=1 leva para lá.
// Com ?v=<nome> (QR do cartão do vendedor) o botão de WhatsApp vai direto para esse vendedor.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import PaginaConsorcio from './PaginaConsorcio';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Consórcio Mahindra na Supersafra — Nova Tratores',
  description: 'Seu Mahindra novo sem juros, sem entrada. Venha ao estande da Nova Tratores na Supersafra.',
  // prévia do link no WhatsApp/Instagram: foto do trator + título (a imagem precisa de endereço completo)
  openGraph: {
    title: 'Consórcio Mahindra na Supersafra',
    description: 'Seu Mahindra novo sem juros e sem entrada. Venha ao estande da Nova Tratores.',
    images: [{ url: 'https://portal.novatratores.com/consorcio/compartilhar.jpg', width: 1200, height: 630 }],
    locale: 'pt_BR',
    type: 'website',
  },
};

export default async function ConsorcioEventoPage({
  params, searchParams,
}: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  if (sp.estande === '1') redirect(`/consorcio/${encodeURIComponent(slug)}/vendedor`);
  // links rastreados (plano Supersafra 1.4): ?origem=insta|face|whats|banner|cartao&v=<vendedor>&utm_*
  const utm: Record<string, string> = {};
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) if (sp[k]) utm[k] = String(sp[k]).slice(0, 80);
  const rastreio = { origem: (sp.origem || '').slice(0, 30), vendedor: (sp.v || '').slice(0, 60), utm };
  return <PaginaConsorcio slug={slug} estande={false} rastreio={rastreio} />;
}
