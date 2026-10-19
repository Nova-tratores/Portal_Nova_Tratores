'use client';
// Modo "Território": em que municípios focar. Cada linha mostra o tamanho do
// mercado (área plantada, rebanho, crédito de investimento) contra a nossa
// presença, com a bolha de FOCO. Filtro por linha de máquina reordena tudo.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { MunicipioIV } from '@/lib/inteligencia-vendas/municipios';
import { BORDA, CARD, Cartao, ComoLer, FUNDO2, KpiVivo, MUDO, TXT, compacto } from './kit';

const LINHAS: { id: string; nome: string; icone: string; re: RegExp | null }[] = [
  { id: '', nome: 'Tudo', icone: 'fa-layer-group', re: null },
  { id: 'graos', nome: 'Grãos · plantadeira e pulverizador', icone: 'fa-seedling', re: /soja|milho|trigo|feij|sorgo|aveia|amendoim/i },
  { id: 'cana', nome: 'Cana · alta potência', icone: 'fa-bolt', re: /cana/i },
  { id: 'perenes', nome: 'Café e frutas · fruteiro', icone: 'fa-mug-hot', re: /caf|laranja|lim|tangerina|abacate|manga|uva|banana/i },
  { id: 'pecuaria', nome: 'Pecuária · vagão e roçadeira', icone: 'fa-cow', re: null },
];

