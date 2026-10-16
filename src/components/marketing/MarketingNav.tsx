'use client';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { useIsMobile } from '@/hooks/useIsMobile';
import { GRUPOS_MKT, PAGINAS_MARKETING, slugDaPagina } from '@/app/(portal)/marketing/paginas';
import { podeTelaMarketing } from '@/lib/permissoes/marketing';

// Sub-nav do Marketing & Eventos. Mostra só as telas que a pessoa pode ver — a
// fonte é PAGINAS_MARKETING (o mesmo array que alimenta o gate e o catálogo de
// permissões). Guias estilo Chrome na faixa rosa do módulo, igual ao Frota/PPV.
export default function MarketingNav() {
  const pathname = usePathname() ?? '';
  const { userProfile } = useAuth();
  const { permissoes, isAdmin, loading } = usePermissoes(userProfile?.id);
  const isMobile = useIsMobile();
  // celular: a guia ativa pode estar fora da faixa — rola a faixa até ela
  const faixaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const f = faixaRef.current;
    const a = f?.querySelector<HTMLElement>('[data-ativo="1"]');
    if (f && a && isMobile) f.scrollLeft = a.offsetLeft - f.offsetLeft - (f.clientWidth - a.offsetWidth) / 2;
  }, [pathname, isMobile, loading]);

  if (loading) return null;

  const perms = permissoes?.modulos_permitidos ?? [];
  const visiveis = PAGINAS_MARKETING.filter((p) =>
    podeTelaMarketing(perms, isAdmin, slugDaPagina(p)),
  );
  // Uma faixa colorida com uma aba só é ruído — some.
  if (visiveis.length <= 1) return null;

  return (
    <div
      ref={faixaRef}
      // celular: uma linha só que rola de lado (antes quebrava em 2 linhas de guias)
      className="print:hidden m-rolar-x"
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 3,
        padding: isMobile ? '8px 12px 0' : '10px 24px 0',
        background: 'linear-gradient(135deg, #F472B6, #9D174D)',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch', // celular: as guias rolam DENTRO da faixa
        boxShadow: '0 1px 4px var(--portal-shadow)',
        flexWrap: 'wrap',
      }}
    >
      {GRUPOS_MKT.map((grupo) => {
        const doGrupo = visiveis.filter((p) => p.grupo === grupo);
        if (doGrupo.length === 0) return null;
        return doGrupo.map((p) => {
          const ativo =
            p.href === '/marketing' ? pathname === '/marketing' : pathname.startsWith(p.href);
          return (
            <Link
              key={p.key}
              href={p.href}
              data-ativo={ativo ? '1' : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: isMobile ? '10px 14px' : '11px 20px',
                fontSize: isMobile ? 13.5 : 14,
                flexShrink: 0,
                fontWeight: ativo ? 700 : 500,
                color: '#111111', // preto sempre (#111827 é remapeado pra branco no escuro)
                // #fefefe: branco que o modo escuro NÃO converte (o #fff vira card escuro)
                background: ativo ? '#fefefe' : 'rgba(255,255,255,0.30)',
                borderRadius: '11px 11px 0 0',
                boxShadow: ativo ? '0 -2px 6px rgba(0,0,0,0.15)' : 'none',
                textDecoration: 'none',
                transition: '0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              {p.label}
            </Link>
          );
        });
      })}
    </div>
  );
}
