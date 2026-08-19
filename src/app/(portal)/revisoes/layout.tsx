// Faixa do grupo SERVIÇOS (a pasta não pôde entrar no route group (servicos)
// — travada pelo dev server no momento da reorganização — então o layout
// local injeta a mesma faixa).
import ServicosNav from '@/components/servicos/ServicosNav';

export default function RevisoesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ServicosNav />
      {children}
    </>
  );
}
