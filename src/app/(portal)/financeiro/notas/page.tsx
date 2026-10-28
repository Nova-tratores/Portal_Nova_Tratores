'use client';
// Notas fiscais (entrada + saída) guardadas no portal — funciona mesmo com a Omie fora.
// Deep-link: /financeiro/notas?campo=os&q=1602 (a tela lê a URL com useSearchParams → Suspense).
// Morava em /estoque/notas até 22/10/2026 (o endereço antigo redireciona — next.config.ts).
import { Suspense } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import FinanceiroNav from '@/components/financeiro/FinanceiroNav';
import { ContaProvider } from '@/components/estoque/ContaProvider';
import NotasFiscais from '@/components/financeiro/notas/NotasFiscais';

export default function NotasFiscaisPage() {
  const { userProfile } = useAuth();
  const { pode, isAdmin, loading } = usePermissoes(userProfile?.id);
  if (!loading && userProfile && !pode('financeiro', 'notas')) return <SemPermissao />;
  return (
    <ContaProvider>
      <FinanceiroNav />
      <Suspense fallback={<div style={{ padding: 24, color: '#888', fontSize: '.85rem' }}>Carregando…</div>}>
        {/* nota de ENTRADA só para quem tem Recebimentos (mesmo gate de /estoque/recebimentos); o servidor também filtra */}
        <NotasFiscais podeXml={pode('financeiro', 'notas-xml')} isAdmin={isAdmin} podeEntrada={pode('estoque', 'recebimentos') || pode('ajustes', 'recebimentos')} />
      </Suspense>
    </ContaProvider>
  );
}
