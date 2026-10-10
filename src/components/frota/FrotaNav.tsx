'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { useIsMobile } from '@/hooks/useIsMobile';
import { ABAS_FROTA, PAGINAS_FROTA, paginaDaRota, slugDaPagina } from '@/app/(portal)/frota/paginas';
import { podeTelaFrota } from '@/lib/permissoes/frota';
import AjudaTela from '@/components/dre-financeiro/AjudaTela';
import { ajudaFrota } from '@/lib/frota/ajuda';

// Faixa do Frota em DOIS níveis (10/10/2026): em cima as 6 abas por pergunta
// (Hoje · Veículos · Manutenção · Combustível · Pessoas · Custos); embaixo, as
// sub-guias da aba ativa quando ela tem mais de uma página. Mostra só o que a
// pessoa pode ver — a fonte é PAGINAS_FROTA (a mesma do gate e do catálogo).
export default function FrotaNav() {
  const pathname = usePathname() ?? '';
  const { userProfile } = useAuth();
  const { permissoes, isAdmin, loading } = usePermissoes(userProfile?.id);
  // celular: guias numa linha só, rolando DENTRO da faixa (sem empilhar linhas)
  const mobile = useIsMobile();

  if (loading) return null;

  const perms = permissoes?.modulos_permitidos ?? [];
  const visiveis = PAGINAS_FROTA.filter((p) => podeTelaFrota(perms, isAdmin, slugDaPagina(p)));
  if (visiveis.length === 0) return null;

  const ativa = paginaDaRota(pathname, visiveis);
  const abas = ABAS_FROTA
    .map((a) => ({ ...a, paginas: visiveis.filter((p) => p.aba === a.id) }))
    .filter((a) => a.paginas.length > 0);
  const abaAtiva = abas.find((a) => a.id === ativa?.aba) || null;

  return (
    <div>
      {/* 1º nível: guias estilo Chrome na FAIXA AZUL do módulo */}
      <nav
        aria-label="Seções da Frota"
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 3,
          padding: mobile ? '8px 12px 0' : '10px 24px 0',
          background: 'linear-gradient(135deg, #3B82F6, #1E3A8A)',
          overflowX: 'auto', WebkitOverflowScrolling: 'touch',
          boxShadow: '0 1px 4px var(--portal-shadow)',
          flexWrap: 'nowrap',
        }}
      >
        {abas.map((a) => {
          const ehAtiva = a.id === abaAtiva?.id;
          return (
            <Link
              key={a.id}
              href={a.paginas[0].href}
              aria-current={ehAtiva ? 'page' : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: mobile ? '10px 14px' : '11px 22px',
                fontSize: mobile ? 13.5 : 14.5,
                flexShrink: 0,
                fontWeight: ehAtiva ? 800 : 600,
                color: '#111111', // fonte PRETA sempre (#111827 era remapeado pra branco no escuro)
                // #fefefe: branco "de verdade" que o modo escuro NÃO converte (o #fff vira card escuro)
                background: ehAtiva ? '#fefefe' : 'rgba(255,255,255,0.30)',
                borderRadius: '11px 11px 0 0',
                boxShadow: ehAtiva ? '0 -2px 6px rgba(0,0,0,0.15)' : 'none',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {a.label}
            </Link>
          );
        })}
        {/* "?" da tela ativa (legenda dos selos e termos) — some se a tela não tem texto */}
        <span style={{ marginLeft: 'auto', alignSelf: 'center', paddingBottom: 8, paddingLeft: 8, flexShrink: 0 }}>
          <AjudaTela pathname={ativa?.href || pathname} cor="#1e40af" buscar={ajudaFrota} nota={null} />
        </span>
      </nav>

      {/* 2º nível: sub-guias da aba ativa (só quando ela tem mais de uma página) */}
      {abaAtiva && abaAtiva.paginas.length > 1 && (
        <nav
          aria-label={`Páginas de ${abaAtiva.label}`}
          style={{
            display: 'flex',
            gap: mobile ? 2 : 6,
            padding: mobile ? '0 12px' : '0 24px',
            background: 'var(--portal-bg-card)',
            borderBottom: '1px solid var(--portal-border)',
            overflowX: 'auto', WebkitOverflowScrolling: 'touch',
          }}
        >
          {abaAtiva.paginas.map((p) => {
            const ehAtiva = p.href === ativa?.href;
            return (
              <Link
                key={p.href}
                href={p.href}
                aria-current={ehAtiva ? 'page' : undefined}
                style={{
                  padding: mobile ? '10px 10px 8px' : '11px 14px 9px',
                  fontSize: mobile ? 13 : 13.5,
                  fontWeight: ehAtiva ? 700 : 500,
                  color: 'var(--portal-text)',
                  borderBottom: `3px solid ${ehAtiva ? '#1e40af' : 'transparent'}`,
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {p.label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
