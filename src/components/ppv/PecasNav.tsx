'use client';
// Barra do SETOR PEÇAS (José, 10/11/2026: "o que tem nessa barra tem que ser igual ao que aparece na dashboard").
// Guias de cima = os módulos do setor Peças da dashboard (src/lib/dashboard/setores.ts), mesmos nomes, mesma
// ordem e mesma regra de permissão — Requisições saiu (fica em Adicionais). As telas DE DENTRO de um módulo
// (ex.: Pré-Pedido, Dashboard, Catálogo, Etiquetas e Retiradas no Pedidos de Peças) vêm na prop `sub` e
// aparecem numa segunda linha, menor, embaixo das guias.
import type { ReactNode } from 'react';
import { MODULOS } from '@/lib/dashboard/setores';
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
/* celular + tema escuro (auditoria 06/11/2026): no celular o globals.css pinta a faixa de branco e o seletor de
   cinza-claro fixos — no escuro ela ficava clara (PPV, Orçamentos, Requisições) */
@media (max-width: 768px) {
  [data-theme="dark"] .ppv-topbar { background: var(--portal-bg-card); color: var(--portal-text); }
  [data-theme="dark"] .ppv-topbar-actions { background: var(--portal-bg-secondary); }
  [data-theme="dark"] .ppv-topbar-nav-btn:not(.active) { color: var(--portal-text-secondary); }
}
`;

/** Telas de dentro do Pedidos de Peças (2ª linha), iguais no /ppv e no /ppv/unidades. */
export function subAbasPPV(o: {
  ativo: 'kanban' | 'dash' | 'catalogo' | 'etiquetas' | 'retiradas';
  podeCatalogo: boolean; podeEtiquetas: boolean; podeRetiradas: boolean; badgeRetiradas?: ReactNode;
  ir?: (aba: 'kanban' | 'dash' | 'catalogo' | 'etiquetas') => void; // no /ppv troca de aba sem recarregar
}): SubAbaPecas[] {
  const link = (aba: 'kanban' | 'dash' | 'catalogo' | 'etiquetas', href: string) => o.ir ? { onClick: () => o.ir!(aba) } : { href };
  return [
    { chave: 'kanban', label: 'Pré-Pedido de Venda', icone: 'fa-th-large', ativo: o.ativo === 'kanban', ...link('kanban', '/ppv') },
    { chave: 'dash', label: 'Dashboard', icone: 'fa-chart-simple', ativo: o.ativo === 'dash', titulo: 'Valor e quantidade de pedidos por data, técnico, cliente, previsão de faturamento e fase', ...link('dash', '/ppv?tab=dashboard') },
    ...(o.podeCatalogo ? [{ chave: 'catalogo', label: 'Catálogo', icone: 'fa-cogs', ativo: o.ativo === 'catalogo', ...link('catalogo', '/ppv/catalogo') }] : []),
    ...(o.podeEtiquetas ? [{ chave: 'etiquetas', label: 'Etiquetas', icone: 'fa-tags', ativo: o.ativo === 'etiquetas', titulo: 'Imprimir etiquetas de identificação de peças (código por empresa)', ...link('etiquetas', '/ppv?tab=etiquetas') }] : []),
    ...(o.podeRetiradas ? [{ chave: 'retiradas', label: 'Retiradas', icone: 'fa-qrcode', ativo: o.ativo === 'retiradas', href: '/ppv/unidades', titulo: 'Rastreio de unidades (QR): fila de retiradas pra liberar', extra: o.badgeRetiradas }] : []),
  ];
}

/** Uma aba da segunda linha (telas de dentro do módulo). */
export interface SubAbaPecas { chave: string; label: string; icone: string; ativo: boolean; onClick?: () => void; href?: string; titulo?: string; extra?: ReactNode }

export default function PecasNav({ sub }: { sub?: SubAbaPecas[] } = {}) {
  const pathname = usePathname() ?? '';
  const { userProfile } = useAuth();
  const { temAcesso, pode, loading } = usePermissoes(userProfile?.id);

  if (loading || !userProfile) return null;

  const modulos = MODULOS.filter((m) => m.setor === 'pecas' && (!m.modulo || (m.acao ? pode(m.modulo, m.acao) : temAcesso(m.modulo))));
  // guia ativa = módulo de rota mais específica que bate com a página (/estoque/recebimentos ganha de /estoque)
  const ativo = modulos
    .filter((m) => pathname === m.href || pathname.startsWith(m.href + '/'))
    .sort((x, y) => y.href.length - x.href.length)[0]?.id;

  return (
    <>
      {modulos.length > 1 && (
        <div className="ppv-topbar ppv-x-topbar">
          <style>{PECAS_TOPBAR_CSS + SUB_CSS}</style>
          <div className="ppv-topbar-actions">
            {modulos.map((m) => {
              const Ic = m.icon;
              return (
                <a key={m.id} href={m.href} className={`ppv-topbar-nav-btn ${m.id === ativo ? 'active' : ''}`} style={{ textDecoration: 'none' }} title={m.frase}>
                  <Ic size={16} /> {m.nome}
                </a>
              );
            })}
          </div>
        </div>
      )}
      {sub && sub.length > 1 && (
        <div className="ppv-subabas">
          {modulos.length <= 1 && <style>{SUB_CSS}</style>}
          {sub.map((a) => {
            const conteudo = <><i className={`fas ${a.icone}`} /> {a.label}{a.extra}</>;
            return a.href
              ? <a key={a.chave} href={a.href} title={a.titulo} className={`ppv-subaba ${a.ativo ? 'ativa' : ''}`}>{conteudo}</a>
              : <button key={a.chave} type="button" onClick={a.onClick} title={a.titulo} className={`ppv-subaba ${a.ativo ? 'ativa' : ''}`}>{conteudo}</button>;
          })}
        </div>
      )}
    </>
  );
}

// segunda linha: pílulas pequenas no fundo da aba ativa (#f1f5f9), coladas embaixo das guias
const SUB_CSS = `
.ppv-subabas { display: flex; align-items: center; gap: 6px; padding: 8px 24px; background: #f1f5f9; border-bottom: 1px solid #e2e8f0; overflow-x: auto; scrollbar-width: none; flex-shrink: 0; }
.ppv-subabas::-webkit-scrollbar { display: none; }
.ppv-subaba { position: relative; display: inline-flex; align-items: center; gap: 7px; padding: 7px 14px; border-radius: 999px; border: 1px solid transparent; background: transparent;
  font-family: 'Poppins', sans-serif; font-size: 13.5px; font-weight: 500; color: #475569; cursor: pointer; white-space: nowrap; text-decoration: none; transition: background .15s, color .15s; }
.ppv-subaba:hover:not(.ativa) { background: #fff; color: #0f172a; border-color: #e2e8f0; }
.ppv-subaba.ativa { background: #fff; color: #ea580c; border-color: #fdba74; font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
.ppv-subaba i { font-size: 12.5px; }
[data-theme="dark"] .ppv-subabas { background: var(--portal-bg-secondary); border-color: var(--portal-border); }
[data-theme="dark"] .ppv-subaba { color: var(--portal-text-secondary); }
[data-theme="dark"] .ppv-subaba:hover:not(.ativa), [data-theme="dark"] .ppv-subaba.ativa { background: var(--portal-bg-card); border-color: var(--portal-border); }
[data-theme="dark"] .ppv-subaba.ativa { color: #fb923c; }
@media (max-width: 768px) { .ppv-subabas { padding: 6px 10px; } .ppv-subaba { padding: 6px 11px; font-size: 13px; } }
`;
