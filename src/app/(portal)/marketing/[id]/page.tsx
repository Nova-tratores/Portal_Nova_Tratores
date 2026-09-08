'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// /marketing/[id] — ficha da ação de marketing.
//
// As abas são estado local, não rotas: o gate do módulo já rodou no layout, e
// abrir uma aba não deve recarregar a ficha inteira nem multiplicar arquivos de
// permissão.
//
// A ficha carrega numa chamada só (/api/marketing/acoes/[id] devolve ação,
// apoios, custos, leads, propostas, equipe, itens, realizadas, concorrentes,
// mídia, avaliações e o ROI já calculado).
// =============================================================================
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Pencil, UserX } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { gateBtn, estiloSemPermissao } from '@/lib/permissoes/ui';
import { STATUS_ACAO, TIPOS_ACAO, rotulo, cor } from '@/lib/marketing/tipos';
import AcaoForm from '@/components/marketing/AcaoForm';
import Modal from '@/components/marketing/Modal';
import ResumoAba from '@/components/marketing/abas/ResumoAba';
import ApoiosAba from '@/components/marketing/abas/ApoiosAba';
import CustosAba from '@/components/marketing/abas/CustosAba';
import LeadsAba from '@/components/marketing/abas/LeadsAba';
import PropostasAba from '@/components/marketing/abas/PropostasAba';
import ListaSimples, { SPEC_EQUIPE, SPEC_ITENS, SPEC_REALIZADAS, SPEC_CONCORRENTES, SPEC_MIDIAS } from '@/components/marketing/abas/ListaSimples';
import AvaliacaoAba from '@/components/marketing/abas/AvaliacaoAba';
import QuestionarioAba from '@/components/marketing/abas/QuestionarioAba';
import RelatorioAba from '@/components/marketing/abas/RelatorioAba';
import {
  apiGet, apiEnviar, periodoBR, Selo, Vazio, AvisoMigracao, Erro, ROSA,
} from '@/components/marketing/ui';

const ABAS = [
  'Resumo', 'Apoio de fábrica', 'Investimento', 'Leads', 'Propostas',
  'Equipe', 'Itens expostos', 'Ações realizadas', 'Concorrentes', 'Mídia',
  'Avaliação', 'Questionário', 'Relatório',
] as const;
type Aba = (typeof ABAS)[number];

