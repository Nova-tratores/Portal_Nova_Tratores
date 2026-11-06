'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// /marketing — lista das ações de marketing (feiras, dias de campo, mídia...).
//
// A lista existe pra responder três perguntas de relance:
//   1. que ação está devendo relatório de contrapartida pra fábrica (dinheiro
//      preso), e há quantos dias;
//   2. qual ação ficou sem dono (o responsável saiu da empresa);
//   3. quanto custou e o que voltou.
// =============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, AlertTriangle, UserX, Trash2, RotateCcw, CalendarDays, UserRound } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { gateBtn, estiloSemPermissao } from '@/lib/permissoes/ui';
import { STATUS_ACAO, TIPOS_ACAO, rotulo, cor } from '@/lib/marketing/tipos';
import type { Acao } from '@/lib/marketing/tipos';
import AcaoForm from '@/components/marketing/AcaoForm';
import Modal from '@/components/marketing/Modal';
import {
  apiGet, apiEnviar, brl, periodoBR, diasAte, Selo, Kpi, Vazio, IconeTipoAcao,
  AvisoMigracao, Erro, BotaoRosa, estiloInput, estiloBotaoContorno,
} from '@/components/marketing/ui';

interface Resumo {
  custo: number; apoioAprovado: number; apoioRecebido: number;
  leads: number; propostas: number; apoioPendente: number; prazoMaisProximo: string | null;
}

