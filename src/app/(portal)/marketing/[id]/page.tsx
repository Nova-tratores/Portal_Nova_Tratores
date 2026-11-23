'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// /marketing/[id] — ficha da campanha de marketing (era "ação" até 18/11/2026).
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
import { STATUS_ACAO, TIPOS_ACAO, rotulo, cor, ehEventoInterno } from '@/lib/marketing/tipos';
import AcaoForm from '@/components/marketing/AcaoForm';
import CapaCampanha from '@/components/marketing/CapaCampanha';
import Modal from '@/components/marketing/Modal';
import ResumoAba from '@/components/marketing/abas/ResumoAba';
import LinhaDoTempoAba from '@/components/marketing/abas/LinhaDoTempoAba';
import ApoiosAba from '@/components/marketing/abas/ApoiosAba';
import CustosAba from '@/components/marketing/abas/CustosAba';
import LeadsAba from '@/components/marketing/abas/LeadsAba';
import PropostasAba from '@/components/marketing/abas/PropostasAba';
import ListaSimples, { SPEC_EQUIPE, SPEC_ITENS, SPEC_REALIZADAS, SPEC_CONCORRENTES, SPEC_MIDIAS } from '@/components/marketing/abas/ListaSimples';
import AvaliacaoAba from '@/components/marketing/abas/AvaliacaoAba';
import QuestionarioAba from '@/components/marketing/abas/QuestionarioAba';
import RelatorioAba from '@/components/marketing/abas/RelatorioAba';
import {
  apiGet, apiEnviar, periodoBR, Selo, Vazio, AvisoMigracao, Erro, ROSA, IconeTipoAcao, estiloBotaoContorno,
} from '@/components/marketing/ui';

// Revisão da tela de campanha (23/11/2026): eram 14 abas em duas linhas, quase todas vazias.
// Viraram 5; dentro de cada uma, blocos que aparecem conforme o tipo da campanha.
const ABAS = ['Resumo', 'Dinheiro', 'Vendas', 'Execução', 'Fechamento'] as const;
type Aba = (typeof ABAS)[number];

