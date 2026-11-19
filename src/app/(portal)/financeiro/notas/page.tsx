'use client';
// Notas fiscais (entrada + saída) guardadas no portal — funciona mesmo com a Omie fora.
// Deep-link: /financeiro/notas?campo=os&q=1602 · ?aba=problemas|envios (painel de erros, 19/11/2026) (a tela lê a URL com useSearchParams → Suspense).
// Morava em /estoque/notas até 22/10/2026 (o endereço antigo redireciona — next.config.ts).
import { Suspense } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import FinanceiroNav from '@/components/financeiro/FinanceiroNav';
import { ContaProvider } from '@/components/estoque/ContaProvider';
import { useEmpresaFinanceiro } from '@/components/financeiro/empresaFinanceiro';
import PainelNotas from '@/components/financeiro/notas/PainelNotas';

export default function NotasFiscaisPage() {
  const { userProfile } = useAuth();
  const { pode, isAdmin, loading } = usePermissoes(userProfile?.id);
  // empresa = o NOVA/CASTRO da faixa do Financeiro (19/11/2026: antes havia também o "Conta: Todas" das notas)
  const [empresa] = useEmpresaFinanceiro();
  if (!loading && userProfile && !pode('financeiro', 'notas')) return <SemPermissao />;
  return (
    <ContaProvider fixa={empresa === 'castro' ? 'CASTRO' : 'NOVA'}>
      <FinanceiroNav />
      <Suspense fallback={<div style={{ padding: 24, color: '#888', fontSize: '.85rem' }}>Carregando…</div>}>
        {/* nota de ENTRADA só para quem tem Recebimentos (mesmo gate de /estoque/recebimentos); o servidor também filtra.
            Abas Problemas e Envios ao Omie só com financeiro:notas-problemas (explícita) — ?aba=problemas|envios */}
        <PainelNotas podeXml={pode('financeiro', 'notas-xml')} isAdmin={isAdmin} podeEntrada={pode('estoque', 'recebimentos') || pode('ajustes', 'recebimentos') || pode('financeiro', 'notas-entrada')} podeProblemas={pode('financeiro', 'notas-problemas')} carregandoPermissoes={loading} />
      </Suspense>
    </ContaProvider>
  );
}
