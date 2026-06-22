'use client';
// Recebimentos de NF-e pendentes (Fase 2). Portado de recebimentos.ejs + public/recebimentos.js.
// Lista NFs de fornecedor pendentes; destaca sinal de garantia/impacto no CMC; permite
// "dar entrada" revisando/editando o CFOP de entrada por item (default = cfopEntradaSugerido).
// SEM dropdown de categoria/departamento (adiado p/ Fase 3).
import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';
import { supabase } from '@/lib/supabase';

interface Usuario { id: string; nome: string; funcao?: string | null }
const TIPO_LABEL: Record<string, string> = { pecas: 'Peças', pecas_garantia: 'Peças (garantia)', almoxarifado: 'Almoxarifado', maquinas: 'Máquinas' };
const TIPO_COR: Record<string, string> = { pecas: '#475569', pecas_garantia: '#b45309', almoxarifado: '#0e7490', maquinas: '#7c3aed' };

// ---------- tipos do payload ----------
interface ItemReceb {
  nSequencia: number | string | null;
  cfop?: string | null;
  cfopEntrada?: string | null;
  cfopEntradaSugerido?: string | null;
  codigoProdutoInt?: string | null;
  descricaoProduto?: string | null;
  idProduto?: number | null;
  criarNovo?: boolean;
  associarExistente?: boolean;
  qtde?: number;
  precoUnit?: number;
  valTotalItem?: number;
  // enriquecidos (so itens com sinal de garantia)
  cfopEhGarantia?: boolean;
  tipoItem?: 'novo' | 'existente';
  cmcAtual?: number | null;
  saldoAtual?: number | null;
  cmcProjetado?: number | null;
  impactoCMC?: number | null;
  impactoPct?: number | null;
  alerta?: boolean;
}
interface Recebimento {
  idReceb?: number | string | null;
  numeroNFe?: string | null;
  serieNFe?: string | null;
  chaveNFe?: string | null;
  etapa?: string | null;
  naturezaOperacao?: string | null;
  fornecedorNome?: string | null;
  dataEmissao?: string | null;
  valorNFe?: number;
  itens?: ItemReceb[];
  sinal?: string | null;
  temSinalGarantia?: boolean;
  temItemNovo?: boolean;
  temItemRisco?: boolean;
  maiorImpactoPct?: number;
  tipo?: string | null;
  responsavelUserId?: string | null;
  responsavelNome?: string | null;
  responsavelAutomatico?: boolean;
}
interface RecebPayload {
  dataDeBR?: string; dataAteBR?: string; fonte?: string; cachedEm?: string; duracaoMs?: number;
  totalRecebimentos?: number; totalNaoProcessados?: number; totalComSinalGarantia?: number;
  totalItensRisco?: number; recebimentos?: Recebimento[]; erro?: string;
}
interface ResultadoCard { tipo: 'ok' | 'erro'; texto: string }

// ---------- helpers ----------
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmtBRL(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return '-';
  return brl.format(Number(n));
}
function fmtNum(n: number | null | undefined, dec = 0): string {
  if (n == null || isNaN(Number(n))) return '-';
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtSaldo(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return '?';
  return fmtNum(n, Number(n) % 1 ? 2 : 0);
}
function fmtPct(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return '-';
  return (Number(n) * 100).toFixed(1).replace('.', ',') + '%';
}
function cfopEntradaEquiv(cfopSaida?: string | null): string {
  if (cfopSaida == null) return '';
  const d = String(cfopSaida).replace(/\D/g, '');
  if (d.length < 4) return '';
  const mapa: Record<string, string> = { '5': '1', '6': '2', '7': '3' };
  return `${mapa[d[0]] || d[0]}.${d.slice(1, 4)}`;
}
function recKey(r: Recebimento): string {
  return String(r.idReceb != null ? r.idReceb : (r.chaveNFe || r.numeroNFe));
}
function isoDefault(offsetMeses: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offsetMeses);
  return d.toISOString().slice(0, 10);
}

const thStyle: React.CSSProperties = { background: '#f8fafc', color: '#475569', fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.4px', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f1f5f9', color: '#334155', fontSize: '.82rem' };

