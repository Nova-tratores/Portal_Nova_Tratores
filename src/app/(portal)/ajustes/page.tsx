'use client';
// Home do módulo Ajustes (ex-"Omie CMC Garantia" / back.novatratores.com).
// Fase 0: esqueleto + gate de permissão. As telas reais (Dashboard CMC Garantia,
// Inventário, Contas, Pedidos, etc.) entram nas fases seguintes da migração.
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import ContaSelector from '@/components/estoque/ContaSelector';

export default function AjustesHomePage() {
  const { userProfile } = useAuth();
  const { temAcesso, loading: permLoading } = usePermissoes(userProfile?.id);

  if (!permLoading && userProfile && !temAcesso('ajustes')) {
    return <SemPermissao />;
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 24px' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#333', marginBottom: 4 }}>
        Ajustes Estoque
      </h1>
      <p style={{ color: '#888', fontSize: '.82rem', marginBottom: 18 }}>
        Correção de CMC por NF de garantia, recebimentos, estoque negativo, inventário,
        contas e pedidos. (Migração em andamento — módulos sendo portados por fase.)
      </p>
      <div style={{ marginBottom: 18 }}>
        <ContaSelector />
      </div>
      <div
        style={{
          background: '#fff',
          border: '1px solid #eee',
          borderRadius: 12,
          padding: 18,
          color: '#666',
          fontSize: '.85rem',
        }}
      >
        Módulo em construção. As telas serão habilitadas conforme a migração avança.
      </div>
    </div>
  );
}
