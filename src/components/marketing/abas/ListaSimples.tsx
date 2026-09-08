'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// Lista genérica das entidades filhas de uma ação: equipe, itens expostos,
// ações realizadas, concorrentes e mídia.
//
// Do ponto de vista da tela são a mesma coisa — lista, cria, edita, apaga — e a
// diferença cabe numa especificação de campos. Cinco componentes quase iguais
// só criariam cinco lugares pro gate de permissão divergir.
// =============================================================================
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { gateBtn, estiloSemPermissao } from '@/lib/permissoes/ui';
import {
  DESTINOS_ITEM, PAPEIS_EQUIPE, TIPOS_ITEM, TIPOS_MIDIA, TIPOS_REALIZADA, rotulo,
} from '@/lib/marketing/tipos';
import Modal from '../Modal';
import { apiEnviar, dataBR, Painel, Campo, estiloInput, BotaoRosa, Vazio, Erro, ROSA } from '../ui';

type TipoCampo = 'texto' | 'area' | 'numero' | 'data' | 'select' | 'bool' | 'foto' | 'apoio';

export interface CampoSpec {
  k: string;
  label: string;
  tipo: TipoCampo;
  opcoes?: readonly { readonly id: string; readonly label: string }[];
  ajuda?: string;
  obrigatorio?: boolean;
  /** Aparece na linha da lista (além do título). */
  naLista?: boolean;
}

export interface Spec {
  rota: string;
  titulo: string;
  singular: string;
  vazio: string;
  acao: string;              // permissão granular
  campoTitulo: string;
  campos: CampoSpec[];
  /** Prefixo no bucket `anexos` quando a spec tem campo de foto. */
  pastaFoto?: string;
}

// ── Especificações ───────────────────────────────────────────────────────────
export const SPEC_EQUIPE: Spec = {
  rota: 'equipe', titulo: 'Equipe presente', singular: 'pessoa', acao: 'acoes:editar',
  vazio: 'Ninguém registrado. Quem foi à feira é o que a fábrica pergunta primeiro.',
  campoTitulo: 'nome',
  campos: [
    { k: 'nome', label: 'Nome', tipo: 'texto', obrigatorio: true },
    { k: 'papel', label: 'Papel', tipo: 'select', opcoes: PAPEIS_EQUIPE, naLista: true },
    { k: 'dias', label: 'Dias no evento', tipo: 'numero', naLista: true },
    { k: 'telefone', label: 'Telefone', tipo: 'texto' },
    { k: 'custo_estimado', label: 'Custo estimado (R$)', tipo: 'numero', ajuda: 'Informativo. NÃO entra no custo da ação, pra não dobrar com a folha.' },
    { k: 'observacoes', label: 'Observações', tipo: 'area' },
  ],
};

export const SPEC_ITENS: Spec = {
  rota: 'itens', titulo: 'Itens expostos', singular: 'item', acao: 'acoes:editar',
  vazio: 'Nenhuma máquina ou implemento registrado.',
  campoTitulo: 'modelo',
  pastaFoto: 'marketing/itens',
  campos: [
    { k: 'modelo', label: 'Modelo', tipo: 'texto', obrigatorio: true },
    { k: 'tipo', label: 'Tipo', tipo: 'select', opcoes: TIPOS_ITEM, naLista: true },
    { k: 'destino', label: 'Finalidade', tipo: 'select', opcoes: DESTINOS_ITEM, naLista: true },
    { k: 'quantidade', label: 'Quantidade', tipo: 'numero', naLista: true },
    { k: 'chassi', label: 'Chassi', tipo: 'texto' },
    { k: 'valor_unitario', label: 'Valor unitário (R$)', tipo: 'numero' },
    { k: 'vendido', label: 'Foi vendido no evento', tipo: 'bool', naLista: true },
    { k: 'foto_url', label: 'Foto', tipo: 'foto' },
    { k: 'observacoes', label: 'Observações', tipo: 'area' },
  ],
};

