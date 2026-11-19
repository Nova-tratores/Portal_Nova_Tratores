'use client';
// /financeiro/notas em abas: Notas (a tela de sempre + totais de hoje e do mês) ·
// Problemas (notas rejeitadas/presas) · Envios ao Omie (o que falhou ao gravar na Omie).
// Só VER: cada linha leva para a tela do caso. Plano: docs/painel-notas-e-erros-omie.md
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { RefreshCw, ExternalLink } from 'lucide-react';
import { authHeaders } from '@/lib/auth/client';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';
import { fmtRS } from '@/components/estoque/ui';
import {
  ROTULO_SITUACAO, ROTULO_GRUPO, haQuanto,
  type LinhaPainel, type Situacao, type Totais, type GrupoTotal,
} from '@/lib/notas/painel';
import NotasFiscais from './NotasFiscais';

type Aba = 'notas' | 'problemas' | 'envios';
type Resp = { linhas: LinhaPainel[]; contagem: Record<Situacao, number>; avisos: string[]; porta?: unknown; error?: string };

const AZUL = '#2563eb';
const COR_SITUACAO: Record<Situacao, string> = {
  rejeitada: '#dc2626', presa: '#d97706', incerta: '#7c3aed', falhou: '#dc2626',
  sem_documento: '#64748b', robo: '#0891b2', resolvida: '#16a34a',
};

export const ESTILO_PAINEL = `
.pn-faixa { display: flex; align-items: flex-end; gap: 4px; padding: 8px clamp(12px, 2vw, 28px) 0; background: linear-gradient(135deg, #dbeafe, #93c5fd); overflow-x: auto; scrollbar-width: none }
.pn-faixa::-webkit-scrollbar { display: none }
.pn-guia { display: inline-flex; align-items: center; gap: 8px; min-height: 42px; padding: 0 18px; border: none; border-radius: 12px 12px 0 0; background: color-mix(in srgb, #fefefe 55%, transparent); color: #111111; font-size: 15.5px; cursor: pointer; white-space: nowrap; transition: background .15s }
.pn-guia:hover { background: color-mix(in srgb, #fefefe 80%, transparent) }
.pn-guia.on { background: color-mix(in srgb, var(--portal-text, #0f172a) 6%, var(--portal-bg, #fafafa)); color: var(--portal-text, #0f172a); font-weight: 600 }
.pn-badge { min-width: 22px; height: 22px; padding: 0 7px; border-radius: 999px; display: inline-grid; place-items: center; font-size: 12.5px; font-weight: 700; color: #fefefe; background: #dc2626 }
.pn-badge.zero { background: #16a34a }
.pn-corpo { background: color-mix(in srgb, var(--portal-text, #0f172a) 6%, var(--portal-bg, #fafafa)); min-height: calc(100vh - 190px); padding: clamp(12px, 2vw, 28px); display: flex; flex-direction: column; gap: 12px; color: var(--portal-text, #0f172a) }
.pn-cartao { background: var(--surface, #fefefe); border: 1px solid var(--border, #e2e8f0); border-radius: 16px }
.pn-tot { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; padding: 10px 12px }
.pn-tot-item { border-left: 4px solid var(--c, #64748b); padding: 6px 10px; border-radius: 8px; background: color-mix(in srgb, var(--c, #64748b) 6%, var(--surface, #fefefe)) }
.pn-tot-item b { display: block; font-size: 13.5px; color: var(--c, #64748b) }
.pn-tot-linha { font-size: 14.5px; font-variant-numeric: tabular-nums }
.pn-tot-linha small { color: var(--portal-text-secondary, #475569) }
.pn-chips { display: flex; flex-wrap: wrap; gap: 6px }
.pn-chip { --c: #64748b; min-height: 40px; padding: 0 12px; border-radius: 999px; border: 1px solid color-mix(in srgb, var(--c) 30%, transparent); background: var(--surface, #fefefe); color: var(--portal-text, #0f172a); font-size: 14.5px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px }
.pn-chip i { width: 9px; height: 9px; border-radius: 50%; background: var(--c) }
.pn-chip.on { background: color-mix(in srgb, var(--c) 14%, var(--surface, #fefefe)); box-shadow: 0 0 0 1.5px var(--c) }
.pn-ctrl { min-height: 40px; padding: 0 12px; border: 1px solid var(--border, #e2e8f0); border-radius: 10px; font-size: 15px; background: var(--surface, #fefefe); color: var(--portal-text, #0f172a) }
.pn-tabela-wrap { overflow-x: auto }
.pn-tabela { width: 100%; border-collapse: collapse; font-size: 15px }
.pn-tabela th { text-align: left; font-weight: 400; font-size: 13.5px; color: var(--portal-text-secondary, #475569); padding: 8px 10px; border-bottom: 1px solid var(--border, #e2e8f0); background: var(--portal-bg-secondary, #f8fafc); white-space: nowrap }
.pn-tabela td { padding: 10px; border-bottom: 1px solid var(--border, #e2e8f0); vertical-align: top }
.pn-tabela tr:last-child td { border-bottom: none }
.pn-sel { --c: #64748b; display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 13px; white-space: nowrap; color: var(--c); background: color-mix(in srgb, var(--c) 11%, transparent); border: 1px solid color-mix(in srgb, var(--c) 30%, transparent) }
.pn-motivo { max-width: 520px; overflow-wrap: anywhere }
.pn-abrir { display: inline-flex; align-items: center; gap: 5px; min-height: 40px; padding: 0 12px; border-radius: 10px; border: 1px solid color-mix(in srgb, ${AZUL} 30%, transparent); color: ${AZUL}; text-decoration: none; font-size: 14.5px; white-space: nowrap }
.pn-cards { display: none; flex-direction: column; gap: 8px }
.pn-card { padding: 12px; display: flex; flex-direction: column; gap: 6px; border-left: 4px solid var(--c, #64748b) }
.pn-muted { color: var(--portal-text-secondary, #475569); font-size: 13.5px }
@media (max-width: 767px) {
  .pn-tabela-wrap { display: none }
  .pn-cards { display: flex }
  .pn-guia { padding: 0 12px; font-size: 14.5px }
}
`;

