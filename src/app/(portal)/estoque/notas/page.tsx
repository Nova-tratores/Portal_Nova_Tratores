'use client';
// Notas fiscais (entrada + saída) guardadas no portal — funciona mesmo com a Omie fora.
// Deep-link: /estoque/notas?campo=os&q=1602 (a tela lê a URL com useSearchParams → Suspense).
import { Suspense } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import NotasFiscais from '@/components/estoque/notas/NotasFiscais';

export default function NotasFiscaisPage() {
  const { userProfile } = useAuth();
  const { pode, isAdmin, loading } = usePermissoes(userProfile?.id);
  if (!loading && userProfile && !pode('estoque', 'notas')) return <SemPermissao />;
  return (
    <Suspense fallback={<div style={{ padding: 24, color: '#888', fontSize: '.85rem' }}>Carregando…</div>}>
      {/* nota de ENTRADA só para quem tem Recebimentos (mesmo gate de /estoque/recebimentos); o servidor também filtra */}
      <NotasFiscais podeXml={pode('estoque', 'notas-xml')} isAdmin={isAdmin} podeEntrada={pode('estoque', 'recebimentos') || pode('ajustes', 'recebimentos')} />
    </Suspense>
  );
}