export default function RecebimentosPage() {
  const { userProfile } = useAuth();
  const { temAcesso, loading: permLoading } = usePermissoes(userProfile?.id);
  const { conta, contaParam } = useConta();
  const criadoPor = userProfile?.nome || 'portal';

  const [de, setDe] = useState(isoDefault(-6));
  const [ate, setAte] = useState(isoDefault(0));
  const [dados, setDados] = useState<RecebPayload | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [erro, setErro] = useState('');
  const [resultados, setResultados] = useState<Record<string, ResultadoCard>>({});
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [soMinhas, setSoMinhas] = useState(false);

  // modal "dar entrada"
  const [modalReceb, setModalReceb] = useState<Recebimento | null>(null);

  // carrega usuarios reais do Portal (financeiro_usu) p/ atribuir/transferir
  useEffect(() => {
    supabase
      .from('financeiro_usu')
      .select('id,nome,funcao')
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => setUsuarios((data as Usuario[]) || []));
  }, []);

  const buscar = useCallback(async (force: boolean) => {
    if (!conta) return;
    setCarregando(true);
    setErro('');
    setStatusMsg('buscando recebimentos no Omie... (pode levar 1-2 min)');
    try {
      let qs = contaParam.replace(/^&/, '');
      if (de) qs += (qs ? '&' : '') + 'de=' + encodeURIComponent(de);
      if (ate) qs += '&ate=' + encodeURIComponent(ate);
      if (force) qs += '&force=1';
      const r = await fetch(`/api/ajustes/recebimentos-pendentes?${qs}`);
      const d = (await r.json()) as RecebPayload;
      if (d.erro) { setErro(d.erro); setStatusMsg(''); return; }
      setResultados({});
      setDados(d);
      const fonte = d.fonte === 'cache' ? `cache de ${d.cachedEm ? new Date(d.cachedEm).toLocaleTimeString('pt-BR') : '?'}` : 'consulta ao vivo';
      const dur = d.duracaoMs ? ` · ${(d.duracaoMs / 1000).toFixed(1)}s` : '';
      setStatusMsg(`Janela emissao ${d.dataDeBR || '?'} a ${d.dataAteBR || '?'} · ${fonte}${dur}`);
    } catch (ex) {
      setErro('Erro de rede: ' + (ex as Error).message);
      setStatusMsg('');
    } finally {
      setCarregando(false);
    }
  }, [conta, contaParam, de, ate]);

  useEffect(() => {
    if (conta) buscar(false);
    else { setDados(null); setStatusMsg(''); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conta]);

  const onEntradaConcluida = useCallback((reck: string, res: ResultadoCard) => {
    setResultados((s) => ({ ...s, [reck]: res }));
  }, []);

  // transferencia de responsavel (persiste em recebimento_meta + atualiza UI)
  const onResponsavelChange = useCallback(async (r: Recebimento, userId: string | null) => {
    if (!conta || r.idReceb == null) return;
    const u = userId ? usuarios.find((x) => x.id === userId) || null : null;
    const nome = u ? u.nome : null;
    // otimista
    setDados((d) => {
      if (!d) return d;
      const recs = (d.recebimentos || []).map((x) =>
        x.idReceb === r.idReceb ? { ...x, responsavelUserId: userId, responsavelNome: nome, responsavelAutomatico: false } : x,
      );
      return { ...d, recebimentos: recs };
    });
    try {
      await fetch(`/api/ajustes/recebimentos/${r.idReceb}/responsavel?conta=${encodeURIComponent(conta)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, userNome: nome }),
      });
    } catch { /* silencioso: a UI ja atualizou; recarregar reflete o estado real */ }
  }, [conta, usuarios]);

  if (!permLoading && userProfile && !temAcesso('ajustes:recebimentos')) return <SemPermissao />;

  return (
    <div style={{ maxWidth: 1300, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Recebimentos de NF-e pendentes</h1>
          <p style={{ color: '#64748b', fontSize: '.82rem', maxWidth: 760 }}>
            Conta <b>{conta ? conta.toUpperCase() : '—'}</b> · NFs de fornecedor que ainda nao foram processadas. As com sinal de garantia/conserto aparecem destacadas, com o impacto no CMC. Voce pode <b>dar entrada</b> (= processar no Omie: gera estoque e contas a pagar) por aqui.
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', fontSize: '.65rem', color: '#64748b', marginBottom: 2 }}>Emissao de</label>
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar(false)} style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.82rem' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '.65rem', color: '#64748b', marginBottom: 2 }}>Ate</label>
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar(false)} style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.82rem' }} />
          </div>
          <button onClick={() => buscar(false)} disabled={carregando || !conta} style={{ padding: '7px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: carregando ? 'wait' : 'pointer', opacity: carregando || !conta ? 0.5 : 1 }}>Buscar</button>
          <button onClick={() => buscar(true)} disabled={carregando || !conta} title="Ignora o cache" style={{ padding: '7px 14px', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: carregando ? 'wait' : 'pointer', opacity: carregando || !conta ? 0.5 : 1 }}>Atualizar</button>
          <ContaSelector />
        </div>
      </div>

      <div style={{ margin: '6px 0 14px', display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '.8rem' }}>
        <Link href="/ajustes" style={{ color: '#dc2626', textDecoration: 'none', fontWeight: 600 }}>← Ajustes</Link>
      </div>

      {conta === '' ? (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: 16, fontSize: '.85rem' }}>
          Esta tela precisa de uma conta especifica para listar os recebimentos. Selecione <b>NOVA</b> ou <b>CASTRO</b> no menu acima.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: '.72rem' }}>
            <span style={{ padding: '3px 8px', borderRadius: 6, background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#475569' }}>Detecta natureza ~ garantia/conserto/reparo e CFOPs de garantia</span>
            {userProfile?.id && (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', color: '#475569' }}>
                <input type="checkbox" checked={soMinhas} onChange={(e) => setSoMinhas(e.target.checked)} />
                Só as minhas
              </label>
            )}
            <span style={{ marginLeft: 'auto', color: '#64748b' }}>{carregando ? 'Carregando…' : statusMsg}</span>
          </div>

          {erro && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '.82rem' }}>{erro}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
            <Kpi label="Recebimentos no periodo" valor={fmtNum(dados?.totalRecebimentos)} />
            <Kpi label="Pendentes (nao processados)" valor={fmtNum(dados?.totalNaoProcessados)} />
            <Kpi label="Com sinal de garantia" valor={fmtNum(dados?.totalComSinalGarantia)} cor="#b45309" />
            <Kpi label="Itens que vao baixar o CMC" valor={fmtNum(dados?.totalItensRisco)} cor="#b91c1c" />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {!dados ? (
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 40, textAlign: 'center', color: '#94a3b8' }}>Clique em <b>Buscar</b> para listar os recebimentos pendentes.</div>
            ) : (() => {
              const lista = (dados.recebimentos || []).filter(
                (r) => !soMinhas || (userProfile?.id && r.responsavelUserId === userProfile.id),
              );
              if (lista.length === 0) {
                return <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 40, textAlign: 'center', color: '#059669' }}>{soMinhas ? 'Nenhuma NF-e atribuída a você nesse período.' : 'Nenhuma NF-e pendente nesse periodo. 🎉'}</div>;
              }
              return lista.map((r) => (
                <CardReceb
                  key={recKey(r)}
                  r={r}
                  resultado={resultados[recKey(r)]}
                  usuarios={usuarios}
                  onAbrir={() => setModalReceb(r)}
                  onResponsavelChange={(uid) => onResponsavelChange(r, uid)}
                />
              ));
            })()}
          </div>
        </>
      )}

      {modalReceb && conta && (
        <ModalEntrada
          r={modalReceb}
          conta={conta}
          criadoPor={criadoPor}
          userId={userProfile?.id || null}
          userNome={userProfile?.nome || null}
          onClose={() => setModalReceb(null)}
          onConcluido={onEntradaConcluida}
        />
      )}
    </div>
  );
}

function Kpi({ label, valor, cor }: { label: string; valor: string; cor?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
      <div style={{ fontSize: '.65rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.4px' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: 4, color: cor || '#1e293b' }}>{valor}</div>
    </div>
  );
}

function CardReceb({ r, resultado, usuarios, onAbrir, onResponsavelChange }: {
  r: Recebimento; resultado?: ResultadoCard; usuarios: Usuario[];
  onAbrir: () => void; onResponsavelChange: (userId: string | null) => void;
}) {
  const temSinal = !!r.temSinalGarantia;
  const borda = r.temItemRisco ? '#fca5a5' : (r.temItemNovo && temSinal ? '#fcd34d' : (temSinal ? '#fde68a' : '#e2e8f0'));
  const headerBg = r.temItemRisco ? '#fef2f2' : (temSinal ? '#fffbeb' : '#f8fafc');
  const concluido = resultado?.tipo === 'ok';
  return (
    <div style={{ background: '#fff', border: `1px solid ${borda}`, borderRadius: 8, overflow: 'hidden', opacity: concluido ? 0.65 : 1 }}>
      <div style={{ padding: '10px 16px', background: headerBg, borderBottom: `1px solid ${borda}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, color: '#1e293b' }}>NF {r.numeroNFe || '?'}{r.serieNFe ? `/${r.serieNFe}` : ''}</span>
        <span style={{ fontSize: '.85rem', color: '#475569' }}>{r.fornecedorNome || ''}</span>
        {r.naturezaOperacao && <span style={{ fontSize: '.7rem', padding: '2px 8px', borderRadius: 6, background: '#e2e8f0', color: '#475569' }}>{r.naturezaOperacao}</span>}
        {r.tipo && <span style={{ fontSize: '.7rem', padding: '2px 8px', borderRadius: 6, background: '#fff', border: `1px solid ${TIPO_COR[r.tipo] || '#cbd5e1'}`, color: TIPO_COR[r.tipo] || '#475569', fontWeight: 600 }}>{TIPO_LABEL[r.tipo] || r.tipo}</span>}
        <span style={{ fontSize: '.72rem', color: '#64748b' }}>emissao {r.dataEmissao || ''}</span>
        <span style={{ fontSize: '.72rem', color: '#64748b' }}>total {fmtBRL(r.valorNFe)}</span>
        {r.etapa && <span style={{ fontSize: '.72rem', color: '#94a3b8' }}>etapa {r.etapa}</span>}
        <span style={{ fontSize: '.72rem', color: '#94a3b8' }}>{r.itens ? r.itens.length : 0} itens</span>
        {temSinal && <span style={{ fontSize: '.7rem', padding: '2px 8px', borderRadius: 6, background: r.sinal === 'natureza' ? '#fef3c7' : '#dbeafe', color: r.sinal === 'natureza' ? '#92400e' : '#1e40af' }}>sinal: {r.sinal === 'natureza' ? 'natureza da operacao' : 'CFOP de garantia'}</span>}
        {r.temItemRisco ? (
          <span style={{ fontSize: '.7rem', padding: '2px 8px', borderRadius: 6, background: '#dc2626', color: '#fff' }}>vai baixar o CMC{r.maiorImpactoPct ? ` (~${fmtPct(r.maiorImpactoPct)})` : ''}</span>
        ) : r.temItemNovo && temSinal ? (
          <span style={{ fontSize: '.7rem', padding: '2px 8px', borderRadius: 6, background: '#fde68a', color: '#92400e' }}>vai criar produto novo</span>
        ) : null}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} title={r.responsavelAutomatico ? 'Responsável padrão (pelo tipo). Troque para transferir.' : 'Responsável (transferível)'}>
            <span style={{ fontSize: '.62rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.4px' }}>resp.</span>
            <select
              value={r.responsavelUserId || ''}
              onChange={(e) => onResponsavelChange(e.target.value || null)}
              style={{ fontSize: '.72rem', border: '1px solid #cbd5e1', borderRadius: 6, padding: '3px 6px', background: '#fff', color: '#334155', maxWidth: 170 }}
            >
              <option value="">(ninguém)</option>
              {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
            {r.responsavelAutomatico && r.responsavelUserId && <span style={{ fontSize: '.6rem', color: '#94a3b8' }}>auto</span>}
          </span>
          {resultado ? (
            <span style={{ fontSize: '.72rem', color: resultado.tipo === 'ok' ? '#047857' : '#dc2626' }}>{resultado.texto}</span>
          ) : (
            <button onClick={onAbrir} style={{ padding: '5px 12px', fontSize: '.75rem', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Dar entrada...</button>
          )}
        </span>
      </div>

      {temSinal ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Produto</th>
                <th style={thStyle}>CFOP forn.</th>
                <th style={thStyle}>CFOP entrada (Omie)</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Qtd</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Custo unit.</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Saldo atual</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>CMC atual</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>CMC projetado</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Impacto</th>
              </tr>
            </thead>
            <tbody>
              {(r.itens || []).map((it, idx) => {
                const novo = it.tipoItem === 'novo';
                const rowBg = it.alerta ? '#fef2f2' : (novo ? '#fffbeb' : undefined);
                const sug = it.cfopEntradaSugerido || cfopEntradaEquiv(it.cfop);
                const divergente = it.cfopEntrada && sug && String(it.cfopEntrada).replace(/\D/g, '') !== String(sug).replace(/\D/g, '');
                return (
                  <tr key={idx} style={{ background: rowBg, borderBottom: '1px solid #f1f5f9' }}>
                    <td style={tdStyle}>
                      {it.descricaoProduto || it.codigoProdutoInt || ''}
                      {it.codigoProdutoInt && <span style={{ fontFamily: 'monospace', fontSize: '.7rem', color: '#94a3b8' }}> {it.codigoProdutoInt}</span>}
                      {novo ? <span style={{ marginLeft: 4, fontSize: '.62rem', padding: '1px 5px', borderRadius: 4, background: '#fef3c7', color: '#92400e' }}>produto novo</span> : (it.idProduto ? <span style={{ fontFamily: 'monospace', fontSize: '.62rem', color: '#94a3b8' }}> #{it.idProduto}</span> : null)}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '.72rem', color: it.cfopEhGarantia ? '#b45309' : undefined, fontWeight: it.cfopEhGarantia ? 600 : undefined }}>{it.cfop || ''}</td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '.72rem' }}>
                      {it.cfopEntrada || <span style={{ color: '#cbd5e1' }}>(definido ao processar)</span>}
                      {divergente && <span style={{ color: '#dc2626', fontSize: '.62rem', marginLeft: 4 }} title={`O Omie puxaria ${it.cfopEntrada}, mas o equivalente da NF e' ${sug}`}>≠ {sug}</span>}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtSaldo(it.qtde)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtBRL(it.precoUnit)}</td>
                    {novo ? (
                      <td style={{ ...tdStyle, textAlign: 'right', color: '#94a3b8' }} colSpan={4}>produto sera criado com CMC {fmtBRL(it.precoUnit)}</td>
                    ) : (
                      <>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{it.saldoAtual != null ? fmtSaldo(it.saldoAtual) : '?'}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{it.cmcAtual != null ? fmtBRL(it.cmcAtual) : '?'}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: it.alerta ? '#b91c1c' : undefined, fontWeight: it.alerta ? 600 : undefined }}>{it.cmcProjetado != null ? fmtBRL(it.cmcProjetado) : '?'}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontSize: '.72rem', color: it.alerta ? '#b91c1c' : '#64748b', fontWeight: it.alerta ? 600 : undefined }}>
                          {it.impactoCMC != null ? `${it.impactoCMC >= 0 ? '+' : ''}${fmtBRL(it.impactoCMC)}${it.impactoPct != null ? ` (${it.impactoPct >= 0 ? '+' : ''}${fmtPct(it.impactoPct)})` : ''}` : ''}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ padding: '8px 16px', fontSize: '.72rem', color: '#64748b' }}>
          {(r.itens || []).slice(0, 6).map((it) => `${it.descricaoProduto || it.codigoProdutoInt || '?'} (${fmtSaldo(it.qtde)} @ ${fmtBRL(it.precoUnit)})`).join(' · ') || '(sem itens)'}
          {(r.itens || []).length > 6 ? ` · +${(r.itens || []).length - 6} itens` : ''}
        </div>
      )}
    </div>
  );
}

// itens que vao baixar o CMC (precisam de correcao apos a entrada)
function itensEmRisco(r: Recebimento): ItemReceb[] {
  return (r.itens || []).filter((it) => it.alerta && it.idProduto && (it.cmcAtual || 0) > 0);
}

// ---------- modal "dar entrada" ----------
function ModalEntrada({ r, conta, criadoPor, userId, userNome, onClose, onConcluido }: {
  r: Recebimento; conta: string; criadoPor: string; userId: string | null; userNome: string | null;
  onClose: () => void; onConcluido: (reck: string, res: ResultadoCard) => void;
}) {
  const [naoFin, setNaoFin] = useState<boolean>(!!r.temSinalGarantia); // garantia: nao gera contas a pagar por padrao
  const [naoMov, setNaoMov] = useState<boolean>(false);
  // CFOP de entrada editavel por item; default = cfopEntradaSugerido (equivalente da NF)
  const [cfops, setCfops] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {};
    (r.itens || []).forEach((it, i) => { init[i] = it.cfopEntradaSugerido || cfopEntradaEquiv(it.cfop) || ''; });
    return init;
  });
  const [enviando, setEnviando] = useState(false);
  const [statusModal, setStatusModal] = useState('');

  // 2a fase: correcao do CMC distorcido por garantia
  const [fase, setFase] = useState<'entrada' | 'correcao'>('entrada');
  const riscos = itensEmRisco(r);
  const [cmcAlvo, setCmcAlvo] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {};
    riscos.forEach((it, i) => { init[i] = String(it.cmcAtual ?? ''); });
    return init;
  });
  const [corrResult, setCorrResult] = useState<Record<number, ResultadoCard>>({});
  const [corrigindo, setCorrigindo] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const usarOmie = () => {
    const novo: Record<number, string> = {};
    (r.itens || []).forEach((it, i) => { novo[i] = it.cfopEntrada || ''; });
    setCfops(novo);
  };

  const confirmar = async () => {
    const itens = (r.itens || []).map((it, i) => {
      const seq = it.nSequencia;
      const cfop = (cfops[i] || '').trim();
      return {
        nSequencia: (seq == null || seq === '' ? null : (isNaN(Number(seq)) ? seq : Number(seq))),
        cAcao: it.criarNovo ? 'NOVO' : 'EDITAR',
        cfopEntrada: cfop || undefined,
      };
    });
    if (!confirm(`Confirmar entrada da NF ${r.numeroNFe || '?'}?\n\nIsso PROCESSA a NF no Omie${naoFin ? ', SEM gerar contas a pagar' : ''}${naoMov ? ', SEM movimentar estoque' : ''}. Continuar?`)) return;
    setEnviando(true);
    setStatusModal('processando no Omie...');
    try {
      const resp = await fetch('/api/ajustes/dar-entrada-recebimento', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conta, idReceb: r.idReceb, chaveNFe: r.chaveNFe,
          itens, naoGerarFinanceiro: naoFin, naoGerarMovEstoque: naoMov,
          criadoPor, userId, userNome, tipo: r.tipo, numeroNFe: r.numeroNFe,
        }),
      });
      const d = await resp.json();
      if (d.ok) {
        onConcluido(recKey(r), { tipo: 'ok', texto: `✔ entrada processada${d.ajustado ? ' (com ajustes)' : ''}${d.descStatus ? ' · ' + d.descStatus : ''}` });
        if (riscos.length > 0) {
          // mantem o modal aberto p/ corrigir o CMC que acabou de baixar
          setEnviando(false);
          setStatusModal('entrada processada. Reveja a correção do custo abaixo.');
          setFase('correcao');
        } else {
          onClose();
        }
      } else {
        setEnviando(false);
        setStatusModal('');
        onConcluido(recKey(r), { tipo: 'erro', texto: d.erro || 'falhou' });
        alert('Erro ao dar entrada: ' + (d.erro || 'falhou'));
      }
    } catch (ex) {
      setEnviando(false);
      setStatusModal('erro de rede: ' + (ex as Error).message);
    }
  };

  const corrigirCustos = async () => {
    setCorrigindo(true);
    for (let i = 0; i < riscos.length; i++) {
      if (corrResult[i]?.tipo === 'ok') continue; // ja corrigido
      const it = riscos[i];
      const novoCMC = Number(cmcAlvo[i]);
      if (!(novoCMC > 0)) { setCorrResult((s) => ({ ...s, [i]: { tipo: 'erro', texto: 'CMC inválido' } })); continue; }
      setStatusModal(`corrigindo ${i + 1}/${riscos.length}: ${it.descricaoProduto || it.codigoProdutoInt || it.idProduto}...`);
      try {
        const resp = await fetch(`/api/ajustes/recebimentos/${r.idReceb}/corrigir-custo?conta=${encodeURIComponent(conta)}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            codigoProduto: it.idProduto, novoCMC, cmcSugerido: novoCMC,
            cfopOrigem: it.cfop, nfOrigemNumero: r.numeroNFe, custoGarantiaUnit: it.precoUnit,
            origemCorrecao: 'garantia', criadoPor, userId, userNome, tipo: r.tipo, numeroNFe: r.numeroNFe,
            obs: `Entrada via integracao Portal por ${userNome || criadoPor}. CMC restaurado apos NF de garantia ${r.numeroNFe || ''}.`,
          }),
        });
        const d = await resp.json();
        if (d.ok) setCorrResult((s) => ({ ...s, [i]: { tipo: 'ok', texto: `✔ ${fmtBRL(d.cmcAnterior)} → ${fmtBRL(d.cmcAplicado)}${d.duplicado ? ' (já feito)' : ''}` } }));
        else setCorrResult((s) => ({ ...s, [i]: { tipo: 'erro', texto: d.erro || 'falhou' } }));
      } catch (ex) {
        setCorrResult((s) => ({ ...s, [i]: { tipo: 'erro', texto: (ex as Error).message } }));
      }
      if (i < riscos.length - 1) await new Promise((res) => setTimeout(res, 1000)); // throttle Omie
    }
    setCorrigindo(false);
    setStatusModal('correções concluídas.');
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 10, width: '100%', maxWidth: 920, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,.25)' }}>
        <div style={{ borderBottom: '1px solid #e2e8f0', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontWeight: 600, color: '#1e293b', fontSize: '.95rem', margin: 0 }}>Dar entrada na NF {r.numeroNFe || '?'}{r.serieNFe ? `/${r.serieNFe}` : ''} - {r.fornecedorNome || ''}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', lineHeight: 1, color: '#64748b', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: 18, overflowY: 'auto', fontSize: '.82rem' }}>
          {fase === 'entrada' && (<>
          <div style={{ fontSize: '.74rem', color: '#475569', marginBottom: 12 }}>
            Natureza: <b>{r.naturezaOperacao || '-'}</b> · etapa {r.etapa || '?'} · total {fmtBRL(r.valorNFe)}. Concluir essa NF processa ela no Omie (igual processar la).
          </div>
          {r.temSinalGarantia && (
            <div style={{ fontSize: '.74rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: 8, marginBottom: 12, color: '#92400e' }}>
              ⚠ <b>Sinal de garantia detectado</b> (CFOP/natureza). Default aplicado: <b>NAO gera contas a pagar</b>. Confira antes de confirmar.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            <label style={{ fontSize: '.82rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={naoFin} onChange={(e) => setNaoFin(e.target.checked)} />
              <b>Nao gerar contas a pagar</b> <span style={{ color: '#64748b' }}>(marque se a NF nao gera financeiro, ex.: garantia)</span>
            </label>
            <label style={{ fontSize: '.82rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={naoMov} onChange={(e) => setNaoMov(e.target.checked)} />
              <b>Nao movimentar estoque</b> <span style={{ color: '#64748b' }}>(marque se essa NF nao deve mexer no estoque)</span>
            </label>
          </div>

          <h3 style={{ fontWeight: 600, color: '#334155', marginBottom: 4, fontSize: '.82rem' }}>CFOP de entrada por item</h3>
          <div style={{ fontSize: '.72rem', color: '#64748b', marginBottom: 8 }}>
            Pre-preenchido com o equivalente do CFOP da NF (1o digito 5→1, 6→2). Edite se precisar. O Omie, por conta dele, &quot;puxa&quot; o CFOP da ultima entrada do produto - por isso a gente sobrescreve.
            <button type="button" onClick={usarOmie} style={{ marginLeft: 6, color: '#2563eb', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', fontSize: '.72rem' }}>usar o que o Omie puxaria</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #e2e8f0', borderRadius: 6 }}>
              <thead>
                <tr>
                  <th style={mTh}>Produto</th>
                  <th style={mTh}>CFOP forn.</th>
                  <th style={mTh}>CFOP entrada (Omie puxaria)</th>
                  <th style={mTh}>CFOP de entrada (a usar)</th>
                  <th style={{ ...mTh, textAlign: 'right' }}>Qtd</th>
                  <th style={{ ...mTh, textAlign: 'right' }}>Custo unit.</th>
                </tr>
              </thead>
              <tbody>
                {(r.itens || []).map((it, i) => (
                  <tr key={i}>
                    <td style={mTd}>
                      {it.descricaoProduto || it.codigoProdutoInt || '?'}
                      {it.criarNovo ? <span style={{ marginLeft: 4, fontSize: '.6rem', padding: '0 5px', borderRadius: 4, background: '#fef3c7', color: '#92400e' }}>novo</span> : (it.idProduto ? <span style={{ fontFamily: 'monospace', fontSize: '.6rem', color: '#94a3b8' }}> #{it.idProduto}</span> : null)}
                    </td>
                    <td style={{ ...mTd, fontFamily: 'monospace' }}>{it.cfop || ''}</td>
                    <td style={{ ...mTd, fontFamily: 'monospace', color: '#64748b' }}>{it.cfopEntrada || '(ao processar)'}</td>
                    <td style={mTd}>
                      <input type="text" value={cfops[i] ?? ''} onChange={(e) => setCfops((s) => ({ ...s, [i]: e.target.value }))}
                        placeholder={it.cfopEntradaSugerido || cfopEntradaEquiv(it.cfop) || '1.949'}
                        style={{ border: '1px solid #cbd5e1', borderRadius: 4, padding: '2px 6px', width: 90, fontFamily: 'monospace', fontSize: '.72rem' }} />
                    </td>
                    <td style={{ ...mTd, textAlign: 'right' }}>{fmtSaldo(it.qtde)}</td>
                    <td style={{ ...mTd, textAlign: 'right' }}>{fmtBRL(it.precoUnit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: '.7rem', color: '#94a3b8', marginTop: 8 }}>Deixe um CFOP de entrada em branco para o Omie decidir aquele item.</div>
          </>)}

          {fase === 'correcao' && (<>
            <div style={{ fontSize: '.74rem', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 6, padding: 8, marginBottom: 12, color: '#065f46' }}>
              ✔ <b>Entrada processada no Omie.</b> Os itens abaixo baixaram o CMC (entrada de garantia). Reveja o <b>CMC a restaurar</b> (= CMC anterior) e clique em <b>Corrigir custo</b> — isso aplica um ajuste no Omie e fica registrado como feito por você.
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                <thead>
                  <tr>
                    <th style={mTh}>Produto</th>
                    <th style={{ ...mTh, textAlign: 'right' }}>CMC distorcido</th>
                    <th style={{ ...mTh, textAlign: 'right' }}>CMC a restaurar</th>
                    <th style={mTh}>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {riscos.map((it, i) => (
                    <tr key={i}>
                      <td style={mTd}>
                        {it.descricaoProduto || it.codigoProdutoInt || '?'}
                        {it.idProduto ? <span style={{ fontFamily: 'monospace', fontSize: '.6rem', color: '#94a3b8' }}> #{it.idProduto}</span> : null}
                      </td>
                      <td style={{ ...mTd, textAlign: 'right', color: '#b91c1c' }}>{fmtBRL(it.cmcProjetado)}</td>
                      <td style={{ ...mTd, textAlign: 'right' }}>
                        <input type="number" step="0.01" value={cmcAlvo[i] ?? ''} onChange={(e) => setCmcAlvo((s) => ({ ...s, [i]: e.target.value }))}
                          disabled={corrResult[i]?.tipo === 'ok'}
                          style={{ border: '1px solid #cbd5e1', borderRadius: 4, padding: '2px 6px', width: 100, textAlign: 'right', fontSize: '.72rem' }} />
                      </td>
                      <td style={{ ...mTd, fontSize: '.72rem', color: corrResult[i]?.tipo === 'ok' ? '#047857' : (corrResult[i]?.tipo === 'erro' ? '#dc2626' : '#94a3b8') }}>{corrResult[i]?.texto || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: '.7rem', color: '#94a3b8', marginTop: 8 }}>O ajuste é aplicado no local de maior saldo do produto (resolvido automaticamente).</div>
          </>)}
        </div>
        <div style={{ borderTop: '1px solid #e2e8f0', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '.72rem', color: '#64748b', marginRight: 'auto' }}>{statusModal}</span>
          {fase === 'entrada' ? (
            <>
              <button onClick={onClose} style={{ padding: '6px 14px', fontSize: '.82rem', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={confirmar} disabled={enviando} style={{ padding: '6px 14px', fontSize: '.82rem', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, cursor: enviando ? 'wait' : 'pointer', opacity: enviando ? 0.6 : 1 }}>
                {enviando ? 'processando...' : 'Confirmar — dar entrada'}
              </button>
            </>
          ) : (
            <>
              <button onClick={onClose} style={{ padding: '6px 14px', fontSize: '.82rem', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Fechar (sem corrigir)</button>
              <button onClick={corrigirCustos} disabled={corrigindo} style={{ padding: '6px 14px', fontSize: '.82rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: corrigindo ? 'wait' : 'pointer', opacity: corrigindo ? 0.6 : 1 }}>
                {corrigindo ? 'corrigindo...' : `Corrigir custo (${riscos.length})`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const mTh: React.CSSProperties = { textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '.7rem', color: '#475569', fontWeight: 600, whiteSpace: 'nowrap' };
const mTd: React.CSSProperties = { padding: '4px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '.72rem', color: '#334155' };
