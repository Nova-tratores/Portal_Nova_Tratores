'use client';
// Barra PADRONIZADA do sistema PEÇAS: as MESMAS guias (estilo Chrome, faixa
// laranja, classes .ppv-topbar) em todas as telas do módulo — Gestão, Catálogo,
// Etiquetas, Retiradas, Orçamentos e Requisições. No /ppv a própria página
// renderiza a barra (Gestão/Catálogo/Etiquetas são abas internas de lá); este
// componente é a mesma barra pras telas irmãs, com links de volta.
// Só mostra as guias que a pessoa tem permissão de ver (módulos do Admin).
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';

export default function PecasNav() {
  const pathname = usePathname() ?? '';
  const { userProfile } = useAuth();
  const { temAcesso, pode, loading } = usePermissoes(userProfile?.id);

  if (loading || !userProfile) return null;

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
    <div className="ppv-topbar">
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
