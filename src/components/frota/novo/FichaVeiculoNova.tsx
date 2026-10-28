'use client';
// Ficha do carro no "Estilo POS NewPortal" (José, 22/10/2026): o CHECKLIST DO MÊS
// em destaque logo no topo (situação, fotos, pendências, linha do tempo dos meses);
// depois o que pede atenção (pendências, documentos), o uso e o custo, e o cadastro.
// Só leitura — editar continua na ficha completa (botão "Editar ficha").
import { useEffect, useMemo, useState } from 'react';
import { authHeaders } from '@/lib/auth/client';
import { formatarPlaca } from '@/lib/frota/placa';
import { corSetor, rotuloSetor } from '@/lib/frota/setores';
import { ehPendencia, ordenarItens, type ItemVisao } from '@/lib/frota/checklist-visao';
import type { ChecklistVeiculo, VeiculoDetalhe } from '@/lib/frota/tipos';
import ChecklistViewer, { corScore, nomeMes } from './ChecklistViewer';
import { ESTILO_FROTA_NOVO } from './estilo';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (s: string | null | undefined) => (s ? new Date(`${String(s).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—');
const mesAtual = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
// datas de referência do vencimento dos documentos (fora do render: regra de pureza do React)
const hojeISO = () => new Date().toISOString().slice(0, 10);
const em30ISO = () => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
const horas = (min: number) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;

type Situacao = { rot: string; cor: string; ico: string };
function situacaoChecklist(c: ChecklistVeiculo | undefined, desligado: string | null): Situacao {
  if (desligado) return { rot: desligado, cor: '#64748b', ico: 'fa-circle-pause' };
  if (!c) return { rot: 'Ainda não foi feito', cor: '#dc2626', ico: 'fa-circle-exclamation' };
  if (c.status === 'suspeito' || (c.score_confianca != null && c.score_confianca < 50)) return { rot: 'Feito, mas suspeito', cor: '#dc2626', ico: 'fa-shield-halved' };
  if (c.status === 'completo') return { rot: 'Feito', cor: '#16a34a', ico: 'fa-circle-check' };
  return { rot: 'Em andamento', cor: '#d97706', ico: 'fa-hourglass-half' };
}

function Cartao({ cor, ico, titulo, extra, children }: { cor: string; ico: string; titulo: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
  <section className="fn-card fn-entra" style={{ ['--fn-cor' as string]: cor, display: 'grid', gap: 10, alignContent: 'start' }}>
    <h3 className="fn-titulo"><span className="fn-ico p"><i className={`fa-solid ${ico}`} /></span>{titulo}<span style={{ flex: 1 }} />{extra}</h3>
    {children}
  </section>
);
}

interface Props {
  placa: string;
  /** pendências da lista (mesma régua que pinta o card) */
  pendencias?: string[];
  onClose: () => void;
  onEditar?: () => void;
}

export default function FichaVeiculoNova({ placa, pendencias = [], onClose, onEditar }: Props) {
  const [det, setDet] = useState<VeiculoDetalhe | null>(null);
  const [erro, setErro] = useState('');
  const [fotosMes, setFotosMes] = useState<ItemVisao[] | null>(null);
  const [aberto, setAberto] = useState<ChecklistVeiculo | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/frota/veiculos/${encodeURIComponent(placa)}`, { headers: await authHeaders() });
        const d = await r.json();
        if (!vivo) return;
        if (!r.ok) setErro(d.error || 'Falha ao carregar.'); else setDet(d);
      } catch (e) { if (vivo) setErro(String(e)); }
    })();
    return () => { vivo = false; };
  }, [placa]);

  const checklists = useMemo(() => [...(det?.checklists || [])].sort((a, b) => b.mes_referencia.localeCompare(a.mes_referencia)), [det]);
  const doMes = checklists.find((c) => c.mes_referencia === mesAtual());
  const ultimo = doMes || checklists[0];
  const anteriorDe = (c: ChecklistVeiculo) => checklists.find((x) => x.mes_referencia < c.mes_referencia) || null;

  // fotos do checklist mais recente para a vitrine do destaque
  useEffect(() => {
    if (!ultimo) return;
    let vivo = true;
    (async () => {
      const r = await fetch(`/api/frota/checklist-itens?id=${encodeURIComponent(ultimo.id)}`, { headers: await authHeaders() });
      const d = await r.json().catch(() => ({}));
      if (vivo && r.ok) setFotosMes(d.itens || []);
    })();
    return () => { vivo = false; };
  }, [ultimo]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !aberto) onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [aberto, onClose]);

  const v = det?.veiculo;
  const setor = v?.setor || null;
  const corV = corSetor(setor);
  const respAtual = det?.responsaveis.find((r) => r.fim === null && r.motorista_nome);
  const foraDaFrota = v && (v.status === 'vendido' || v.status === 'arquivado');
  const desligado = !v ? null
    : foraDaFrota ? 'Fora da frota — não faz checklist'
      : v.sem_uso ? 'Carro sem uso — não faz checklist'
        : v.checklist_desativado ? 'Checklist desligado neste carro' : null;
  const sit = situacaoChecklist(doMes, desligado);
  const pendMes = (fotosMes || []).filter(ehPendencia);
  const vitrine = ordenarItens((fotosMes || []).filter((i) => i.foto_url)).sort((a, b) => Number(ehPendencia(b)) - Number(ehPendencia(a))).slice(0, 6);
  const custoTotal = (det?.custos_12m || []).reduce((s, c) => s + c.total, 0);
  const multasAbertas = (det?.multas || []).filter((m) => !['paga', 'descontada', 'arquivada'].includes(String((m as { status_interno?: string }).status_interno || '')));
  const docs = [...(det?.documentos || [])].sort((a, b) => String(a.vigencia_fim || '9').localeCompare(String(b.vigencia_fim || '9')));

  // linha do tempo: últimos 12 meses, do mais antigo ao atual
  const meses = useMemo(() => {
    const out: string[] = [];
    const d = new Date(`${mesAtual()}-15T12:00:00`);
    for (let n = 11; n >= 0; n--) { const x = new Date(d); x.setMonth(d.getMonth() - n); out.push(x.toISOString().slice(0, 7)); }
    return out;
  }, []);

  return (
    <div className="fn" role="dialog" aria-modal="true" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 9400, background: 'rgba(15,23,42,.45)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', padding: 'clamp(0px, 2vw, 24px)' }}>
      <style>{ESTILO_FROTA_NOVO}</style>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(1280px, 100%)', maxHeight: '100%', overflowY: 'auto', background: 'var(--fn-soft)', borderRadius: 20, boxShadow: '0 30px 80px -30px rgba(15,23,42,.6)' }}>
        {erro && <div style={{ padding: 24, color: '#b91c1c' }}>{erro}</div>}
        {!det && !erro && <div className="fn-sub" style={{ padding: 32 }}>Carregando a ficha…</div>}

        {det && v && (
          <div style={{ padding: 'clamp(12px, 2vw, 22px)', display: 'grid', gap: 14 }}>
            {/* ── cabeçalho ── */}
            <div className="fn-card" style={{ ['--fn-cor' as string]: corV, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              {det.imagem_url
                ? <img src={det.imagem_url} alt="" style={{ width: 112, height: 84, objectFit: 'cover', borderRadius: 12, background: 'var(--fn-soft)' }} />
                : <span className="fn-ico" style={{ width: 84, height: 84, borderRadius: 16, fontSize: 30 }}><i className="fa-solid fa-car-side" /></span>}
              <div style={{ minWidth: 0, flex: '1 1 260px', display: 'grid', gap: 5 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="fn-placa" style={{ fontSize: 15 }}>{formatarPlaca(v.placa)}</span>
                  <span className="fn-pilula" style={{ ['--fn-cor' as string]: corV }}>{rotuloSetor(setor)}</span>
                  {v.sem_uso && <span className="fn-pilula" style={{ ['--fn-cor' as string]: '#d97706' }}>Sem uso</span>}
                  {v.status === 'vendido' && <span className="fn-pilula" style={{ ['--fn-cor' as string]: '#7c3aed' }}>Vendido</span>}
                  {v.status === 'arquivado' && <span className="fn-pilula">Arquivado</span>}
                  {v.status && ['manutencao', 'parado'].includes(v.status) && <span className="fn-pilula" style={{ ['--fn-cor' as string]: '#dc2626' }}>{v.status === 'manutencao' ? 'Em manutenção' : 'Parado'}</span>}
                </div>
                <div style={{ fontSize: 20, fontWeight: 500, letterSpacing: '-.01em' }}>{[v.marca, v.modelo || v.descricao].filter(Boolean).join(' ') || '—'}{v.ano ? <span className="fn-sub"> · {v.ano}</span> : null}</div>
                <div className="fn-sub" style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  <span><i className="fa-regular fa-user" /> {respAtual ? <>{respAtual.motorista_nome} <span style={{ color: 'var(--fn-text3)' }}>desde {dataBR(respAtual.inicio)}</span></> : 'Sem responsável'}</span>
                  {det.km_odometro != null && <span><i className="fa-solid fa-gauge" /> {Math.round(det.km_odometro).toLocaleString('pt-BR')} km <span style={{ color: 'var(--fn-text3)' }}>({det.km_odometro_fonte === 'rastreador' ? 'rastreador' : 'bomba'})</span></span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {onEditar && <button className="fn-btn" onClick={onEditar}><i className="fa-solid fa-pen" /> Editar ficha</button>}
                <button className="fn-btn" onClick={onClose} aria-label="Fechar"><i className="fa-solid fa-xmark" /></button>
              </div>
            </div>

            {/* ── CHECKLIST DO MÊS (destaque) ── */}
            <section className="fn-card fn-entra" style={{ ['--fn-cor' as string]: sit.cor, padding: 18, display: 'grid', gap: 14,
              borderColor: `color-mix(in srgb, ${sit.cor} 40%, var(--fn-border))`, background: `color-mix(in srgb, ${sit.cor} 4%, var(--fn-surface))` }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="fn-ico" style={{ width: 48, height: 48, borderRadius: 13, fontSize: 20 }}><i className={`fa-solid ${sit.ico}`} /></span>
                <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                  <div className="fn-rot">Checklist de {nomeMes(mesAtual())}</div>
                  <div style={{ fontSize: 20, fontWeight: 500, color: sit.cor }}>{sit.rot}</div>
                  {doMes ? (
                    <div className="fn-sub" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <span><i className="fa-regular fa-user" /> {doMes.tecnico_nome || '—'}</span>
                      <span><i className="fa-regular fa-calendar" /> {dataBR(doMes.fim_em || doMes.inicio_em)}</span>
                      {doMes.km != null && <span><i className="fa-solid fa-gauge" /> {doMes.km.toLocaleString('pt-BR')} km</span>}
                      {doMes.score_confianca != null && <span style={{ color: corScore(doMes.score_confianca) }}><i className="fa-solid fa-shield-halved" /> confiança {doMes.score_confianca}%</span>}
                    </div>
                  ) : !desligado && (
                    <div className="fn-sub">{respAtual ? `${respAtual.motorista_nome} ainda não fez o checklist deste mês.` : 'Carro sem responsável: o checklist pode ser feito pelo portal.'}</div>
                  )}
                </div>
                {doMes && fotosMes && (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ textAlign: 'center' }}><div className="fn-num" style={{ color: pendMes.length ? '#dc2626' : '#16a34a' }}>{pendMes.length}</div><div className="fn-rot">pendência(s)</div></div>
                    <div style={{ textAlign: 'center' }}><div className="fn-num">{fotosMes.filter((i) => i.foto_url).length}</div><div className="fn-rot">fotos</div></div>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {ultimo && <button className="fn-btn cheio" onClick={() => setAberto(ultimo)}><i className="fa-solid fa-images" /> Abrir checklist{doMes ? '' : ` de ${nomeMes(ultimo.mes_referencia)}`}</button>}
                  {!doMes && !desligado && !respAtual && <a className="fn-btn" href={`/frota/checklist/${encodeURIComponent(v.placa)}`} target="_blank" rel="noopener noreferrer"><i className="fa-solid fa-mobile-screen" /> Fazer checklist</a>}
                </div>
              </div>

              {/* pendências do checklist, uma por linha */}
              {pendMes.length > 0 && (
                <div style={{ display: 'grid', gap: 6 }}>
                  {pendMes.slice(0, 4).map((p) => (
                    <button key={p.id} onClick={() => setAberto(doMes || ultimo || null)} className="fn-linha" style={{ border: 'none', background: 'var(--fn-surface)', borderRadius: 10, padding: '8px 12px', cursor: 'pointer', font: 'inherit', color: 'inherit', textAlign: 'left' }}>
                      <span style={{ color: '#b91c1c' }}><i className="fa-solid fa-triangle-exclamation" /> {p.titulo || p.item_key}</span>
                      <span className="fn-sub">{p.observacao || (p.ia_analise?.comprova === false ? 'foto não comprova (IA)' : 'problema')}</span>
                    </button>
                  ))}
                  {pendMes.length > 4 && <span className="fn-sub">+ {pendMes.length - 4} pendência(s) — abra o checklist.</span>}
                </div>
              )}

              {/* vitrine de fotos (pendências primeiro) */}
              {vitrine.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
                  {vitrine.map((f) => (
                    <button key={f.id} onClick={() => setAberto(ultimo || null)} style={{ position: 'relative', padding: 0, border: 'none', background: 'none', cursor: 'zoom-in' }} title={f.titulo || ''}>
                      <img src={f.foto_url || ''} alt={f.titulo || ''} className="fn-foto" loading="lazy" style={{ outline: ehPendencia(f) ? '2px solid #dc2626' : 'none' }} />
                      <span style={{ position: 'absolute', left: 6, bottom: 6, right: 6, fontSize: 11, color: '#fefefe', background: 'rgba(0,0,0,.55)', borderRadius: 6, padding: '1px 6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}>{f.titulo}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* linha do tempo dos últimos 12 meses */}
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
                {meses.map((m) => {
                  const c = checklists.find((x) => x.mes_referencia === m);
                  const s = situacaoChecklist(c, null);
                  const futuro = m > mesAtual();
                  return (
                    <button key={m} disabled={!c} onClick={() => c && setAberto(c)}
                      title={c ? `${nomeMes(m)}: ${s.rot.toLowerCase()} · ${c.tecnico_nome || ''}` : `${nomeMes(m)}: sem checklist`}
                      style={{ flex: '1 0 54px', display: 'grid', justifyItems: 'center', gap: 3, padding: '6px 4px', borderRadius: 10, border: '1px solid var(--fn-border)', background: 'var(--fn-surface)', cursor: c ? 'pointer' : 'default', font: 'inherit', opacity: futuro ? 0.4 : 1 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 999, background: c ? s.cor : 'var(--fn-border)' }} />
                      <span style={{ fontSize: 11.5, color: 'var(--fn-text2)' }}>{nomeMes(m).slice(0, 3)}/{m.slice(2, 4)}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* ── o que pede atenção · uso · cadastro ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 14, alignItems: 'start' }}>
              <Cartao cor={pendencias.length ? '#dc2626' : '#16a34a'} ico="fa-list-check" titulo="Pendências do carro" extra={<span className="fn-pilula" style={{ ['--fn-cor' as string]: pendencias.length ? '#dc2626' : '#16a34a' }}>{pendencias.length}</span>}>
                {pendencias.length === 0
                  ? <span className="fn-sub"><i className="fa-solid fa-circle-check" style={{ color: '#16a34a' }} /> Nada pendente no cadastro.</span>
                  : <div>{pendencias.map((p) => <div key={p} className="fn-linha"><span style={{ color: 'var(--fn-text)' }}>{p}</span><span /></div>)}</div>}
              </Cartao>

              <Cartao cor="#0891b2" ico="fa-file-shield" titulo="Documentos" extra={<span className="fn-pilula">{docs.length}</span>}>
                {docs.length === 0 ? <span className="fn-sub">Nenhum documento cadastrado.</span> : (
                  <div>{docs.slice(0, 5).map((d) => {
                    const hoje = hojeISO(); const em30 = em30ISO();
                    const venc = d.vigencia_fim && d.vigencia_fim < hoje; const logo = d.vigencia_fim && !venc && d.vigencia_fim <= em30;
                    return (
                      <div key={d.id} className="fn-linha">
                        <span style={{ color: 'var(--fn-text)' }}>{d.tipo.toUpperCase() === d.tipo ? d.tipo : d.tipo}{d.arquivo_url && <a href={d.arquivo_url} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 6, color: '#2563eb' }}><i className="fa-solid fa-paperclip" /></a>}</span>
                        <span style={{ color: venc ? '#dc2626' : logo ? '#d97706' : 'var(--fn-text2)' }}>{d.vigencia_fim ? `${venc ? 'venceu' : 'vence'} ${dataBR(d.vigencia_fim)}` : 'sem validade'}</span>
                      </div>
                    );
                  })}</div>
                )}
              </Cartao>

              <Cartao cor="#7c3aed" ico="fa-route" titulo="Uso nos últimos 30 dias">
                {det.uso_30d.dias_com_uso === 0 ? <span className="fn-sub">Sem dados do rastreador neste período.</span> : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                    {[
                      ['Rodou', `${det.uso_30d.km.toLocaleString('pt-BR')} km`],
                      ['Dias com uso', String(det.uso_30d.dias_com_uso)],
                      ['Ligado', horas(det.uso_30d.tempo_ligado_min)],
                      ['Paradas fora do lugar', String(det.uso_30d.paradas_atipicas)],
                    ].map(([r, val]) => <div key={r}><div style={{ fontSize: 18, fontWeight: 500 }}>{val}</div><div className="fn-rot">{r}</div></div>)}
                  </div>
                )}
              </Cartao>

              <Cartao cor="#059669" ico="fa-sack-dollar" titulo="Custo em 12 meses" extra={<span style={{ fontSize: 17, fontWeight: 500 }}>{brl(custoTotal)}</span>}>
                {(det.custos_12m || []).length === 0 ? <span className="fn-sub">Sem custos lançados.</span> : (
                  <div>{[...det.custos_12m].sort((a, b) => b.total - a.total).map((c) => (
                    <div key={c.tipo} className="fn-linha"><span>{c.tipo}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{brl(c.total)}</span></div>
                  ))}</div>
                )}
              </Cartao>

              <Cartao cor="#dc2626" ico="fa-receipt" titulo="Multas e manutenções">
                <div>
                  <div className="fn-linha"><span>Multas em aberto</span><span style={{ color: multasAbertas.length ? '#dc2626' : undefined }}>{multasAbertas.length}{multasAbertas.length ? ` · ${brl(multasAbertas.reduce((s, m) => s + Number(m.valor || 0), 0))}` : ''}</span></div>
                  {det.manutencoes.slice(0, 3).map((m) => (
                    <div key={m.id} className="fn-linha"><span>{m.descricao || m.tipo || 'Manutenção'}</span><span>{dataBR(m.data)}{m.valor_total ? ` · ${brl(m.valor_total)}` : ''}</span></div>
                  ))}
                  {det.manutencoes.length === 0 && <div className="fn-linha"><span>Manutenções</span><span>nenhuma registrada</span></div>}
                </div>
              </Cartao>

              <Cartao cor="#475569" ico="fa-id-card" titulo="Cadastro">
                <div>
                  {[
                    ['Chassi', v.chassi], ['RENAVAM', v.renavam], ['Cor', v.cor], ['Combustível', v.combustivel],
                    ['Proprietário', v.proprietario], ['Documento (exercício)', v.exercicio_crlv],
                  ].map(([r, val]) => <div key={String(r)} className="fn-linha"><span>{r}</span><span>{val == null || val === '' ? '—' : String(val)}</span></div>)}
                </div>
              </Cartao>

              <Cartao cor="#2563eb" ico="fa-users" titulo="Quem já ficou com o carro">
                <div>{det.responsaveis.filter((r) => r.motorista_nome).slice(0, 5).map((r) => (
                  <div key={r.id} className="fn-linha"><span style={{ color: 'var(--fn-text)' }}>{r.motorista_nome}</span><span>{dataBR(r.inicio)} → {r.fim ? dataBR(r.fim) : 'hoje'}</span></div>
                ))}</div>
              </Cartao>
            </div>
          </div>
        )}
      </div>

      {aberto && <div onClick={(e) => e.stopPropagation()}><ChecklistViewer checklist={aberto} anterior={anteriorDe(aberto)} onClose={() => setAberto(null)} /></div>}
    </div>
  );
}
