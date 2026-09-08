'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// Aba "Questionário" — links únicos de preenchimento pós-evento.
//
// Serve pra quando a memória do evento está com alguém que não usa o módulo (ou
// nem trabalha mais aqui). Gera um endereço /q/<token>, manda no WhatsApp, e a
// pessoa responde do celular sem login.
//
// A importação nunca sobrescreve calado: mostra o que vai gravar, marca onde há
// conflito e pede confirmação.
// =============================================================================
import { useCallback, useEffect, useState } from 'react';
import {
  Check, Copy, ExternalLink, Link2, Lock, MessageCircle, RotateCcw, Trash2, Upload,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { gateBtn, estiloSemPermissao } from '@/lib/permissoes/ui';
import { PERGUNTAS, IDS_PERGUNTAS } from '@/lib/marketing/questionario';
import Modal from '../Modal';
import {
  apiGet, apiEnviar, Painel, Titulo, Selo, Kpi, Campo, estiloInput,
  BotaoRosa, Vazio, Erro, ROSA,
} from '../ui';

interface Usuario { id: string; nome: string; email: string | null; ativo: boolean | null }

function horaBR(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function QuestionarioAba({
  acaoId, acaoNome, onMudou,
}: { acaoId: string; acaoNome: string; onMudou: () => void }) {
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const podeGerenciar = pode('marketing', 'acoes:editar');

  const [links, setLinks] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  const [novoAberto, setNovo] = useState(false);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [destinatario, setDestinatario] = useState('');
  const [expira, setExpira] = useState('');
  const [criando, setCriando] = useState(false);
  const [criado, setCriado] = useState<any>(null);

  const [vendo, setVendo] = useState<any>(null);
  const [importando, setImportando] = useState<any>(null);
  const [previa, setPrevia] = useState<any>(null);
  const [gravando, setGravando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  const base = typeof window === 'undefined' ? '' : window.location.origin;
  const urlDe = (token: string) => `${base}/q/${token}`;

  const carregar = useCallback(async () => {
    try {
      const r = await apiGet<any>(`/api/marketing/questionario?acao_id=${acaoId}`);
      setLinks(r.links ?? []);
      setErro(null);
    } catch (e: any) {
      setErro(e?.corpo?.migracaoFaltando
        ? 'As tabelas do questionário ainda não existem. Rode sql/marketing-questionario.sql no Supabase.'
        : (e?.message || 'Não foi possível carregar os links.'));
    } finally {
      setCarregando(false);
    }
  }, [acaoId]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    if (!novoAberto) return;
    (async () => {
      const { data } = await supabase
        .from('financeiro_usu').select('id, nome, email, ativo').order('nome');
      setUsuarios((data as Usuario[]) ?? []);
    })();
  }, [novoAberto]);

  const copiar = async (texto: string, chave: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(chave);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      setErro('O navegador não deixou copiar. Selecione o endereço e copie na mão.');
    }
  };

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    setCriando(true);
    setErro(null);
    try {
      const u = usuarios.find((x) => x.id === destinatario);
      const r = await apiEnviar<any>('/api/marketing/questionario', 'POST', {
        acao_id: acaoId,
        destinatario_usuario_id: u?.id ?? null,
        destinatario_nome: u?.nome ?? null,
        destinatario_email: u?.email ?? null,
        expira_em: expira || null,
      });
      setCriado(r.link);
      setDestinatario('');
      setExpira('');
      carregar();
    } catch (e2: any) {
      setErro(e2?.message || 'Não foi possível gerar o link.');
    } finally {
      setCriando(false);
    }
  };

  const alternar = async (link: any) => {
    try {
      await apiEnviar('/api/marketing/questionario', 'PATCH', { id: link.id, editavel: !link.editavel });
      carregar();
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível mudar o link.');
    }
  };

  const excluir = async (link: any) => {
    if (!window.confirm(`Apagar o link de ${link.destinatario_nome || 'sem destinatário'}? As respostas vão junto.`)) return;
    try {
      await apiEnviar(`/api/marketing/questionario?id=${link.id}`, 'DELETE');
      carregar();
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível apagar.');
    }
  };

  const abrirImportacao = async (link: any) => {
    setImportando(link);
    setPrevia(null);
    setResultado(null);
    try {
      setPrevia(await apiGet(`/api/marketing/questionario/importar?link_id=${link.id}`));
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível montar a prévia.');
      setImportando(null);
    }
  };

  const confirmarImportacao = async (sobrescrever: boolean) => {
    setGravando(true);
    try {
      const r = await apiEnviar<any>('/api/marketing/questionario/importar', 'POST', {
        link_id: importando.id, sobrescrever,
      });
      const partes = [`${r.aplicados} campo(s) preenchido(s)`];
      if (r.observacoes) partes.push(`${r.observacoes} resposta(s) nas observações`);
      if (r.ignoradosPorConflito) partes.push(`${r.ignoradosPorConflito} mantido(s) como estava(m)`);
      setResultado(partes.join(' · '));
      onMudou();
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível importar.');
    } finally {
      setGravando(false);
    }
  };

  const totalPerguntas = IDS_PERGUNTAS.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: 'var(--portal-text-muted, #64748b)', flex: '1 1 320px' }}>
          Um endereço por pessoa, sem login. Ela responde pelo celular, aos poucos, e volta no
          mesmo link quando lembrar de mais alguma coisa.
        </div>
        <BotaoRosa
          onClick={() => { setCriado(null); setErro(null); setNovo(true); }}
          {...gateBtn(podeGerenciar)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, ...estiloSemPermissao(podeGerenciar) }}
        >
          <Link2 size={16} /> Gerar link de preenchimento
        </BotaoRosa>
      </div>

      {erro && <Erro>{erro}</Erro>}

      {carregando ? (
        <Vazio>Carregando…</Vazio>
      ) : links.length === 0 ? (
        <Vazio>
          Nenhum link gerado. Use quando a informação do evento estiver com alguém que não abre o
          portal.
        </Vazio>
      ) : (
        links.map((l) => {
          const url = urlDe(l.token);
          const progresso = l.respondidas ?? 0;
          return (
            <Painel key={l.id} style={{ borderLeft: `3px solid ${l.editavel ? ROSA : '#94a3b8'}` }}>
              <Titulo
                acao={
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Selo
                      texto={l.editavel ? 'Aberto' : 'Fechado'}
                      cor={l.editavel ? '#16a34a' : '#94a3b8'}
                    />
                    {l.enviado_em && <Selo texto="Enviado" cor="#2563eb" />}
                  </div>
                }
              >
                {l.destinatario_nome || 'Sem destinatário'}
              </Titulo>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12, color: 'var(--portal-text-muted, #64748b)', marginBottom: 10 }}>
                <span>Criado {horaBR(l.criado_em)}</span>
                <span>1º acesso {horaBR(l.primeiro_acesso_em)}</span>
                <span>Último salvamento {horaBR(l.ultimo_salvamento_em)}</span>
                <span>Enviado {horaBR(l.enviado_em)}</span>
                {l.expira_em && <span>Expira {horaBR(l.expira_em)}</span>}
              </div>

              {/* Progresso: é o que diz se a pessoa abriu e travou. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ flex: 1, height: 8, background: 'var(--portal-bg)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${(progresso / totalPerguntas) * 100}%`, height: '100%', background: ROSA }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text)' }}>
                  {progresso} de {totalPerguntas}
                </span>
              </div>

              <div
                style={{
                  fontSize: 12, fontFamily: 'monospace', padding: '7px 9px',
                  background: 'var(--portal-bg)', border: '1px solid var(--portal-border)',
                  borderRadius: 3, wordBreak: 'break-all', marginBottom: 10,
                  color: 'var(--portal-text)',
                }}
              >
                {url}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <Acao onClick={() => copiar(url, l.id)}>
                  {copiado === l.id ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar link</>}
                </Acao>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(
                    `Oi${l.destinatario_nome ? `, ${String(l.destinatario_nome).split(' ')[0]}` : ''}! Preciso da sua ajuda pra registrar o que aconteceu no ${acaoNome}. São algumas perguntas, dá pra responder aos poucos pelo celular e voltar depois: ${url}`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={estiloAcao}
                >
                  <MessageCircle size={14} /> Enviar no WhatsApp
                </a>
                <a href={url} target="_blank" rel="noopener noreferrer" style={estiloAcao}>
                  <ExternalLink size={14} /> Abrir
                </a>
                <Acao onClick={() => setVendo(l)}>Ver respostas</Acao>
                <Acao onClick={() => abrirImportacao(l)} desabilitado={!podeGerenciar}>
                  <Upload size={14} /> Importar para a ficha
                </Acao>
                <Acao onClick={() => alternar(l)} desabilitado={!podeGerenciar}>
                  {l.editavel ? <><Lock size={14} /> Fechar</> : <><RotateCcw size={14} /> Reabrir</>}
                </Acao>
                <Acao onClick={() => excluir(l)} desabilitado={!podeGerenciar} perigo>
                  <Trash2 size={14} />
                </Acao>
              </div>
            </Painel>
          );
        })
      )}

      {/* Gerar link */}
      <Modal titulo="Gerar link de preenchimento" aberto={novoAberto} onFechar={() => setNovo(false)} largura={620}>
        {criado ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 14, color: 'var(--portal-text)' }}>
              Link criado para <b>{criado.destinatario_nome || 'sem destinatário'}</b>.
            </div>
            <div
              style={{
                fontSize: 13, fontFamily: 'monospace', padding: 10,
                background: 'var(--portal-bg)', border: '1px solid var(--portal-border)',
                borderRadius: 3, wordBreak: 'break-all', color: 'var(--portal-text)',
              }}
            >
              {urlDe(criado.token)}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <BotaoRosa onClick={() => copiar(urlDe(criado.token), 'novo')}>
                {copiado === 'novo' ? 'Copiado' : 'Copiar link'}
              </BotaoRosa>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `Oi${criado.destinatario_nome ? `, ${String(criado.destinatario_nome).split(' ')[0]}` : ''}! Preciso da sua ajuda pra registrar o que aconteceu no ${acaoNome}. São algumas perguntas, dá pra responder aos poucos pelo celular e voltar depois: ${urlDe(criado.token)}`,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                style={estiloAcao}
              >
                <MessageCircle size={14} /> Enviar no WhatsApp
              </a>
            </div>
            <div style={{ fontSize: 12, color: 'var(--portal-text-muted, #64748b)' }}>
              Quem tiver este endereço responde o questionário. Não é preciso login, então mande
              só para a pessoa certa.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setNovo(false)} style={estiloBotaoNeutro}>Fechar</button>
            </div>
          </div>
        ) : (
          <form onSubmit={criar} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Campo label="Para quem é o link *" ajuda="O nome fica gravado no questionário." largura="1 1 100%">
              <select
                style={estiloInput}
                value={destinatario}
                onChange={(e) => setDestinatario(e.target.value)}
                required
              >
                <option value="">— escolher —</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}{u.ativo === false ? ' (inativo)' : ''}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Expira em" ajuda="Opcional. Em branco, o link não expira." largura="1 1 100%">
              <input type="date" style={estiloInput} value={expira} onChange={(e) => setExpira(e.target.value)} />
            </Campo>
            {erro && <Erro>{erro}</Erro>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setNovo(false)} style={estiloBotaoNeutro}>Cancelar</button>
              <BotaoRosa tipo="submit" disabled={criando || !destinatario}>
                {criando ? 'Gerando…' : 'Gerar link'}
              </BotaoRosa>
            </div>
          </form>
        )}
      </Modal>

      {/* Ver respostas */}
      <Modal
        titulo={`Respostas — ${vendo?.destinatario_nome ?? ''}`}
        aberto={!!vendo}
        onFechar={() => setVendo(null)}
        largura={820}
      >
        {vendo && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Kpi rotulo="Respondidas" valor={`${vendo.respondidas ?? 0} de ${totalPerguntas}`} />
              <Kpi rotulo="Enviado" valor={vendo.enviado_em ? horaBR(vendo.enviado_em) : 'ainda não'} />
            </div>
            {PERGUNTAS.map((p) => {
              const resposta = String(vendo.respostas?.[p.id] ?? '').trim();
              return (
                <div key={p.id} style={{ borderBottom: '1px solid var(--portal-border)', paddingBottom: 9 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text)' }}>
                    {p.id.toUpperCase()} · {p.texto}
                  </div>
                  <div style={{ fontSize: 13, color: resposta ? 'var(--portal-text)' : '#b91c1c', whiteSpace: 'pre-wrap', marginTop: 3 }}>
                    {resposta || 'Não respondido'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      {/* Importar */}
      <Modal
        titulo="Importar respostas para a ficha"
        aberto={!!importando}
        onFechar={() => { setImportando(null); setPrevia(null); setResultado(null); }}
        largura={820}
      >
        {!previa ? (
          <Vazio>Montando a prévia…</Vazio>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {resultado ? (
              <div style={{ padding: 12, borderRadius: 4, border: '1px solid #16a34a', background: '#f0fdf4', color: '#111111', fontSize: 13 }}>
                Importado: {resultado}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--portal-text-muted, #64748b)' }}>
                Isto grava na ficha da ação. Nada é apagado sem você mandar.
              </div>
            )}

            {previa.itens.length === 0 ? (
              <Vazio>Nenhuma resposta se encaixa num campo da ficha ainda.</Vazio>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--portal-bg)' }}>
                      {['Pergunta', 'Vai para', 'Valor', 'Situação'].map((h) => (
                        <th key={h} style={{ textAlign: 'left', padding: '8px 9px', color: 'var(--portal-text)', borderBottom: '1px solid var(--portal-border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previa.itens.map((i: any) => (
                      <tr key={i.q} style={{ borderBottom: '1px solid var(--portal-border)' }}>
                        <td style={{ padding: '8px 9px', color: 'var(--portal-text)' }}>{i.q.toUpperCase()}</td>
                        <td style={{ padding: '8px 9px', color: 'var(--portal-text-muted, #64748b)' }}>
                          {i.tabela === 'acao' ? 'Ficha' : 'Avaliação'} · {i.campo}
                        </td>
                        <td style={{ padding: '8px 9px', color: 'var(--portal-text)' }}>{String(i.valor).slice(0, 120)}</td>
                        <td style={{ padding: '8px 9px' }}>
                          {i.conflito
                            ? <span style={{ color: '#b45309', fontWeight: 700 }}>Já preenchido</span>
                            : <span style={{ color: '#16a34a' }}>Livre</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {previa.numeroNaoLido?.length > 0 && (
              <div style={{ fontSize: 13, color: 'var(--portal-text)' }}>
                Em {previa.numeroNaoLido.join(', ').toUpperCase()} não deu para ler um número na
                resposta. O texto inteiro vai para as observações, e o campo numérico fica como está.
              </div>
            )}

            {previa.paraObservacoes?.length > 0 && (
              <div style={{ fontSize: 13, color: 'var(--portal-text)' }}>
                Outras <b>{previa.paraObservacoes.length}</b> resposta(s) vão para as observações
                da ficha, cada uma com o número da pergunta na frente.
              </div>
            )}

            {!resultado && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', borderTop: `2px solid ${ROSA}`, paddingTop: 12 }}>
                <button onClick={() => setImportando(null)} style={estiloBotaoNeutro}>Cancelar</button>
                <BotaoRosa onClick={() => confirmarImportacao(false)} disabled={gravando}>
                  {gravando ? 'Gravando…' : 'Importar só o que está livre'}
                </BotaoRosa>
                {previa.conflitos > 0 && (
                  <button
                    onClick={() => {
                      if (window.confirm(`Isto substitui ${previa.conflitos} campo(s) já preenchido(s) na ficha. Continuar?`)) {
                        confirmarImportacao(true);
                      }
                    }}
                    disabled={gravando}
                    style={{ ...estiloBotaoNeutro, borderColor: '#b45309', color: '#b45309', fontWeight: 700 }}
                  >
                    Substituir os {previa.conflitos} já preenchidos
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

const estiloAcao: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 5, padding: '6px 11px', fontSize: 12,
  borderRadius: 3, border: '1px solid var(--portal-border)',
  background: 'var(--portal-bg-card)', color: 'var(--portal-text)',
  cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap',
};

const estiloBotaoNeutro: React.CSSProperties = {
  padding: '9px 16px', fontSize: 14, borderRadius: 3,
  border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)',
  color: 'var(--portal-text)', cursor: 'pointer',
};

function Acao({
  children, onClick, desabilitado, perigo,
}: { children: React.ReactNode; onClick: () => void; desabilitado?: boolean; perigo?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={desabilitado}
      title={desabilitado ? 'Você não tem permissão para esta ação' : undefined}
      style={{
        ...estiloAcao,
        color: perigo ? '#dc2626' : 'var(--portal-text)',
        opacity: desabilitado ? 0.5 : 1,
        cursor: desabilitado ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}
