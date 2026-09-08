'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// Aba "Apoio de fábrica" — a verba co-op de cada apoiador, com o processo
// documental (NF/ND/OC) e a contrapartida devida.
//
// A tela precisa gritar sozinha duas coisas: relatório pendente com prazo, e
// responsável que saiu da empresa. Sem isso o dinheiro fica parado e ninguém
// percebe — que é exatamente o que aconteceu no IRRIGASHOW.
// =============================================================================
import { useState } from 'react';
import { AlertTriangle, Plus, Trash2, UserX } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { gateBtn, estiloSemPermissao } from '@/lib/permissoes/ui';
import {
  DOCUMENTOS_APOIO, STATUS_APOIO, STATUS_RELATORIO, TIPOS_APOIO, rotulo, cor,
} from '@/lib/marketing/tipos';
import Modal from '../Modal';
import {
  apiEnviar, brl, dataBR, diasAte, Painel, Titulo, Selo, Campo, estiloInput,
  BotaoRosa, Vazio, Erro,
} from '../ui';

const VAZIO = {
  apoiador: 'Mahindra', tipo: 'verba', descricao: '',
  valor_previsto: '', valor_aprovado: '', valor_recebido: '', status: 'pleiteado',
  processo_numero: '', documento_tipo: '', documento_numero: '', documento_emitido_em: '',
  previsao_credito: '', credito_em: '', forma_credito: '',
  contrapartida_texto: '', contrapartida_prazo: '', relatorio_status: 'pendente',
  responsavel_nome: '', observacoes: '',
};

