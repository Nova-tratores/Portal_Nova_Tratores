'use client';
// Frota > HOJE — a primeira tela do módulo (10/10/2026, Raio-X da Frota).
// Responde "o que eu preciso fazer na frota agora?" sem passar por 6 abas:
// parados, problemas graves, documentos vencendo, checklists que faltam,
// cadastro a corrigir, paradas atípicas sem explicação e CNH. Cada item leva
// direto para onde se resolve. Os dados vêm de GET /api/frota/hoje.
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  OctagonAlert, AlertTriangle, FileWarning, Fuel, ClipboardCheck, UserX, MapPinned, IdCard, Check, Loader2, Gauge, CalendarClock,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { authHeaders } from '@/lib/auth/client';
import { formatarPlaca } from '@/lib/frota/placa';
import { podeTelaFrota } from '@/lib/permissoes/frota';
import { GRAVIDADE_COR, GRAVIDADE_LABEL, type Gravidade } from '@/lib/frota/gravidade';
import { variacao } from '@/lib/frota/hoje';
import type { MotoristaRH } from '@/lib/frota/tipos';
import { CabecalhoFrota, KpiFrota, KpisFrota, CarregandoFrota, AZUL_FROTA } from '@/components/frota/ui';

const fmtRS = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const fmtData = (s: string | null | undefined) => (s ? new Date(`${String(s).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '');

interface DadosHoje {
  geradoEm: string;
  ativos: number;
  parados: { placa: string; modelo: string; motivos: string[] }[];
  graves: { id: string; placa: string; modelo: string; titulo: string; gravidade: Gravidade; origem: string | null; aberta_em: string | null; responsavel?: string | null }[];
  documentos: { placa: string; modelo: string; tipo: string; vigencia_fim: string; vencido: boolean; dias: number }[];
  cadastro: { placa: string; modelo: string; problemas: string[] }[];
  checklists: { mes: string; resumo: { total: number; pendente: number; suspeito: number }; faltando: { placa: string; placa_key: string; tecnico_nome: string; status: string; descricao: string }[] };
  paradas: { total: number; podeJustificar: boolean; itens: { id: string; placa: string; data: string; inicio: string; duracao_min: number; classe: string; destino_nome: string | null; endereco: string | null }[] };
  combustivel: { ultimos30: { gasto: number; litros: number; abastecimentos: number }; anteriores30: { gasto: number } };
  km: { confiaveis: number; total: number; pedirFoto: { placa: string; km: number | null; descricao: string; idadeDias: number | null }[] } | null;
  leiturasSuspeitas: { id: string; placa: string; km: number; lida_em: string; foto_url: string | null; lido_por: string | null; motivo: string | null }[];
  podeConferirKm: boolean;
  preventivas: {
    resumo: { vencida: number; em_breve: number; em_dia: number; sem_historico: number; pctEmDia: number | null };
    semPlano: number;
    itens: { placa: string; modelo: string; nome: string; estado: 'vencida' | 'em_breve'; regua: string | null; texto: string }[];
  } | null;
}

const linkFicha = (placa: string) => `/frota/veiculos?placa=${encodeURIComponent(placa)}`;
const linkPendencias = (placa: string) => `/frota/pendencias?placa=${encodeURIComponent(placa)}`;

export default function FrotaHoje() {
  const { userProfile } = useAuth();
  const { permissoes, isAdmin } = usePermissoes(userProfile?.id);
  const [d, setD] = useState<DadosHoje | null>(null);
  const [erro, setErro] = useState('');
  const [motoristas, setMotoristas] = useState<MotoristaRH[] | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch('/api/frota/hoje', { headers: await authHeaders() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error || `Falha ao carregar (${r.status}).`); return; }
      setErro('');
      setD(j as DadosHoje);
    } catch (e) { setErro(String(e)); }
  }, []);
  // carregar só grava estado DEPOIS do fetch (assíncrono) — a regra não enxerga o await
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar(); }, [carregar]);

  // CNH vem do RH (rota própria, só para quem pode ver Motoristas)
  const podeVerMotoristas = podeTelaFrota(permissoes?.modulos_permitidos ?? [], isAdmin, 'motoristas');
  useEffect(() => {
    if (!podeVerMotoristas) return;
    let vivo = true;
    (async () => {
      try {
        const r = await fetch('/api/frota/motoristas/rh', { headers: await authHeaders() });
        if (!r.ok) return;
        const j = await r.json();
        if (vivo) setMotoristas(j.motoristas || []);
      } catch { /* bloco opcional */ }
    })();
    return () => { vivo = false; };
  }, [podeVerMotoristas]);

  const cnh = useMemo(() => (motoristas || []).filter((m) => (m.pendencias || []).length > 0), [motoristas]);

  if (!d) {
    return (
      <div className="frota-pg" style={{ padding: '28px 40px', fontFamily: 'Inter, sans-serif' }}>
        <CabecalhoFrota titulo="Hoje" resumo="O que precisa de atenção na frota agora." />
        {erro ? <div style={{ color: '#b91c1c', fontSize: 13 }}>{erro}</div> : <CarregandoFrota kpis={4} linhas={5} />}
      </div>
    );
  }

  const varComb = variacao(d.combustivel.ultimos30.gasto, d.combustivel.anteriores30.gasto);
  const docsVencidos = d.documentos.filter((x) => x.vencido).length;
  const criticas = d.graves.filter((g) => g.gravidade === 'critica').length;
  const tudoEmDia = [];
  if (!d.parados.length) tudoEmDia.push('nenhum veículo parado');
  if (!d.graves.length) tudoEmDia.push('nenhum problema grave');
  if (!d.documentos.length) tudoEmDia.push('documentos em dia');
  if (!d.checklists.faltando.length) tudoEmDia.push('checklists do mês feitos');
  if (!d.cadastro.length) tudoEmDia.push('cadastro completo');
  if (!d.paradas.total) tudoEmDia.push('paradas explicadas');
  if (d.km && !d.km.pedirFoto.length) tudoEmDia.push('km de todos os carros recente');
  if (d.preventivas && !d.preventivas.itens.length) tudoEmDia.push('preventivas em dia');

  return (
    <div className="frota-pg" style={{ padding: '28px 40px', fontFamily: 'Inter, sans-serif' }}>
      <CabecalhoFrota
        titulo="Hoje"
        resumo="O que precisa de atenção na frota agora. Cada item leva direto para onde se resolve."
        acoes={<span style={{ fontSize: 12, color: 'var(--portal-text-secondary)' }}>
          {d.km ? <>km confiável em {d.km.confiaveis} de {d.km.total} · </> : null}
          atualizado {new Date(d.geradoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </span>}
      />

      <KpisFrota>
        <KpiFrota
          rotulo="Parados" icone={<OctagonAlert size={14} />} valor={d.parados.length}
          contexto={`de ${d.ativos} veículos ativos`} tom={d.parados.length ? 'ruim' : 'bom'} href="#parados"
        />
        <KpiFrota
          rotulo="Problemas graves" icone={<AlertTriangle size={14} />} valor={d.graves.length}
          contexto={criticas ? `${criticas} crítico${criticas > 1 ? 's' : ''} (não rodar)` : 'nenhum crítico'}
          tom={criticas ? 'ruim' : d.graves.length ? 'atencao' : 'bom'} href="#graves"
        />
        <KpiFrota
          rotulo="Documentos" icone={<FileWarning size={14} />} valor={d.documentos.length}
          contexto={docsVencidos ? `${docsVencidos} vencido${docsVencidos > 1 ? 's' : ''} · resto em até 30 dias` : 'vencendo em até 30 dias'}
          tom={docsVencidos ? 'ruim' : d.documentos.length ? 'atencao' : 'bom'} href="#documentos"
        />
        <KpiFrota
          rotulo="Combustível (30 dias)" icone={<Fuel size={14} />} valor={fmtRS(d.combustivel.ultimos30.gasto)}
          contexto={varComb == null ? `${d.combustivel.ultimos30.abastecimentos} abastecimentos` : `${varComb >= 0 ? '▲' : '▼'} ${Math.abs(varComb).toFixed(0)}% vs 30 dias antes`}
          href="/frota/abastecimento"
        />
      </KpisFrota>

      {erro && <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>{erro}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {d.parados.length > 0 && (
          <Bloco id="parados" titulo="Veículos parados" icone={<OctagonAlert size={16} />} cor="#b91c1c" n={d.parados.length}
            ajuda="Não deveriam rodar: problema crítico aberto ou marcado como parado/em manutenção na Ficha.">
            {d.parados.map((p) => (
              <Linha key={p.placa} placa={p.placa} modelo={p.modelo}
                texto={p.motivos.join(' · ')}
                acao={<Acao href={linkPendencias(p.placa)}>Ver pendências</Acao>} />
            ))}
          </Bloco>
        )}

        {d.graves.length > 0 && (
          <Bloco id="graves" titulo="Problemas graves abertos" icone={<AlertTriangle size={16} />} cor="#c2410c" n={d.graves.length}
            ajuda="Pendências de gravidade crítica ou grave, da mais urgente e mais antiga para a mais nova.">
            {d.graves.slice(0, 30).map((g) => (
              <Linha key={g.id} placa={g.placa} modelo={g.modelo}
                selo={<span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4, padding: '2px 8px', borderRadius: 999, background: GRAVIDADE_COR[g.gravidade].bg, color: GRAVIDADE_COR[g.gravidade].cor }}>{GRAVIDADE_LABEL[g.gravidade].toUpperCase()}</span>}
                texto={`${g.titulo}${g.aberta_em ? ` · aberta em ${fmtData(g.aberta_em)}` : ''}${g.responsavel ? ` · ${g.responsavel}` : ''}`}
                acao={<Acao href={`${linkPendencias(g.placa)}&pend=${g.id}`}>Abrir</Acao>} />
            ))}
            {d.graves.length > 30 && <Mais href="/frota/pendencias" n={d.graves.length - 30} />}
          </Bloco>
        )}

        {d.preventivas && d.preventivas.itens.length > 0 && (
          <Bloco id="preventivas" titulo="Preventivas vencidas ou vencendo" icone={<CalendarClock size={16} />} cor="#0f766e" n={d.preventivas.itens.length}
            ajuda={`${d.preventivas.resumo.pctEmDia != null ? `${d.preventivas.resumo.pctEmDia}% das preventivas em dia. ` : ''}Vence o que chegar primeiro: km, horas de motor ou data, pelo manual de cada modelo.${d.preventivas.semPlano ? ` ${d.preventivas.semPlano} carro(s) ainda sem plano.` : ''}`}>
            {d.preventivas.itens.slice(0, 20).map((p) => (
              <Linha key={`${p.placa}-${p.nome}`} placa={p.placa} modelo={p.modelo}
                selo={<span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4, padding: '2px 8px', borderRadius: 999, background: p.estado === 'vencida' ? '#fee2e2' : '#fef3c7', color: p.estado === 'vencida' ? '#991b1b' : '#92400e' }}>{p.estado === 'vencida' ? 'VENCIDA' : 'EM BREVE'}</span>}
                texto={`${p.nome} · ${p.texto}${p.regua ? ` (por ${p.regua === 'data' ? 'data' : p.regua})` : ''}`}
                destaque={p.estado === 'vencida'}
                acao={<Acao href="/frota/preventivas">Registrar feito</Acao>} />
            ))}
            {d.preventivas.itens.length > 20 && <Mais href="/frota/preventivas" n={d.preventivas.itens.length - 20} />}
          </Bloco>
        )}

        {d.documentos.length > 0 && (
          <Bloco id="documentos" titulo="Documentos vencidos ou vencendo" icone={<FileWarning size={16} />} cor="#b45309" n={d.documentos.length}
            ajuda="Vencidos e os que vencem nos próximos 30 dias. O documento renovado tira o antigo da lista.">
            {d.documentos.map((x) => (
              <Linha key={`${x.placa}-${x.tipo}`} placa={x.placa} modelo={x.modelo}
                texto={`${x.tipo} ${x.vencido ? `venceu em ${fmtData(x.vigencia_fim)}` : `vence em ${fmtData(x.vigencia_fim)} (${x.dias} dia${x.dias === 1 ? '' : 's'})`}`}
                destaque={x.vencido}
                acao={<Acao href={linkFicha(x.placa)}>Abrir a Ficha</Acao>} />
            ))}
          </Bloco>
        )}

        {d.checklists.faltando.length > 0 && (
          <Bloco titulo={`Checklists de ${d.checklists.mes.slice(5, 7)}/${d.checklists.mes.slice(0, 4)} que faltam`} icone={<ClipboardCheck size={16} />} cor={AZUL_FROTA}
            n={d.checklists.faltando.length}
            ajuda={`${d.checklists.resumo.pendente} não feito(s) e ${d.checklists.resumo.suspeito} suspeito(s) de ${d.checklists.resumo.total}. Veículo com checklist desligado na Ficha não entra.`}>
            {d.checklists.faltando.map((c) => (
              <Linha key={c.placa_key || c.placa} placa={c.placa_key || c.placa} modelo={c.descricao}
                texto={`${c.status === 'suspeito' ? 'Feito, mas suspeito (score baixo)' : 'Não fez'} · ${c.tecnico_nome}`}
                acao={c.placa_key ? <Acao href={`/frota/checklist/${c.placa_key}`}>Abrir checklist</Acao> : undefined} />
            ))}
          </Bloco>
        )}

        {d.cadastro.length > 0 && (
          <Bloco titulo="Cadastro a corrigir" icone={<UserX size={16} />} cor="#4338ca" n={d.cadastro.length}
            ajuda="Veículos ativos sem responsável ou com o cadastro incompleto. Corrija na Ficha do veículo.">
            {d.cadastro.map((c) => (
              <Linha key={c.placa} placa={c.placa} modelo={c.modelo} texto={c.problemas.join(' · ')}
                acao={<Acao href={linkFicha(c.placa)}>Corrigir na Ficha</Acao>} />
            ))}
          </Bloco>
        )}

        {d.leiturasSuspeitas.length > 0 && (
          <LeiturasSuspeitas itens={d.leiturasSuspeitas} podeConferir={d.podeConferirKm} onMudou={carregar} />
        )}

        {d.km && d.km.pedirFoto.length > 0 && (
          <Bloco titulo="Carros sem km recente" icone={<Gauge size={16} />} cor="#0369a1" n={d.km.pedirFoto.length}
            ajuda="O km destes carros vem de um número digitado há mais de 15 dias ou não existe. Peça ao responsável uma foto do painel (Pendências da frota → Registrar km); a preventiva por km depende disso.">
            {d.km.pedirFoto.slice(0, 10).map((k) => (
              <Linha key={k.placa} placa={k.placa}
                texto={k.km != null ? `${Math.round(k.km).toLocaleString('pt-BR')} km · ${k.descricao}${k.idadeDias != null ? ` (há ${k.idadeDias} dias)` : ''}` : 'sem nenhuma leitura de km'}
                acao={<Acao href={linkFicha(k.placa)}>Registrar na Ficha</Acao>} />
            ))}
            {d.km.pedirFoto.length > 10 && <Mais href="/frota/veiculos" n={d.km.pedirFoto.length - 10} />}
          </Bloco>
        )}

        {d.paradas.total > 0 && <ParadasSemExplicacao dados={d.paradas} onMudou={carregar} />}

        {cnh.length > 0 && (
          <Bloco titulo="Motoristas com CNH a resolver" icone={<IdCard size={16} />} cor="#b91c1c" n={cnh.length}
            ajuda="CNH vencida, vencendo, sem cadastro ou motorista desligado que ainda responde por veículo.">
            {cnh.slice(0, 12).map((m) => (
              <div key={m.rh_id || m.id} style={linhaEstilo}>
                <strong style={{ fontSize: 13.5, color: 'var(--portal-text)', minWidth: 0, flex: '1 1 200px' }}>{m.nome}</strong>
                <span style={{ fontSize: 13, color: 'var(--portal-text-secondary)', flex: '2 1 260px', minWidth: 0 }}>{m.pendencias.join(' · ')}</span>
                <Acao href="/frota/motoristas">Abrir Motoristas</Acao>
              </div>
            ))}
            {cnh.length > 12 && <Mais href="/frota/motoristas" n={cnh.length - 12} />}
          </Bloco>
        )}

        {tudoEmDia.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13, color: 'var(--portal-text-secondary)', padding: '10px 0' }}>
            <Check size={15} color="#15803d" />
            <span>Em dia: {tudoEmDia.join(' · ')}.</span>
          </div>
        )}
      </div>
    </div>
  );
}

const linhaEstilo: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 14px',
  borderTop: '1px solid var(--portal-border)',
};

function Bloco({ id, titulo, icone, cor, n, ajuda, children }: {
  id?: string; titulo: string; icone: React.ReactNode; cor: string; n: number; ajuda?: string; children: React.ReactNode;
}) {
  return (
    <section id={id} style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderLeft: `4px solid ${cor}`, scrollMarginTop: 100 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', flexWrap: 'wrap' }}>
        <span style={{ color: cor, display: 'flex' }}>{icone}</span>
        <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, color: 'var(--portal-text)' }}>{titulo}</h2>
        <span style={{ fontSize: 12, fontWeight: 800, color: '#fefefe', background: cor, borderRadius: 999, padding: '1px 9px' }}>{n}</span>
        {ajuda && <span style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)', flexBasis: '100%' }}>{ajuda}</span>}
      </div>
      {children}
    </section>
  );
}

function Linha({ placa, modelo, texto, selo, acao, destaque }: {
  placa: string; modelo?: string; texto: string; selo?: React.ReactNode; acao?: React.ReactNode; destaque?: boolean;
}) {
  return (
    <div style={linhaEstilo}>
      <Link href={linkFicha(placa)} title="Abrir a Ficha do veículo" style={{ textDecoration: 'none', minWidth: 0, flex: '0 1 220px', display: 'flex', flexDirection: 'column' }}>
        <strong style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--portal-text)', fontVariantNumeric: 'tabular-nums' }}>{formatarPlaca(placa)}</strong>
        {modelo && <span style={{ fontSize: 12, color: 'var(--portal-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{modelo}</span>}
      </Link>
      {selo}
      <span style={{ fontSize: 13.5, color: destaque ? '#b91c1c' : 'var(--portal-text)', fontWeight: destaque ? 700 : 400, flex: '1 1 260px', minWidth: 0 }}>{texto}</span>
      {acao}
    </div>
  );
}

function Acao({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} style={{ fontSize: 12.5, fontWeight: 700, color: AZUL_FROTA, textDecoration: 'none', padding: '6px 12px', border: `1px solid ${AZUL_FROTA}`, whiteSpace: 'nowrap' }}>
      {children} →
    </Link>
  );
}

function Mais({ href, n }: { href: string; n: number }) {
  return (
    <div style={{ ...linhaEstilo, justifyContent: 'center' }}>
      <Link href={href} style={{ fontSize: 13, fontWeight: 700, color: AZUL_FROTA, textDecoration: 'none' }}>+ {n} outros →</Link>
    </div>
  );
}

// Paradas atípicas da semana sem explicação: seleciona várias e justifica ou ignora de uma vez.
function ParadasSemExplicacao({ dados, onMudou }: { dados: DadosHoje['paradas']; onMudou: () => void }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState('');
  const todos = dados.itens.map((p) => p.id);
  const alternar = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const aplicar = async (corpo: Record<string, unknown>) => {
    if (!sel.size) return;
    setEnviando(true); setMsg('');
    try {
      const r = await fetch('/api/frota/paradas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ ids: [...sel], ...corpo }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j.error || 'Não deu para salvar.'); return; }
      setMsg(`${j.atualizadas || sel.size} parada(s) atualizada(s).`);
      setSel(new Set()); setTexto('');
      onMudou();
    } catch { setMsg('Falha de conexão — tente de novo.'); }
    finally { setEnviando(false); }
  };

  return (
    <Bloco titulo="Paradas atípicas sem explicação (7 dias)" icone={<MapPinned size={16} />} cor="#7c3aed" n={dados.total}
      ajuda={`Paradas fora do padrão que ninguém justificou nem ignorou${dados.total > dados.itens.length ? ` — mostrando as ${dados.itens.length} mais longas` : ''}.`}>
      {dados.podeJustificar && (
        <div style={{ ...linhaEstilo, background: 'var(--portal-bg-secondary)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--portal-text)', cursor: 'pointer' }}>
            <input type="checkbox" checked={sel.size === todos.length && todos.length > 0}
              onChange={() => setSel(sel.size === todos.length ? new Set() : new Set(todos))} />
            {sel.size ? `${sel.size} selecionada(s)` : 'Selecionar todas'}
          </label>
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Justificativa (ex.: visita a cliente)"
            aria-label="Justificativa das paradas selecionadas"
            style={{ flex: '1 1 220px', minWidth: 0, padding: '7px 10px', border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: 13 }} />
          <button type="button" disabled={!sel.size || !texto.trim() || enviando} onClick={() => aplicar({ justificativa: texto.trim() })}
            style={{ padding: '7px 12px', border: 'none', background: AZUL_FROTA, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: !sel.size || !texto.trim() ? 0.5 : 1 }}>
            {enviando ? <Loader2 size={13} className="spin" /> : 'Justificar'}
          </button>
          <button type="button" disabled={!sel.size || enviando} onClick={() => aplicar({ ignorada: true })}
            style={{ padding: '7px 12px', border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: sel.size ? 1 : 0.5 }}>
            Ignorar
          </button>
          {msg && <span style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)', flexBasis: '100%' }}>{msg}</span>}
        </div>
      )}
      {dados.itens.slice(0, 25).map((p) => (
        <div key={p.id} style={linhaEstilo}>
          {dados.podeJustificar && (
            <input type="checkbox" checked={sel.has(p.id)} onChange={() => alternar(p.id)} aria-label={`Selecionar parada de ${p.placa}`} />
          )}
          <strong style={{ fontSize: 14, fontWeight: 800, color: 'var(--portal-text)', flex: '0 1 110px' }}>{formatarPlaca(p.placa)}</strong>
          <span style={{ fontSize: 13, color: 'var(--portal-text)', flex: '1 1 260px', minWidth: 0 }}>
            {fmtData(p.data)} · {new Date(p.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · {Math.round(p.duracao_min)} min
            {' · '}{p.destino_nome || p.endereco || (p.classe === 'fora_geocerca' ? 'fora de local conhecido' : p.classe)}
          </span>
        </div>
      ))}
      {dados.itens.length > 25 && <Mais href="/frota/paradas" n={dados.total - 25} />}
    </Bloco>
  );
}

// Leituras de km que voltaram ou saltaram demais: quem edita a Ficha confere pela foto.
function LeiturasSuspeitas({ itens, podeConferir, onMudou }: { itens: DadosHoje['leiturasSuspeitas']; podeConferir: boolean; onMudou: () => void }) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const decidir = async (id: string, acao: 'aceitar' | 'descartar') => {
    setOcupado(id); setMsg('');
    try {
      const r = await fetch('/api/frota/leituras', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ id, acao }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j.error || 'Não deu para salvar.'); return; }
      onMudou();
    } catch { setMsg('Falha de conexão — tente de novo.'); }
    finally { setOcupado(null); }
  };
  return (
    <Bloco titulo="Leituras de km para conferir" icone={<Gauge size={16} />} cor="#b45309" n={itens.length}
      ajuda="Leituras que ficaram menores que a anterior ou saltaram demais. Olhe a foto: aceite se o número estiver certo, descarte se foi erro.">
      {msg && <div style={{ ...linhaEstilo, color: '#b91c1c', fontSize: 13 }}>{msg}</div>}
      {itens.map((l) => (
        <div key={l.id} style={linhaEstilo}>
          {l.foto_url ? (
            <a href={l.foto_url} target="_blank" rel="noreferrer" title="Abrir a foto do painel">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={l.foto_url} alt={`Painel do ${l.placa}`} style={{ width: 64, height: 48, objectFit: 'cover', background: 'var(--portal-bg-secondary)' }} />
            </a>
          ) : null}
          <strong style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--portal-text)', flex: '0 1 110px' }}>{formatarPlaca(l.placa)}</strong>
          <span style={{ fontSize: 13.5, color: 'var(--portal-text)', flex: '1 1 260px', minWidth: 0 }}>
            <strong>{Math.round(Number(l.km)).toLocaleString('pt-BR')} km</strong> · {fmtData(l.lida_em)}{l.lido_por ? ` · ${l.lido_por}` : ''}
            {l.motivo && <span style={{ display: 'block', color: '#b45309', fontSize: 12.5 }}>{l.motivo}</span>}
          </span>
          {podeConferir && (
            <span style={{ display: 'flex', gap: 6 }}>
              <button type="button" disabled={ocupado === l.id} onClick={() => decidir(l.id, 'aceitar')}
                style={{ padding: '6px 12px', border: 'none', background: '#15803d', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                {ocupado === l.id ? <Loader2 size={13} className="spin" /> : 'Aceitar'}
              </button>
              <button type="button" disabled={ocupado === l.id} onClick={() => decidir(l.id, 'descartar')}
                style={{ padding: '6px 12px', border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                Descartar
              </button>
            </span>
          )}
        </div>
      ))}
    </Bloco>
  );
}
