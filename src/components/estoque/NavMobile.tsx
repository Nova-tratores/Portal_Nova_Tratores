'use client';
// Submenu do módulo (Estoque / Ajustes) na versão CELULAR. No computador o
// EstoqueNav/AjustesNav seguem com as linhas por grupo; no celular aquelas
// 4–5 linhas comiam meia tela. Aqui vira UMA barra: "módulo · página atual ▾"
// e o toque abre uma folha de baixo com todas as páginas, agrupadas.
import { useState } from 'react';
import Link from 'next/link';

export interface NavMobileGrupo {
  key: string;
  label: string;
  icon: string;
  cor: string;
  corBg: string;
  itens: Array<{ key: string; label: string; href: string }>;
}

export default function NavMobile({ modulo, icone, grupos, pathname }: {
  modulo: string;
  icone: string;
  grupos: NavMobileGrupo[];
  pathname: string;
}) {
  const [aberto, setAberto] = useState(false);
  // A folha fecha no toque do link (onClick abaixo).

  const todos = grupos.flatMap((g) => g.itens.map((i) => ({ ...i, grupo: g })));
  const atual = todos.find((i) => i.href === pathname)
    // sub-rotas (ex.: /ajustes/encerramentos/123) caem na página-mãe mais longa
    || todos.filter((i) => i.href !== '/' && pathname.startsWith(i.href + '/')).sort((a, b) => b.href.length - a.href.length)[0];

  return (
    <>
      <nav style={{ background: 'var(--portal-bg-card, #fff)', borderBottom: '1px solid var(--portal-border, #e2e8f0)', padding: '8px 12px' }}>
        <button
          type="button"
          onClick={() => setAberto(true)}
          aria-haspopup="dialog"
          style={{
            width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 10,
            padding: '6px 12px', borderRadius: 10, border: '1px solid var(--portal-border, #e2e8f0)',
            background: 'var(--portal-bg, #f8fafc)', color: 'var(--portal-text, #1e293b)', cursor: 'pointer', textAlign: 'left',
          }}
        >
          <span aria-hidden style={{ fontSize: 18 }}>{icone}</span>
          <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
            <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.5px', color: atual?.grupo.cor || 'var(--portal-text-secondary, #64748b)' }}>
              {modulo}{atual ? ` · ${atual.grupo.label}` : ''}
            </span>
            <span style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {atual?.label || 'Escolher página'}
            </span>
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#dc2626', whiteSpace: 'nowrap' }}>Páginas ▾</span>
        </button>
      </nav>

      {aberto && (
        <div
          className="m-folha-fundo"
          onClick={() => setAberto(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,.5)', display: 'flex' }}
        >
          <div
            className="m-folha"
            role="dialog"
            aria-label={`Páginas do ${modulo}`}
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'var(--portal-bg-card, #fff)', color: 'var(--portal-text, #1e293b)', overflowY: 'auto', width: '100%' }}
          >
            <div style={{ position: 'sticky', top: 0, background: 'var(--portal-bg-card, #fff)', display: 'flex', alignItems: 'center', padding: '10px 12px 8px 16px', borderBottom: '1px solid var(--portal-border, #e2e8f0)', zIndex: 1 }}>
              <span style={{ fontSize: 17, fontWeight: 800, flex: 1 }}>{icone} {modulo}</span>
              <button type="button" onClick={() => setAberto(false)} aria-label="Fechar"
                style={{ width: 44, height: 44, border: 'none', background: 'transparent', fontSize: 24, lineHeight: 1, color: 'var(--portal-text-secondary, #64748b)', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: '6px 12px 16px' }}>
              {grupos.map((g) => (
                <div key={g.key} style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.5px', color: g.cor, padding: '4px 4px 6px', borderBottom: `2px solid ${g.cor}33` }}>
                    <span aria-hidden>{g.icon}</span> {g.label}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6, marginTop: 6 }}>
                    {g.itens.map((p) => {
                      const ativo = p.href === atual?.href;
                      return (
                        <Link key={p.key} href={p.href} onClick={() => setAberto(false)}
                          style={{
                            minHeight: 44, display: 'flex', alignItems: 'center', padding: '8px 10px', borderRadius: 8,
                            fontSize: 14, fontWeight: ativo ? 700 : 500, textDecoration: 'none', lineHeight: 1.2,
                            background: ativo ? '#dc2626' : 'var(--portal-bg, #f1f5f9)',
                            color: ativo ? '#fefefe' : 'var(--portal-text, #334155)',
                            border: `1px solid ${ativo ? '#dc2626' : 'var(--portal-border, #e2e8f0)'}`,
                          }}>
                          {p.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
