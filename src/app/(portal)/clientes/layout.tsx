// Clientes agora faz parte do grupo SERVIÇOS — a faixa azul de guias entra
// por este layout local (a pasta não pôde ser movida pro route group
// (servicos): travada pelo dev server).
import ServicosNav from '@/components/servicos/ServicosNav';

export default function ClientesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ServicosNav />
      {children}
    </>
  );
}