export default function MarketingPage() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const podeCriar = pode('marketing', 'acoes:criar');
  const podeExcluir = pode('marketing', 'acoes:excluir');

  const [acoes, setAcoes] = useState<Acao[]>([]);
  const [resumos, setResumos] = useState<Record<string, Resumo>>({});
  const [inativos, setInativos] = useState<Set<string>>(new Set());
  const [carregando, setCarregando] = useState(true);
  const [migracaoFaltando, setMigracao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [busca, setBusca] = useState('');
  const [fTipo, setFTipo] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fAno, setFAno] = useState('');
  const [lixeira, setLixeira] = useState(false);

  const [modalAberto, setModal] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const q = new URLSearchParams();
      if (busca.trim()) q.set('q', busca.trim());
      if (fTipo) q.set('tipo', fTipo);
      if (fStatus) q.set('status', fStatus);
      if (fAno) q.set('ano', fAno);
      if (lixeira) q.set('lixeira', '1');
      const r = await apiGet<any>(`/api/marketing/acoes?${q}`);
      setAcoes(r.acoes ?? []);
      setResumos(r.resumos ?? {});
      setInativos(new Set(r.inativos ?? []));
      setMigracao(!!r.migracaoFaltando);
    } catch (e: any) {
      if (e?.corpo?.migracaoFaltando) setMigracao(true);
      else setErro(e?.message || 'Não foi possível carregar as ações.');
    } finally {
      setCarregando(false);
    }
  }, [busca, fTipo, fStatus, fAno, lixeira]);

  useEffect(() => {
    const t = setTimeout(carregar, 250);
    return () => clearTimeout(t);
  }, [carregar]);

  const criar = async (dados: Record<string, any>) => {
    setSalvando(true);
    setErroForm(null);
    try {
      const r = await apiEnviar<any>('/api/marketing/acoes', 'POST', dados);
      setModal(false);
      router.push(`/marketing/${r.acao.id}`);
    } catch (e: any) {
      setErroForm(e?.message || 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const mandarPraLixeira = async (a: Acao, restaurar: boolean) => {
    const msg = restaurar
      ? `Restaurar "${a.nome}"?`
      : `Mandar "${a.nome}" pra lixeira? Nada é apagado — dá pra restaurar depois.`;
    if (!window.confirm(msg)) return;
    try {
      await apiEnviar(`/api/marketing/acoes/${a.id}${restaurar ? '?restaurar=1' : ''}`, 'DELETE');
      carregar();
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível concluir.');
    }
  };

  // Totais da lista filtrada — a régua do ano.
  const totais = useMemo(() => {
    let custo = 0, apoio = 0, leads = 0, pendentes = 0, vencidos = 0;
    for (const a of acoes) {
      const r = resumos[a.id];
      if (!r) continue;
      custo += r.custo;
      apoio += r.apoioRecebido;
      leads += r.leads;
      pendentes += r.apoioPendente;
      const d = diasAte(r.prazoMaisProximo);
      if (d !== null && d < 0) vencidos += 1;
    }
    return { custo, apoio, leads, pendentes, vencidos };
  }, [acoes, resumos]);

  const anos = useMemo(() => {
    const s = new Set<number>();
    const agora = new Date().getFullYear();
    for (let a = agora + 1; a >= agora - 4; a--) s.add(a);
    return [...s];
  }, []);

  if (migracaoFaltando) return <AvisoMigracao />;

  return (
    <div style={{ padding: 16, maxWidth: 1400, margin: '0 auto' }}>
      {/* Barra de filtros */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 14 }}>
        <div style={{ position: 'relative', flex: '2 1 260px' }}>
          <Search size={15} style={{ position: 'absolute', left: 9, top: 11, opacity: 0.5 }} />
          <input
            style={{ ...estiloInput, paddingLeft: 30 }}
            placeholder="Buscar por nome, cidade, responsável, projeto…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <select style={{ ...estiloInput, flex: '0 1 150px' }} value={fTipo} onChange={(e) => setFTipo(e.target.value)}>
          <option value="">Todos os tipos</option>
          {TIPOS_ACAO.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <select style={{ ...estiloInput, flex: '0 1 150px' }} value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="">Todas as situações</option>
          {STATUS_ACAO.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <select style={{ ...estiloInput, flex: '0 1 110px' }} value={fAno} onChange={(e) => setFAno(e.target.value)}>
          <option value="">Todo período</option>
          {anos.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <button
          onClick={() => setLixeira((v) => !v)}
          title="Ações mandadas pra lixeira"
          style={{
            ...estiloBotaoContorno, minHeight: 40,
            background: lixeira ? '#fee2e2' : 'var(--portal-bg-card)',
            color: lixeira ? '#111111' : 'var(--portal-text)',
          }}
        >
          <Trash2 size={14} /> Lixeira
        </button>
        <BotaoRosa
          onClick={() => { setErroForm(null); setModal(true); }}
          {...gateBtn(podeCriar)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, ...estiloSemPermissao(podeCriar) }}
        >
          <Plus size={16} /> Nova ação
        </BotaoRosa>
      </div>

      {/* Régua do período */}
      {acoes.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          <Kpi rotulo="Ações" valor={String(acoes.length)} />
          <Kpi rotulo="Investido" valor={brl(totais.custo)} dica="Soma dos custos confirmados das ações listadas." />
          <Kpi rotulo="Apoio recebido" valor={brl(totais.apoio)} dica="Verba de fábrica que JÁ entrou. Aprovada e não recebida não conta aqui." cor="#16a34a" />
          <Kpi rotulo="Leads" valor={String(totais.leads)} />
          <Kpi
            rotulo="Relatórios devidos"
            valor={String(totais.pendentes)}
            dica="Apoios cuja contrapartida ainda não foi entregue à fábrica."
            cor={totais.pendentes > 0 ? '#dc2626' : undefined}
            alerta={totais.vencidos > 0}
          />
        </div>
      )}

      {erro && <Erro>{erro}</Erro>}

      {carregando ? (
        <Vazio>Carregando…</Vazio>
      ) : acoes.length === 0 ? (
        <Vazio>
          {lixeira
            ? 'A lixeira está vazia.'
            : 'Nenhuma ação cadastrada ainda. Comece pela feira que está devendo relatório.'}
        </Vazio>
      ) : (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(min(330px, 100%), 1fr))' }}>
          {acoes.map((a) => {
            const r = resumos[a.id];
            const dias = diasAte(r?.prazoMaisProximo);
            const semDono = !!a.responsavel_id && inativos.has(a.responsavel_id);
            const vencido = dias !== null && dias < 0;

            const corStatus = cor(STATUS_ACAO, a.status);
            return (
              <div
                key={a.id}
                className="mkt-card mkt-card-hover"
                style={{
                  ['--c' as any]: corStatus,
                  background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)',
                  borderRadius: 16, display: 'flex', flexDirection: 'column',
                }}
              >
                <Link
                  href={`/marketing/${a.id}`}
                  style={{ display: 'block', padding: '16px 18px 14px', textDecoration: 'none', color: 'inherit', flex: 1 }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <IconeTipoAcao tipo={a.tipo} cor={corStatus} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, color: 'var(--portal-text-muted, #475569)' }}>{rotulo(TIPOS_ACAO, a.tipo)}</span>
                        <Selo texto={rotulo(STATUS_ACAO, a.status)} cor={corStatus} />
                      </div>
                      <div style={{ fontSize: 16.5, fontWeight: 500, color: 'var(--portal-text)', marginTop: 2, lineHeight: 1.3 }}>{a.nome}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10, fontSize: 13, color: 'var(--portal-text-muted, #475569)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CalendarDays size={14} style={{ opacity: 0.7, flex: 'none' }} />
                      {periodoBR(a.data_inicio, a.data_fim)}
                      {a.cidade ? ` · ${a.cidade}${a.uf ? `/${a.uf}` : ''}` : ''}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <UserRound size={14} style={{ opacity: 0.7, flex: 'none' }} />
                      {a.responsavel_nome || 'Sem responsável'} · {a.empresa}
                    </span>
                  </div>

                  {/* Os dois alertas que a lista precisa gritar sozinha */}
                  {(r?.apoioPendente ?? 0) > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, padding: '6px 10px', borderRadius: 10, fontSize: 13, fontWeight: 500, color: vencido ? '#b91c1c' : '#92400e', background: vencido ? '#fef2f2' : '#fffbeb' }}>
                      <AlertTriangle size={14} />
                      {vencido
                        ? `Relatório de contrapartida venceu há ${Math.abs(dias!)} dia(s)`
                        : dias !== null
                          ? `Relatório de contrapartida vence em ${dias} dia(s)`
                          : `${r!.apoioPendente} relatório(s) de contrapartida pendente(s)`}
                    </div>
                  )}
                  {semDono && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, padding: '6px 10px', borderRadius: 10, fontSize: 13, fontWeight: 500, color: '#b91c1c', background: '#fef2f2' }}>
                      <UserX size={14} /> Responsável não está mais ativo — reatribuir
                    </div>
                  )}

                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--portal-border)' }}>
                    <div>
                      <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted, #64748b)' }}>Investido</div>
                      <div style={{ fontSize: 23, fontWeight: 500, letterSpacing: '-.01em', fontVariantNumeric: 'tabular-nums', color: 'var(--portal-text)' }}>
                        {brl(r?.custo ?? 0)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 14, fontSize: 13, color: 'var(--portal-text-muted, #475569)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      <span title="Apoio de fábrica recebido">
                        <span style={{ display: 'block', fontSize: 15, fontWeight: 500, color: 'var(--portal-text)' }}>{brl(r?.apoioRecebido ?? 0)}</span>apoio
                      </span>
                      <span>
                        <span style={{ display: 'block', fontSize: 15, fontWeight: 500, color: 'var(--portal-text)' }}>{r?.leads ?? 0}</span>leads
                      </span>
                      <span>
                        <span style={{ display: 'block', fontSize: 15, fontWeight: 500, color: 'var(--portal-text)' }}>{r?.propostas ?? 0}</span>propostas
                      </span>
                    </div>
                  </div>
                </Link>

                {podeExcluir && (
                  <div style={{ padding: '0 18px 14px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => mandarPraLixeira(a, !!a.deleted_at)}
                      title={a.deleted_at ? 'Restaurar' : 'Mandar pra lixeira'}
                      style={{ ...estiloBotaoContorno, fontSize: 12.5, padding: '5px 10px' }}
                    >
                      {a.deleted_at ? <><RotateCcw size={13} /> Restaurar</> : <><Trash2 size={13} /> Lixeira</>}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal titulo="Nova ação de marketing" aberto={modalAberto} onFechar={() => setModal(false)}>
        <AcaoForm
          salvando={salvando}
          erro={erroForm}
          onSalvar={criar}
          onCancelar={() => setModal(false)}
        />
      </Modal>

      <div style={{ marginTop: 20, fontSize: 12, color: 'var(--portal-text-muted, #64748b)', borderTop: '1px solid var(--portal-border)', paddingTop: 10 }}>
        Feira, dia de campo, ação de loja, patrocínio, mídia e brinde ficam todos aqui — o tipo é que muda.
      </div>
    </div>
  );
}
