'use client';
// =============================================================================
// /inteligencia-vendas/equipe — supervisão dos vendedores.
// Cartão por vendedor com a situação (ativo / atenção / parado / não usa o
// CRM), o que fez no campo, o que tem em aberto e o que vendeu. Clique abre o
// detalhe: alertas, últimas visitas e propostas em aberto.
// =============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { MapPin, RefreshCw, X } from 'lucide-react';
import type { LinhaEquipe, Situacao } from '@/lib/inteligencia-vendas/equipe';
import { hojeBR } from '@/lib/inteligencia-vendas/normalizar';
import {
  apiGet, Aviso, borda, Botao, BotaoCSV, brl, Cabecalho, Carregando, compacto, dataBR, fundo2, fundoCard, GradeKpi, Kpi, mut, Pagina,
  Painel, Selo, Tabela, tempoDesde, txt, VERMELHO, type Coluna,
} from './ui';

const SIT: Record<Situacao, { rotulo: string; cor: string }> = {
  parado: { rotulo: 'Parado', cor: '#DC2626' },
  atencao: { rotulo: 'Atenção', cor: '#D97706' },
  ativo: { rotulo: 'Ativo', cor: '#16A34A' },
  sem_crm: { rotulo: 'Não usa o CRM', cor: '#64748B' },
};

