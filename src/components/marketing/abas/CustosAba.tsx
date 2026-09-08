'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// Aba "Investimento" — os custos da ação, no modelo HÍBRIDO.
//
// Cada linha é digitada à mão OU aponta pra um documento que já existe no
// portal (Requisição, Conta a pagar, Nota de entrada). O botão "Buscar
// documentos" usa o Projeto do Omie da ação pra oferecer os candidatos, em vez
// de a pessoa redigitar tudo.
//
// O valor é SNAPSHOT: sincronizar relê a origem e mostra divergência, mas nunca
// altera o total sozinho — senão o retorno de uma feira encerrada mudaria
// quando alguém editasse uma requisição antiga meses depois.
// =============================================================================
import { useState } from 'react';
import { Link2, Plus, RefreshCw, Trash2, TriangleAlert } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { gateBtn, estiloSemPermissao } from '@/lib/permissoes/ui';
import { CATEGORIAS_CUSTO, ORIGENS_CUSTO, STATUS_CUSTO, rotulo, cor } from '@/lib/marketing/tipos';
import { totaisCusto, divergente, parseValorMisto, rankingCategorias } from '@/lib/marketing/custos';
import Modal from '../Modal';
import {
  apiGet, apiEnviar, brl, dataBR, Painel, Titulo, Selo, Kpi, Campo, estiloInput,
  BotaoRosa, Vazio, Erro,
} from '../ui';

const VAZIO = {
  descricao: '', categoria: 'estande', fornecedor: '', data: '',
  valor: '', rateio_percent: 100, status: 'confirmado', observacoes: '',
  vinculo_tipo: '', vinculo_ref: '', vinculo_label: '', valor_fonte: null as number | null,
};

