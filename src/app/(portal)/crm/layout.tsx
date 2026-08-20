// Módulo CRM (demonstração): a faixa de guias entra por aqui em todas as telas.
import CrmNav from '@/components/crm/CrmNav';

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CrmNav />
      {children}
    </>
  );
}
