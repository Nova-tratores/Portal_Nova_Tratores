'use client';
// Frota > Manutenção > OFICINA (Fase 2, fatia 3 — 04/11/2026).
// Kanban da ordem de serviço da frota: Aberta · Em oficina · Aguardando peça ·
// Pronta. Arrastar um cartão (ou o botão da ficha) abre a janela da etapa, que
// pede o que a regra exige (km com foto, peça e previsão, quem retirou).
// Quem move é o Pós-Vendas; quem tem a Frota vê e abre a OS.
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Wrench } from 'lucide-react';
import { fetchAuth } from '@/lib/auth/client';
import { diaBR } from '@/lib/frota/mapa-vivo';
import { formatarPlaca } from '@/lib/frota/placa';
import {
  DIAS_ALERTA_ETAPA, ETAPA_INFO, ETAPAS_ATIVAS, diasEntre, fmtParado, pecaAtrasada, podeIr, resumoEtapa, type EtapaOS,
} from '@/lib/frota/oficina';
import { AZUL_FROTA, CabecalhoFrota, CarregandoFrota, KpiFrota, KpisFrota, VazioFrota } from '@/components/frota/ui';
import { botao, fmtDataHora, fmtReais, type OsFrota, type VeiculoOpcao } from '@/components/frota/oficina/comum';
import NovaOS from '@/components/frota/oficina/NovaOS';
import OsDetalhe from '@/components/frota/oficina/OsDetalhe';
import MudarEtapa from '@/components/frota/oficina/MudarEtapa';

interface Dados {
  os: OsFrota[];
  veiculos: VeiculoOpcao[];
  podeMover: boolean;
  migracaoFaltando?: boolean;
  error?: string;
}

