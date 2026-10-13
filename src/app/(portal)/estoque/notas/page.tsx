'use client';
// Notas fiscais (entrada + saída) guardadas no portal — funciona mesmo com a Omie fora.
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import NotasFiscais from '@/components/estoque/notas/NotasFiscais';

export default function NotasFiscaisPage() {
  const { userProfile } = useAuth();
  const { pode, isAdmin, loading } = usePermissoes(userProfile?.id);
  if (!loading && userProfile && !pode('estoque', 'notas')) return <SemPermissao />;
  return <NotasFiscais podeXml={pode('estoque', 'notas-xml')} isAdmin={isAdmin} />;
}
