'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { ABAS_MARKETING, GRUPOS_MKT, PAGINAS_MARKETING, slugDaPagina } from '@/app/(portal)/marketing/paginas';
import '@/components/abas-modulo.css';
import { podeTelaMarketing, slugDaRota } from '@/lib/permissoes/marketing';

// Faixa de guias do Controle Marketing (Site + Marketing & Eventos juntos, 18/11/2026).
// Dois grupos — Redes sociais e Eventos — cada um com o nome antes das guias dele.
// Mostra só as telas que a pessoa pode ver; a fonte é ABAS_MARKETING / PAGINAS_MARKETING
// (o mesmo arquivo que alimenta o gate e o catálogo de permissões). Guias estilo Chrome.
export default function MarketingNav() {
  const pathname = usePathname() ?? '';
  const { userProfile } = useAuth();
  const { permissoes, isAdmin, loading } = usePermissoes(userProfile?.id);

  if (loading) return null;

  const perms = permissoes?.modulos_permitidos ?? [];
  const pode = (key: string) => {
    const p = PAGINAS_MARKETING.find((x) => x.key === key);
    return !!p && podeTelaMarketing(perms, isAdmin, slugDaPagina(p));
  };
  // cada guia abre a primeira tela dela que a pessoa pode ver
  const visiveis = ABAS_MARKETING
    .map((a) => ({ ...a, telas: a.telas.filter(pode) }))
    .filter((a) => a.telas.length)
    .map((a) => ({
      ...a,
      href: PAGINAS_MARKETING.find((p) => p.key === a.telas[0])!.href,
      slugs: a.telas.map((t) => t.slice('marketing:'.length)),
    }));
  // Uma faixa colorida com uma guia só é ruído — some.
  if (visiveis.length <= 1) return null;

  const atual = slugDaRota(pathname);

  return (
    <div
      className="print:hidden aba-faixa"
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 3,
        padding: '10px clamp(12px, 2vw, 28px) 0',
        background: 'linear-gradient(135deg, #F472B6, #9D174D)',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch', // celular: as guias rolam DENTRO da faixa
        boxShadow: '0 1px 4px var(--portal-shadow)',
        flexWrap: 'nowrap',
      }}
    >
      {GRUPOS_MKT.map((grupo, i) => {
        const doGrupo = visiveis.filter((a) => a.grupo === grupo);
        if (doGrupo.length === 0) return null;
        // 19/11/2026 (José: "melhora onde diz que é rede ou eventos"): o nome do grupo virou uma
        // etiqueta escura com ícone, e uma linha branca separa os dois grupos.
        return [
          i > 0 && (
            <span key={`sep-${grupo}`} aria-hidden style={{ alignSelf: 'stretch', width: 2, margin: '2px 6px 8px 10px', borderRadius: 2, background: 'rgba(255,255,255,0.55)', flex: 'none' }} />
          ),
          <span
            key={`g-${grupo}`}
            style={{
              alignSelf: 'center',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              margin: '0 6px 6px 0',
              padding: '6px 12px',
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 700,
              color: '#fefefe',
              background: 'rgba(0,0,0,0.28)',
              whiteSpace: 'nowrap',
              flex: 'none',
            }}
          >
            <i className={grupo === 'Redes sociais' ? 'fa-solid fa-share-nodes' : 'fa-solid fa-calendar-check'} />
            {grupo}
          </span>,
          ...doGrupo.map((a) => {
            const ativo = a.slugs.includes(atual);
            return (
              <Link
                key={a.label}
                href={a.href}
                className={`aba-guia${ativo ? ' aba-ativa' : ''}`}
                style={{
                  padding: '11px 20px',
                  fontSize: 14,
                  fontWeight: ativo ? 700 : 500,
                  color: '#111111', // preto sempre (#111827 é remapeado pra branco no escuro)
                  // #fefefe: branco que o modo escuro NÃO converte (o #fff vira card escuro)
                  background: ativo ? '#fefefe' : 'rgba(255,255,255,0.30)',
                  borderRadius: '11px 11px 0 0',
                  boxShadow: ativo ? '0 -2px 6px rgba(0,0,0,0.15)' : 'none',
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                {a.label}
              </Link>
            );
          }),
        ];
      })}
    </div>
  );
}
