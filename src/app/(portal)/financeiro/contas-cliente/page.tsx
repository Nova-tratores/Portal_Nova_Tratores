'use client';
// Financeiro → Contas do cliente/fornecedor + calculadora de dívida (09/11/2026).
// Deep-link: /financeiro/contas-cliente?doc=<cpf/cnpj só dígitos | NOVA:cod>
import { Suspense } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import FinanceiroNav from '@/components/financeiro/FinanceiroNav';
import ContasCliente from '@/components/financeiro/contas-cliente/ContasCliente';

export default function ContasClientePage() {
  const { userProfile } = useAuth();
  const { pode, loading } = usePermissoes(userProfile?.id);
  if (!loading && userProfile && !pode('financeiro', 'contas-cliente')) return <SemPermissao />;
  return (
    <>
      <FinanceiroNav />
      <Suspense fallback={<div style={{ padding: 24, color: '#888', fontSize: '.85rem' }}>Carregando…</div>}>
        <ContasCliente />
      </Suspense>
    </>
  );
}
