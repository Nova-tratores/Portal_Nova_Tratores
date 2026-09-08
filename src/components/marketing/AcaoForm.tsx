'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// Formulário de ação de marketing — usado pra CRIAR (na lista) e pra EDITAR
// (na ficha). Um só, pra os dois caminhos não divergirem.
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { TIPOS_ACAO, STATUS_ACAO, EMPRESAS } from '@/lib/marketing/tipos';
import type { Acao } from '@/lib/marketing/tipos';
import { Campo, estiloInput, BotaoRosa, ROSA } from './ui';

interface Usuario { id: string; nome: string; email: string | null; ativo: boolean | null }
interface Projeto { codigo: number; nome: string; empresa: string }

export default function AcaoForm({
  inicial, salvando, erro, onSalvar, onCancelar,
}: {
  inicial?: Partial<Acao>;
  salvando: boolean;
  erro?: string | null;
  onSalvar: (dados: Record<string, any>) => void;
  onCancelar: () => void;
}) {
  const [f, setF] = useState<Record<string, any>>({
    nome: '', tipo: 'feira', status: 'planejada', empresa: 'NOVA',
    data_inicio: '', data_fim: '', local_nome: '', cidade: '', uf: '',
    orcamento_previsto: '', meta_leads: '', meta_vendas: '', meta_receita: '',
    publico_estimado: '', objetivo: '', observacoes: '',
    responsavel_id: '', responsavel_nome: '', responsavel_email: '',
    projeto_codigo: '', projeto_nome: '', projeto_empresa: '',
    ...(inicial ?? {}),
  });
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [buscaProjeto, setBuscaProjeto] = useState('');

  const set = (k: string, v: any) => setF((s) => ({ ...s, [k]: v }));

  // financeiro_usu é o diretório de pessoas do portal (nome legível + avatar).
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('financeiro_usu')
        .select('id, nome, email, ativo')
        .order('nome');
      setUsuarios((data as Usuario[]) ?? []);
    })();
  }, []);

  // Projeto do Omie = o centro de custo da ação. É por ele que a requisição, a
  // conta a pagar e o pedido de venda encontram este evento depois.
  useEffect(() => {
    const termo = buscaProjeto.trim();
    let vivo = true;
    const t = setTimeout(async () => {
      if (termo.length < 2) { if (vivo) setProjetos([]); return; }
      // Os caracteres removidos (% , ( ) * \) injetam condições no filtro do
      // PostgREST — mesma precaução do sanitizarFiltro de lib/busca-segura.
      const { data } = await supabase
        .from('portal_nt_projetos_PRINCIPAL')
        .select('codigo, nome, empresa')
        .ilike('nome', `%${termo.replace(/[%,()*\\]/g, '')}%`)
        .limit(15);
      if (vivo) setProjetos((data as Projeto[]) ?? []);
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [buscaProjeto]);

  const submeter = (e: React.FormEvent) => {
    e.preventDefault();
    onSalvar(f);
  };

  const respAtual = usuarios.find((u) => u.id === f.responsavel_id);

  return (
    <form onSubmit={submeter} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <Campo label="Nome da ação *" largura="2 1 320px">
          <input
            style={estiloInput}
            value={f.nome ?? ''}
            onChange={(e) => set('nome', e.target.value)}
            placeholder="IRRIGASHOW 2026"
            required
          />
        </Campo>
        <Campo label="Apelido curto" ajuda="Opcional. Ex.: IRRIGASHOW26">
          <input style={estiloInput} value={f.codigo ?? ''} onChange={(e) => set('codigo', e.target.value)} />
        </Campo>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <Campo label="Tipo *" ajuda="Feira é um tipo — o módulo cobre também mídia, brinde e patrocínio.">
          <select style={estiloInput} value={f.tipo} onChange={(e) => set('tipo', e.target.value)}>
            {TIPOS_ACAO.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </Campo>
        <Campo label="Situação">
          <select style={estiloInput} value={f.status} onChange={(e) => set('status', e.target.value)}>
            {STATUS_ACAO.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Campo>
        <Campo label="Empresa">
          <select style={estiloInput} value={f.empresa} onChange={(e) => set('empresa', e.target.value)}>
            {EMPRESAS.map((e2) => <option key={e2} value={e2}>{e2}</option>)}
          </select>
        </Campo>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <Campo label="Início" ajuda="Ação sem data é válida (ex.: brindes do ano).">
          <input type="date" style={estiloInput} value={(f.data_inicio ?? '').slice(0, 10)} onChange={(e) => set('data_inicio', e.target.value)} />
        </Campo>
        <Campo label="Fim">
          <input type="date" style={estiloInput} value={(f.data_fim ?? '').slice(0, 10)} onChange={(e) => set('data_fim', e.target.value)} />
        </Campo>
        <Campo label="Local">
          <input style={estiloInput} value={f.local_nome ?? ''} onChange={(e) => set('local_nome', e.target.value)} placeholder="Parque de exposições" />
        </Campo>
        <Campo label="Cidade">
          <input style={estiloInput} value={f.cidade ?? ''} onChange={(e) => set('cidade', e.target.value)} />
        </Campo>
        <Campo label="UF" largura="0 0 80px">
          <input style={estiloInput} maxLength={2} value={f.uf ?? ''} onChange={(e) => set('uf', e.target.value.toUpperCase())} />
        </Campo>
      </div>

      {/* Responsável: o id é pra saber se a pessoa ainda está no portal; o NOME
          fica gravado junto, pra ação continuar legível se ela sair da empresa. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <Campo label="Responsável" ajuda="O nome fica gravado mesmo se a pessoa sair da empresa.">
          <select
            style={estiloInput}
            value={f.responsavel_id ?? ''}
            onChange={(e) => {
              const u = usuarios.find((x) => x.id === e.target.value);
              setF((s) => ({
                ...s,
                responsavel_id: u?.id ?? '',
                responsavel_nome: u?.nome ?? '',
                responsavel_email: u?.email ?? '',
              }));
            }}
          >
            <option value="">— escolher —</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}{u.ativo === false ? ' (inativo)' : ''}
              </option>
            ))}
          </select>
        </Campo>
        {respAtual?.ativo === false && (
          <div style={{ alignSelf: 'flex-end', fontSize: 12, color: '#dc2626', fontWeight: 700, paddingBottom: 8 }}>
            Essa pessoa não está mais ativa no portal.
          </div>
        )}
        <Campo label="Público estimado" largura="1 1 160px">
          <input type="number" min={0} style={estiloInput} value={f.publico_estimado ?? ''} onChange={(e) => set('publico_estimado', e.target.value)} />
        </Campo>
      </div>

      {/* Projeto do Omie — a ponte com o financeiro */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <Campo
          label="Projeto do Omie"
          ajuda="É por ele que requisição e conta a pagar encontram esta ação. Digite pra buscar."
          largura="2 1 320px"
        >
          <input
            style={estiloInput}
            value={f.projeto_nome ? String(f.projeto_nome) : buscaProjeto}
            onChange={(e) => {
              setBuscaProjeto(e.target.value);
              setF((s) => ({ ...s, projeto_nome: '', projeto_codigo: '', projeto_empresa: '' }));
            }}
            placeholder="buscar projeto..."
          />
        </Campo>
        {f.projeto_codigo ? (
          <button
            type="button"
            onClick={() => { setF((s) => ({ ...s, projeto_codigo: '', projeto_nome: '', projeto_empresa: '' })); setBuscaProjeto(''); }}
            style={{ padding: '9px 12px', fontSize: 13, borderRadius: 3, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text)', cursor: 'pointer' }}
          >
            Tirar vínculo
          </button>
        ) : null}
      </div>
      {projetos.length > 0 && !f.projeto_codigo && (
        <div style={{ border: '1px solid var(--portal-border)', borderRadius: 3, maxHeight: 180, overflowY: 'auto' }}>
          {projetos.map((p) => (
            <button
              key={`${p.empresa}-${p.codigo}`}
              type="button"
              onClick={() => {
                setF((s) => ({ ...s, projeto_codigo: p.codigo, projeto_nome: p.nome, projeto_empresa: p.empresa }));
                setProjetos([]);
              }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', fontSize: 13, border: 'none', borderBottom: '1px solid var(--portal-border)', background: 'transparent', color: 'var(--portal-text)', cursor: 'pointer' }}
            >
              {p.nome} <span style={{ opacity: 0.6 }}>· {p.empresa} · {p.codigo}</span>
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <Campo label="Orçamento previsto (R$)">
          <input type="number" step="0.01" min={0} style={estiloInput} value={f.orcamento_previsto ?? ''} onChange={(e) => set('orcamento_previsto', e.target.value)} />
        </Campo>
        <Campo label="Meta de leads">
          <input type="number" min={0} style={estiloInput} value={f.meta_leads ?? ''} onChange={(e) => set('meta_leads', e.target.value)} />
        </Campo>
        <Campo label="Meta de vendas (un.)">
          <input type="number" min={0} style={estiloInput} value={f.meta_vendas ?? ''} onChange={(e) => set('meta_vendas', e.target.value)} />
        </Campo>
        <Campo label="Meta de receita (R$)">
          <input type="number" step="0.01" min={0} style={estiloInput} value={f.meta_receita ?? ''} onChange={(e) => set('meta_receita', e.target.value)} />
        </Campo>
      </div>

      <Campo label="Objetivo" largura="1 1 100%">
        <textarea rows={2} style={{ ...estiloInput, resize: 'vertical' }} value={f.objetivo ?? ''} onChange={(e) => set('objetivo', e.target.value)} />
      </Campo>
      <Campo label="Observações" largura="1 1 100%">
        <textarea rows={2} style={{ ...estiloInput, resize: 'vertical' }} value={f.observacoes ?? ''} onChange={(e) => set('observacoes', e.target.value)} />
      </Campo>

      {erro && (
        <div style={{ padding: 10, borderRadius: 3, border: '1px solid #dc2626', background: '#fef2f2', color: '#111111', fontSize: 13 }}>
          {erro}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: `2px solid ${ROSA}`, paddingTop: 12 }}>
        <button
          type="button"
          onClick={onCancelar}
          style={{ padding: '9px 16px', fontSize: 14, borderRadius: 3, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text)', cursor: 'pointer' }}
        >
          Cancelar
        </button>
        <BotaoRosa tipo="submit" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </BotaoRosa>
      </div>
    </form>
  );
}