export const SPEC_REALIZADAS: Spec = {
  rota: 'realizadas', titulo: 'Ações realizadas e contrapartidas', singular: 'atividade', acao: 'acoes:editar',
  vazio: 'Nada registrado. Marcar a atividade como contrapartida de um apoio a faz entrar no relatório da fábrica.',
  campoTitulo: 'titulo',
  pastaFoto: 'marketing/evidencias',
  campos: [
    { k: 'titulo', label: 'O que foi (ou será) feito', tipo: 'texto', obrigatorio: true },
    { k: 'tipo', label: 'Tipo', tipo: 'select', opcoes: TIPOS_REALIZADA, naLista: true },
    { k: 'apoio_id', label: 'É contrapartida de qual apoio?', tipo: 'apoio', ajuda: 'Preenchido, entra na seção 3 do relatório enviado à fábrica.' },
    { k: 'planejado', label: 'Estava planejado', tipo: 'bool' },
    { k: 'realizado', label: 'Foi realizado', tipo: 'bool', naLista: true },
    { k: 'data', label: 'Data', tipo: 'data', naLista: true },
    { k: 'responsavel_nome', label: 'Responsável', tipo: 'texto' },
    { k: 'evidencia_url', label: 'Evidência (foto/print)', tipo: 'foto' },
    { k: 'descricao', label: 'Descrição', tipo: 'area' },
  ],
};

export const SPEC_CONCORRENTES: Spec = {
  rota: 'concorrentes', titulo: 'Concorrentes observados', singular: 'concorrente', acao: 'acoes:editar',
  vazio: 'Nada registrado. É a informação de feira que mais se perde na conversa do estande.',
  campoTitulo: 'marca',
  pastaFoto: 'marketing/concorrentes',
  campos: [
    { k: 'marca', label: 'Marca', tipo: 'texto', obrigatorio: true },
    { k: 'ameaca', label: 'Ameaça', tipo: 'select', opcoes: [{ id: 'baixa', label: 'Baixa' }, { id: 'media', label: 'Média' }, { id: 'alta', label: 'Alta' }], naLista: true },
    { k: 'representante', label: 'Representante / revenda', tipo: 'texto' },
    { k: 'o_que_expos', label: 'O que expôs', tipo: 'area' },
    { k: 'preco_praticado', label: 'Preço praticado', tipo: 'texto', ajuda: 'Texto livre — anote como ouviu ("a partir de 380 mil em 60x").' },
    { k: 'condicao', label: 'Condição de pagamento', tipo: 'texto' },
    { k: 'destaque', label: 'O que chamou atenção', tipo: 'area' },
    { k: 'foto_url', label: 'Foto do estande', tipo: 'foto' },
  ],
};

export const SPEC_MIDIAS: Spec = {
  rota: 'midias', titulo: 'Mídia e evidências', singular: 'registro', acao: 'midias:enviar',
  vazio: 'Nenhuma foto ou publicação. Sem evidência, o relatório à fábrica vai vazio no registro fotográfico.',
  campoTitulo: 'legenda',
  pastaFoto: 'marketing/midias',
  campos: [
    { k: 'url', label: 'Arquivo ou link', tipo: 'foto', obrigatorio: true },
    { k: 'tipo', label: 'Tipo', tipo: 'select', opcoes: TIPOS_MIDIA, naLista: true },
    { k: 'legenda', label: 'Legenda', tipo: 'texto' },
    { k: 'contrapartida', label: 'Usar no relatório à fábrica', tipo: 'bool', naLista: true, ajuda: 'Só o que estiver marcado aqui entra no registro fotográfico do PDF.' },
    { k: 'apoio_id', label: 'De qual apoio', tipo: 'apoio' },
    { k: 'veiculo', label: 'Veículo', tipo: 'texto', ajuda: 'Instagram, rádio, jornal…' },
    { k: 'alcance', label: 'Alcance', tipo: 'numero' },
    { k: 'data', label: 'Data', tipo: 'data' },
    { k: 'ordem', label: 'Ordem', tipo: 'numero', ajuda: 'Menor primeiro no relatório.' },
  ],
};