export default function ApoiosAba({
  acaoId, apoios, inativos, onMudou,
}: { acaoId: string; apoios: any[]; inativos: Set<string>; onMudou: () => void }) {
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const podeEditar = pode('marketing', 'apoios:editar');

  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<any>(null);
  const [f, setF] = useState<any>(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));

  const abrirNovo = () => { setEditando(null); setF(VAZIO); setErro(null); setAberto(true); };
  const abrirEdicao = (ap: any) => {
    setEditando(ap);
    setF({ ...VAZIO, ...ap, ...Object.fromEntries(
      ['documento_emitido_em', 'previsao_credito', 'credito_em', 'contrapartida_prazo']
        .map((k) => [k, (ap[k] ?? '').slice(0, 10)]),
    ) });
    setErro(null);
    setAberto(true);
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      if (editando) await apiEnviar('/api/marketing/apoios', 'PATCH', { ...f, id: editando.id });
      else await apiEnviar('/api/marketing/apoios', 'POST', { ...f, acao_id: acaoId });
      setAberto(false);
      onMudou();
    } catch (e2: any) {
      setErro(e2?.message || 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (ap: any) => {
    if (!window.confirm(`Excluir o apoio de ${ap.apoiador}? Isso apaga o registro do processo.`)) return;
    try {
      await apiEnviar(`/api/marketing/apoios?id=${ap.id}`, 'DELETE');
      onMudou();
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível excluir.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <BotaoRosa
          onClick={abrirNovo}
          {...gateBtn(podeEditar)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, ...estiloSemPermissao(podeEditar) }}
        >
          <Plus size={16} /> Novo apoio
        </BotaoRosa>
      </div>

      {erro && <Erro>{erro}</Erro>}

      {apoios.length === 0 ? (
        <Vazio>
          Nenhum apoio de fábrica registrado. É aqui que entra a verba co-op, com valor, prazo e
          o que a fábrica exige em troca.
        </Vazio>
      ) : (
        apoios.map((ap) => {
          const devendo = ap.relatorio_status === 'pendente' || ap.relatorio_status === 'em_elaboracao';
          const dias = diasAte(ap.contrapartida_prazo);
          const vencido = devendo && dias !== null && dias < 0;
          const semDono = !!ap.responsavel_id && inativos.has(ap.responsavel_id);

          return (
            <Painel key={ap.id} style={{ borderLeft: `3px solid ${vencido ? '#dc2626' : cor(STATUS_APOIO, ap.status)}` }}>
              <Titulo
                acao={
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Selo texto={rotulo(STATUS_APOIO, ap.status)} cor={cor(STATUS_APOIO, ap.status)} />
                    <Selo texto={rotulo(STATUS_RELATORIO, ap.relatorio_status)} cor={cor(STATUS_RELATORIO, ap.relatorio_status)} titulo="Situação do relatório de contrapartida" />
                    <button
                      onClick={() => abrirEdicao(ap)}
                      {...gateBtn(podeEditar)}
                      style={{ padding: '5px 10px', fontSize: 12, borderRadius: 3, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text)', cursor: 'pointer', ...estiloSemPermissao(podeEditar) }}
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => excluir(ap)}
                      {...gateBtn(podeEditar)}
                      title="Excluir apoio"
                      style={{ padding: '5px 8px', borderRadius: 3, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: '#dc2626', cursor: 'pointer', display: 'flex', ...estiloSemPermissao(podeEditar) }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                }
              >
                {ap.apoiador} · {rotulo(TIPOS_APOIO, ap.tipo)}
              </Titulo>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, fontSize: 13, color: 'var(--portal-text)' }}>
                <span>Previsto <b>{brl(ap.valor_previsto)}</b></span>
                <span>Aprovado <b>{brl(ap.valor_aprovado)}</b></span>
                <span>Recebido <b style={{ color: '#16a34a' }}>{brl(ap.valor_recebido)}</b></span>
                {ap.processo_numero && <span>Processo <b>{ap.processo_numero}</b></span>}
                {ap.documento_tipo && <span>{ap.documento_tipo} <b>{ap.documento_numero || '—'}</b> ({dataBR(ap.documento_emitido_em)})</span>}
                {ap.credito_em && <span>Crédito em <b>{dataBR(ap.credito_em)}</b>{ap.forma_credito ? ` (${ap.forma_credito})` : ''}</span>}
              </div>

              {ap.contrapartida_texto && (
                <div style={{ marginTop: 10, fontSize: 13, color: 'var(--portal-text)' }}>
                  <b>Contrapartida acordada:</b> {ap.contrapartida_texto}
                </div>
              )}

              {(devendo || semDono) && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--portal-border)', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {devendo && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: vencido ? '#dc2626' : '#b45309' }}>
                      <AlertTriangle size={15} />
                      {ap.contrapartida_prazo
                        ? vencido
                          ? `Relatório de contrapartida venceu em ${dataBR(ap.contrapartida_prazo)} — há ${Math.abs(dias!)} dia(s)`
                          : `Relatório de contrapartida vence em ${dataBR(ap.contrapartida_prazo)} — faltam ${dias} dia(s)`
                        : 'Relatório de contrapartida pendente, e sem prazo registrado'}
                    </div>
                  )}
                  {semDono && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#dc2626' }}>
                      <UserX size={15} /> Responsável deste apoio não está mais ativo no portal — reatribuir
                    </div>
                  )}
                </div>
              )}

              {ap.relatorio_enviado_em && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--portal-text-muted, #64748b)' }}>
                  Relatório enviado em {dataBR(ap.relatorio_enviado_em)}
                  {ap.relatorio_enviado_para?.length ? ` para ${ap.relatorio_enviado_para.join(', ')}` : ''}.
                </div>
              )}
            </Painel>
          );
        })
      )}

      <Modal titulo={editando ? 'Editar apoio de fábrica' : 'Novo apoio de fábrica'} aberto={aberto} onFechar={() => setAberto(false)}>
        <form onSubmit={salvar} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <Campo label="Apoiador *"><input style={estiloInput} value={f.apoiador} onChange={(e) => set('apoiador', e.target.value)} required /></Campo>
            <Campo label="Tipo">
              <select style={estiloInput} value={f.tipo} onChange={(e) => set('tipo', e.target.value)}>
                {TIPOS_APOIO.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </Campo>
            <Campo label="Etapa do processo" ajuda="Onde o dinheiro está parado agora.">
              <select style={estiloInput} value={f.status} onChange={(e) => set('status', e.target.value)}>
                {STATUS_APOIO.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </Campo>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <Campo label="Valor pedido (R$)"><input type="number" step="0.01" style={estiloInput} value={f.valor_previsto ?? ''} onChange={(e) => set('valor_previsto', e.target.value)} /></Campo>
            <Campo label="Valor aprovado (R$)"><input type="number" step="0.01" style={estiloInput} value={f.valor_aprovado ?? ''} onChange={(e) => set('valor_aprovado', e.target.value)} /></Campo>
            <Campo label="Valor recebido (R$)" ajuda="Só o que entrou de fato. É isto que abate o custo."><input type="number" step="0.01" style={estiloInput} value={f.valor_recebido ?? ''} onChange={(e) => set('valor_recebido', e.target.value)} /></Campo>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <Campo label="Nº do processo / co-op"><input style={estiloInput} value={f.processo_numero ?? ''} onChange={(e) => set('processo_numero', e.target.value)} /></Campo>
            <Campo label="Documento" largura="0 1 120px">
              <select style={estiloInput} value={f.documento_tipo ?? ''} onChange={(e) => set('documento_tipo', e.target.value)}>
                <option value="">—</option>
                {DOCUMENTOS_APOIO.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </Campo>
            <Campo label="Nº do documento"><input style={estiloInput} value={f.documento_numero ?? ''} onChange={(e) => set('documento_numero', e.target.value)} /></Campo>
            <Campo label="Emitido em"><input type="date" style={estiloInput} value={f.documento_emitido_em ?? ''} onChange={(e) => set('documento_emitido_em', e.target.value)} /></Campo>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <Campo label="Forma do crédito" ajuda="Depósito, desconto em duplicata…"><input style={estiloInput} value={f.forma_credito ?? ''} onChange={(e) => set('forma_credito', e.target.value)} /></Campo>
            <Campo label="Previsão do crédito"><input type="date" style={estiloInput} value={f.previsao_credito ?? ''} onChange={(e) => set('previsao_credito', e.target.value)} /></Campo>
            <Campo label="Crédito em"><input type="date" style={estiloInput} value={f.credito_em ?? ''} onChange={(e) => set('credito_em', e.target.value)} /></Campo>
          </div>

          <Campo label="Contrapartida acordada" ajuda="O que a fábrica exige em troca — vai no relatório." largura="1 1 100%">
            <textarea rows={2} style={{ ...estiloInput, resize: 'vertical' }} value={f.contrapartida_texto ?? ''} onChange={(e) => set('contrapartida_texto', e.target.value)} />
          </Campo>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <Campo label="Prazo da contrapartida" ajuda="É o que dispara o aviso semanal."><input type="date" style={estiloInput} value={f.contrapartida_prazo ?? ''} onChange={(e) => set('contrapartida_prazo', e.target.value)} /></Campo>
            <Campo label="Situação do relatório">
              <select style={estiloInput} value={f.relatorio_status} onChange={(e) => set('relatorio_status', e.target.value)}>
                {STATUS_RELATORIO.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </Campo>
            <Campo label="Responsável pelo apoio"><input style={estiloInput} value={f.responsavel_nome ?? ''} onChange={(e) => set('responsavel_nome', e.target.value)} /></Campo>
          </div>

          <Campo label="Observações" largura="1 1 100%">
            <textarea rows={2} style={{ ...estiloInput, resize: 'vertical' }} value={f.observacoes ?? ''} onChange={(e) => set('observacoes', e.target.value)} />
          </Campo>

          {erro && <Erro>{erro}</Erro>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setAberto(false)} style={{ padding: '9px 16px', fontSize: 14, borderRadius: 3, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text)', cursor: 'pointer' }}>
              Cancelar
            </button>
            <BotaoRosa tipo="submit" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</BotaoRosa>
          </div>
        </form>
      </Modal>
    </div>
  );
}