export default function Equipe() {
  const [dados, setDados] = useState<{ linhas: LinhaEquipe[]; atualizadoEm: number | null } | null>(null);
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState<LinhaEquipe | null>(null);
  const [filtro, setFiltro] = useState<Situacao | ''>('');

  const carregar = useCallback(async (atualizar = false) => {
    try { setDados(await apiGet(`/api/inteligencia-vendas/equipe${atualizar ? '?atualizar=1' : ''}`)); setErro(''); }
    catch (e) { setErro((e as Error).message); }
  }, []);
  useEffect(() => { const t = setTimeout(() => carregar(), 0); return () => clearTimeout(t); }, [carregar]);

  const linhas = useMemo(() => dados?.linhas ?? [], [dados]);
  const vis = useMemo(() => linhas.filter((l) => !filtro || l.situacao === filtro), [linhas, filtro]);
  const soma = (f: (l: LinhaEquipe) => number) => linhas.reduce((s, l) => s + f(l), 0);

  const colunas: Coluna<LinhaEquipe>[] = useMemo(() => [
    { id: 'sit', rotulo: 'Situação', valor: (l) => SIT[l.situacao].rotulo, render: (l) => <Selo cor={SIT[l.situacao].cor}>{SIT[l.situacao].rotulo}</Selo> },
    { id: 'nome', rotulo: 'Vendedor', valor: (l) => l.nome, render: (l) => <b>{l.nome}</b> },
    { id: 'ult', rotulo: 'Última visita', valor: (l) => l.ultimaVisita, render: (l) => <span>{dataBR(l.ultimaVisita)}{l.diasSemVisita != null && <span style={{ color: mut, fontSize: 12 }}> · {l.diasSemVisita} d úteis</span>}</span> },
    { id: 'v7', rotulo: 'Visitas 7 d', direita: true, valor: (l) => l.visitas7 },
    { id: 'v30', rotulo: 'Visitas 30 d', direita: true, valor: (l) => l.visitas30 },
    { id: 'cli30', rotulo: 'Clientes 30 d', direita: true, valor: (l) => l.clientesVisitados30 },
    { id: 'gps', rotulo: 'Sem GPS', direita: true, valor: (l) => l.semGps30, render: (l) => <span style={{ color: l.semGps30 ? VERMELHO : txt, fontWeight: l.semGps30 ? 800 : 400 }}>{l.semGps30}</span> },
    { id: 'ret', rotulo: 'Retornos vencidos', direita: true, valor: (l) => l.retornosVencidos, render: (l) => <span style={{ color: l.retornosVencidos ? VERMELHO : txt, fontWeight: l.retornosVencidos ? 800 : 400 }}>{l.retornosVencidos}</span> },
    { id: 'prop', rotulo: 'Propostas abertas', direita: true, valor: (l) => l.propostasAbertas, render: (l) => <span>{l.propostasAbertas}{l.propostasParadas ? <span style={{ color: '#D97706', fontSize: 12 }}> ({l.propostasParadas} paradas)</span> : null}</span> },
    { id: 'valprop', rotulo: 'Em aberto', direita: true, valor: (l) => l.valorPropostas, render: (l) => (l.valorPropostas ? `R$ ${compacto(l.valorPropostas)}` : '—') },
    { id: 'gp', rotulo: 'Ganhas / perdidas 90 d', direita: true, valor: (l) => l.ganhas90, render: (l) => `${l.ganhas90} / ${l.perdidas90}` },
    { id: 'maq', rotulo: 'Máquinas 12 m (Omie)', direita: true, valor: (l) => l.vendasMaquina12m, render: (l) => (l.vendasMaquina12m ? <span>R$ {compacto(l.vendasMaquina12m)} <span style={{ color: mut, fontSize: 12 }}>({l.pedidosMaquina12m})</span></span> : '—') },
    { id: 'cart', rotulo: 'Carteira', direita: true, valor: (l) => l.carteira, render: (l) => <span>{l.carteira}{l.carteiraComOportunidade ? <span style={{ color: mut, fontSize: 12 }}> ({l.carteiraComOportunidade} c/ oport.)</span> : null}</span> },
    { id: 'alertas', rotulo: 'Alertas', valor: (l) => l.alertas.join(' · '), render: (l) => <span style={{ fontSize: 12.5 }}>{l.alertas[0] || '—'}{l.alertas.length > 1 ? <span style={{ color: mut }}> +{l.alertas.length - 1}</span> : null}</span> },
  ], []);

  return (
    <Pagina>
      <Cabecalho
        titulo="Equipe"
        sub={<>Supervisão dos vendedores: CRM (visitas, GPS, retornos), propostas do portal e vendas do Omie. Situação conta dias úteis.{dados?.atualizadoEm ? ` Atualizado ${tempoDesde(dados.atualizadoEm)}.` : ''}</>}
        acoes={<>
          <Link href="/supervisor-vendas" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 8, border: `1px solid ${VERMELHO}`, color: VERMELHO, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
            <MapPin size={14} /> Mapa e rotas
          </Link>
          <Botao onClick={() => carregar(true)}><RefreshCw size={14} /> Atualizar</Botao>
          {dados && <BotaoCSV nome={`equipe-${hojeBR()}.csv`} linhas={vis} colunas={colunas} />}
        </>}
      />
      {erro && <Aviso cor={VERMELHO}>{erro}</Aviso>}
      {!dados && !erro && <Carregando />}
      {dados && <>
        <GradeKpi>
          <Kpi rotulo="Vendedores" valor={linhas.length} ativo={!filtro} onClick={() => setFiltro('')} />
          {(Object.keys(SIT) as Situacao[]).map((s) => (
            <Kpi key={s} rotulo={SIT[s].rotulo} valor={linhas.filter((l) => l.situacao === s).length} cor={SIT[s].cor}
              ativo={filtro === s} onClick={() => setFiltro(filtro === s ? '' : s)} />
          ))}
          <Kpi rotulo="Visitas em 30 dias" valor={soma((l) => l.visitas30)} cor="#2563EB" sub={`${soma((l) => l.semGps30)} presenciais sem GPS`} />
          <Kpi rotulo="Propostas em aberto" valor={soma((l) => l.propostasAbertas)} cor="#CA8A04" sub={`R$ ${compacto(soma((l) => l.valorPropostas))}`} />
          <Kpi rotulo="Máquinas faturadas 12 m" valor={`R$ ${compacto(soma((l) => l.vendasMaquina12m))}`} cor="#16A34A" />
        </GradeKpi>
        <Tabela linhas={vis} colunas={colunas} chave={(l) => String(l.id)} onLinha={setAberto} />
      </>}

      {aberto && <DetalheVendedor l={aberto} onFechar={() => setAberto(null)} />}
    </Pagina>
  );
}

