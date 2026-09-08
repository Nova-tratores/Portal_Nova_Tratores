'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// /marketing/leads — todos os leads de feira, de todas as ações.
//
// A fila de trabalho do comercial depois do evento: quem ainda está em "novo"
// uma semana depois é lead esfriando.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { QUALIFICACOES_LEAD, TEMPERATURAS, rotulo, cor } from '@/lib/marketing/tipos';
import {
  apiGet, apiEnviar, dataBR, diasAte, Painel, Selo, Kpi, Vazio, AvisoMigracao, Erro, estiloInput,
} from '@/components/marketing/ui';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { gateBtn, estiloSemPermissao } from '@/lib/permissoes/ui';

export default function LeadsGeraisPage() {
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const podeEditar = pode('marketing', 'leads:editar');

  const [leads, setLeads] = useState<any[]>([]);
  const [acoes, setAcoes] = useState<Record<string, any>>({});
  const [carregando, setCarregando] = useState(true);
  const [migracao, setMigracao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [fQual, setFQual] = useState('');
  const [fAcao, setFAcao] = useState('');

  const carregar = useCallback(async () => {
    try {
      const r = await apiGet<any>('/api/marketing/leads');
      setLeads(r.itens ?? []);
      setAcoes(r.acoes ?? {});
    } catch (e: any) {
      if (e?.corpo?.migracaoFaltando) setMigracao(true);
      else setErro(e?.message || 'Não foi possível carregar os leads.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return leads.filter((l) => {
      if (fQual && l.qualificacao !== fQual) return false;
      if (fAcao && l.acao_id !== fAcao) return false;
      if (!t) return true;
      return [l.texto, l.nome, l.telefone, l.cidade, l.interesse, l.cliente_nome]
        .some((v) => v && String(v).toLowerCase().includes(t));
    });
  }, [leads, busca, fQual, fAcao]);

  const contagem = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of lista) m[l.qualificacao] = (m[l.qualificacao] ?? 0) + 1;
    return m;
  }, [lista]);

  const qualificar = async (l: any, qualificacao: string) => {
    try {
      await apiEnviar('/api/marketing/leads', 'PATCH', { id: l.id, qualificacao });
      setLeads((s) => s.map((x) => (x.id === l.id ? { ...x, qualificacao } : x)));
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível atualizar.');
    }
  };

  if (migracao) return <AvisoMigracao />;

  return (
    <div style={{ padding: 16, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <Kpi rotulo="Leads" valor={String(lista.length)} />
        {QUALIFICACOES_LEAD.filter((q) => contagem[q.id]).map((q) => (
          <Kpi key={q.id} rotulo={q.label} valor={String(contagem[q.id])} cor={q.cor} />
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <input style={{ ...estiloInput, flex: '2 1 240px' }} placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select style={{ ...estiloInput, flex: '0 1 180px' }} value={fQual} onChange={(e) => setFQual(e.target.value)}>
          <option value="">Todas as situações</option>
          {QUALIFICACOES_LEAD.map((q) => <option key={q.id} value={q.id}>{q.label}</option>)}
        </select>
        <select style={{ ...estiloInput, flex: '1 1 240px' }} value={fAcao} onChange={(e) => setFAcao(e.target.value)}>
          <option value="">Todas as ações</option>
          {Object.values(acoes).map((a: any) => <option key={a.id} value={a.id}>{a.nome}</option>)}
        </select>
      </div>

      {erro && <Erro>{erro}</Erro>}

      {carregando ? (
        <Vazio>Carregando…</Vazio>
      ) : lista.length === 0 ? (
        <Vazio>Nenhum lead. A captura acontece na tela do celular, em /lead.</Vazio>
      ) : (
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))' }}>
          {lista.map((l) => {
            const idade = diasAte(String(l.capturado_em).slice(0, 10));
            const esfriando = l.qualificacao === 'novo' && idade !== null && idade < -7;
            return (
              <Painel key={l.id} style={{ borderLeft: `3px solid ${esfriando ? '#dc2626' : cor(QUALIFICACOES_LEAD, l.qualificacao)}` }}>
                <Link href={`/marketing/${l.acao_id}`} style={{ fontSize: 12, color: '#2563eb', textDecoration: 'none' }}>
                  {acoes[l.acao_id]?.nome ?? 'ação'}
                </Link>
                <div style={{ marginTop: 5, fontSize: 13, color: 'var(--portal-text)', whiteSpace: 'pre-wrap' }}>{l.texto}</div>
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--portal-text-muted, #64748b)' }}>
                  {[l.nome, l.telefone, l.cidade].filter(Boolean).join(' · ') || 'sem contato registrado'}
                </div>
                {esfriando && (
                  <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: '#dc2626' }}>
                    Sem contato há {Math.abs(idade!)} dias e ainda como &quot;novo&quot;.
                  </div>
                )}
                <div style={{ marginTop: 9, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {l.temperatura && <Selo texto={rotulo(TEMPERATURAS, l.temperatura)} cor={cor(TEMPERATURAS, l.temperatura)} />}
                  <select
                    value={l.qualificacao}
                    onChange={(e) => qualificar(l, e.target.value)}
                    {...gateBtn(podeEditar)}
                    style={{ ...estiloInput, fontSize: 13, padding: '5px 8px', width: 'auto', flex: '1 1 140px', ...estiloSemPermissao(podeEditar) }}
                  >
                    {QUALIFICACOES_LEAD.map((q) => <option key={q.id} value={q.id}>{q.label}</option>)}
                  </select>
                </div>
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--portal-text-muted, #94a3b8)' }}>
                  {dataBR(l.capturado_em)} · {l.capturado_por_nome || 'origem não registrada'}
                </div>
              </Painel>
            );
          })}
        </div>
      )}
    </div>
  );
}
