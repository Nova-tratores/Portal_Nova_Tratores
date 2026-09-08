'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// Aba "Leads" — o que foi capturado no estande. A captura em si é a tela mobile
// (/lead); aqui é onde o comercial qualifica e dá desfecho.
import { useMemo, useState } from 'react';
import { ExternalLink, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { gateBtn, estiloSemPermissao } from '@/lib/permissoes/ui';
import { QUALIFICACOES_LEAD, TEMPERATURAS, rotulo, cor } from '@/lib/marketing/tipos';
import { apiEnviar, dataBR, Painel, Selo, Kpi, estiloInput, Vazio, Erro, ROSA } from '../ui';

export default function LeadsAba({
  acaoId, leads, onMudou,
}: { acaoId: string; leads: any[]; onMudou: () => void }) {
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const podeEditar = pode('marketing', 'leads:editar');

  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('');
  const [busca, setBusca] = useState('');

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return leads.filter((l) => {
      if (filtro && l.qualificacao !== filtro) return false;
      if (!t) return true;
      return [l.texto, l.nome, l.telefone, l.cidade, l.interesse, l.cliente_nome]
        .some((v) => v && String(v).toLowerCase().includes(t));
    });
  }, [leads, filtro, busca]);

  const contagem = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of leads) m[l.qualificacao] = (m[l.qualificacao] ?? 0) + 1;
    return m;
  }, [leads]);

  // Telefones repetidos: três vendedores anotam o mesmo visitante numa feira.
  const repetidos = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of leads) if (l.telefone_norm) m[l.telefone_norm] = (m[l.telefone_norm] ?? 0) + 1;
    return new Set(Object.entries(m).filter(([, n]) => n > 1).map(([t]) => t));
  }, [leads]);

  const qualificar = async (l: any, qualificacao: string) => {
    try { await apiEnviar('/api/marketing/leads', 'PATCH', { id: l.id, qualificacao }); onMudou(); }
    catch (e: any) { setErro(e?.message || 'Não foi possível atualizar.'); }
  };

  const excluir = async (l: any) => {
    if (!window.confirm('Excluir este lead?')) return;
    try { await apiEnviar(`/api/marketing/leads?id=${l.id}`, 'DELETE'); onMudou(); }
    catch (e: any) { setErro(e?.message || 'Não foi possível excluir.'); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Kpi rotulo="Total" valor={String(leads.length)} />
        {QUALIFICACOES_LEAD.filter((q) => contagem[q.id]).map((q) => (
          <Kpi key={q.id} rotulo={q.label} valor={String(contagem[q.id])} cor={q.cor} />
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <input
          style={{ ...estiloInput, flex: '2 1 240px' }}
          placeholder="Buscar no texto, nome, telefone, cidade…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <select style={{ ...estiloInput, flex: '0 1 180px' }} value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="">Todas as situações</option>
          {QUALIFICACOES_LEAD.map((q) => <option key={q.id} value={q.id}>{q.label}</option>)}
        </select>
        <a
          href={`/lead?acao=${acaoId}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', fontSize: 13, borderRadius: 3, border: `1px solid ${ROSA}`, color: ROSA, textDecoration: 'none' }}
          title="Abrir a tela de captura já nesta ação — é este link que vira o QR do estande"
        >
          <ExternalLink size={15} /> Tela de captura
        </a>
      </div>

      {erro && <Erro>{erro}</Erro>}

      {lista.length === 0 ? (
        <Vazio>
          {leads.length === 0
            ? 'Nenhum lead capturado. Imprima o QR da tela de captura e deixe no balcão do estande.'
            : 'Nenhum lead com esse filtro.'}
        </Vazio>
      ) : (
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {lista.map((l) => (
            <Painel key={l.id} style={{ borderLeft: `3px solid ${cor(QUALIFICACOES_LEAD, l.qualificacao)}` }}>
              <div style={{ fontSize: 13, color: 'var(--portal-text)', whiteSpace: 'pre-wrap' }}>{l.texto}</div>

              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--portal-text-muted, #64748b)' }}>
                {[l.nome, l.telefone, l.cidade, l.interesse].filter(Boolean).join(' · ') || 'sem dados de contato'}
              </div>
              {l.cliente_nome && (
                <div style={{ marginTop: 3, fontSize: 12, color: '#2563eb' }}>
                  Cliente: {l.cliente_nome} ({l.cliente_empresa})
                </div>
              )}
              {l.telefone_norm && repetidos.has(l.telefone_norm) && (
                <div style={{ marginTop: 5, fontSize: 12, fontWeight: 700, color: '#b45309' }}>
                  Telefone repetido nesta ação — confira se não é o mesmo visitante.
                </div>
              )}

              {l.foto_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={l.foto_url}
                  alt="Registro do lead"
                  style={{ marginTop: 8, width: '100%', maxHeight: 150, objectFit: 'cover', borderRadius: 3 }}
                />
              )}

              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {l.temperatura && <Selo texto={rotulo(TEMPERATURAS, l.temperatura)} cor={cor(TEMPERATURAS, l.temperatura)} />}
                <select
                  value={l.qualificacao}
                  onChange={(e) => qualificar(l, e.target.value)}
                  {...gateBtn(podeEditar)}
                  style={{ ...estiloInput, fontSize: 13, padding: '5px 8px', width: 'auto', flex: '1 1 130px', ...estiloSemPermissao(podeEditar) }}
                >
                  {QUALIFICACOES_LEAD.map((q) => <option key={q.id} value={q.id}>{q.label}</option>)}
                </select>
                <button
                  onClick={() => excluir(l)}
                  {...gateBtn(podeEditar)}
                  title="Excluir"
                  style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', display: 'flex', ...estiloSemPermissao(podeEditar) }}
                >
                  <Trash2 size={15} />
                </button>
              </div>

              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--portal-text-muted, #94a3b8)' }}>
                {dataBR(l.capturado_em)} · {l.capturado_por_nome || 'origem não registrada'}
              </div>
            </Painel>
          ))}
        </div>
      )}
    </div>
  );
}
