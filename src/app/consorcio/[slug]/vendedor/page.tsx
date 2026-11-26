// Página do VENDEDOR no evento (24/11/2026, José: "separar a página de divulgação da que o vendedor preenche").
// Só a ficha do cliente (temperatura, próximo passo, usado para lance…) e a tabela rápida das cartas.
// Ao salvar: número da sorte + o resumo final para mandar no WhatsApp do cliente.
// Fica no celular/tablet da equipe; não vai em material de divulgação nem é indexada.
import type { Metadata } from 'next';
import PaginaConsorcio from '../PaginaConsorcio';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Ficha do vendedor — Consórcio Nova Tratores',
  robots: { index: false, follow: false },
};

export default async function ConsorcioVendedorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PaginaConsorcio slug={slug} estande rastreio={{ origem: 'estande', vendedor: '', utm: {} }} />;
}
