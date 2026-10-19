'use client';
// =============================================================================
// Centro de Vendas — o módulo Inteligência de Vendas em 4 modos (José, 19/10/2026:
// "mais visual, animado, como um radar; juntar abas; parecido com a Janela
// Mecânicos"). Seletor de modo com a luz que desliza, tela cheia e "Como ler".
//   Radar ........ oportunidades + o que espera retorno nosso
//   Equipe ....... supervisão dos vendedores
//   Território ... municípios (IBGE + CAR + crédito) e empresas novas
//   Ferramentas .. calculadora, indicações, concorrência, CNPJ, listas completas
// =============================================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClienteIV } from '@/lib/inteligencia-vendas/tipos';
import type { ItemRetorno } from '@/lib/inteligencia-vendas/retorno';
import type { MunicipioIV } from '@/lib/inteligencia-vendas/municipios';
import { apiGet } from '../ui';
import Calculadora from '../Calculadora';
import Indicacoes from '../Indicacoes';
import Concorrencia from '../Concorrencia';
import Empresas from '../Empresas';
import Oportunidades from '../Oportunidades';
import Retorno from '../Retorno';
import { BORDA, CARD, EstilosIV, MUDO, TXT } from './kit';
import ModoRadar from './ModoRadar';
import ModoEquipe, { type DadosEquipe } from './ModoEquipe';
import ModoTerritorio from './ModoTerritorio';

export type Modo = 'radar' | 'equipe' | 'territorio' | 'ferramentas';
const MODOS: { id: Modo; rot: string; sub: string; cor: string; icone: string }[] = [
  { id: 'radar', rot: 'Radar', sub: 'quem ligar e o que oferecer', cor: 'linear-gradient(135deg, #f87171, #b91c1c)', icone: 'radar' },
  { id: 'equipe', rot: 'Vendedores', sub: 'painel do período', cor: 'linear-gradient(135deg, #60a5fa, #1d4ed8)', icone: 'fa-users' },
  { id: 'territorio', rot: 'Território', sub: 'onde está o mercado', cor: 'linear-gradient(135deg, #4ade80, #15803d)', icone: 'fa-map-location-dot' },
  { id: 'ferramentas', rot: 'Ferramentas', sub: 'calcular, registrar, listas', cor: 'linear-gradient(135deg, #c084fc, #7e22ce)', icone: 'fa-toolbox' },
];
const FERRAMENTAS = [
  { id: 'calculadora', rot: 'Calculadora de retorno', icone: 'fa-calculator' },
  { id: 'indicacoes', rot: 'Indicações', icone: 'fa-handshake' },
  { id: 'concorrencia', rot: 'Concorrência', icone: 'fa-chess' },
  { id: 'empresas', rot: 'Empresas (CNPJ)', icone: 'fa-building' },
  { id: 'clientes', rot: 'Lista de clientes', icone: 'fa-table-list' },
  { id: 'retorno', rot: 'Fila sem retorno', icone: 'fa-hourglass-half' },
] as const;