function useBuscar<T>(url: string | null) {
  const [dados, setDados] = useState<T | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    if (!url) return;
    let vivo = true;
    (async () => {
      setCarregando(true); setErro('');
      try {
        const r = await fetch(url, { headers: await authHeaders(), cache: 'no-store' });
        const j = await r.json();
        if (!vivo) return;
        if (!r.ok) setErro(j?.error || `Erro ${r.status}`); else setDados(j);
      } catch (e) { if (vivo) setErro(e instanceof Error ? e.message : String(e)); }
      finally { if (vivo) setCarregando(false); }
    })();
    return () => { vivo = false; };
  }, [url, versao]);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  return { dados, carregando, erro, recarregar };
}

// ── totais de hoje e do mês (aba Notas) ───────────────────────────────────

const COR_GRUPO: Record<GrupoTotal, string> = { nfse: '#0369a1', nfe_pecas: '#ea580c', nfe_maquinas: '#b91c1c', nfe_outras: '#64748b', entrada: '#059669' };

export function TotaisHojeMes() {
  const { contaParam } = useConta();
  const { dados } = useBuscar<{ totais: Totais; avisos: string[] }>(`/api/financeiro/notas/painel?aba=totais${contaParam}`);
  if (!dados?.totais) return null;
  const t = dados.totais;
  const grupos = (Object.keys(ROTULO_GRUPO) as GrupoTotal[]).filter((g) => t.mes[g].qtd || t.mes[g].canceladas);
  const [a, m, d] = t.dia.split('-');
  return (
    <div className="pn-cartao" style={{ padding: '10px 12px 4px' }}>
      <div className="pn-muted" style={{ padding: '0 2px' }}>Notas emitidas hoje ({d}/{m}) e no mês ({m}/{a}) — canceladas fora do valor</div>
      <div className="pn-tot">
        {grupos.length === 0 && <span className="pn-muted">Nenhuma nota no mês ainda.</span>}
        {grupos.map((g) => (
          <div key={g} className="pn-tot-item" style={{ ['--c' as string]: COR_GRUPO[g] }}>
            <b>{ROTULO_GRUPO[g]}</b>
            <div className="pn-tot-linha"><small>Hoje </small>{t.hoje[g].qtd} · {fmtRS(t.hoje[g].valor)}</div>
            <div className="pn-tot-linha"><small>Mês </small>{t.mes[g].qtd} · {fmtRS(t.mes[g].valor)}{t.mes[g].canceladas ? <small> · {t.mes[g].canceladas} canc.</small> : null}</div>
          </div>
        ))}
      </div>
      {dados.avisos?.map((x) => <div key={x} className="pn-muted" style={{ padding: '0 4px 6px' }}>{x}</div>)}
    </div>
  );
}