/** Painel lateral com o detalhe do vendedor (usado aqui e no Centro de Vendas). */
export function DetalheVendedor({ l, onFechar }: { l: LinhaEquipe; onFechar: () => void }) {
  return (
          <div onClick={() => onFechar()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9000, display: 'flex', justifyContent: 'flex-end' }}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(760px, 100%)', height: '100%', overflowY: 'auto', background: 'var(--portal-bg, #f9fafb)' }}>
              <div style={{ position: 'sticky', top: 0, zIndex: 2, background: 'linear-gradient(135deg, #F87171, #991B1B)', padding: '14px 18px', color: '#fefefe', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{l.nome}</div>
                  <div style={{ fontSize: 13, opacity: 0.92 }}>{SIT[l.situacao].rotulo} · última visita {dataBR(l.ultimaVisita)}</div>
                </div>
                <button onClick={() => onFechar()} aria-label="Fechar" style={{ background: 'rgba(255,255,255,0.2)', border: 0, borderRadius: 8, width: 34, height: 34, color: '#fefefe', cursor: 'pointer' }}><X size={18} /></button>
              </div>
              <div style={{ padding: 18, display: 'grid', gap: 14 }}>
                {l.alertas.length > 0 && (
                  <Painel titulo="Alertas">
                    {l.alertas.map((a) => <div key={a} style={{ fontSize: 13, color: txt, padding: '4px 0', borderBottom: borda }}>• {a}</div>)}
                  </Painel>
                )}
                <GradeKpi min={140}>
                  <Kpi rotulo="Visitas 7 / 30 / 90 d" valor={`${l.visitas7} / ${l.visitas30} / ${l.visitas90}`} cor="#2563EB" />
                  <Kpi rotulo="Negócios no CRM" valor={l.negociosAbertos} sub={brl(l.valorNegocios)} cor="#2563EB" />
                  <Kpi rotulo="Peças 12 m (Omie)" valor={`R$ ${compacto(l.vendasPecas12m)}`} cor="#16A34A" />
                  <Kpi rotulo="Carteira sem visita 6 m" valor={l.carteiraSemVisita} sub={`de ${l.carteira} clientes`} cor="#475569" />
                </GradeKpi>
                <Painel titulo={`Propostas em aberto (${l.propostas.length})`}>
                  {l.propostas.length === 0 && <div style={{ fontSize: 13, color: mut }}>Nenhuma.</div>}
                  {l.propostas.map((p) => (
                    <div key={p.id} style={{ display: 'flex', gap: 10, padding: '6px 0', borderBottom: borda, fontSize: 13, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <b style={{ color: txt, flex: '1 1 200px' }}>{p.cliente}</b>
                      <span style={{ color: mut, flex: '1 1 160px' }}>{p.oque}</span>
                      <span style={{ color: txt }}>{brl(p.valor)}</span>
                      <span style={{ color: (p.dias ?? 0) > 15 ? '#D97706' : mut }}>{p.dias ?? '—'} d na fase</span>
                      <span style={{ color: p.proximo ? txt : VERMELHO }}>{p.proximo ? `próx. ${dataBR(p.proximo)}` : 'sem próximo contato'}</span>
                    </div>
                  ))}
                </Painel>
                <Painel titulo={`Últimas visitas (${l.ultimasVisitas.length})`}>
                  {l.ultimasVisitas.length === 0 && <div style={{ fontSize: 13, color: mut }}>Nenhuma visita registrada no CRM.</div>}
                  {l.ultimasVisitas.map((v) => (
                    <div key={v.id} style={{ padding: '7px 0', borderBottom: borda, fontSize: 13 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <b style={{ color: txt }}>{dataBR(String(v.data_visita).slice(0, 10))}</b>
                        <span style={{ color: txt }}>{v.propriedade_nome || v.cliente_nome || '—'}</span>
                        <Selo cor="#475569">{v.tipo}</Selo>
                        {v.tipo === 'presencial' && !v.latitude && <Selo cor={VERMELHO}>sem GPS</Selo>}
                        {v.retroativa && <Selo cor="#D97706">retroativa</Selo>}
                        {v.acionar_pos_vendas && <Selo cor={v.pos_vendas_resolvido ? '#16A34A' : '#7C3AED'}>pós-vendas{v.pos_vendas_resolvido ? ' ok' : ''}</Selo>}
                      </div>
                      {v.resumo && <div style={{ color: mut, marginTop: 3 }}>{v.resumo}</div>}
                      {(v.proximos_passos || v.data_proximo_contato) && (
                        <div style={{ color: txt, marginTop: 2, fontSize: 12.5, background: fundo2, borderRadius: 6, padding: '3px 7px', display: 'inline-block' }}>
                          → {v.proximos_passos || 'retorno'}{v.data_proximo_contato ? ` (${dataBR(v.data_proximo_contato)})` : ''}
                        </div>
                      )}
                    </div>
                  ))}
                </Painel>
                <div style={{ fontSize: 12, color: mut, background: fundoCard, border: borda, borderRadius: 8, padding: 10 }}>
                  Vendas do Omie e propostas casam pelo nome do vendedor (o CRM grava “DOUGRAS BOMFIM”, o Omie “DOUGRAS MOGRS DE JESUS BOMFIM”).
                </div>
              </div>
            </div>
          </div>
    );
}
