import { ContaProvider } from '@/components/estoque/ContaProvider';
import EstoqueNav from './EstoqueNav';

// Layout do módulo Estoque: provê o contexto de conta (NOVA/CASTRO/Todas) a
// todas as páginas sob /estoque e injeta o submenu interno (EstoqueNav). A
// auth/chrome já vem de (portal)/layout.tsx.
export default function EstoqueLayout({ children }: { children: React.ReactNode }) {
  return (
    <ContaProvider>
      <EstoqueNav />
      {children}
    </ContaProvider>
  );
}