// ── Componente ───────────────────────────────────────────────────────────────
export default function ListaSimples({
  spec, acaoId, itens, apoios, onMudou,
}: { spec: Spec; acaoId: string; itens: any[]; apoios?: any[]; onMudou: () => void }) {
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const podeEditar = pode('marketing', spec.acao);

  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<any>(null);
  const [f, setF] = useState<any>({});
  const [salvando, setSalvando] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));

  const abrirNovo = () => {
    const base: any = {};
    for (const c of spec.campos) {
      base[c.k] = c.tipo === 'bool' ? (c.k === 'planejado') : c.tipo === 'select' ? (c.opcoes?.[0]?.id ?? '') : '';
    }
    setEditando(null); setF(base); setErro(null); setAberto(true);
  };

  const abrirEdicao = (it: any) => {
    const base: any = {};
    for (const c of spec.campos) {
      base[c.k] = c.tipo === 'data' ? String(it[c.k] ?? '').slice(0, 10) : (it[c.k] ?? (c.tipo === 'bool' ? false : ''));
    }
    setEditando(it); setF(base); setErro(null); setAberto(true);
  };

  // Upload direto pro bucket público `anexos`, como no /pendencias.
  const enviarFoto = async (campo: string, arquivo: File) => {
    setEnviandoFoto(true);
    setErro(null);
    try {
      const nome = `${spec.pastaFoto || 'marketing/anexos'}/${Date.now()}-${arquivo.name.replace(/[^a-zA-Z0-9.-]/g, '_') || 'foto.jpg'}`;
      const { error } = await supabase.storage.from('anexos').upload(nome, arquivo);
      if (error) throw error;
      set(campo, supabase.storage.from('anexos').getPublicUrl(nome).data.publicUrl);
    } catch (e: any) {
      setErro('A foto não pôde ser enviada: ' + (e?.message || 'erro no envio'));
    } finally {
      setEnviandoFoto(false);
    }
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const corpo: any = { ...f };
      for (const c of spec.campos) if (c.tipo === 'apoio' && !corpo[c.k]) corpo[c.k] = null;
      if (editando) await apiEnviar(`/api/marketing/${spec.rota}`, 'PATCH', { ...corpo, id: editando.id });
      else await apiEnviar(`/api/marketing/${spec.rota}`, 'POST', { ...corpo, acao_id: acaoId });
      setAberto(false);
      onMudou();
    } catch (e2: any) {
      setErro(e2?.message || 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (it: any) => {
    if (!window.confirm(`Excluir este ${spec.singular}?`)) return;
    try { await apiEnviar(`/api/marketing/${spec.rota}?id=${it.id}`, 'DELETE'); onMudou(); }
    catch (e: any) { setErro(e?.message || 'Não foi possível excluir.'); }
  };

  const resumo = (it: any) =>
    spec.campos
      .filter((c) => c.naLista)
      .map((c) => {
        const v = it[c.k];
        if (v === null || v === undefined || v === '') return null;
        if (c.tipo === 'bool') return v ? c.label : null;
        if (c.tipo === 'data') return dataBR(v);
        if (c.tipo === 'select') return rotulo(c.opcoes ?? [], String(v));
        return `${c.label}: ${v}`;
      })
      .filter(Boolean)
      .join(' · ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <BotaoRosa onClick={abrirNovo} {...gateBtn(podeEditar)} style={{ display: 'flex', alignItems: 'center', gap: 6, ...estiloSemPermissao(podeEditar) }}>
          <Plus size={16} /> Adicionar
        </BotaoRosa>
      </div>

      {erro && <Erro>{erro}</Erro>}

      {itens.length === 0 ? (
        <Vazio>{spec.vazio}</Vazio>
      ) : (
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {itens.map((it) => {
            const foto = it.foto_url || it.evidencia_url || (spec.rota === 'midias' ? it.url : null);
            const ehImagem = typeof foto === 'string' && /^https?:/.test(foto) && !/\.(pdf|mp4|mov)(\?|$)/i.test(foto);
            return (
              <Painel key={it.id} style={{ borderLeft: `3px solid ${ROSA}` }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <button
                    onClick={() => abrirEdicao(it)}
                    style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: 'var(--portal-text)' }}
                  >
                    {it[spec.campoTitulo] || `(sem ${spec.campoTitulo})`}
                  </button>
                  <button
                    onClick={() => excluir(it)}
                    {...gateBtn(podeEditar)}
                    title="Excluir"
                    style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', display: 'flex', ...estiloSemPermissao(podeEditar) }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {resumo(it) && (
                  <div style={{ marginTop: 5, fontSize: 12, color: 'var(--portal-text-muted, #64748b)' }}>{resumo(it)}</div>
                )}
                {ehImagem && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={foto} alt="" style={{ marginTop: 8, width: '100%', maxHeight: 150, objectFit: 'cover', borderRadius: 3 }} />
                )}
              </Painel>
            );
          })}
        </div>
      )}

      <Modal titulo={`${editando ? 'Editar' : 'Novo'} — ${spec.titulo}`} aberto={aberto} onFechar={() => setAberto(false)} largura={640}>
        <form onSubmit={salvar} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {spec.campos.map((c) => {
            if (c.tipo === 'bool') {
              return (
                <label key={c.k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--portal-text)' }}>
                  <input type="checkbox" checked={!!f[c.k]} onChange={(e) => set(c.k, e.target.checked)} />
                  <span>{c.label}{c.ajuda ? <span style={{ color: 'var(--portal-text-muted, #64748b)' }}> — {c.ajuda}</span> : null}</span>
                </label>
              );
            }
            if (c.tipo === 'apoio') {
              return (
                <Campo key={c.k} label={c.label} ajuda={c.ajuda} largura="1 1 100%">
                  <select style={estiloInput} value={f[c.k] ?? ''} onChange={(e) => set(c.k, e.target.value)}>
                    <option value="">— não é contrapartida —</option>
                    {(apoios ?? []).map((a) => <option key={a.id} value={a.id}>{a.apoiador}</option>)}
                  </select>
                </Campo>
              );
            }
            if (c.tipo === 'foto') {
              return (
                <Campo key={c.k} label={c.label} ajuda={c.ajuda} largura="1 1 100%">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <input
                      style={estiloInput}
                      value={f[c.k] ?? ''}
                      onChange={(e) => set(c.k, e.target.value)}
                      placeholder="Cole um link ou envie um arquivo"
                    />
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => { const a = e.target.files?.[0]; if (a) enviarFoto(c.k, a); }}
                      style={{ fontSize: 13, color: 'var(--portal-text)' }}
                    />
                    {enviandoFoto && <span style={{ fontSize: 12, color: 'var(--portal-text-muted, #64748b)' }}>Enviando…</span>}
                  </div>
                </Campo>
              );
            }
            return (
              <Campo key={c.k} label={c.label + (c.obrigatorio ? ' *' : '')} ajuda={c.ajuda} largura="1 1 100%">
                {c.tipo === 'area' ? (
                  <textarea rows={2} style={{ ...estiloInput, resize: 'vertical' }} value={f[c.k] ?? ''} onChange={(e) => set(c.k, e.target.value)} />
                ) : c.tipo === 'select' ? (
                  <select style={estiloInput} value={f[c.k] ?? ''} onChange={(e) => set(c.k, e.target.value)}>
                    {c.opcoes?.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                ) : (
                  <input
                    type={c.tipo === 'numero' ? 'number' : c.tipo === 'data' ? 'date' : 'text'}
                    step={c.tipo === 'numero' ? '0.01' : undefined}
                    style={estiloInput}
                    value={f[c.k] ?? ''}
                    onChange={(e) => set(c.k, e.target.value)}
                    required={c.obrigatorio}
                  />
                )}
              </Campo>
            );
          })}

          {erro && <Erro>{erro}</Erro>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setAberto(false)} style={{ padding: '9px 16px', fontSize: 14, borderRadius: 3, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text)', cursor: 'pointer' }}>Cancelar</button>
            <BotaoRosa tipo="submit" disabled={salvando || enviandoFoto}>{salvando ? 'Salvando…' : 'Salvar'}</BotaoRosa>
          </div>
        </form>
      </Modal>
    </div>
  );
}