export default function ModoTerritorio({ dados }: { dados: { municipios: MunicipioIV[]; anoIBGE: string; avisos: string[] } | null }) {
  const [linha, setLinha] = useState('');
  const [aberto, setAberto] = useState<number | null>(null);
  const atual = LINHAS.find((l) => l.id === linha)!;
  const medida = (m: MunicipioIV) => linha === 'pecuaria' ? (m.bovinos || 0) : atual.re ? m.culturas.filter((c) => atual.re!.test(c.nome)).reduce((s, c) => s + c.ha, 0) : m.areaPlantadaHa;
  const lista = useMemo(() => {
    const ms = dados?.municipios ?? [];
    return [...ms].sort((a, b) => (linha ? medida(b) * (1 - Math.min(1, (b.penetracao ?? 0) / .05) * .5) - medida(a) * (1 - Math.min(1, (a.penetracao ?? 0) / .05) * .5) : b.foco - a.foco));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados, linha]);
  const maxMed = Math.max(1, ...lista.map(medida));
  const ms = dados?.municipios ?? [];
  const soma = (f: (m: MunicipioIV) => number) => ms.reduce((s, m) => s + f(m), 0);

  return (
    <>
      <ComoLer chave="territorio" titulo="Como ler o Território" itens={[
        <><b>Um município por linha</b>, entre os 45 que a loja atende. A <b>bolha</b> é o FOCO (0 a 100): mercado grande e pouca presença nossa = foco alto.</>,
        <><b>Barra verde</b> = tamanho do mercado (área plantada no IBGE {dados?.anoIBGE || ''}, ou rebanho na pecuária). <b>Barra vermelha</b> = nossa presença: clientes com trator nosso ÷ imóveis rurais do CAR.</>,
        <><b>Crédito de investimento</b> é o dinheiro de banco que os produtores de lá pegaram nos últimos 3 anos para máquina e benfeitoria (Banco Central). Muito crédito = produtor investindo.</>,
        <><b>Escolha a linha de máquina</b> em cima para reordenar: &quot;Grãos&quot; mostra onde vender plantadeira e pulverizador, e assim por diante. Clique na linha para ver todas as culturas.</>,
      ]} />
      {!dados && <div style={{ color: MUDO, padding: 30, textAlign: 'center' }}>Buscando IBGE, CAR e a carteira… (a primeira vez leva uns 30 segundos)</div>}
      {dados && <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(190px, 100%), 1fr))', gap: 12, marginBottom: 14 }}>
          <KpiVivo titulo="Área plantada" valor={soma((m) => m.areaPlantadaHa)} formato={(v) => `${compacto(v)} ha`} cor="#16a34a" destaque icone="fa-seedling" />
          <KpiVivo titulo="Imóveis rurais (CAR)" valor={soma((m) => m.imoveis || 0)} cor="#2563eb" icone="fa-map" atraso={80} />
          <KpiVivo titulo="Crédito de investimento 3 anos" valor={soma((m) => m.invest36m || 0)} formato={(v) => `R$ ${compacto(v)}`} cor="#8b5cf6" icone="fa-building-columns" atraso={160} />
          <KpiVivo titulo="Clientes com trator nosso" valor={soma((m) => m.clientesComTrator)} cor="#ef4444" icone="fa-tractor" atraso={240}
            sub={`${((soma((m) => m.clientesComTrator) / Math.max(1, soma((m) => m.imoveis || 0))) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% dos imóveis`} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {LINHAS.map((l) => (
            <button key={l.id} type="button" onClick={() => setLinha(l.id)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 999, fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
              border: `1px solid ${linha === l.id ? '#16a34a' : BORDA}`, background: linha === l.id ? '#16a34a' : CARD, color: linha === l.id ? '#fefefe' : TXT, transition: 'all .2s',
            }}><i className={`fas ${l.icone}`} />{l.nome}</button>
          ))}
        </div>
        <Cartao titulo={<span><i className="fas fa-location-crosshairs" style={{ color: '#16a34a', marginRight: 8 }} />Onde focar{linha ? ` — ${atual.nome}` : ''}</span>}
          extra={<Link href="/inteligencia-vendas/municipios" style={{ fontSize: 12.5, color: '#ef4444', fontWeight: 800, textDecoration: 'none' }}>tabela completa →</Link>}>
          <div style={{ display: 'grid', gap: 6 }}>
            {lista.slice(0, 20).map((m, i) => {
              const pen = Math.min(1, (m.penetracao ?? 0) / .05);
              const corFoco = m.foco >= 70 ? '#ef4444' : m.foco >= 50 ? '#f59e0b' : '#64748b';
              return (
                <div key={m.ibge}>
                  <button type="button" onClick={() => setAberto(aberto === m.ibge ? null : m.ibge)} className="iv-entra iv-linha"
                    style={{ animationDelay: `${i * 35}ms`, width: '100%', display: 'grid', gridTemplateColumns: '54px minmax(120px, 1.1fr) minmax(140px, 2fr) minmax(90px, .8fr)', gap: 12, alignItems: 'center', border: `1px solid ${BORDA}`, borderRadius: 12, padding: '8px 10px', background: CARD, cursor: 'pointer', color: TXT, fontFamily: 'inherit', textAlign: 'left' }}>
                    <span style={{ width: 46, height: 46, borderRadius: '50%', display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: 15, color: '#fefefe', background: `radial-gradient(circle at 30% 30%, ${corFoco}cc, ${corFoco})`, boxShadow: `0 4px 12px ${corFoco}55` }}>{m.foco}</span>
                    <span style={{ minWidth: 0 }}>
                      <b style={{ fontSize: 14 }}>{m.nome}</b>
                      <div style={{ fontSize: 11.5, color: MUDO, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.culturas.slice(0, 3).map((c) => c.nome).join(' · ')}</div>
                    </span>
                    <span style={{ display: 'grid', gap: 5 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: MUDO }}>
                        <span style={{ flex: 1, height: 9, background: FUNDO2, borderRadius: 9, overflow: 'hidden' }}>
                          <span className="iv-barra" style={{ display: 'block', height: '100%', width: `${(medida(m) / maxMed) * 100}%`, background: 'linear-gradient(90deg, #22c55e, #15803d)', borderRadius: 9, animationDelay: `${i * 35}ms` }} />
                        </span>
                        <span style={{ width: 70, textAlign: 'right' }}>{compacto(medida(m))}{linha === 'pecuaria' ? ' cab.' : ' ha'}</span>
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: MUDO }}>
                        <span style={{ flex: 1, height: 9, background: FUNDO2, borderRadius: 9, overflow: 'hidden' }}>
                          <span className="iv-barra" style={{ display: 'block', height: '100%', width: `${Math.max(2, pen * 100)}%`, background: 'linear-gradient(90deg, #f87171, #b91c1c)', borderRadius: 9, animationDelay: `${i * 35 + 150}ms` }} />
                        </span>
                        <span style={{ width: 70, textAlign: 'right' }}>{m.clientesComTrator} c/ trator</span>
                      </span>
                    </span>
                    <span style={{ fontSize: 12, textAlign: 'right' }}>
                      <b style={{ color: '#8b5cf6' }}>R$ {compacto(m.invest36m || 0)}</b>
                      <div style={{ color: MUDO, fontSize: 11 }}>investimento</div>
                    </span>
                  </button>
                  {aberto === m.ibge && (
                    <div className="iv-troca" style={{ margin: '6px 0 8px 66px', padding: 12, borderRadius: 12, background: FUNDO2, fontSize: 13, color: TXT }}>
                      <div style={{ marginBottom: 6 }}><b>O que vender lá:</b> {m.linhas.join(' · ')}</div>
                      <div style={{ marginBottom: 6, color: MUDO }}>{m.imoveis ?? '—'} imóveis no CAR · {m.clientes} clientes ({m.clientesAtivos} ativos) · {m.propostasAbertas} propostas abertas · {m.oportunidades} clientes com oportunidade{m.bovinos ? ` · ${compacto(m.bovinos)} bovinos` : ''}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {m.culturas.slice(0, 12).map((c) => <span key={c.nome} style={{ background: CARD, border: `1px solid ${BORDA}`, borderRadius: 999, padding: '2px 9px', fontSize: 12 }}>{c.nome} <b>{compacto(c.ha)} ha</b></span>)}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Cartao>
      </>}
    </>
  );
}
