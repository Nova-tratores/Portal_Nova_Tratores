'use client';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import FrotaNav from '@/components/frota/FrotaNav';
import { podeTelaFrota, slugDaRota } from '@/lib/permissoes/frota';

// Celular/tablet: tira o padding largo de desktop, busca ocupa a linha toda,
// grids de 2 colunas em formulário viram 1, tabelas largas rolam por dentro.
const FROTA_RESPONSIVO_CSS = `
@media (max-width: 1024px) {
  .frota-pg { padding-left: 20px !important; padding-right: 20px !important; }
}
@media (max-width: 768px) {
  .frota-pg { padding: 16px 12px !important; }
  .frota-busca { width: 100% !important; min-width: 0 !important; box-sizing: border-box !important; }
  .frota-busca-box { flex: 1 1 100% !important; min-width: 0 !important; }
  .frota-g1 { grid-template-columns: minmax(0, 1fr) !important; }
  .frota-modal-in { padding: 14px !important; }
  .frota-hide-m { display: none !important; }
  .frota-touch { min-height: 36px; }
}
`;

// Gate centralizado do módulo (mesmo padrão do feedbacks/layout.tsx): módulo +
// tela num lugar só, em vez de repetir a checagem em cada page.
export default function FrotaLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const { userProfile } = useAuth();
  const { permissoes, isAdmin, temAcesso, loading } = usePermissoes(userProfile?.id);

  // Só bloqueia DEPOIS que tudo carregou. Durante o loading renderiza o layout
  // normal — trocar a árvore de filhos entre renders confunde o Router do Next.
  if (!loading && userProfile) {
    if (!temAcesso('frota')) return <SemPermissao />;
    const slug = slugDaRota(pathname);
    const perms = permissoes?.modulos_permitidos ?? [];
    if (slug && !podeTelaFrota(perms, isAdmin, slug)) return <SemPermissao />;
  }

  return (
    <div style={{ minHeight: 'calc(100vh - 84px)', background: 'var(--portal-bg)' }}>
      {/* Responsivo do módulo: classes .frota-* usadas pelas telas (estilos são inline,
          então o ajuste de celular precisa de !important). Desktop não muda. */}
      <style>{FROTA_RESPONSIVO_CSS}</style>
      <FrotaNav />
      {children}
    </div>
  );
}