// ── lista (Problemas / Envios) ────────────────────────────────────────────

const COMO_LER: Record<'problemas' | 'envios', string[]> = {
  problemas: [
    'Cada linha é um caso que ainda precisa de alguém: nota rejeitada pela prefeitura/SEFAZ, nota que foi mandada e não voltou, remessa ou devolução que a Omie não aceitou.',
    '"Nota não voltou" só aparece depois de 30 minutos sem resposta (antes disso é normal).',
    '"Sem PDF/XML": a nota existe, mas a Omie não devolveu o arquivo depois de várias tentativas. Clique para ver no arquivo de notas.',
    'Abrir leva para a OS, o recebimento ou a remessa. Nada é refeito por esta tela.',
  ],
  envios: [
    'Tudo o que falhou ao gravar na Omie no período: faturar OS/PPV, remessas, devoluções, contas a pagar, características de peças — e os robôs com erro.',
    '"Resposta incerta": a Omie não confirmou. "Resolvida depois": falhou na hora, mas o caso hoje já está certo (ex.: a NFS-e saiu).',
    'Robô que falhou várias vezes do mesmo jeito aparece numa linha só, com quantas vezes.',
  ],
};

export function ListaPainel({ aba, resp, carregando, erro, recarregar, dias, setDias }: {
  aba: 'problemas' | 'envios'; resp: Resp | null; carregando: boolean; erro: string; recarregar: () => void;
  dias: number; setDias: (n: number) => void;
}) {
  const [situacao, setSituacao] = useState<Situacao | ''>('');
  const [origem, setOrigem] = useState('');
  const [soHoje, setSoHoje] = useState(false);
  const [semRobos, setSemRobos] = useState(false);
  const agora = new Date();
  const hoje = new Date(agora.getTime() - 3 * 3600_000).toISOString().slice(0, 10);

  const linhas = useMemo(() => (resp?.linhas || []).filter((l) =>
    (!situacao || l.situacao === situacao) &&
    (!origem || l.origem === origem) &&
    (!soHoje || new Date(new Date(l.quando).getTime() - 3 * 3600_000).toISOString().slice(0, 10) === hoje) &&
    (!semRobos || l.situacao !== 'robo')), [resp, situacao, origem, soHoje, semRobos, hoje]);
  const origens = useMemo(() => [...new Set((resp?.linhas || []).map((l) => l.origem))].sort(), [resp]);
  const situacoes = (Object.keys(ROTULO_SITUACAO) as Situacao[]).filter((s) => resp?.contagem?.[s]);

  return (
    <>
      <details className="pn-cartao" style={{ padding: '10px 14px' }}>
        <summary style={{ cursor: 'pointer', fontSize: 15, minHeight: 28 }}>Como ler esta tela</summary>
        <ul style={{ margin: '8px 0 2px', paddingLeft: 20, fontSize: 14.5, lineHeight: 1.5 }}>
          {COMO_LER[aba].map((t) => <li key={t}>{t}</li>)}
        </ul>
      </details>

      <div className="pn-cartao" style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="pn-chips">
          <button type="button" className={`pn-chip${!situacao ? ' on' : ''}`} style={{ ['--c' as string]: AZUL }} onClick={() => setSituacao('')}>Todas · {resp?.linhas.length ?? 0}</button>
          {situacoes.map((s) => (
            <button key={s} type="button" className={`pn-chip${situacao === s ? ' on' : ''}`} style={{ ['--c' as string]: COR_SITUACAO[s] }} onClick={() => setSituacao(situacao === s ? '' : s)}>
              <i /> {ROTULO_SITUACAO[s]} · {resp?.contagem[s]}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <select className="pn-ctrl" value={origem} onChange={(e) => setOrigem(e.target.value)} aria-label="Origem">
            <option value="">Todas as origens</option>
            {origens.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          {aba === 'envios' && (
            <select className="pn-ctrl" value={dias} onChange={(e) => setDias(Number(e.target.value))} aria-label="Período">
              <option value={1}>Último dia</option>
              <option value={7}>Últimos 7 dias</option>
              <option value={30}>Últimos 30 dias</option>
              <option value={90}>Últimos 90 dias</option>
            </select>
          )}
          <label className="pn-ctrl" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={soHoje} onChange={(e) => setSoHoje(e.target.checked)} /> Só hoje
          </label>
          {aba === 'envios' && (
            <label className="pn-ctrl" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={semRobos} onChange={(e) => setSemRobos(e.target.checked)} /> Esconder robôs
            </label>
          )}
          <button type="button" className="pn-ctrl" onClick={recarregar} disabled={carregando} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: carregando ? 'wait' : 'pointer', marginLeft: 'auto' }}>
            <RefreshCw size={14} className={carregando ? 'animate-spin' : ''} /> Atualizar
          </button>
        </div>
      </div>

      {erro && <div className="pn-cartao" style={{ padding: '10px 14px', color: '#b91c1c' }}>{erro}</div>}
      {resp?.avisos?.map((a) => <div key={a} className="pn-cartao pn-muted" style={{ padding: '8px 14px' }}>{a}</div>)}

      {!erro && resp && linhas.length === 0 && (
        <div className="pn-cartao" style={{ padding: 24, textAlign: 'center', color: '#15803d' }}>
          {resp.linhas.length ? 'Nada com esses filtros.' : aba === 'problemas' ? 'Nenhuma nota presa ou rejeitada agora.' : 'Nenhuma falha de envio à Omie no período.'}
        </div>
      )}
      {!resp && carregando && <div className="pn-muted" style={{ padding: 12 }}>Carregando…</div>}

      {linhas.length > 0 && (
        <>
          <div className="pn-cartao pn-tabela-wrap">
            <table className="pn-tabela">
              <thead><tr><th>Situação</th><th>Quando</th><th>Origem</th><th>Documento</th><th>Cliente / fornecedor</th><th>Motivo</th><th>Quem</th><th style={{ textAlign: 'right' }}>Valor</th><th /></tr></thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id}>
                    <td><span className="pn-sel" style={{ ['--c' as string]: COR_SITUACAO[l.situacao] }}>{ROTULO_SITUACAO[l.situacao]}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }} title={l.quando ? new Date(l.quando).toLocaleString('pt-BR') : ''}>{haQuanto(l.quando, agora) || '—'}</td>
                    <td>{l.origem}<div className="pn-muted">{[l.tipo, l.empresa].filter(Boolean).join(' · ')}</div></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{l.documento || '—'}</td>
                    <td>{l.cliente || '—'}</td>
                    <td className="pn-motivo">{l.motivo}</td>
                    <td>{l.quem || '—'}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{l.valor !== null ? fmtRS(l.valor) : '—'}</td>
                    <td>{l.link && <Link className="pn-abrir" href={l.link}>Abrir <ExternalLink size={13} /></Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pn-cards">
            {linhas.map((l) => (
              <div key={l.id} className="pn-cartao pn-card" style={{ ['--c' as string]: COR_SITUACAO[l.situacao] }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <span className="pn-sel" style={{ ['--c' as string]: COR_SITUACAO[l.situacao] }}>{ROTULO_SITUACAO[l.situacao]}</span>
                  <span className="pn-muted">{haQuanto(l.quando, agora)}</span>
                </div>
                <div style={{ fontWeight: 600 }}>{l.origem} · {l.documento || '—'}</div>
                {l.cliente && <div className="pn-muted">{l.cliente}{l.valor !== null ? ` · ${fmtRS(l.valor)}` : ''}</div>}
                <div style={{ fontSize: 14.5, overflowWrap: 'anywhere' }}>{l.motivo}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span className="pn-muted">{[l.quem, l.empresa].filter(Boolean).join(' · ')}</span>
                  {l.link && <Link className="pn-abrir" href={l.link}>Abrir <ExternalLink size={13} /></Link>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {aba === 'envios' && !!resp?.porta && <CartaoPorta porta={resp.porta as Porta} />}
    </>
  );
}

type Porta = { ultimaHora?: Array<{ conta: string; prioridade: string; ok: number; erro: number; bloqueio: number; incerto: number }>; bloqueios?: Array<{ conta: string; metodo: string; ate: string; motivo: string }> };

function CartaoPorta({ porta }: { porta: Porta }) {
  const h = porta.ultimaHora || [];
  const soma = h.reduce((a, x) => ({ ok: a.ok + x.ok, erro: a.erro + x.erro, bloqueio: a.bloqueio + x.bloqueio, incerto: a.incerto + x.incerto }), { ok: 0, erro: 0, bloqueio: 0, incerto: 0 });
  return (
    <div className="pn-cartao" style={{ padding: '10px 14px', fontSize: 14.5 }}>
      <b>Porta da Omie (só Dev)</b> <span className="pn-muted">— última hora, só deste servidor (o robô tem a dele)</span>
      <div style={{ marginTop: 4 }}>{soma.ok} ok · {soma.erro} erro · {soma.bloqueio} bloqueio · {soma.incerto} incerta</div>
      {(porta.bloqueios || []).map((b) => <div key={`${b.conta}${b.metodo}`} style={{ color: '#b91c1c' }}>Bloqueio {b.conta} {b.metodo} até {new Date(b.ate).toLocaleTimeString('pt-BR')}: {b.motivo}</div>)}
    </div>
  );
}

// ── tela ──────────────────────────────────────────────────────────────────

export default function PainelNotas({ podeXml, isAdmin, podeEntrada, podeProblemas, carregandoPermissoes = false }: { podeXml: boolean; isAdmin: boolean; podeEntrada: boolean; podeProblemas: boolean; carregandoPermissoes?: boolean }) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const pedida = sp.get('aba');
  const aba: Aba = podeProblemas && (pedida === 'problemas' || pedida === 'envios') ? pedida : 'notas';
  const { contaParam } = useConta();
  const [dias, setDias] = useState(7);

  const problemas = useBuscar<Resp>(podeProblemas ? `/api/financeiro/notas/painel?aba=problemas${contaParam}` : null);
  const envios = useBuscar<Resp>(podeProblemas ? `/api/financeiro/notas/painel?aba=envios&dias=${dias}${contaParam}` : null);

  const trocar = (a: Aba) => {
    const p = new URLSearchParams(sp.toString());
    if (a === 'notas') p.delete('aba'); else p.set('aba', a);
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // contador da aba: o que precisa de alguém (sem "resolvida depois" nem robôs)
  const nProb = problemas.dados ? problemas.dados.linhas.length : null;
  const nEnv = envios.dados ? envios.dados.linhas.filter((l) => l.situacao !== 'resolvida' && l.situacao !== 'robo').length : null;

  // link direto ?aba=problemas|envios: espera as permissões; senão a aba Notas monta e reescreve a URL sem o ?aba
  if (carregandoPermissoes && (pedida === 'problemas' || pedida === 'envios')) {
    return <div style={{ padding: 24, color: '#888', fontSize: '.85rem' }}>Carregando…</div>;
  }

  return (
    <>
      <style>{ESTILO_PAINEL}</style>
      {podeProblemas && (
        <div className="pn-faixa" role="tablist" aria-label="Notas fiscais">
          <button type="button" role="tab" aria-selected={aba === 'notas'} className={`pn-guia${aba === 'notas' ? ' on' : ''}`} onClick={() => trocar('notas')}>
            <i className="fa-solid fa-file-invoice" /> Notas
          </button>
          <button type="button" role="tab" aria-selected={aba === 'problemas'} className={`pn-guia${aba === 'problemas' ? ' on' : ''}`} onClick={() => trocar('problemas')}>
            <i className="fa-solid fa-triangle-exclamation" /> Problemas {nProb !== null && <span className={`pn-badge${nProb ? '' : ' zero'}`}>{nProb}</span>}
          </button>
          <button type="button" role="tab" aria-selected={aba === 'envios'} className={`pn-guia${aba === 'envios' ? ' on' : ''}`} onClick={() => trocar('envios')}>
            <i className="fa-solid fa-cloud-arrow-up" /> Envios ao Omie {nEnv !== null && <span className={`pn-badge${nEnv ? '' : ' zero'}`}>{nEnv}</span>}
          </button>
        </div>
      )}
      {aba === 'notas' ? (
        <>
          <div style={{ padding: 'clamp(12px, 2vw, 28px) clamp(12px, 2vw, 28px) 0', background: 'color-mix(in srgb, var(--portal-text, #0f172a) 6%, var(--portal-bg, #fafafa))' }}>
            <TotaisHojeMes />
          </div>
          <NotasFiscais podeXml={podeXml} isAdmin={isAdmin} podeEntrada={podeEntrada} />
        </>
      ) : (
        <div className="pn-corpo">
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}><ContaSelector /></div>
          {aba === 'problemas'
            ? <ListaPainel aba="problemas" resp={problemas.dados} carregando={problemas.carregando} erro={problemas.erro} recarregar={problemas.recarregar} dias={dias} setDias={setDias} />
            : <ListaPainel aba="envios" resp={envios.dados} carregando={envios.carregando} erro={envios.erro} recarregar={envios.recarregar} dias={dias} setDias={setDias} />}
        </div>
      )}
    </>
  );
}
