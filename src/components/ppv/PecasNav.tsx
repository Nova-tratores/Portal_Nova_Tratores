'use client';
// Barra PADRONIZADA do sistema PEÇAS: as MESMAS guias (estilo Chrome, faixa
// laranja, classes .ppv-topbar) em todas as telas do módulo — Gestão, Catálogo,
// Etiquetas, Retiradas, Orçamentos e Requisições. No /ppv a própria página
// renderiza a barra (Gestão/Catálogo/Etiquetas são abas internas de lá); este
// componente é a mesma barra pras telas irmãs, com links de volta.
// Só mostra as guias que a pessoa tem permissão de ver (módulos do Admin).
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';

// Responsividade da faixa (PC estreito / tablet / notebook com menu aberto): as
// guias rolam na horizontal DENTRO da faixa em vez de serem cortadas. O padding
// de 11px preserva os cantos côncavos da guia ativa (::before/::after) e o
// badge do "Retiradas" (top:-6px), que o overflow cortaria; a margem negativa
// mantém a posição de hoje no desktop largo (onde nada rola). No celular
// (≤768px) quem manda é o globals.css (segmented control).
export const PECAS_TOPBAR_CSS = `
@media (min-width: 769px) {
  .ppv-x-topbar .ppv-topbar-actions {
    min-width: 0; overflow-x: auto; overflow-y: hidden;
    margin-left: -11px; padding: 8px 11px 0; scrollbar-width: none;
  }
  .ppv-x-topbar .ppv-topbar-actions::-webkit-scrollbar { display: none; }
  .ppv-x-topbar .ppv-topbar-nav-btn { flex-shrink: 0; }
}
@media (min-width: 769px) and (max-width: 1279px) {
  .ppv-x-topbar { padding: 0 14px; }
  .ppv-x-topbar .ppv-topbar-nav-btn { padding: 11px 16px; font-size: 14px; }
}
@media (min-width: 769px) and (max-width: 1023px) {
  .ppv-x-topbar .ppv-topbar-nav-btn { padding: 10px 12px; font-size: 13px; gap: 6px; }
}
/* CELULAR: segmentado que ROLA de lado (6 guias não cabem em 390px). Cada guia
   no tamanho do texto (sem flex:1 espremendo), ativa na cor do módulo (laranja,
   não o vermelho genérico do globals) e a página leva a ativa até a vista. */
@media (max-width: 768px) {
  .ppv-x-topbar .ppv-topbar-actions {
    overflow-x: auto; overflow-y: hidden; scrollbar-width: none; scroll-snap-type: x proximity;
    -webkit-overflow-scrolling: touch; box-sizing: border-box; max-width: 100%; min-width: 0;
  }
  .ppv-x-topbar .ppv-topbar-actions::-webkit-scrollbar { display: none; }
  .ppv-x-topbar .ppv-topbar-nav-btn {
    flex: 0 0 auto !important; min-height: 40px; padding: 9px 13px !important; font-size: 13px !important;
    color: #475569; scroll-snap-align: start;
  }
  .ppv-x-topbar .ppv-topbar-nav-btn.active {
    background: #EA580C !important; color: #fefefe !important; box-shadow: 0 2px 6px rgba(234,88,12,0.30) !important;
  }
}
`;

/** Celular: rola a faixa de guias até a ativa ficar visível (chamar num useEffect). */
export function rolarGuiaAtiva() {
  if (typeof window === 'undefined' || window.innerWidth > 768) return;
  const rolar = () => document.querySelectorAll<HTMLElement>('.ppv-x-topbar .ppv-topbar-nav-btn.active').forEach((el) => {
    const pai = el.parentElement;
    if (pai) pai.scrollLeft += el.getBoundingClientRect().left - pai.getBoundingClientRect().left - 12;
  });
  requestAnimationFrame(rolar);
  setTimeout(rolar, 600); // a faixa pode montar depois (permissões carregando)
}

export default function PecasNav() {
  const pathname = usePathname() ?? '';
  const { userProfile } = useAuth();
  const { temAcesso, pode, loading } = usePermissoes(userProfile?.id);
  const pronto = !loading && !!userProfile;
  useEffect(() => { if (pronto) rolarGuiaAtiva(); }, [pronto, pathname]);

  if (!pronto) return null;

  const abas = [
    { ok: temAcesso('ppv'), icone: 'fa-th-large', label: 'Pré-Pedido de Venda', href: '/ppv', ativo: pathname === '/ppv' },
    { ok: temAcesso('ppv') && pode('ppv', 'catalogo'), icone: 'fa-cogs', label: 'Catálogo', href: '/ppv/catalogo', ativo: pathname.startsWith('/ppv/catalogo') },
    { ok: temAcesso('ppv') && pode('ppv', 'etiquetas'), icone: 'fa-tags', label: 'Etiquetas', href: '/ppv?tab=etiquetas', ativo: false },
    { ok: temAcesso('ppv') && pode('ppv', 'rastreio_liberar'), icone: 'fa-qrcode', label: 'Retiradas', href: '/ppv/unidades', ativo: pathname.startsWith('/ppv/unidades') },
    { ok: temAcesso('orcamentos'), icone: 'fa-calculator', label: 'Orçamentos', href: '/orcamentos', ativo: pathname.startsWith('/orcamentos') },
    { ok: temAcesso('requisicoes'), icone: 'fa-clipboard-list', label: 'Requisições', href: '/requisicoes', ativo: pathname.startsWith('/requisicoes') },
  ].filter((a) => a.ok);

  if (abas.length <= 1) return null; // só uma tela liberada → barra não ajuda

  return (
    <div className="ppv-topbar ppv-x-topbar">
      <style>{PECAS_TOPBAR_CSS}</style>
      <div className="ppv-topbar-actions">
        {abas.map((a) => (
          <a
            key={a.label}
            href={a.href}
            className={`ppv-topbar-nav-btn ${a.ativo ? 'active' : ''}`}
            style={{ textDecoration: 'none' }}
          >
            <i className={`fas ${a.icone}`} /> {a.label}
          </a>
        ))}
      </div>
    </div>
  );
}
