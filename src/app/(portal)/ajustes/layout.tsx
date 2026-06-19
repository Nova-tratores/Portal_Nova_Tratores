import { ContaProvider } from '@/components/estoque/ContaProvider';

// Layout do módulo Ajustes (ex-"Omie CMC Garantia" / back.novatratores.com):
// provê o contexto de conta (NOVA/CASTRO/Todas) a todas as páginas sob /ajustes.
// Reusa o ContaProvider do módulo estoque (mesma lista de contas + mesma chave
// localStorage 'omie_conta_selecionada'). A auth/chrome vem de (portal)/layout.tsx.
export default function AjustesLayout({ children }: { children: React.ReactNode }) {
  return <ContaProvider>{children}</ContaProvider>;
}
