'use client';
// Submenu interno do módulo Ajustes (aparece em todas as páginas /ajustes via layout).
// Agrupado por DEPARTAMENTO (Financeiro / Estoque / Venda), com divisor gráfico entre eles.
// Mostra só as páginas que o usuário pode acessar (pode('ajustes', '<x>'); admin/total veem todas).
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { PAGINAS_AJUSTES, DEPARTAMENTOS, FUNCOES, type Departamento, type PaginaAjustes } from './paginas';

// Agrupa as páginas visíveis do departamento por função (ordem de FUNCOES);
// página sem função cai em "Outros", no fim.
function porFuncao(dep: Departamento, itens: PaginaAjustes[]): { funcao: string; paginas: PaginaAjustes[] }[] {
  const ordem = FUNCOES[dep] || [];
  const grupos = ordem.map((funcao) => ({ funcao, paginas: itens.filter((p) => p.funcao === funcao) }));
  const soltas = itens.filter((p) => !p.funcao || !ordem.includes(p.funcao));
  if (soltas.length) grupos.push({ funcao: 'Outros', paginas: soltas });
  return grupos.filter((g) => g.paginas.length > 0);
}

export default function AjustesNav() {
  const { userProfile } = useAuth();
  const { pode, loading } = usePermissoes(userProfile?.id);
  const pathname = usePathname();
  // celular: o menu vem recolhido (aberto ocupava a 1ª tela inteira; auditoria 06/11/2026) e fecha ao trocar de página
  const [aberto, setAberto] = useState({ em: pathname, on: false });
  const menuAberto = aberto.em === pathname && aberto.on;

  if (loading) return null;
  const visiveis = PAGINAS_AJUSTES.filter((p) => pode('ajustes', p.key.slice('ajustes:'.length)));
  if (visiveis.length === 0) return null;

  // Blocos por departamento (na ordem de DEPARTAMENTOS), só os que têm páginas visíveis.
  const blocos = DEPARTAMENTOS
    .map((dep) => ({ dep, itens: visiveis.filter((p) => p.departamento === dep.key) }))
    .filter((b) => b.itens.length > 0);

  const linkBase: React.CSSProperties = {
    padding: '4px 10px',
    borderRadius: 6,
    fontSize: '.8rem',
    textDecoration: 'none',
    color: '#334155',
    whiteSpace: 'nowrap',
  };

  const linkPagina = (p: PaginaAjustes) => {
    const ativo = pathname === p.href;
    return (
      <Link
        key={p.key}
        href={p.href}
        style={{
          ...linkBase,
          background: ativo ? '#dc2626' : '#f1f5f9',
          color: ativo ? '#fff' : '#334155',
          fontWeight: ativo ? 600 : 400,
        }}
      >
        {p.label}
      </Link>
    );
  };

  const atual = visiveis.find((p) => p.href === pathname);
  return (
    <nav
      className={`est-nav ajn ${menuAberto ? 'aberto' : ''}`}
      style={{
        background: '#fff',
        borderBottom: '1px solid #e2e8f0',
        padding: '6px 16px',
        marginBottom: 4,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        position: 'sticky',
        top: 0,
        zIndex: 20,
      }}
    >
      <style>{`
        .ajn-botao { display: none }
        @media (max-width: 760px) {
          .est-nav.ajn { position: static !important; padding: 8px 12px !important }
          .est-nav.ajn:not(.aberto) .est-nav-row { display: none !important }
          .ajn-botao { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; min-height: 44px; padding: 0 14px; border: 1px solid var(--portal-border, #e2e8f0); border-radius: 10px; background: var(--portal-bg-secondary, #f8fafc); color: var(--portal-text, #0f172a); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer }
          .ajn-botao small { color: #64748b; font-weight: 400 }
        }
      `}</style>
      <button type="button" className="ajn-botao" aria-expanded={menuAberto} onClick={() => setAberto({ em: pathname, on: !menuAberto })}>
        <span>{atual ? atual.label : 'Páginas de Ajustes'} <small>· trocar de página</small></span>
        <i className={`fas fa-chevron-${menuAberto ? 'up' : 'down'}`} />
      </button>
      {blocos.map(({ dep, itens }, idx) => (
        <div
          key={dep.key}
          className="est-nav-row"
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
            padding: '6px 0',
            borderTop: idx > 0 ? '1px solid #eef2f7' : 'none',
          }}
        >
          {/* divisor gráfico do departamento */}
          <span
            className="est-nav-tag"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: '.68rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '.5px',
              color: dep.cor,
              background: dep.corBg,
              border: `1px solid ${dep.cor}22`,
              borderLeft: `3px solid ${dep.cor}`,
              borderRadius: 6,
              padding: '3px 10px',
              minWidth: 108,
            }}
          >
            <span aria-hidden>{dep.icon}</span> {dep.label}
          </span>
          {FUNCOES[dep.key] ? (
            // Departamento com funções: uma sub-linha por função, com rótulo pequeno.
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
              {porFuncao(dep.key, itens).map(({ funcao, paginas }) => (
                <div key={funcao} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ fontSize: '.66rem', fontWeight: 700, color: dep.cor, textTransform: 'uppercase', letterSpacing: '.4px', minWidth: 118 }}>
                    {funcao}
                  </span>
                  {paginas.map(linkPagina)}
                </div>
              ))}
            </div>
          ) : (
            itens.map(linkPagina)
          )}
        </div>
      ))}
    </nav>
  );
}
