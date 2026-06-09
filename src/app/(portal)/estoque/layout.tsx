import { ContaProvider } from '@/components/estoque/ContaProvider';

// Layout do módulo Estoque: provê o contexto de conta (NOVA/CASTRO/Todas) a
// todas as páginas sob /estoque. A auth/chrome já vem de (portal)/layout.tsx.
export default function EstoqueLayout({ children }: { children: React.ReactNode }) {
  return <ContaProvider>{children}</ContaProvider>;
}
