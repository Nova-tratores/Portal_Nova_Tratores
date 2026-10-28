'use client';
// =============================================================================
// Aba Prospecção (José, 20/10/2026): "isso na verdade é para ser um atalho, embaixo eu quero
// os módulos separados, para facilitar o entendimento ainda mais".
//   em cima ... a Jornada com o Tratorilson (resumo dos 4 caminhos, bolinhas)
//   embaixo ... as TELAS COMPLETAS do caminho escolhido nas bolinhas, cada uma na sua aba:
//               Carteira → Oportunidades · Recuperar → Sem retorno, Concorrência
//               Novos clientes → Indicações, Empresas, Propriedades do CAR · Território → Municípios
// =============================================================================
import { useState, type ReactNode } from 'react';
import type { GrupoId } from '@/lib/inteligencia-vendas/prospeccao';
import { ProspeccaoJornada } from './ProspeccaoViva';
import Oportunidades from './Oportunidades';
import Retorno from './Retorno';
import Concorrencia from './Concorrencia';
import Indicacoes from './Indicacoes';
import Empresas from './Empresas';
import Municipios from './Municipios';

const TX = 'var(--portal-text, #0f172a)', MU = 'var(--portal-text-muted, #64748b)';
interface Modulo { id: string; nome: string; icone: string; explica: string; tela: () => ReactNode }

function PropriedadesCAR() {
  return (
    <div className="pm-car">
      <i className="fas fa-map-location-dot" />
      <div>
        <b>Propriedades rurais do CAR</b>
        <p>As 34 mil propriedades dos 45 municípios da loja, com cultura, área, crédito rural e uma nota de potencial. Filtre as de potencial alto <b>sem cliente nosso</b> para achar quem ainda não compra com a gente, e confirme as que o sistema já ligou a clientes pelas visitas.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a href="/dashboard-agro?tab=prospeccao" className="pm-bt pm-bt-pri"><i className="fas fa-magnifying-glass" /> Abrir a prospecção por propriedade</a>
          <a href="/dashboard-agro?tab=vinculos" className="pm-bt"><i className="fas fa-link" /> Confirmar vínculos com clientes</a>
          <a href="/dashboard-agro?tab=mapa" className="pm-bt"><i className="fas fa-map" /> Ver no mapa</a>
        </div>
      </div>
    </div>
  );
}

const MODULOS: Record<GrupoId, { nome: string; cor: string; icone: string; modulos: Modulo[] }> = {
  carteira: { nome: 'Carteira', cor: '#dc2626', icone: 'fa-address-book', modulos: [
    { id: 'oportunidades', nome: 'Oportunidades', icone: 'fa-bullseye', explica: 'Todos os clientes da carteira com motivo para ligar, com filtro por motivo, cidade e vendedor.', tela: () => <Oportunidades topo="D" /> },
  ] },
  recuperar: { nome: 'Recuperar', cor: '#d97706', icone: 'fa-rotate-left', modulos: [
    { id: 'retorno', nome: 'Sem retorno', icone: 'fa-hourglass-half', explica: 'Propostas e negócios parados e retornos combinados na visita que venceram, por vendedor.', tela: () => <Retorno /> },
    { id: 'concorrencia', nome: 'Concorrência', icone: 'fa-flag', explica: 'Propostas perdidas, para quem perdemos e por quê, e o que a equipe viu dos concorrentes.', tela: () => <Concorrencia /> },
  ] },
  novos: { nome: 'Novos clientes', cor: '#16a34a', icone: 'fa-user-plus', modulos: [
    { id: 'propriedades', nome: 'Propriedades do CAR', icone: 'fa-tractor', explica: 'Propriedades grandes sem cliente nosso, no Dashboard Agro.', tela: () => <PropriedadesCAR /> },
    { id: 'indicacoes', nome: 'Indicações', icone: 'fa-handshake', explica: 'Quem os clientes indicaram, se já foi contatado e o benefício de quem indicou.', tela: () => <Indicacoes /> },
    { id: 'empresas', nome: 'Empresas (CNPJ)', icone: 'fa-building', explica: 'Empresas rurais novas da região (Receita Federal) e a atividade dos clientes.', tela: () => <Empresas /> },
  ] },
  territorio: { nome: 'Território', cor: '#2563eb', icone: 'fa-map-location-dot', modulos: [
    { id: 'municipios', nome: 'Municípios', icone: 'fa-map', explica: 'Todas as cidades com a nota de foco, o mercado (IBGE, CAR, crédito) e a nossa presença.', tela: () => <Municipios /> },
  ] },
};