export default function CustosAba({
  acaoId, custos, onMudou,
}: { acaoId: string; custos: any[]; onMudou: () => void }) {
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const podeEditar = pode('marketing', 'custos:editar');
  const podeVincular = pode('marketing', 'custos:vincular');

  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<any>(null);
  const [f, setF] = useState<any>(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [sugestoesAberto, setSugestoes] = useState(false);
  const [sug, setSug] = useState<any>(null);
  const [carregandoSug, setCarregandoSug] = useState(false);
  const [sincronizando, setSinc] = useState(false);
  const [avisoSinc, setAvisoSinc] = useState<string | null>(null);

  const t = totaisCusto(custos as any);
  const categorias = rankingCategorias(t.porCategoria);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));

  const abrirNovo = () => { setEditando(null); setF(VAZIO); setErro(null); setAberto(true); };
  const abrirEdicao = (c: any) => {
    setEditando(c);
    setF({ ...VAZIO, ...c, data: (c.data ?? '').slice(0, 10) });
    setErro(null);
    setAberto(true);
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      if (editando) await apiEnviar('/api/marketing/custos', 'PATCH', { ...f, id: editando.id });
      else await apiEnviar('/api/marketing/custos', 'POST', { ...f, acao_id: acaoId });
      setAberto(false);
      onMudou();
    } catch (e2: any) {
      setErro(e2?.message || 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (c: any) => {
    if (!window.confirm(`Excluir o custo "${c.descricao}"?`)) return;
    try { await apiEnviar(`/api/marketing/custos?id=${c.id}`, 'DELETE'); onMudou(); }
    catch (e: any) { setErro(e?.message || 'Não foi possível excluir.'); }
  };

  const abrirSugestoes = async () => {
    setSugestoes(true);
    setCarregandoSug(true);
    setSug(null);
    try { setSug(await apiGet(`/api/marketing/custos/sugestoes?acao_id=${acaoId}`)); }
    catch (e: any) { setErro(e?.message || 'Não foi possível buscar documentos.'); setSugestoes(false); }
    finally { setCarregandoSug(false); }
  };

  const lancarDoDocumento = async (tipo: string, doc: any) => {
    try {
      await apiEnviar('/api/marketing/custos', 'POST', {
        acao_id: acaoId,
        descricao: doc.titulo,
        categoria: 'outro',
        fornecedor: doc.fornecedor || null,
        data: doc.data ? String(doc.data).slice(0, 10) : null,
        valor: parseValorMisto(doc.valorCru),
        valor_fonte: parseValorMisto(doc.valorCru),
        vinculo_tipo: tipo,
        vinculo_ref: doc.ref,
        vinculo_label: doc.extra || doc.titulo,
        status: 'confirmado',
      });
      setSug((s: any) => ({
        ...s,
        requisicoes: tipo === 'requisicao' ? s.requisicoes.filter((r: any) => r.ref !== doc.ref) : s.requisicoes,
        contas: tipo === 'finan_pagar' ? s.contas.filter((r: any) => r.ref !== doc.ref) : s.contas,
      }));
      onMudou();
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível lançar.');
    }
  };

  const sincronizar = async () => {
    setSinc(true);
    setAvisoSinc(null);
    try {
      const r = await apiEnviar<any>('/api/marketing/custos/sincronizar', 'POST', { acao_id: acaoId });
      setAvisoSinc(
        r.conferidos === 0
          ? 'Nenhum custo vinculado a documento nesta ação.'
          : `${r.conferidos} documento(s) conferido(s) · ${r.divergentes} com valor diferente do lançado. O total não muda sozinho.`,
      );
      onMudou();
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível conferir.');
    } finally {
      setSinc(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Kpi rotulo="Confirmado" valor={brl(t.confirmado)} dica="É este valor que entra no retorno." />
        <Kpi rotulo="Previsto" valor={brl(t.previsto)} cor="#d97706" />
        <Kpi rotulo="Total" valor={brl(t.total)} />
        <Kpi rotulo="Divergentes" valor={String(t.divergentes)} dica="Custos cujo documento de origem mudou de valor." cor={t.divergentes ? '#dc2626' : undefined} alerta={t.divergentes > 0} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={sincronizar}
          {...gateBtn(podeVincular, sincronizando)}
          title={podeVincular ? 'Relê o valor atual dos documentos vinculados' : undefined}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', fontSize: 13, borderRadius: 3, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text)', cursor: 'pointer', ...estiloSemPermissao(podeVincular) }}
        >
          <RefreshCw size={15} /> {sincronizando ? 'Conferindo…' : 'Conferir com a origem'}
        </button>
        <button
          onClick={abrirSugestoes}
          {...gateBtn(podeVincular)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', fontSize: 13, borderRadius: 3, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text)', cursor: 'pointer', ...estiloSemPermissao(podeVincular) }}
        >
          <Link2 size={15} /> Buscar documentos
        </button>
        <BotaoRosa onClick={abrirNovo} {...gateBtn(podeEditar)} style={{ display: 'flex', alignItems: 'center', gap: 6, ...estiloSemPermissao(podeEditar) }}>
          <Plus size={16} /> Novo custo
        </BotaoRosa>
      </div>

      {avisoSinc && (
        <div style={{ padding: 12, borderRadius: 4, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', fontSize: 13, color: 'var(--portal-text)' }}>
          {avisoSinc}
        </div>
      )}
      {erro && <Erro>{erro}</Erro>}

      {custos.length === 0 ? (
        <Vazio>Nenhum custo lançado. Digite na mão ou traga de uma requisição pelo botão acima.</Vazio>
      ) : (
        <Painel style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 760 }}>
            <thead>
              <tr style={{ background: 'var(--portal-bg)' }}>
                {['Descrição', 'Categoria', 'Fornecedor', 'Data', 'Origem', 'Valor', ''].map((h) => (
                  <th key={h} style={{ textAlign: h === 'Valor' ? 'right' : 'left', padding: '9px 10px', fontWeight: 700, color: 'var(--portal-text)', borderBottom: '1px solid var(--portal-border)', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {custos.map((c) => {
                const div = divergente(c);
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--portal-border)', opacity: c.status === 'cancelado' ? 0.5 : 1 }}>
                    <td style={{ padding: '8px 10px', color: 'var(--portal-text)' }}>
                      <button
                        onClick={() => abrirEdicao(c)}
                        style={{ background: 'none', border: 'none', padding: 0, color: 'var(--portal-text)', cursor: 'pointer', textAlign: 'left', fontSize: 13 }}
                      >
                        {c.descricao}
                      </button>
                      {c.status !== 'confirmado' && (
                        <span style={{ marginLeft: 6 }}>
                          <Selo texto={rotulo(STATUS_CUSTO, c.status)} cor={cor(STATUS_CUSTO, c.status)} />
                        </span>
                      )}
                      {Number(c.rateio_percent) !== 100 && (
                        <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--portal-text-muted, #64748b)' }}>
                          rateio {Number(c.rateio_percent)}%
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--portal-text)' }}>{rotulo(CATEGORIAS_CUSTO, c.categoria)}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--portal-text)' }}>{c.fornecedor || '—'}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--portal-text)', whiteSpace: 'nowrap' }}>{dataBR(c.data)}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--portal-text)', whiteSpace: 'nowrap' }}>
                      {rotulo(ORIGENS_CUSTO, c.origem)}
                      {c.vinculo_ref ? ` #${c.vinculo_ref}` : ''}
                      {div && (
                        <span title={`O documento de origem está em ${brl(c.valor_fonte)} — o lançado continua valendo.`} style={{ marginLeft: 6, color: '#dc2626', display: 'inline-flex', verticalAlign: 'middle' }}>
                          <TriangleAlert size={14} />
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--portal-text)', whiteSpace: 'nowrap' }}>
                      {brl(parseValorMisto(c.valor) * (Number(c.rateio_percent ?? 100) / 100))}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                      <button
                        onClick={() => excluir(c)}
                        {...gateBtn(podeEditar)}
                        title="Excluir"
                        style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', display: 'flex', ...estiloSemPermissao(podeEditar) }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Painel>
      )}

      {categorias.length > 0 && (
        <Painel>
          <Titulo>Por categoria</Titulo>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {categorias.map((c) => (
              <div key={c.id} style={{ padding: '6px 11px', border: '1px solid var(--portal-border)', borderRadius: 3, fontSize: 13, color: 'var(--portal-text)' }}>
                {c.label}: <b>{brl(c.valor)}</b> <span style={{ opacity: 0.6 }}>({c.percent.toFixed(0)}%)</span>
              </div>
            ))}
          </div>
        </Painel>
      )}

      {/* Formulário */}
      <Modal titulo={editando ? 'Editar custo' : 'Novo custo'} aberto={aberto} onFechar={() => setAberto(false)} largura={640}>
        <form onSubmit={salvar} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Campo label="Descrição *" largura="1 1 100%">
            <input style={estiloInput} value={f.descricao} onChange={(e) => set('descricao', e.target.value)} required />
          </Campo>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <Campo label="Categoria">
              <select style={estiloInput} value={f.categoria} onChange={(e) => set('categoria', e.target.value)}>
                {CATEGORIAS_CUSTO.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </Campo>
            <Campo label="Fornecedor"><input style={estiloInput} value={f.fornecedor ?? ''} onChange={(e) => set('fornecedor', e.target.value)} /></Campo>
            <Campo label="Data"><input type="date" style={estiloInput} value={f.data ?? ''} onChange={(e) => set('data', e.target.value)} /></Campo>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <Campo label="Valor (R$) *"><input type="number" step="0.01" style={estiloInput} value={f.valor ?? ''} onChange={(e) => set('valor', e.target.value)} required /></Campo>
            <Campo label="Rateio (%)" ajuda="Menos de 100 quando a nota cobre mais de uma ação.">
              <input type="number" min={1} max={100} step="0.001" style={estiloInput} value={f.rateio_percent ?? 100} onChange={(e) => set('rateio_percent', e.target.value)} />
            </Campo>
            <Campo label="Situação" ajuda="Previsto não entra no retorno.">
              <select style={estiloInput} value={f.status} onChange={(e) => set('status', e.target.value)}>
                {STATUS_CUSTO.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </Campo>
          </div>
          {f.vinculo_ref && (
            <div style={{ padding: 10, borderRadius: 3, border: '1px solid var(--portal-border)', fontSize: 13, color: 'var(--portal-text)' }}>
              Vinculado a <b>{rotulo(ORIGENS_CUSTO, f.vinculo_tipo)} #{f.vinculo_ref}</b>
              {f.vinculo_label ? ` — ${f.vinculo_label}` : ''}.
              <div style={{ fontSize: 12, color: 'var(--portal-text-muted, #64748b)', marginTop: 3 }}>
                O valor acima é o que vale para o retorno, mesmo que o documento mude depois.
              </div>
            </div>
          )}
          <Campo label="Observações" largura="1 1 100%">
            <textarea rows={2} style={{ ...estiloInput, resize: 'vertical' }} value={f.observacoes ?? ''} onChange={(e) => set('observacoes', e.target.value)} />
          </Campo>
          {erro && <Erro>{erro}</Erro>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setAberto(false)} style={{ padding: '9px 16px', fontSize: 14, borderRadius: 3, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text)', cursor: 'pointer' }}>Cancelar</button>
            <BotaoRosa tipo="submit" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</BotaoRosa>
          </div>
        </form>
      </Modal>

      {/* Sugestões vindas do Projeto do Omie */}
      <Modal titulo="Documentos que podem ser desta ação" aberto={sugestoesAberto} onFechar={() => setSugestoes(false)} largura={860}>
        {carregandoSug ? (
          <Vazio>Procurando…</Vazio>
        ) : !sug ? (
          <Vazio>Nada encontrado.</Vazio>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 13, color: 'var(--portal-text-muted, #64748b)' }}>
              Base da busca: {sug.motivo}.
              {!sug.porProjeto && ' Amarrar a ação a um projeto do Omie deixa isso preciso.'}
            </div>

            {(['requisicoes', 'contas'] as const).map((chave) => {
              const lista = sug[chave] ?? [];
              const tipo = chave === 'requisicoes' ? 'requisicao' : 'finan_pagar';
              const titulo = chave === 'requisicoes' ? 'Requisições' : 'Contas a pagar';
              return (
                <div key={chave}>
                  <Titulo>{titulo} ({lista.length})</Titulo>
                  {lista.length === 0 ? (
                    <Vazio>Nada aqui.</Vazio>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 260, overflowY: 'auto' }}>
                      {lista.map((d: any) => (
                        <div key={d.ref} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--portal-border)', borderRadius: 3 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, color: 'var(--portal-text)' }}>#{d.ref} · {d.titulo}</div>
                            <div style={{ fontSize: 12, color: 'var(--portal-text-muted, #64748b)' }}>
                              {[d.fornecedor, dataBR(d.data), d.extra].filter(Boolean).join(' · ')}
                            </div>
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text)', whiteSpace: 'nowrap' }}>
                            {brl(parseValorMisto(d.valorCru))}
                          </div>
                          <BotaoRosa onClick={() => lancarDoDocumento(tipo, d)} style={{ padding: '6px 11px', fontSize: 12 }}>
                            Lançar
                          </BotaoRosa>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
}
