// Clientes agora faz parte do grupo SERVIÇOS — a faixa azul de guias entra
// por este layout local (a pasta não pôde ser movida pro route group
// (servicos): travada pelo dev server).
import ServicosNav from '@/components/servicos/ServicosNav';

// Ajustes de responsividade da Pasta Clientes (classes .cli-*; só agem em telas
// estreitas e usam !important para vencer o estilo inline).
const CSS_CLIENTES = `
@media (max-width:1024px){
  .cli-xs{overflow-x:auto!important;-webkit-overflow-scrolling:touch}
  .cli-mw900{min-width:900px}
  .cli-mw600{min-width:600px}
  .cli-mw480{min-width:480px}
}
@media (max-width:768px){
  .cli-page{padding:12px 12px 24px!important}
  .cli-mpad{padding:18px!important}
  .cli-kpi5{grid-template-columns:repeat(3,minmax(0,1fr))!important}
  .cli-cols2{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .cli-wrap{flex-wrap:wrap!important}
}
@media (max-width:480px){
  .cli-g2-xs{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .cli-kpi5{grid-template-columns:repeat(2,minmax(0,1fr))!important}
}
`;

export default function ClientesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS_CLIENTES }} />
      <ServicosNav />
      {children}
    </>
  );
}
