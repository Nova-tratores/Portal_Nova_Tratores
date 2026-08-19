// Layout do grupo SERVIÇOS: injeta a faixa azul de guias (ServicosNav) em
// todas as telas do grupo de uma vez. O route group (servicos) NÃO muda as
// URLs — /pos, /garantias etc. continuam iguais.
// (revisoes e cronograma estão fora do grupo — pastas travadas pelo dev na
// hora da mudança — e recebem a faixa direto na página.)
import ServicosNav from '@/components/servicos/ServicosNav';

export default function ServicosLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ServicosNav />
      {children}
    </>
  );
}