export default function CentroVendas({ estilo = 'radar', modoInicial = 'radar' }: { estilo?: 'radar' | 'cartoes'; modoInicial?: Modo }) {
  const [modo, setModo] = useState<Modo>(modoInicial);
  const [ferr, setFerr] = useState<(typeof FERRAMENTAS)[number]['id']>('calculadora');
  const [clientes, setClientes] = useState<ClienteIV[] | null>(null);
  const [retorno, setRetorno] = useState<ItemRetorno[] | null>(null);
  const [equipe, setEquipe] = useState<DadosEquipe | null>(null);
  const [territorio, setTerritorio] = useState<{ municipios: MunicipioIV[]; anoIBGE: string; avisos: string[] } | null>(null);
  const [erro, setErro] = useState('');
  const raiz = useRef<HTMLDivElement>(null);
  const [cheia, setCheia] = useState(false);

  const carregar = useCallback(async (m: Modo) => {
    try {
      if (m === 'radar') {
        if (!clientes) setClientes((await apiGet('/api/inteligencia-vendas/base')).clientes);
        if (!retorno) setRetorno((await apiGet('/api/inteligencia-vendas/retorno')).itens);
      }
      if (m === 'equipe' && !equipe) setEquipe(await apiGet('/api/inteligencia-vendas/equipe'));
      if (m === 'territorio' && !territorio) setTerritorio(await apiGet('/api/inteligencia-vendas/municipios'));
    } catch (e) { setErro((e as Error).message); }
  }, [clientes, retorno, equipe, territorio]);
  useEffect(() => { const t = setTimeout(() => carregar(modo), 0); return () => clearTimeout(t); }, [modo, carregar]);
  useEffect(() => {
    const f = () => setCheia(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', f);
    return () => document.removeEventListener('fullscreenchange', f);
  }, []);

  return (
    <div ref={raiz} style={{ padding: 'clamp(14px, 2vw, 24px) clamp(12px, 2vw, 28px)', minWidth: 0, background: 'var(--portal-bg, #f8fafc)', minHeight: cheia ? '100vh' : undefined, overflowY: cheia ? 'auto' : undefined, overflowX: 'clip' }}>
      <EstilosIV />
      <style>{`
        .cv-modo { position: relative; display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; padding: 5px; border-radius: 20px; background: ${CARD}; border: 1px solid ${BORDA}; box-shadow: 0 2px 12px rgba(15,23,42,.07); flex: 1; min-width: 0 }
        .cv-luz { position: absolute; top: 5px; bottom: 5px; left: 5px; width: calc(25% - 6px); border-radius: 15px; transition: transform .55s cubic-bezier(.3,1.35,.45,1), background .4s; box-shadow: 0 8px 22px rgba(15,23,42,.25); overflow: hidden }
        .cv-luz::after { content: ''; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,.45) 45%, transparent 60%); background-size: 250% 100%; animation: cvBrilho 2.8s ease-in-out infinite }
        @keyframes cvBrilho { 0% { background-position: 150% 0 } 60%, 100% { background-position: -100% 0 } }
        .cv-op { position: relative; z-index: 1; display: flex; align-items: center; gap: 11px; border: none; background: transparent; font-family: inherit; text-align: left; padding: 10px 12px; border-radius: 15px; cursor: pointer; color: ${MUDO}; transition: color .3s, transform .15s; min-width: 0 }
        .cv-op:hover { transform: translateY(-1px) } .cv-op:active { transform: scale(.98) }
        .cv-op b { display: block; font-size: 15.5px; font-weight: 900; line-height: 1.15 } .cv-op small { display: block; font-size: 12px; font-weight: 600; opacity: .85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
        .cv-op-on { color: #fefefe }
        .cv-ic { position: relative; width: 40px; height: 40px; border-radius: 12px; flex-shrink: 0; display: grid; place-items: center; font-size: 17px; background: rgba(148,163,184,.18); transition: background .3s }
        .cv-op-on .cv-ic { background: rgba(255,255,255,.22) }
        .cv-op-on .cv-ic i { animation: cvPula 1.4s ease-in-out infinite } @keyframes cvPula { 50% { transform: translateY(-3px) scale(1.08) } }
        .cv-radar span { position: absolute; inset: 8px; border-radius: 50%; border: 2px solid currentColor; opacity: .7 }
        .cv-radar span::before { content: ''; position: absolute; inset: 5px; border-radius: 50%; border: 1.5px solid currentColor; opacity: .6 }
        .cv-radar em { position: absolute; inset: 8px; border-radius: 50%; background: conic-gradient(from 0deg, currentColor, transparent 35%); opacity: .25; animation: ivGira 2.4s linear infinite }
        .cv-op-on .cv-radar em { opacity: .6; animation-duration: 1.4s }
        .cv-radar u { position: absolute; width: 5px; height: 5px; border-radius: 50%; background: #fde047; top: 12px; right: 11px }
        .cv-tela { width: 44px; height: 44px; border-radius: 14px; border: 1px solid ${BORDA}; background: ${CARD}; color: ${MUDO}; cursor: pointer; flex-shrink: 0 }
        .cv-tela:hover { color: #ef4444; border-color: #ef4444 }
        .cv-ferr { display: inline-flex; align-items: center; gap: 7px; padding: 8px 14px; border-radius: 999px; font-size: 13px; font-weight: 800; cursor: pointer; font-family: inherit; border: 1px solid ${BORDA}; background: ${CARD}; color: ${TXT}; transition: all .2s }
        .cv-ferr-on { background: #7e22ce; border-color: #7e22ce; color: #fefefe }
        @media (max-width: 860px) { .cv-modo { grid-template-columns: repeat(2, 1fr) } .cv-luz { display: none } .cv-op-on { background: #ef4444 } .cv-op small { display: none } }
      `}</style>
      {/* abas estilo Chrome (docs/padrao-telas.md): faixa de ponta a ponta, sem título ao lado */}
      <div role="tablist" style={{ display: 'flex', alignItems: 'flex-end', gap: 3, padding: '10px clamp(12px, 2vw, 28px) 0', margin: 'calc(-1 * clamp(14px, 2vw, 24px)) calc(-1 * clamp(12px, 2vw, 28px)) 16px', background: 'linear-gradient(135deg, #F87171, #991B1B)', overflowX: 'auto' }}>
        {MODOS.map((m) => {
          const on = modo === m.id;
          return (
            <button key={m.id} type="button" role="tab" aria-selected={on} onClick={() => setModo(m.id)} title={m.sub}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', border: 0, borderRadius: '11px 11px 0 0', fontFamily: 'inherit', fontSize: 14, fontWeight: on ? 700 : 500, color: '#111111', background: on ? '#fefefe' : 'rgba(255,255,255,0.30)', boxShadow: on ? '0 -2px 6px rgba(0,0,0,0.15)' : 'none', cursor: 'pointer', whiteSpace: 'nowrap', transition: '0.15s' }}>
              {m.icone === 'radar'
                ? <span className="cv-radar" style={{ position: 'relative', width: 18, height: 18, color: on ? '#dc2626' : '#111111' }}><span style={{ inset: 0 }} /><em style={{ inset: 0 }} /></span>
                : <i className={`fas ${m.icone}`} style={{ color: on ? '#dc2626' : '#111111' }} />}
              {m.rot}
            </button>
          );
        })}
        <button type="button" title={cheia ? 'Sair da tela cheia (Esc)' : 'Tela cheia (bom para TV)'}
          onClick={() => (document.fullscreenElement ? document.exitFullscreen() : raiz.current?.requestFullscreen?.())}
          style={{ marginLeft: 'auto', alignSelf: 'center', marginBottom: 8, width: 34, height: 34, borderRadius: 10, border: 0, background: 'rgba(255,255,255,0.30)', color: '#111111', cursor: 'pointer', flexShrink: 0 }}>
          <i className={`fas ${cheia ? 'fa-compress' : 'fa-expand'}`} />
        </button>
      </div>
      {erro && <div style={{ padding: 12, borderRadius: 12, background: 'rgba(239,68,68,.1)', color: '#b91c1c', marginBottom: 12, fontSize: 13 }}>{erro}</div>}

      <div key={modo} className="iv-troca">
        {modo === 'radar' && (clientes
          ? <ModoRadar clientes={clientes} retorno={retorno} estilo={estilo} />
          : <Espera texto="Ligando o radar… cruzando vendas, oficina, propostas e CRM (a primeira vez leva uns 15 segundos)" />)}
        {modo === 'equipe' && <ModoEquipe dados={equipe} />}
        {modo === 'territorio' && <ModoTerritorio dados={territorio} />}
        {modo === 'ferramentas' && (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              {FERRAMENTAS.map((f) => (
                <button key={f.id} type="button" className={`cv-ferr ${ferr === f.id ? 'cv-ferr-on' : ''}`} onClick={() => setFerr(f.id)}>
                  <i className={`fas ${f.icone}`} />{f.rot}
                </button>
              ))}
            </div>
            <div key={ferr} className="iv-troca" style={{ margin: '0 calc(-1 * clamp(12px, 3vw, 24px))' }}>
              {ferr === 'calculadora' && <Calculadora />}
              {ferr === 'indicacoes' && <Indicacoes />}
              {ferr === 'concorrencia' && <Concorrencia />}
              {ferr === 'empresas' && <Empresas />}
              {ferr === 'clientes' && <Oportunidades />}
              {ferr === 'retorno' && <Retorno />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Espera({ texto }: { texto: string }) {
  return (
    <div style={{ display: 'grid', placeItems: 'center', padding: 60, color: MUDO, gap: 14, textAlign: 'center' }}>
      <div style={{ position: 'relative', width: 90, height: 90, borderRadius: '50%', border: '2px solid rgba(239,68,68,.35)' }}>
        <div className="iv-varre" style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'conic-gradient(from 0deg, rgba(239,68,68,.55), transparent 30%)', animationDuration: '1.6s' }} />
        <div style={{ position: 'absolute', inset: 22, borderRadius: '50%', border: '1.5px solid rgba(239,68,68,.3)' }} />
      </div>
      <div style={{ fontSize: 14 }}>{texto}</div>
    </div>
  );
}
