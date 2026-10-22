'use client';
// =============================================================================
// INTELIGÊNCIA DE VENDAS — tudo numa página só (José, 21/10/2026: "juntar todos os
// módulos em uma página, separando por módulos dentro dela com as bolinhas lá em cima,
// e colocar no módulo comercial"). As 10 telas que eram abas viram bolinhas, em 4 grupos
// (Prospectar · Mercado · Ferramentas · Equipe); clicar troca o módulo embaixo, sem sair
// da página. Cada módulo é a MESMA tela de antes (carregada só quando é aberta).
// Só aparecem as bolinhas que a pessoa pode ver (permissão por tela, como nas abas).
// ?m=<slug> abre direto num módulo e fica na URL (dá para mandar o link).
// =============================================================================
import { Suspense, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { podeTelaIV } from '@/app/(portal)/inteligencia-vendas/paginas';

const carregando = () => <div style={{ padding: 60, textAlign: 'center', color: 'var(--portal-text-muted, #64748b)' }}><i className="fas fa-spinner fa-spin" /> Abrindo o módulo…</div>;
const TELAS: Record<string, React.ComponentType> = {
  'como-escolhemos': dynamic(() => import('./ComoEscolhemos'), { ssr: false, loading: carregando }),
  prospeccao: dynamic(() => import('./ProspeccaoPagina'), { ssr: false, loading: carregando }),
  oportunidades: dynamic(() => import('./Oportunidades').then((m) => { const O = m.default; const C = () => <O topo="C" />; return C; }), { ssr: false, loading: carregando }),
  retorno: dynamic(() => import('./Retorno'), { ssr: false, loading: carregando }),
  noticias: dynamic(() => import('./BoletimOpcoes').then((m) => { const B = m.default; const C = () => <B layout="jornal" />; return C; }), { ssr: false, loading: carregando }),
  municipios: dynamic(() => import('./Municipios'), { ssr: false, loading: carregando }),
  concorrencia: dynamic(() => import('./Concorrencia'), { ssr: false, loading: carregando }),
  empresas: dynamic(() => import('./Empresas'), { ssr: false, loading: carregando }),
  calculadora: dynamic(() => import('./Calculadora'), { ssr: false, loading: carregando }),
  indicacoes: dynamic(() => import('./Indicacoes'), { ssr: false, loading: carregando }),
  equipe: dynamic(() => import('./Equipe'), { ssr: false, loading: carregando }),
};

// livre = explicativo, sem dados: aparece para todos que entram na IV (sem permissão própria)
type Modulo = { slug: string; nome: string; icone: string; dica: string; livre?: boolean };
type Grupo = { nome: string; cor: string; modulos: Modulo[] };
export const GRUPOS_IV: Grupo[] = [
  { nome: 'Prospectar', cor: '#dc2626', modulos: [
    { slug: 'como-escolhemos', nome: 'Como escolhemos', icone: 'fa-diagram-project', dica: 'De onde vêm os dados e como viram a nota de cada cliente.', livre: true },
    { slug: 'prospeccao', nome: 'Prospecção', icone: 'fa-route', dica: 'Por onde começar: carteira, recuperar, clientes novos e território, com o Tratorilson explicando.' },
    { slug: 'oportunidades', nome: 'Oportunidades', icone: 'fa-bullseye', dica: 'Clientes da carteira com motivo para ligar hoje: renovar, implemento, outra marca, sumiu…' },
    { slug: 'retorno', nome: 'Sem retorno', icone: 'fa-hourglass-half', dica: 'Propostas e negócios parados esperando resposta do cliente.' },
  ] },
  { nome: 'Mercado', cor: '#0f766e', modulos: [
    { slug: 'noticias', nome: 'Notícias', icone: 'fa-newspaper', dica: 'O boletim do agro de hoje e as taxas do Plano Safra, atualizados sozinhos.' },
    { slug: 'municipios', nome: 'Municípios', icone: 'fa-map-location-dot', dica: 'Onde está o potencial: área plantada, rebanho, crédito e nossa presença em cada cidade.' },
    { slug: 'concorrencia', nome: 'Concorrência', icone: 'fa-chess', dica: 'Para quem perdemos negócio, por quê e com qual marca.' },
    { slug: 'empresas', nome: 'Empresas', icone: 'fa-building', dica: 'CNPJs rurais da carteira e empresas novas da região.' },
  ] },
  { nome: 'Ferramentas', cor: '#7c3aed', modulos: [
    { slug: 'calculadora', nome: 'Calculadora', icone: 'fa-calculator', dica: 'Simule o financiamento: parcela, prazo e a taxa da linha certa.' },
    { slug: 'indicacoes', nome: 'Indicações', icone: 'fa-handshake', dica: 'Quem indicou quem: registre e acompanhe as indicações.' },
  ] },
  { nome: 'Equipe', cor: '#2563eb', modulos: [
    { slug: 'equipe', nome: 'Equipe', icone: 'fa-users', dica: 'Como cada vendedor está: visitas, negócios, propostas e vendas no período.' },
  ] },
];

function ComPermissao() {
  const { userProfile } = useAuth();
  const { permissoes, isAdmin, loading } = usePermissoes(userProfile?.id);
  const perms = useMemo(() => permissoes?.modulos_permitidos ?? [], [permissoes]);
  // só os módulos que a pessoa pode ver
  return <CentralCorpo pode={(slug) => loading || podeTelaIV(perms, isAdmin, slug)} />;
}

/** A página em si; `pode` diz se a bolinha do módulo aparece. */
export function CentralCorpo({ pode }: { pode: (slug: string) => boolean }) {
  const router = useRouter();
  const sp = useSearchParams();
  const grupos = GRUPOS_IV
    .map((g) => ({ ...g, modulos: g.modulos.filter((m) => m.livre || pode(m.slug)) }))
    .filter((g) => g.modulos.length);
  const todos = grupos.flatMap((g) => g.modulos.map((m) => ({ ...m, cor: g.cor, grupo: g.nome })));

  // o módulo aberto vem do endereço (?m=): troca na hora e dá para mandar o link
  const [clicado, setClicado] = useState<string | null>(null); // resposta imediata ao clique, antes da URL atualizar
  const atual = clicado ?? sp?.get('m') ?? '';
  // sem ?m= abre no 1º módulo de trabalho (a apresentação 'Como escolhemos' só quando clicada)
  const ativo = todos.find((m) => m.slug === atual) || todos.find((m) => !m.livre) || todos[0];
  const idx = ativo ? todos.indexOf(ativo) : 0;

  const ir = (slug: string) => {
    setClicado(slug);
    const q = new URLSearchParams(sp?.toString() || '');
    q.set('m', slug);
    router.replace(`?${q.toString()}`, { scroll: false });
  };

  if (!ativo) return null;
  const Tela = TELAS[ativo.slug];
  return (
    <div>
      <style>{ESTILO}</style>
      <div className="civ-topo">
        <div className="civ-grupos">
          {grupos.map((g) => (
            <div key={g.nome} className="civ-grupo" style={{ ['--k' as string]: g.cor }}>
              <span className={`civ-grupo-nome ${g.modulos.some((m) => m.slug === ativo.slug) ? 'on' : ''}`}>{g.nome}</span>
              <div className="civ-bols" role="tablist" aria-label={g.nome}>
                {g.modulos.map((m) => {
                  const on = m.slug === ativo.slug;
                  return (
                    <button key={m.slug} type="button" role="tab" aria-selected={on} title={m.nome} onClick={() => ir(m.slug)}
                      className={`civ-bol ${on ? 'on' : ''}`}>
                      <span className="civ-bol-ic"><i className={`fas ${m.icone}`} /></span>
                      <span className="civ-bol-nome">{m.nome}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="civ-trilho"><span style={{ width: `${todos.length > 1 ? (idx / (todos.length - 1)) * 100 : 100}%`, background: ativo.cor }} /></div>
        <p className="civ-dica" key={ativo.slug} style={{ ['--k' as string]: ativo.cor }}>
          <b><i className={`fas ${ativo.icone}`} /> {ativo.nome}</b> · {ativo.dica}
        </p>
      </div>
      <div className="civ-modulo" key={ativo.slug}>
        <Suspense fallback={carregando()}><Tela /></Suspense>
      </div>
    </div>
  );
}

export default function CentralIV() {
  return <Suspense fallback={null}><ComPermissao /></Suspense>;
}

const ESTILO = `
  .civ-topo { position: sticky; top: 0; z-index: 20; background: var(--portal-bg, #f8fafc); padding: 14px 20px 10px; border-bottom: 1px solid var(--portal-border, #e2e8f0) }
  .civ-grupos { display: flex; gap: 18px; justify-content: center; flex-wrap: wrap; align-items: flex-end }
  .civ-grupo { display: flex; flex-direction: column; align-items: center; gap: 6px }
  .civ-grupo-nome { font-size: 10.5px; font-weight: 900; text-transform: uppercase; letter-spacing: .8px; color: var(--portal-text-muted, #64748b); transition: color .3s }
  .civ-grupo-nome.on { color: var(--k) }
  .civ-bols { display: flex; gap: 6px; padding: 4px 6px; border-radius: 99px; background: color-mix(in srgb, var(--k) 8%, transparent) }
  .civ-bol { display: inline-flex; align-items: center; height: 42px; min-width: 42px; padding: 0; border-radius: 99px; border: 0; background: var(--portal-bg-card, #fefefe); box-shadow: 0 0 0 2px color-mix(in srgb, var(--k) 40%, transparent); color: var(--k); font: inherit; cursor: pointer; overflow: hidden; transition: all .35s cubic-bezier(.2,.9,.25,1) }
  .civ-bol:hover { transform: scale(1.08); box-shadow: 0 0 0 3px var(--k) }
  .civ-bol-ic { width: 42px; height: 42px; display: grid; place-items: center; font-size: 15px; flex-shrink: 0 }
  .civ-bol-nome { max-width: 0; opacity: 0; white-space: nowrap; font-size: 14px; font-weight: 900; transition: max-width .35s, opacity .25s, padding .35s }
  .civ-bol.on { background: var(--k); color: #fefefe; box-shadow: 0 8px 20px color-mix(in srgb, var(--k) 40%, transparent) }
  .civ-bol.on .civ-bol-nome { max-width: 180px; opacity: 1; padding-right: 16px }
  .civ-bol.on .civ-bol-ic { animation: civBate 2.4s ease-in-out infinite }
  @keyframes civBate { 0%, 100% { transform: scale(1) } 50% { transform: scale(1.15) } }
  .civ-trilho { height: 4px; border-radius: 4px; background: var(--portal-border, #e2e8f0); overflow: hidden; max-width: 900px; margin: 12px auto 0 }
  .civ-trilho span { display: block; height: 100%; border-radius: 4px; transition: width .5s cubic-bezier(.2,.8,.2,1), background .4s }
  .civ-dica { text-align: center; font-size: 13.5px; color: var(--portal-text-muted, #475569); margin: 8px auto 0; max-width: 900px; animation: civEntra .35s ease }
  .civ-dica b { color: var(--k) }
  .civ-modulo { animation: civEntra .35s ease }
  @keyframes civEntra { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
  @media (max-width: 700px) {
    .civ-topo { padding: 10px 8px 8px }
    .civ-grupos { flex-wrap: nowrap; overflow-x: auto; justify-content: flex-start; padding-bottom: 4px }
    .civ-grupo { flex-shrink: 0 }
  }
  @media (prefers-reduced-motion: reduce) { .civ-bol-ic, .civ-dica, .civ-modulo { animation: none !important } }
`;