/** Um bloco dentro de uma aba (ex.: "Investimento" e "Apoio de fábrica" dentro de Dinheiro). */
function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 500, color: 'var(--portal-text)' }}>{titulo}</h2>
      {children}
    </section>
  );
}

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
      else setErro(e?.message || 'Não foi possível carregar a campanha.');
    } finally {
      setCarregando(false);
    }
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  const [relatorioAberto, setRelatorioAberto] = useState(false);
  const [avisoRoleta, setAvisoRoleta] = useState<string | null>(null);

  // inscrições da roleta que ainda não viraram lead (o gatilho do banco faz isso sozinho; isto cobre o que ficou para trás)
  const converterRoleta = async () => {
    setAvisoRoleta(null);
    try {
      const r = await apiEnviar<any>('/api/marketing/leads/da-roleta', 'POST', { acao_id: id });
      setAvisoRoleta(r?.criados ? `${r.criados} lead(s) criados a partir da roleta.` : 'Nada novo para converter.');
      carregar();
    } catch (e: any) { setAvisoRoleta(e?.message || 'Não consegui converter.'); }
  };

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

  // Revisão da tela (23/11/2026): o TIPO decide o que aparece.
  //   evento interno → sem Vendas; feira/dia de campo → equipe, itens expostos e concorrentes;
  //   apoio de fábrica só se houver apoio ou for feira; relatório da fábrica vira botão quando há apoio.
  const interno = ehEventoInterno(acao.tipo);
  const ehFeira = acao.tipo === 'feira' || acao.tipo === 'dia_de_campo';
  const mostraApoio = ficha.apoios.length > 0 || ehFeira;
  const terminou = !!acao.data_fim && String(acao.data_fim).slice(0, 10) < new Date().toISOString().slice(0, 10);
  const abasVisiveis = ABAS.filter((a) => !(interno && a === 'Vendas'));
  const abaAtual: Aba = abasVisiveis.includes(aba) ? aba : 'Resumo';   // trocou o tipo com uma aba escondida aberta

  // Contador por aba: o número que faz a pessoa saber onde falta preencher.
  const contagem: Partial<Record<Aba, number>> = {
    Dinheiro: ficha.custos.length + (mostraApoio ? ficha.apoios.length : 0),
    Vendas: ficha.leads.length + ficha.propostas.length,
    Execução: ficha.realizadas.length + ficha.midias.length + ((ehFeira || interno) ? ficha.equipe.length : 0) + (ehFeira ? ficha.itens.length + ficha.concorrentes.length : 0),
    Fechamento: ficha.avaliacoes.length,
  };

  // "O que falta" no topo do Resumo: cada pendência com o botão que resolve
  type Pend = { texto: string; botao?: string; acao?: () => void; precisaEditar?: boolean };
  const pendencias: Pend[] = [];
  if (acao.status !== 'cancelada') {
    if (!acao.responsavel_id) pendencias.push({ texto: 'Responsável não definido.', botao: 'Definir', acao: () => { setErroForm(null); setEditando(true); }, precisaEditar: true });
    if (ficha.custos.length === 0) pendencias.push({ texto: 'Nenhum custo lançado: sem custo, o retorno não vale nada.', botao: 'Lançar custo', acao: () => setAba('Dinheiro') });
    const naRoleta = ficha.roleta?.participantes ?? 0;
    const daRoleta = ficha.leads.filter((l: any) => l.origem === 'roleta').length;
    if (!interno && naRoleta > daRoleta) pendencias.push({ texto: `${naRoleta - daRoleta} participante(s) da roleta ainda não viraram lead.`, botao: 'Converter em leads', acao: converterRoleta });
    if (!interno && ficha.propostas.length === 0 && acao.status !== 'planejada') pendencias.push({ texto: 'Nenhuma proposta vinculada: é o que liga a campanha à venda.', botao: 'Vincular', acao: () => setAba('Vendas') });
    if (terminou && ficha.avaliacoes.length === 0) pendencias.push({ texto: 'A campanha terminou e ainda não foi avaliada.', botao: 'Avaliar', acao: () => setAba('Fechamento') });
  }

  return (
    <div style={{ padding: 16, maxWidth: 1400, margin: '0 auto' }}>
      <Link
        href="/marketing"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#2563eb', textDecoration: 'none', marginBottom: 10 }}
      >
        <ArrowLeft size={15} /> Todas as campanhas
      </Link>

      {/* Cabeçalho */}
      <div
        style={{
          background: 'var(--portal-bg-card)',
          border: '1px solid var(--portal-border)',
          borderRadius: 16, marginBottom: 14, overflow: 'hidden',
        }}
      >
        {/* capa em faixa baixa (revisão 23/11/2026): antes ocupava meia tela e empurrava os números para baixo */}
        <div style={{ maxHeight: 120, overflow: 'hidden', position: 'relative' }}>
          <CapaCampanha acao={acao} roleta={ficha.roleta} proporcao="16 / 3" />
          {/* Sem foto: o quadro lilás sozinho não dizia que dá pra pôr uma capa */}
          {!acao.capa_url && !ficha.roleta?.capa && podeEditar && (
            <button
              onClick={() => { setErroForm(null); setEditando(true); }}
              style={{ ...estiloBotaoContorno, position: 'absolute', top: 12, right: 12 }}
            >
              <i className="fa-solid fa-image" /> Colocar capa
            </button>
          )}
        </div>
        <div style={{ padding: '16px 18px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', minWidth: 0, flex: '1 1 300px' }}>
          <IconeTipoAcao tipo={acao.tipo} cor={cor(STATUS_ACAO, acao.status)} tamanho={48} />
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 500, letterSpacing: '-.01em', color: 'var(--portal-text)' }}>{acao.nome}</h1>
            <div style={{ fontSize: 13, color: 'var(--portal-text-muted, #64748b)', marginTop: 3 }}>
              {rotulo(TIPOS_ACAO, acao.tipo)} · {periodoBR(acao.data_inicio, acao.data_fim)}
              {(() => {
                if (!acao.data_fim || acao.status === 'cancelada' || acao.status === 'realizada') return null;
                const dias = Math.round((Date.parse(String(acao.data_fim).slice(0, 10)) - Date.parse(new Date().toISOString().slice(0, 10))) / 86_400_000);
                if (dias < 0) return <b style={{ fontWeight: 500, color: '#dc2626' }}> · terminou há {-dias} dia(s)</b>;
                return <b style={{ fontWeight: 500, color: dias <= 3 ? '#d97706' : '#16a34a' }}> · {dias === 0 ? 'último dia' : `faltam ${dias} dia(s)`}</b>;
              })()}
              {acao.cidade ? ` · ${acao.cidade}${acao.uf ? `/${acao.uf}` : ''}` : ''}
              {acao.local_nome ? ` · ${acao.local_nome}` : ''}
            </div>
            <div style={{ fontSize: 13, color: 'var(--portal-text-muted, #64748b)', marginTop: 2 }}>
              Responsável: {acao.responsavel_nome || 'não definido'} · {acao.empresa}
              {acao.projeto_nome ? ` · Projeto Omie: ${acao.projeto_nome}` : ''}
            </div>
          </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Selo texto={rotulo(STATUS_ACAO, acao.status)} cor={cor(STATUS_ACAO, acao.status)} />
            {/* A roleta do site é uma ferramenta DENTRO da campanha (campanhas.acao_id) */}
            {ficha.roleta && (
              <Link
                href={`/marketing/campanhas?campanha=${encodeURIComponent(ficha.roleta.slug)}`}
                style={{ ...estiloBotaoContorno, textDecoration: 'none' }}
              >
                <i className="fa-solid fa-dharmachakra" /> Abrir a roleta
              </Link>
            )}
            {ficha.apoios.length > 0 && (
              <button onClick={() => setRelatorioAberto(true)} style={estiloBotaoContorno}>
                <i className="fa-solid fa-file-lines" /> Relatório para a fábrica
              </button>
            )}
            <button
              onClick={() => { setErroForm(null); setEditando(true); }}
              {...gateBtn(podeEditar)}
              style={{ ...estiloBotaoContorno, ...estiloSemPermissao(podeEditar) }}
            >
              <Pencil size={14} /> Editar
            </button>
          </div>
        </div>

        {semDono && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, padding: 10, borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', fontSize: 13, fontWeight: 500, color: '#111111' }}>
            <UserX size={16} color="#dc2626" />
            O responsável desta campanha não está mais ativo no portal. Reatribua antes que o histórico fique sem dono.
          </div>
        )}
        </div>
      </div>

      {/* Abas */}
      {/* Abas no jeito das do POS: escolhida com fundo clarinho e sublinhado cheio,
          contador em pílula na cor do módulo. */}
      <div className="mkt-abas" style={{ display: 'flex', flexWrap: 'wrap', gap: 2, borderBottom: '1px solid var(--portal-border)', marginBottom: 14 }}>
        {abasVisiveis.map((a) => {
          const ativa = abaAtual === a;
          const n = contagem[a];
          return (
            <button
              key={a}
              onClick={() => setAba(a)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '9px 13px', fontSize: 13.5, fontWeight: 500,
                border: 'none', borderRadius: '10px 10px 0 0', cursor: 'pointer',
                borderBottom: `3px solid ${ativa ? ROSA : 'transparent'}`,
                marginBottom: -1,
                background: ativa ? `color-mix(in srgb, ${ROSA} 9%, var(--portal-bg-card))` : 'transparent',
                color: 'var(--portal-text)',
                whiteSpace: 'nowrap',
              }}
            >
              {a}
              {n !== undefined && n > 0 && (
                <span
                  style={{
                    fontSize: 11.5, padding: '1px 7px', borderRadius: 999, fontVariantNumeric: 'tabular-nums',
                    color: ativa ? '#fefefe' : ROSA,
                    background: ativa ? ROSA : `color-mix(in srgb, ${ROSA} 12%, var(--portal-bg-card))`,
                  }}
                >
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Revisão da tela (23/11/2026): 14 abas viraram 5; o tipo da campanha decide o que aparece em cada uma */}
      {abaAtual === 'Resumo' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: '3 1 560px', minWidth: 0 }}>
            {pendencias.length > 0 && (
              <div style={{ border: '1px solid #fcd34d', background: 'color-mix(in srgb, #f59e0b 8%, var(--portal-bg-card))', borderRadius: 14, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--portal-text)' }}>O que falta</div>
                {avisoRoleta && <div style={{ fontSize: 13, color: 'var(--portal-text-muted, #64748b)' }}>{avisoRoleta}</div>}
                {pendencias.map((p) => (
                  <div key={p.texto} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13.5, color: 'var(--portal-text)' }}>
                    <i className="fa-solid fa-triangle-exclamation" style={{ color: '#d97706' }} />
                    <span style={{ flex: '1 1 240px' }}>{p.texto}</span>
                    {p.botao && <button onClick={p.acao} disabled={!podeEditar && p.precisaEditar} style={{ ...estiloBotaoContorno, padding: '6px 11px' }}>{p.botao}</button>}
                  </div>
                ))}
              </div>
            )}
            <ResumoAba ficha={ficha} roi={roi} />
          </div>
          <div style={{ flex: '1 1 300px', minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--portal-text)', marginBottom: 8 }}>Linha do tempo</div>
            <div style={{ maxHeight: 640, overflowY: 'auto' }}><LinhaDoTempoAba acaoId={id} /></div>
          </div>
        </div>
      )}
      {abaAtual === 'Dinheiro' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Bloco titulo="Investimento"><CustosAba acaoId={id} custos={ficha.custos} onMudou={carregar} /></Bloco>
          {mostraApoio && <Bloco titulo="Apoio de fábrica"><ApoiosAba acaoId={id} apoios={ficha.apoios} inativos={ficha.inativos} onMudou={carregar} /></Bloco>}
        </div>
      )}
      {abaAtual === 'Vendas' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Bloco titulo="Leads"><LeadsAba acaoId={id} leads={ficha.leads} onMudou={carregar} /></Bloco>
          <Bloco titulo="Propostas"><PropostasAba acaoId={id} propostas={ficha.propostas} onMudou={carregar} /></Bloco>
        </div>
      )}
      {abaAtual === 'Execução' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Bloco titulo="Ações realizadas"><ListaSimples spec={SPEC_REALIZADAS} acaoId={id} itens={ficha.realizadas} apoios={ficha.apoios} onMudou={carregar} /></Bloco>
          <Bloco titulo="Mídia (fotos, vídeos, posts)"><ListaSimples spec={SPEC_MIDIAS} acaoId={id} itens={ficha.midias} apoios={ficha.apoios} onMudou={carregar} /></Bloco>
          {(ehFeira || interno) && <Bloco titulo="Equipe"><ListaSimples spec={SPEC_EQUIPE} acaoId={id} itens={ficha.equipe} onMudou={carregar} /></Bloco>}
          {ehFeira && <Bloco titulo="Itens expostos"><ListaSimples spec={SPEC_ITENS} acaoId={id} itens={ficha.itens} onMudou={carregar} /></Bloco>}
          {ehFeira && <Bloco titulo="Concorrentes"><ListaSimples spec={SPEC_CONCORRENTES} acaoId={id} itens={ficha.concorrentes} onMudou={carregar} /></Bloco>}
        </div>
      )}
      {abaAtual === 'Fechamento' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {!terminou && <div style={{ fontSize: 13.5, color: 'var(--portal-text-muted, #64748b)' }}>A campanha ainda não terminou. Use esta parte depois do fim, para registrar o que funcionou.</div>}
          <Bloco titulo="Avaliação"><AvaliacaoAba acaoId={id} avaliacoes={ficha.avaliacoes} onMudou={carregar} /></Bloco>
          <Bloco titulo="Pedir para alguém preencher (questionário)"><QuestionarioAba acaoId={id} acaoNome={acao.nome} onMudou={carregar} /></Bloco>
        </div>
      )}

      <Modal titulo="Relatório para a fábrica" aberto={relatorioAberto} onFechar={() => setRelatorioAberto(false)}>
        <RelatorioAba apoios={ficha.apoios} onMudou={carregar} />
      </Modal>

      <Modal titulo="Editar campanha" aberto={editando} onFechar={() => setEditando(false)}>
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
