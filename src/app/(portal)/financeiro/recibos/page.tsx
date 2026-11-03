'use client';
// Financeiro → Recibos de pagamento (José, 03/11/2026). Quem tem Financeiro, POS ou PPV (o servidor confere igual).
import { Suspense } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import FinanceiroNav from '@/components/financeiro/FinanceiroNav';
import Recibos from '@/components/financeiro/recibos/Recibos';

export default function RecibosPage() {
  const { userProfile } = useAuth();
  const { temAcesso, isAdmin, loading } = usePermissoes(userProfile?.id);
  if (!loading && userProfile && !isAdmin && !['financeiro', 'pos', 'ppv'].some((m) => temAcesso(m))) return <SemPermissao />;
  return (
    <>
      <FinanceiroNav />
      <Suspense fallback={<div style={{ padding: 24, color: '#888', fontSize: '.85rem' }}>Carregando…</div>}>
        <Recibos />
      </Suspense>
    </>
  );
}
