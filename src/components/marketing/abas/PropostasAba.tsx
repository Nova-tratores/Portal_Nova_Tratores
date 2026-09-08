'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// Aba "Propostas" — liga propostas do Comercial a esta ação.
//
// ⚠️ NADA é escrito no módulo Comercial: a ligação mora em mkt_acao_propostas.
// A view v_formulario foi criada com `SELECT f.*`, então uma coluna nova em
// "Formulario" não apareceria na view que a tela /propostas lê.
//
// O `peso` existe porque atribuição comercial honesta não é binária: a proposta
// que nasceu na feira e fechou depois de uma ação de loja não pode contar
// inteira nas duas.
// =============================================================================
import { useState } from 'react';
import { Link2, Search, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { gateBtn, estiloSemPermissao } from '@/lib/permissoes/ui';
import { PROPOSTA_PERDIDA, PROPOSTA_VENDIDA } from '@/lib/marketing/tipos';
import { parseValorMisto } from '@/lib/marketing/custos';
import Modal from '../Modal';
import { apiGet, apiEnviar, brl, dataBR, Painel, Selo, Kpi, estiloInput, BotaoRosa, Vazio, Erro } from '../ui';

function corDoStatus(s: string | null): string {
  if (s === PROPOSTA_VENDIDA) return '#16a34a';
  if (s === PROPOSTA_PERDIDA) return '#dc2626';
  return '#2563eb';
}

export default function PropostasAba({
  acaoId, propostas, onMudou,
}: { acaoId: string; propostas: any[]; onMudou: () => void }) {
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const podeVincular = pode('marketing', 'propostas:vincular');

  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState<any[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const vendidas = propostas.filter((p) => p.status === PROPOSTA_VENDIDA);
  const receita = vendidas.reduce((s, p) => s + parseValorMisto(p.valor_total) * Number(p.peso ?? 1), 0);
  const abertas = propostas.filter((p) => p.status !== PROPOSTA_VENDIDA && p.status !== PROPOSTA_PERDIDA);

  const buscar = async () => {
    if (busca.trim().length < 2) return;
    setBuscando(true);
    try { setAchados((await apiGet<any>(`/api/marketing/propostas?q=${encodeURIComponent(busca.trim())}`)).propostas ?? []); }
    catch (e: any) { setErro(e?.message || 'Não foi possível buscar.'); }
    finally { setBuscando(false); }
  };

  const vincular = async (p: any) => {
    try {
      await apiEnviar('/api/marketing/propostas', 'POST', { acao_id: acaoId, proposta_id: p.id });
      setAchados((a) => a.filter((x) => x.id !== p.id));
      onMudou();
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível vincular.');
    }
  };

  const mudarPeso = async (p: any, peso: number) => {
    try { await apiEnviar('/api/marketing/propostas', 'PATCH', { acao_id: acaoId, proposta_id: p.proposta_id, peso }); onMudou(); }
    catch (e: any) { setErro(e?.message || 'Não foi possível alterar o peso.'); }
  };

  const desvincular = async (p: any) => {
    if (!window.confirm(`Desvincular a proposta #${p.proposta_id} desta ação? A proposta em si não é alterada.`)) return;
    try { await apiEnviar(`/api/marketing/propostas?acao_id=${acaoId}&proposta_id=${p.proposta_id}`, 'DELETE'); onMudou(); }
    catch (e: any) { setErro(e?.message || 'Não foi possível desvincular.'); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Kpi rotulo="Vinculadas" valor={String(propostas.length)} />
        <Kpi rotulo="Em aberto" valor={String(abertas.length)} cor="#2563eb" />
        <Kpi rotulo="Vendidas" valor={String(vendidas.length)} cor="#16a34a" />
        <Kpi rotulo="Receita atribuída" valor={brl(receita)} dica="Já considerando o peso de cada vínculo." cor="#16a34a" />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <BotaoRosa
          onClick={() => { setErro(null); setAberto(true); }}
          {...gateBtn(podeVincular)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, ...estiloSemPermissao(podeVincular) }}
        >
          <Link2 size={16} /> Vincular proposta
        </BotaoRosa>
      </div>

      {erro && <Erro>{erro}</Erro>}

      {propostas.length === 0 ? (
        <Vazio>
          Nenhuma proposta vinculada. Sem isso a ação fica só com custo, e o retorno não aparece.
        </Vazio>
      ) : (
        <Painel style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 700 }}>
            <thead>
              <tr style={{ background: 'var(--portal-bg)' }}>
                {['#', 'Cliente', 'Vendedor', 'Situação', 'Peso', 'Valor atribuído', ''].map((h) => (
                  <th key={h} style={{ textAlign: h.includes('Valor') ? 'right' : 'left', padding: '9px 10px', fontWeight: 700, color: 'var(--portal-text)', borderBottom: '1px solid var(--portal-border)', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {propostas.map((p) => (
                <tr key={p.proposta_id} style={{ borderBottom: '1px solid var(--portal-border)' }}>
                  <td style={{ padding: '8px 10px' }}>
                    <a href={`/propostas?id=${p.proposta_id}`} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'none' }}>
                      {p.proposta_id}
                    </a>
                  </td>
                  <td style={{ padding: '8px 10px', color: 'var(--portal-text)' }}>{p.cliente || '—'}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--portal-text)' }}>{p.vendedor_nome || '—'}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <Selo texto={p.status || 'sem situação'} cor={corDoStatus(p.status)} />
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <select
                      value={String(p.peso ?? 1)}
                      onChange={(e) => mudarPeso(p, Number(e.target.value))}
                      {...gateBtn(podeVincular)}
                      title="Quanto desta venda pertence a esta ação"
                      style={{ ...estiloInput, fontSize: 13, padding: '4px 6px', width: 90, ...estiloSemPermissao(podeVincular) }}
                    >
                      <option value="1">100%</option>
                      <option value="0.75">75%</option>
                      <option value="0.5">50%</option>
                      <option value="0.25">25%</option>
                    </select>
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--portal-text)', whiteSpace: 'nowrap' }}>
                    {brl(parseValorMisto(p.valor_total) * Number(p.peso ?? 1))}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                    <button
                      onClick={() => desvincular(p)}
                      {...gateBtn(podeVincular)}
                      title="Desvincular"
                      style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', display: 'flex', ...estiloSemPermissao(podeVincular) }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Painel>
      )}

      <Modal titulo="Vincular proposta a esta ação" aberto={aberto} onFechar={() => setAberto(false)} largura={800}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--portal-text-muted, #64748b)' }}>
            A proposta não é alterada: o portal só guarda o vínculo com esta ação.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={15} style={{ position: 'absolute', left: 9, top: 12, opacity: 0.5 }} />
              <input
                style={{ ...estiloInput, paddingLeft: 30 }}
                placeholder="Cliente, modelo, cidade ou número da proposta"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscar(); } }}
              />
            </div>
            <BotaoRosa onClick={buscar} disabled={buscando}>{buscando ? 'Buscando…' : 'Buscar'}</BotaoRosa>
          </div>

          {achados.length === 0 ? (
            <Vazio>Digite e busque para ver as propostas.</Vazio>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 380, overflowY: 'auto' }}>
              {achados.map((p) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--portal-border)', borderRadius: 3 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--portal-text)' }}>#{p.id} · {p.Cliente || 'sem cliente'}</div>
                    <div style={{ fontSize: 12, color: 'var(--portal-text-muted, #64748b)' }}>
                      {[p.Modelo, p.Cidade, p.status, dataBR(p.criado_em)].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text)', whiteSpace: 'nowrap' }}>
                    {brl(parseValorMisto(p.Valor_Total))}
                  </div>
                  <BotaoRosa onClick={() => vincular(p)} style={{ padding: '6px 11px', fontSize: 12 }}>Vincular</BotaoRosa>
                </div>
              ))}
            </div>
          )}
          {erro && <Erro>{erro}</Erro>}
        </div>
      </Modal>
    </div>
  );
}