export default function FichaAcaoPage() {
  const params = useParams();
  const id = String(params?.id ?? '');
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const podeEditar = pode('marketing', 'acoes:editar');

  const [ficha, setFicha] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  const [migracao, setMigracao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>('Resumo');
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!id) return;
    try {
      const r = await apiGet<any>(`/api/marketing/acoes/${id}`);
      setFicha({ ...r, inativos: new Set(r.inativos ?? []) });
      setErro(null);
    } catch (e: any) {
      if (e?.corpo?.migracaoFaltando) setMigracao(true);
      else setErro(e?.message || 'Não foi possível carregar a ação.');
    } finally {
      setCarregando(false);
    }
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  const salvarEdicao = async (dados: Record<string, any>) => {
    setSalvando(true);
    setErroForm(null);
    try {
      await apiEnviar(`/api/marketing/acoes/${id}`, 'PATCH', dados);
      setEditando(false);
      carregar();
    } catch (e: any) {
      setErroForm(e?.message || 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  };

  if (migracao) return <AvisoMigracao />;
  if (carregando) return <Vazio>Carregando…</Vazio>;
  if (erro) return <Erro>{erro}</Erro>;
  if (!ficha) return <Vazio>Ação não encontrada.</Vazio>;

  const { acao, roi } = ficha;
  const semDono = !!acao.responsavel_id && ficha.inativos.has(acao.responsavel_id);

  // Contador por aba: o número que faz a pessoa saber onde falta preencher.
  const contagem: Partial<Record<Aba, number>> = {
    'Apoio de fábrica': ficha.apoios.length,
    Investimento: ficha.custos.length,
    Leads: ficha.leads.length,
    Propostas: ficha.propostas.length,
    Equipe: ficha.equipe.length,
    'Itens expostos': ficha.itens.length,
    'Ações realizadas': ficha.realizadas.length,
    Concorrentes: ficha.concorrentes.length,
    Mídia: ficha.midias.length,
    Avaliação: ficha.avaliacoes.length,
  };

  return (
    <div style={{ padding: 16, maxWidth: 1400, margin: '0 auto' }}>
      <Link
        href="/marketing"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#2563eb', textDecoration: 'none', marginBottom: 10 }}
      >
        <ArrowLeft size={15} /> Todas as ações
      </Link>

      {/* Cabeçalho */}
      <div
        style={{
          background: 'var(--portal-bg-card)',
          border: '1px solid var(--portal-border)',
          borderLeft: `4px solid ${cor(STATUS_ACAO, acao.status)}`,
          borderRadius: 4, padding: 16, marginBottom: 14,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--portal-text)' }}>{acao.nome}</h1>
            <div style={{ fontSize: 13, color: 'var(--portal-text-muted, #64748b)', marginTop: 3 }}>
              {rotulo(TIPOS_ACAO, acao.tipo)} · {periodoBR(acao.data_inicio, acao.data_fim)}
              {acao.cidade ? ` · ${acao.cidade}${acao.uf ? `/${acao.uf}` : ''}` : ''}
              {acao.local_nome ? ` · ${acao.local_nome}` : ''}
            </div>
            <div style={{ fontSize: 13, color: 'var(--portal-text-muted, #64748b)', marginTop: 2 }}>
              Responsável: {acao.responsavel_nome || 'não definido'} · {acao.empresa}
              {acao.projeto_nome ? ` · Projeto Omie: ${acao.projeto_nome}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Selo texto={rotulo(STATUS_ACAO, acao.status)} cor={cor(STATUS_ACAO, acao.status)} />
            <button
              onClick={() => { setErroForm(null); setEditando(true); }}
              {...gateBtn(podeEditar)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', fontSize: 13,
                borderRadius: 3, border: '1px solid var(--portal-border)',
                background: 'var(--portal-bg-card)', color: 'var(--portal-text)', cursor: 'pointer',
                ...estiloSemPermissao(podeEditar),
              }}
            >
              <Pencil size={14} /> Editar
            </button>
          </div>
        </div>

        {semDono && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, padding: 10, borderRadius: 3, background: '#fef2f2', border: '1px solid #dc2626', fontSize: 13, fontWeight: 700, color: '#111111' }}>
            <UserX size={16} color="#dc2626" />
            O responsável desta ação não está mais ativo no portal. Reatribua antes que o histórico fique sem dono.
          </div>
        )}
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, borderBottom: `2px solid ${ROSA}`, marginBottom: 14 }}>
        {ABAS.map((a) => {
          const ativa = aba === a;
          const n = contagem[a];
          return (
            <button
              key={a}
              onClick={() => setAba(a)}
              style={{
                padding: '8px 13px', fontSize: 13, fontWeight: ativa ? 700 : 500,
                border: 'none', borderRadius: '4px 4px 0 0', cursor: 'pointer',
                background: ativa ? ROSA : 'transparent',
                color: ativa ? '#111111' : 'var(--portal-text)',
              }}
            >
              {a}
              {n !== undefined && n > 0 && (
                <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.75 }}>{n}</span>
              )}
            </button>
          );
        })}
      </div>

      {aba === 'Resumo' && <ResumoAba ficha={ficha} roi={roi} />}
      {aba === 'Apoio de fábrica' && <ApoiosAba acaoId={id} apoios={ficha.apoios} inativos={ficha.inativos} onMudou={carregar} />}
      {aba === 'Investimento' && <CustosAba acaoId={id} custos={ficha.custos} onMudou={carregar} />}
      {aba === 'Leads' && <LeadsAba acaoId={id} leads={ficha.leads} onMudou={carregar} />}
      {aba === 'Propostas' && <PropostasAba acaoId={id} propostas={ficha.propostas} onMudou={carregar} />}
      {aba === 'Equipe' && <ListaSimples spec={SPEC_EQUIPE} acaoId={id} itens={ficha.equipe} onMudou={carregar} />}
      {aba === 'Itens expostos' && <ListaSimples spec={SPEC_ITENS} acaoId={id} itens={ficha.itens} onMudou={carregar} />}
      {aba === 'Ações realizadas' && <ListaSimples spec={SPEC_REALIZADAS} acaoId={id} itens={ficha.realizadas} apoios={ficha.apoios} onMudou={carregar} />}
      {aba === 'Concorrentes' && <ListaSimples spec={SPEC_CONCORRENTES} acaoId={id} itens={ficha.concorrentes} onMudou={carregar} />}
      {aba === 'Mídia' && <ListaSimples spec={SPEC_MIDIAS} acaoId={id} itens={ficha.midias} apoios={ficha.apoios} onMudou={carregar} />}
      {aba === 'Avaliação' && <AvaliacaoAba acaoId={id} avaliacoes={ficha.avaliacoes} onMudou={carregar} />}
      {aba === 'Questionário' && <QuestionarioAba acaoId={id} acaoNome={acao.nome} onMudou={carregar} />}
      {aba === 'Relatório' && <RelatorioAba apoios={ficha.apoios} onMudou={carregar} />}

      <Modal titulo="Editar ação" aberto={editando} onFechar={() => setEditando(false)}>
        <AcaoForm
          inicial={acao}
          salvando={salvando}
          erro={erroForm}
          onSalvar={salvarEdicao}
          onCancelar={() => setEditando(false)}
        />
      </Modal>
    </div>
  );
}
