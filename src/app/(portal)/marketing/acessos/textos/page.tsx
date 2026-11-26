'use client';
// (client: as abas levam uma função `ativo`, que não atravessa de servidor para navegador)
// Acessos → Site → engrenagem "Textos do site" (25/11/2026, José: "isso aqui tem que ficar dentro do site").
// Telefones, horário, faixa de aviso, topo e banners. Antes morava em Conteúdo e publicar.
import TextosSite from '../../conteudo/TextosSite';
import { ABAS_ACESSOS } from '@/components/marketing/redes/abasAcessos';

export default function TextosDoSitePage() {
  return <TextosSite abas={ABAS_ACESSOS} voltar="/marketing/acessos" />;
}