function OficinaTela() {
  const router = useRouter();
  const params = useSearchParams();
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [nova, setNova] = useState(false);
  const [incluirEm, setIncluirEm] = useState<OsFrota | null>(null);
  const [mover, setMover] = useState<{ os: OsFrota; para: EtapaOS } | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<EtapaOS | null>(null);
  // "agora" das contas de dias: fixado a cada carregamento (render puro)
  const [agora, setAgora] = useState(() => Date.now());
  const abertaId = params.get('os');

  const carregar = useCallback(async () => {
    try {
      const r = await fetchAuth('/api/frota/oficina');
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error || `Falha ao carregar (${r.status}).`); return; }
      setErro('');
      setAgora(Date.now());
      setD({ os: j.os || [], veiculos: j.veiculos || [], podeMover: !!j.podeMover, migracaoFaltando: j.migracaoFaltando, error: j.error });
    } catch (e) { setErro(String(e)); }
  }, []);
  // carregar só grava estado depois do fetch (assíncrono)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar(); }, [carregar]);

  const abrir = (id: string | null) => {
    const q = new URLSearchParams(params.toString());
    if (id) q.set('os', id); else q.delete('os');
    router.replace(`/frota/oficina${q.toString() ? `?${q}` : ''}`, { scroll: false });
  };
  const depois = (msg?: string) => {
    if (msg) setAviso(msg);
    carregar();
  };

  const hoje = diaBR(agora);
  const ativas = useMemo(() => (d?.os || []).filter((o) => ETAPAS_ATIVAS.includes(o.etapa)), [d]);
  const encerradas = useMemo(() => (d?.os || []).filter((o) => !ETAPAS_ATIVAS.includes(o.etapa))
    .sort((a, b) => (b.concluida_em || b.etapa_desde).localeCompare(a.concluida_em || a.etapa_desde)), [d]);
  const selecionada = d?.os.find((o) => o.id === abertaId) || null;

  const parados = ativas.filter((o) => o.parado);
  const diasParados = parados.reduce((s, o) => s + o.dias_parado, 0);
  const custoParados = parados.reduce((s, o) => s + o.custo_parado, 0);
  const aguardando = ativas.filter((o) => o.etapa === 'aguardando_peca');
  const atrasadas = aguardando.filter((o) => pecaAtrasada(o, hoje)).length;
  const concluidas = encerradas.filter((o) => o.etapa === 'concluida');

  const soltar = (para: EtapaOS) => {
    const os = ativas.find((o) => o.id === arrastando);
    setArrastando(null);
    setSobre(null);
    if (!os || os.etapa === para || !d?.podeMover) return;
    if (!podeIr(os.etapa, para)) { setAviso(`Não dá para ir de "${ETAPA_INFO[os.etapa].label}" para "${ETAPA_INFO[para].label}".`); return; }
    setMover({ os, para });
  };

  return (
    <div className="frota-pg" style={{ padding: '24px 32px', fontFamily: 'Inter, sans-serif' }}>
      <CabecalhoFrota
        icone={<Wrench size={20} color={AZUL_FROTA} />}
        titulo="Oficina"
        resumo="Ordem de serviço da frota: o que está na oficina, o que espera peça e quanto tempo cada carro está parado."
        acoes={<button type="button" onClick={() => setNova(true)} disabled={!d || d.migracaoFaltando} style={botao('primario')}><Plus size={16} /> Nova OS</button>}
      />

      {erro && <p role="alert" style={{ color: '#b91c1c', fontSize: 13.5, fontWeight: 700 }}>{erro}</p>}
      {aviso && (
        <div role="status" style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px', marginBottom: 14, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', fontSize: 13.5, fontWeight: 600 }}>
          <span style={{ flex: 1 }}>{aviso}</span>
          <button type="button" onClick={() => setAviso('')} style={{ ...botao(), minHeight: 28, padding: '3px 8px' }}>OK</button>
        </div>
      )}

      {!d && !erro && <CarregandoFrota kpis={4} linhas={3} />}
      {d?.migracaoFaltando && (
        <VazioFrota titulo="A oficina ainda não está ligada" texto={<>Falta aplicar <code>sql/frota-oficina.sql</code> no Supabase. Depois disso esta tela passa a funcionar sem outra mudança.</>} />
      )}

      {d && !d.migracaoFaltando && (
        <>
          <KpisFrota>
            <KpiFrota rotulo="Na oficina" valor={ativas.length} contexto={`${ativas.filter((o) => o.etapa === 'aberta').length} aberta(s) esperando entrar`} />
            <KpiFrota rotulo="Parados agora" valor={parados.length} tom={parados.length ? 'ruim' : 'bom'}
              contexto={parados.length ? `${fmtParado(diasParados)} somados · ≈ ${fmtReais(custoParados)}` : 'nenhum carro parado pela oficina'}
              title="Do dia em que entrou na oficina até ficar pronto. Custo estimado: R$ 250 por dia." />
            <KpiFrota rotulo="Aguardando peça" valor={aguardando.length} tom={atrasadas ? 'ruim' : aguardando.length ? 'atencao' : 'neutro'}
              contexto={atrasadas ? `${atrasadas} com a previsão vencida` : 'previsões em dia'} />
            <KpiFrota rotulo="Entregues em 30 dias" valor={concluidas.length}
              contexto={`${concluidas.reduce((s, o) => s + o.dias_parado, 0)} dias parados no total`} />
          </KpisFrota>

          {!d.podeMover && (
            <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--portal-text-secondary)' }}>
              Você pode abrir OS e acompanhar. Quem muda as etapas é o Pós-Vendas.
            </p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(250px, 100%), 1fr))', gap: 12, alignItems: 'start' }}>
            {ETAPAS_ATIVAS.map((etapa) => {
              const info = ETAPA_INFO[etapa];
              const cartoes = ativas.filter((o) => o.etapa === etapa);
              const origem = ativas.find((o) => o.id === arrastando);
              const aceita = !!origem && origem.etapa !== etapa && podeIr(origem.etapa, etapa);
              return (
                <section key={etapa}
                  onDragOver={(e) => { if (aceita) { e.preventDefault(); setSobre(etapa); } }}
                  onDragLeave={() => setSobre((s) => (s === etapa ? null : s))}
                  onDrop={() => soltar(etapa)}
                  style={{
                    background: 'var(--portal-bg-secondary)', border: `1px solid ${sobre === etapa ? info.cor : 'var(--portal-border)'}`,
                    borderTop: `4px solid ${info.cor}`, padding: 10, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0,
                    opacity: origem && !aceita && origem.etapa !== etapa ? 0.45 : 1,
                  }}>
                  <h2 style={{ margin: 0, fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--portal-text)', display: 'flex', justifyContent: 'space-between' }}>
                    {info.label}<span style={{ color: 'var(--portal-text-secondary)' }}>{cartoes.length}</span>
                  </h2>
                  {!cartoes.length && <span style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)', padding: '6px 2px' }}>Nenhuma OS.</span>}
                  {cartoes.map((o) => {
                    const dias = diasEntre(o.etapa_desde, agora);
                    const atrasoPeca = pecaAtrasada(o, hoje);
                    const vermelho = dias > DIAS_ALERTA_ETAPA || atrasoPeca;
                    const feitos = o.itens.filter((i) => i.feito).length;
                    return (
                      <button key={o.id} type="button" draggable={d.podeMover}
                        onDragStart={() => setArrastando(o.id)} onDragEnd={() => { setArrastando(null); setSobre(null); }}
                        onClick={() => abrir(o.id)}
                        style={{ textAlign: 'left', font: 'inherit', cursor: 'pointer', background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderLeft: `4px solid ${o.parado ? '#b91c1c' : info.cor}`, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4, color: 'var(--portal-text)', borderRadius: 0 }}>
                        <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                          <strong style={{ fontSize: 15 }}>{formatarPlaca(o.placa)}</strong>
                          <span style={{ fontSize: 11.5, color: 'var(--portal-text-secondary)', whiteSpace: 'nowrap' }}>{o.rotulo}</span>
                        </span>
                        {o.veiculo && <span style={{ fontSize: 12, color: 'var(--portal-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.veiculo}</span>}
                        <span style={{ fontSize: 12.5 }}>
                          {o.itens.length ? `${feitos} de ${o.itens.length} itens feitos` : (o.descricao || 'sem itens')}
                          {' · '}{o.oficina === 'externa' ? (o.fornecedor || 'oficina externa') : 'oficina própria'}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: vermelho ? 800 : 600, color: vermelho ? '#b91c1c' : 'var(--portal-text-secondary)' }}>
                          {resumoEtapa(o, agora)}{atrasoPeca ? ' · previsão vencida' : ''}
                        </span>
                        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {o.parado && <span style={{ fontSize: 10.5, fontWeight: 800, background: '#fee2e2', color: '#991b1b', padding: '2px 7px' }}>PARADO · {fmtParado(o.dias_parado)}</span>}
                          {o.requisicao && <span style={{ fontSize: 10.5, fontWeight: 800, background: '#e0e7ff', color: '#3730a3', padding: '2px 7px' }}>REQ #{o.requisicao.id}</span>}
                        </span>
                      </button>
                    );
                  })}
                </section>
              );
            })}
          </div>

          <details style={{ marginTop: 20 }}>
            <summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 800, color: 'var(--portal-text)' }}>
              Encerradas nos últimos 30 dias ({encerradas.length})
            </summary>
            <div style={{ marginTop: 10, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', overflowX: 'auto' }}>
              {!encerradas.length && <div style={{ padding: 16, fontSize: 13, color: 'var(--portal-text-secondary)' }}>Nenhuma OS encerrada no período.</div>}
              {encerradas.map((o) => (
                <button key={o.id} type="button" onClick={() => abrir(o.id)}
                  style={{ width: '100%', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '10px 14px', border: 'none', borderTop: '1px solid var(--portal-border)', background: 'transparent', font: 'inherit', textAlign: 'left', cursor: 'pointer', color: 'var(--portal-text)' }}>
                  <strong style={{ minWidth: 90 }}>{formatarPlaca(o.placa)}</strong>
                  <span style={{ minWidth: 70, fontSize: 12.5, color: 'var(--portal-text-secondary)' }}>{o.rotulo}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, padding: '2px 8px', background: ETAPA_INFO[o.etapa].fundo, color: ETAPA_INFO[o.etapa].cor }}>{ETAPA_INFO[o.etapa].label}</span>
                  <span style={{ flex: 1, minWidth: 160, fontSize: 13 }}>{o.itens.map((i) => i.descricao).join(', ') || o.descricao || '—'}</span>
                  <span style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)' }}>
                    {fmtDataHora(o.concluida_em || o.etapa_desde)}{o.dias_parado ? ` · ${fmtParado(o.dias_parado)} parado` : ''}
                  </span>
                </button>
              ))}
            </div>
          </details>
        </>
      )}

      {nova && d && (
        <NovaOS veiculos={d.veiculos} onFechar={() => setNova(false)}
          onFeito={(msg, id) => { setNova(false); depois(msg); if (id) abrir(id); }} />
      )}
      {incluirEm && d && (
        <NovaOS veiculos={d.veiculos} osExistente={incluirEm} onFechar={() => setIncluirEm(null)}
          onFeito={(msg) => { setIncluirEm(null); depois(msg); }} />
      )}
      {selecionada && !mover && !incluirEm && (
        <OsDetalhe os={selecionada} podeMover={!!d?.podeMover} onFechar={() => abrir(null)}
          onMover={(para) => setMover({ os: selecionada, para })}
          onIncluir={() => setIncluirEm(selecionada)}
          onMudou={(msg) => depois(msg)} />
      )}
      {mover && (
        <MudarEtapa os={mover.os} para={mover.para} onFechar={() => setMover(null)}
          onFeito={(msg) => { setMover(null); depois(msg); }} />
      )}
    </div>
  );
}

export default function OficinaPage() {
  return <Suspense fallback={null}><OficinaTela /></Suspense>;
}
