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
  .frota-touch { min-height: 40px; }
  /* Kit da Frota (components/frota/ui.tsx): título 20px, KPIs 2 por linha e
     mais baixos — 4 KPIs empilhados ocupavam a tela inteira antes da lista */
  .frota-cab { margin-bottom: 12px !important; }
  .frota-titulo { font-size: 20px !important; }
  .frota-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 8px !important; margin-bottom: 16px !important; }
  .frota-kpi { padding: 10px 12px !important; }
  .frota-kpi-valor { font-size: 22px !important; }
  .frota-kpi-ctx { font-size: 12px !important; line-height: 1.3; }
  /* Segmentado (Ativos/Vendidos/…) e botão principal ocupam a linha toda */
  .frota-seg { flex: 1 1 100% !important; }
  .frota-seg > button { flex: 1 1 auto; min-height: 40px; }
  .frota-flex1-m { margin-left: 0 !important; flex: 1 1 auto !important; justify-content: center !important; min-height: 44px !important; }
  /* Aba Hoje: placa ocupa a linha (selo à direita), ação vai para a direita */
  .frota-linha-placa { flex: 1 1 auto !important; min-height: 36px; justify-content: center; }
  .frota-acao { display: inline-flex; align-items: center; margin-left: auto; }
  /* Barra de filtros (título + selects): título numa linha, filtros 2 por linha */
  .frota-filtros-m { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px !important; }
  .frota-filtros-m > h2, .frota-filtros-m > h1 { grid-column: 1 / -1; }
  .frota-filtros-m > select, .frota-filtros-m > label, .frota-filtros-m > input { min-height: 42px; width: 100%; box-sizing: border-box; }
  /* Linha de botões de ação de um cartão: ocupa a largura, botões iguais */
  .frota-acoes-m { flex: 1 1 100% !important; flex-wrap: wrap; }
  .frota-acoes-m > button, .frota-acoes-m > a { flex: 1 1 auto; justify-content: center; min-height: 40px; }
  /* Ficha do veículo (VeiculoDrawer): botões de texto pequenos (5px de
     padding) ganham altura de dedo; o "×" dos chips de equipamento fica como está */
  .frota-ficha button:not([title^="Remover"]) { min-height: 36px; }
  .frota-ficha a[href^="/frota/pendencias"] { display: inline-flex; align-items: center; min-height: 36px; }
  .frota-sub-m { flex-basis: 100%; font-size: 13px !important; color: var(--portal-text-secondary) !important; }
  /* TCO: coluna fixa do veículo estreita (placa + modelo quebram), números 12.5px */
  .frota-tco table { font-size: 12.5px; }
  .frota-tco td:first-child, .frota-tco th:first-child { min-width: 132px; max-width: 150px; white-space: normal !important; overflow-wrap: anywhere; box-shadow: 1px 0 0 var(--portal-border); }
  /* Multa: placa à esquerda e valor à direita na 1ª linha; descrição e
     status (select grande) embaixo, na largura toda */
  .frota-multa { gap: 8px 12px !important; padding: 12px !important; }
  .frota-multa-placa { order: 1; }
  .frota-multa-valor { order: 2; margin-left: auto; }
  .frota-multa-desc { order: 3; flex: 1 1 100% !important; min-width: 0 !important; }
  .frota-multa-status { order: 4; flex: 1 1 100%; }
  .frota-multa-status select { min-height: 42px; }
  .frota-multa-desc select, .frota-multa-desc input[type=date] { min-height: 36px; }
  /* Formulário em linha (flex-wrap) → um campo por linha, na largura toda */
  .frota-form-m > * { flex: 1 1 100% !important; min-width: 0 !important; }
  .frota-form-m select, .frota-form-m input { width: 100% !important; min-width: 0 !important; box-sizing: border-box; }
  .frota-form-m > button { justify-content: center; min-height: 46px; }
  /* Álcool × Gasolina: tabela de comparar com letra legível (era 10–12px) */
  .frota-flex-tab th { font-size: 11px !important; }
  .frota-flex-tab td { font-size: 12.5px !important; }
  .frota-full-m { flex: 1 1 100% !important; width: 100% !important; justify-content: center !important; min-height: 44px !important; }
  /* Cartão de veículo mais compacto (cabe placa + selos sem quebrar tanto) */
  .frota-vcard { padding: 12px !important; gap: 12px !important; }
  .frota-vcard-img { width: 60px !important; height: 60px !important; }
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
    <div style={{ minHeight: 'calc(100vh - var(--portal-header-h))', background: 'var(--portal-bg)' }}>
      {/* Responsivo do módulo: classes .frota-* usadas pelas telas (estilos são inline,
          então o ajuste de celular precisa de !important). Desktop não muda. */}
      <style>{FROTA_RESPONSIVO_CSS}</style>
      <FrotaNav />
      {children}
    </div>
  );
}