export default function ProspeccaoPagina() {
  const [grupo, setGrupo] = useState<GrupoId>('carteira');
  const [escolhido, setEscolhido] = useState<Record<GrupoId, string>>({ carteira: 'oportunidades', recuperar: 'retorno', novos: 'propriedades', territorio: 'municipios' });
  const g = MODULOS[grupo];
  const mod = g.modulos.find((m) => m.id === escolhido[grupo]) || g.modulos[0];
  return (
    <div>
      <style>{ESTILO}</style>
      <ProspeccaoJornada aoMudar={setGrupo} />
      <section id="pv-modulos" className="pm" style={{ ['--k' as string]: g.cor }}>
        <div className="pm-cab">
          <span className="pm-cab-ic"><i className={`fas ${g.icone}`} /></span>
          <div style={{ minWidth: 0 }}>
            <small>Tela completa do caminho</small>
            <b>{g.nome}</b>
          </div>
          <span className="pm-cab-dica"><i className="fas fa-circle-info" /> Troque o caminho nas bolinhas lá em cima</span>
        </div>
        <div className="pm-abas" role="tablist">
          {g.modulos.map((m) => (
            <button key={m.id} type="button" role="tab" aria-selected={m.id === mod.id} className={m.id === mod.id ? 'on' : ''} onClick={() => setEscolhido((x) => ({ ...x, [grupo]: m.id }))}>
              <i className={`fas ${m.icone}`} /> {m.nome}
            </button>
          ))}
        </div>
        <div className="pm-explica"><i className="fas fa-robot" /> {mod.explica}</div>
        <div key={`${grupo}-${mod.id}`} className="pm-corpo">{mod.tela()}</div>
      </section>
    </div>
  );
}

const ESTILO = `
  .pm { margin: 6px clamp(12px, 2vw, 28px) 30px; border-radius: 22px; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); border-top: 5px solid var(--k); box-shadow: 0 10px 30px rgba(15,23,42,.06); overflow: hidden; scroll-margin-top: 96px; transition: border-color .4s }
  .pm-cab { display: flex; gap: 12px; align-items: center; padding: 16px 20px 6px; flex-wrap: wrap }
  .pm-cab-ic { width: 46px; height: 46px; border-radius: 15px; display: grid; place-items: center; font-size: 20px; color: #fefefe; background: var(--k); box-shadow: 0 8px 18px color-mix(in srgb, var(--k) 32%, transparent); transition: background .4s }
  .pm-cab small { display: block; font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: .06em; color: ${MU} } .pm-cab b { font-size: 22px; font-weight: 900; color: ${TX} }
  .pm-cab-dica { margin-left: auto; font-size: 12.5px; color: ${MU} } .pm-cab-dica i { color: var(--k) }
  .pm-abas { display: flex; gap: 4px; padding: 10px 20px 0; border-bottom: 1px solid var(--portal-border, #e2e8f0); overflow-x: auto }
  .pm-abas button { position: relative; border: none; background: none; padding: 10px 14px 12px; font: inherit; font-size: 15px; font-weight: 700; color: ${MU}; cursor: pointer; white-space: nowrap; display: inline-flex; gap: 8px; align-items: center; transition: color .2s }
  .pm-abas button::after { content: ''; position: absolute; left: 8px; right: 8px; bottom: -1px; height: 3px; border-radius: 3px 3px 0 0; background: var(--k); transform: scaleX(0); transition: transform .3s cubic-bezier(.2,.9,.25,1) }
  .pm-abas button.on { color: ${TX} } .pm-abas button.on::after { transform: none } .pm-abas button:hover { color: ${TX} } .pm-abas button i { color: var(--k) }
  .pm-explica { margin: 12px 20px 0; font-size: 13.5px; color: ${MU}; display: flex; gap: 8px; align-items: center } .pm-explica i { color: #0369a1 }
  .pm-corpo { animation: pmEntra .4s cubic-bezier(.2,.8,.2,1) both } @keyframes pmEntra { from { opacity: 0; transform: translateY(12px) } }
  .pm-car { display: flex; gap: 16px; align-items: flex-start; margin: 18px 20px 24px; padding: 20px; border-radius: 18px; background: linear-gradient(135deg, #f0fdf4, var(--portal-bg-card, #fefefe)); border: 1px solid #bbf7d0 }
  .pm-car > i { font-size: 34px; color: #16a34a } .pm-car b { font-size: 17px; color: ${TX} } .pm-car p { margin: 6px 0 12px; font-size: 14.5px; line-height: 1.55; color: ${TX}; max-width: 820px }
  .pm-bt { display: inline-flex; gap: 7px; align-items: center; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); color: ${TX}; border-radius: 10px; padding: 8px 13px; font-size: 13.5px; font-weight: 700; text-decoration: none }
  .pm-bt-pri { background: #16a34a; border-color: #16a34a; color: #fefefe }
  @media (prefers-reduced-motion: reduce) { .pm-corpo { animation: none } }
`;
