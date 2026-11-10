'use client';
// Boletos de fornecedor: os boletos agrupados registrados (status, parcelas,
// duplicatas, estornar/reaplicar) e as regras por fornecedor (quem cobra assim).
// Registrar um boleto é na Correção de contas (vista Lista, selecionar as
// duplicatas); pagar uma parcela é em Baixar contas.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';
import { authHeaders } from '@/lib/auth/client';
import { fmtBR } from '@/lib/ajustes/boletos-fornecedor';
import type { Boleto } from '@/components/ajustes/PainelBoletosBaixa';
import { PaginaFin, CampoFin, Segmentado, BotaoFin, Chip, ChipEmpresa, RodapeGrade, TEAL, type CorChip } from '@/components/ajustes/omie-fin';

interface BoletoFull extends Boleto {
  codigo_barras: string | null; data_emissao: string | null; valor_titulos: number; alinhar_vencimento: boolean; observacao: string | null; criado_por: string | null; created_at: string;
  titulos: Array<{ parcela_id: string; codigo_lancamento: number; numero_documento: string | null; valor_alocado: number; valor_titulo: number; principal: boolean; status: string; erro: string | null; snapshot_anterior: Record<string, string | null> | null; campos_novos: Record<string, string> | null }>;
}
interface Regra { id: string; conta_omie: string; codigo_cliente_fornecedor: number; nome: string; ativo: boolean; dias_tolerancia: number; tolerancia_valor: number; alinhar_vencimento: boolean }

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtBRL = (n: number) => brl.format(Number(n) || 0);
const STATUS_ROTULO: Record<string, [string, CorChip]> = {
  pendente: ['Pendente', 'ambar'], registrado: ['Registrado', 'azul'], parcial: ['Parcialmente pago', 'roxo'],
  pago: ['Pago', 'verde'], cancelado: ['Estornado', 'cinza'], erro_omie: ['Erro na Omie', 'vermelho'],
};

export default function BoletosFornecedorPage() {
  const { userProfile } = useAuth();
  const { pode, loading: permLoading } = usePermissoes(userProfile?.id);
  const { conta, contaParam } = useConta();
  const [aba, setAba] = useState<'boletos' | 'regras'>('boletos');
  const [filtro, setFiltro] = useState<'ativos' | 'todos'>('ativos');
  const [boletos, setBoletos] = useState<BoletoFull[]>([]);
  const [regras, setRegras] = useState<Regra[]>([]);
  const [status, setStatus] = useState('');
  const [semTabela, setSemTabela] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setStatus('carregando…');
    try {
      const r = await fetch(`/api/ajustes/boletos-fornecedor?status=${filtro}${contaParam}`, { headers: await authHeaders() });
      const d = await r.json();
      if (d.migracaoFaltando) { setSemTabela(true); setStatus(''); return; }
      if (d.erro) { setStatus('Erro: ' + d.erro); return; }
      setBoletos(d.boletos || []); setRegras(d.regras || []); setStatus('');
    } catch (ex) { setStatus('Erro de rede: ' + (ex as Error).message); }
  }, [filtro, contaParam]);
  useEffect(() => { const t = setTimeout(carregar, 0); return () => clearTimeout(t); }, [carregar, conta]);

  const acao = useCallback(async (b: BoletoFull, acao: 'estornar' | 'reaplicar') => {
    if (acao === 'estornar' && !confirm(`Estornar o boleto ${b.numero} de ${b.nome_fornecedor}? Cada duplicata volta ao vencimento/previsão/observação que tinha antes.`)) return;
    const motivo = acao === 'estornar' ? (prompt('Motivo do estorno (opcional):') || '') : '';
    setStatus(acao === 'estornar' ? 'estornando na Omie…' : 'reaplicando na Omie…');
    try {
      const r = await fetch(`/api/ajustes/boletos-fornecedor/${b.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ acao, motivo }) });
      const d = await r.json();
      setStatus(d.ok ? (acao === 'estornar' ? `estornado ✓ (${d.revertidos} duplicata(s))` : `reaplicado ✓ (${d.aplicados} aplicada(s))`) : 'Erro: ' + (d.erro || 'falha'));
      carregar();
    } catch (ex) { setStatus('Erro de rede: ' + (ex as Error).message); }
  }, [carregar]);

  if (!permLoading && userProfile && !pode('financeiro', 'boletos-fornecedor') && !pode('financeiro', 'correcao-contas') && !pode('financeiro', 'baixa-contas')) return <SemPermissao />;
  const podeEditar = pode('financeiro', 'boletos-fornecedor');

  return (
    <PaginaFin
      titulo="Boletos de fornecedor"
      sub={<>Boleto parcelado que junta várias NFs — ele <b>reprograma</b> as duplicatas na Omie</>}
      direita={<ContaSelector />}
      comoLer={<>
        Fornecedor que junta várias NFs num boleto parcelado (ex.: CAMBUCI). O boleto <b>reprograma</b> as duplicatas da NF na Omie (previsão/vencimento = parcela, observação com o nº) — nada de título manual nem baixa antes de pagar.
        Clique numa linha para ver as <b>parcelas</b> e as <b>duplicatas</b> (antes → depois). <b>Reaplicar</b> refaz na Omie o que falhou; <b>Estornar</b> devolve cada duplicata ao que era antes.
        <div style={{ marginTop: 6 }}>Registrar: <Link href="/financeiro/caixa/correcao-contas">Correção de contas</Link> → vista Lista → marcar as duplicatas. Pagar: <Link href="/financeiro/caixa/baixar-contas">Baixar contas</Link> → Boletos de fornecedor.</div>
      </>}
    >
      {semTabela ? (
        <div className="ofin-aviso"><div>As tabelas do boleto agrupado ainda não existem no banco. Aplique <code>sql/boletos-fornecedor.sql</code> no SQL Editor do Supabase.</div></div>
      ) : (
        <>
          <div className="ofin-abas">
            <button type="button" className={`ofin-aba${aba === 'boletos' ? ' ativo' : ''}`} onClick={() => setAba('boletos')}>Boletos ({boletos.length})</button>
            <button type="button" className={`ofin-aba${aba === 'regras' ? ' ativo' : ''}`} onClick={() => setAba('regras')}>Regras por fornecedor ({regras.length})</button>
          </div>

          {aba === 'boletos' && (
            <div className="ofin-cartao">
              <div className="ofin-grade-cab">
                <Segmentado<'ativos' | 'todos'> valor={filtro} onChange={setFiltro} opcoes={[['ativos', 'Em andamento'], ['todos', 'Todos']]} />
                {status && <span className={`ofin-msg${status.startsWith('Erro') ? ' erro' : status.includes('✓') ? ' ok' : ''}`}>{status}</span>}
                <div style={{ flex: 1 }} />
                <BotaoFin variante="neutro" icone="fa-rotate" onClick={carregar}>Atualizar</BotaoFin>
              </div>
              <div className="ofin-grade-caixa">
                <table className="ofin-grade">
                  <thead><tr><th>Empresa</th><th>Fornecedor</th><th>Boleto</th><th>Data</th><th>Parcelas</th><th className="num">Duplicatas</th><th className="num">Valor</th><th>Situação</th><th>Por</th><th /></tr></thead>
                  <tbody>
                    {boletos.length === 0 && <tr><td colSpan={10} className="vazio">Nenhum boleto {filtro === 'ativos' ? 'em andamento' : 'registrado'}.</td></tr>}
                    {boletos.map((b) => {
                      const [rot, cor] = STATUS_ROTULO[b.status] || [b.status, 'cinza'];
                      const pagas = b.parcelas.filter((p) => p.status === 'paga').length;
                      const exp = aberto === b.id;
                      return [
                        <tr key={b.id} className={`clica${exp ? ' sel' : ''}`} onClick={() => setAberto(exp ? null : b.id)}>
                          <td><ChipEmpresa conta={b.conta_omie} /></td>
                          <td><i className={`fas fa-chevron-${exp ? 'down' : 'right'}`} style={{ fontSize: 10, color: TEAL, marginRight: 8 }} />{b.nome_fornecedor}</td>
                          <td style={{ fontFamily: 'monospace' }}>{b.numero}</td>
                          <td className="nowrap">{fmtBR(b.data_emissao) || fmtBR(b.created_at.slice(0, 10))}</td>
                          <td className="nowrap">{pagas}/{b.parcelas.length} pagas</td>
                          <td className="num">{new Set(b.titulos.map((t) => t.codigo_lancamento)).size}</td>
                          <td className="num" style={{ fontWeight: 600 }}>{fmtBRL(b.valor_total)}</td>
                          <td><Chip cor={cor} title={b.erro || ''}>{rot}</Chip></td>
                          <td className="apagado">{b.criado_por || '-'}</td>
                          <td className="num" onClick={(e) => e.stopPropagation()}>
                            <span style={{ display: 'inline-flex', gap: 6 }}>
                              {podeEditar && (b.status === 'erro_omie' || b.status === 'pendente') && <BotaoFin mini variante="aviso" icone="fa-rotate-right" onClick={() => acao(b, 'reaplicar')}>Reaplicar</BotaoFin>}
                              {podeEditar && ['registrado', 'erro_omie', 'pendente'].includes(b.status) && <BotaoFin mini variante="perigo" icone="fa-rotate-left" onClick={() => acao(b, 'estornar')}>Estornar</BotaoFin>}
                            </span>
                          </td>
                        </tr>,
                        exp && (
                          <tr key={b.id + '-det'} style={{ background: 'transparent' }}>
                            <td colSpan={10} style={{ padding: '12px 16px 16px', background: 'var(--ofin-cinza)' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 14 }}>
                                <div>
                                  <h3 className="ofin-secao">Parcelas</h3>
                                  <div className="ofin-cartao" style={{ marginBottom: 0 }}>
                                    <table className="ofin-grade compacta">
                                      <thead><tr><th>Parcela</th><th>Vencimento</th><th className="num">Valor</th><th>Situação</th></tr></thead>
                                      <tbody>{b.parcelas.map((p) => <tr key={p.id}><td>{String(p.numero).padStart(3, '0')}/{String(p.total).padStart(3, '0')}</td><td>{fmtBR(p.data_vencimento)}</td><td className="num">{fmtBRL(p.valor)}</td><td>{p.status === 'paga' ? <Chip cor="verde">paga em {fmtBR(p.pago_em)}</Chip> : <Chip cor="azul">{p.status}</Chip>}</td></tr>)}</tbody>
                                    </table>
                                  </div>
                                  {b.codigo_barras && <div className="ofin-msg" style={{ marginTop: 8, fontFamily: 'monospace' }}>{b.codigo_barras}</div>}
                                  {b.observacao && <div className="ofin-msg" style={{ marginTop: 4 }}>{b.observacao}</div>}
                                </div>
                                <div>
                                  <h3 className="ofin-secao">Duplicatas <small>{fmtBRL(b.valor_titulos)}</small></h3>
                                  <div className="ofin-cartao" style={{ marginBottom: 0 }}>
                                    <div className="ofin-grade-caixa">
                                      <table className="ofin-grade compacta">
                                        <thead><tr><th>Documento</th><th>Parcela</th><th className="num">Alocado</th><th>Antes → depois</th><th>Situação</th></tr></thead>
                                        <tbody>{b.titulos.map((t) => {
                                          const p = b.parcelas.find((x) => x.id === t.parcela_id);
                                          return (
                                            <tr key={t.parcela_id + t.codigo_lancamento}>
                                              <td>{t.numero_documento || t.codigo_lancamento}</td>
                                              <td className="nowrap">{p ? `${p.numero}/${p.total}` : '-'}{t.principal ? '' : ' (parte)'}</td>
                                              <td className="num">{fmtBRL(t.valor_alocado)}</td>
                                              <td className="apagado">{t.principal && t.campos_novos ? `venc ${fmtBR(t.snapshot_anterior?.dataVencimento) || '?'} → ${fmtBR(t.campos_novos.dataVencimento) || '='} · prev → ${fmtBR(t.campos_novos.dataPrevisao)}` : ''}</td>
                                              <td style={{ fontSize: 12, color: t.status === 'erro' ? '#dc2626' : undefined }} title={t.erro || ''}>{t.status}{t.erro ? ` — ${t.erro}` : ''}</td>
                                            </tr>
                                          );
                                        })}</tbody>
                                      </table>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ),
                      ];
                    })}
                  </tbody>
                </table>
              </div>
              <RodapeGrade mostrando={boletos.length} dica={<><i className="fas fa-hand-pointer" /> clique numa linha para ver parcelas e duplicatas</>} />
            </div>
          )}

          {aba === 'regras' && <Regras regras={regras} conta={conta} podeEditar={podeEditar} onMudou={carregar} />}
        </>
      )}
    </PaginaFin>
  );
}

function Regras({ regras, conta, podeEditar, onMudou }: { regras: Regra[]; conta: string; podeEditar: boolean; onMudou: () => void }) {
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState<Array<{ codigo: number; nome: string; titulos: number }>>([]);
  const [sel, setSel] = useState<{ codigo: number; nome: string } | null>(null);
  const [dias, setDias] = useState('10');
  const [tol, setTol] = useState('1.00');
  const [alinhar, setAlinhar] = useState(true);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!conta || busca.trim().length < 2) { setAchados([]); return; }
      const r = await fetch(`/api/ajustes/boletos-fornecedor/regras?conta=${encodeURIComponent(conta)}&busca=${encodeURIComponent(busca)}`, { headers: await authHeaders() });
      const d = await r.json();
      setAchados(d.fornecedores || []);
    }, 400);
    return () => clearTimeout(t);
  }, [busca, conta]);

  const salvar = useCallback(async (r: Partial<Regra> & { codigoFornecedor: number; nome: string }) => {
    setStatus('salvando…');
    const res = await fetch('/api/ajustes/boletos-fornecedor/regras', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ id: r.id || null, conta: r.conta_omie || conta, codigoFornecedor: r.codigoFornecedor, nome: r.nome, ativo: r.ativo, diasTolerancia: r.dias_tolerancia, toleranciaValor: r.tolerancia_valor, alinharVencimento: r.alinhar_vencimento }),
    });
    const d = await res.json();
    setStatus(d.ok ? 'salvo ✓' : 'Erro: ' + (d.erro || 'falha'));
    if (d.ok) { setSel(null); setBusca(''); onMudou(); }
  }, [conta, onMudou]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: podeEditar ? 'minmax(0, 1.5fr) minmax(min(340px, 100%), 1fr)' : '1fr', gap: 14, alignItems: 'start' }} className="ofin-regras">
      <style>{`@media (max-width: 900px) { .ofin-regras { grid-template-columns: 1fr !important; } }`}</style>
      <div className="ofin-cartao" style={{ marginBottom: 0 }}>
        <div className="ofin-grade-caixa">
          <table className="ofin-grade">
            <thead><tr><th>Empresa</th><th>Fornecedor</th><th>Cód. Omie</th><th>Aguardando boleto após</th><th className="num">Tolerância</th><th>Alinha venc.</th><th className="centro">Ativa</th></tr></thead>
            <tbody>
              {regras.length === 0 && <tr><td colSpan={7} className="vazio">Nenhuma regra. A regra só muda tolerâncias e avisos — registrar boleto funciona para qualquer fornecedor.</td></tr>}
              {regras.map((r) => (
                <tr key={r.id}>
                  <td><ChipEmpresa conta={r.conta_omie} /></td><td>{r.nome}</td><td className="apagado" style={{ fontFamily: 'monospace' }}>{r.codigo_cliente_fornecedor}</td>
                  <td>{r.dias_tolerancia} dias</td><td className="num">{fmtBRL(r.tolerancia_valor)}</td><td>{r.alinhar_vencimento ? 'sim' : 'só previsão'}</td>
                  <td className="centro">{podeEditar ? <input type="checkbox" checked={r.ativo} onChange={(e) => salvar({ ...r, codigoFornecedor: r.codigo_cliente_fornecedor, ativo: e.target.checked })} /> : r.ativo ? 'sim' : 'não'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <RodapeGrade mostrando={regras.length} />
      </div>
      {podeEditar && (
        <div className="ofin-cartao" style={{ marginBottom: 0, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 className="ofin-secao" style={{ margin: 0 }}>Nova regra <small>empresa <b>{conta || '(escolha NOVA ou CASTRO no topo)'}</b></small></h3>
          <CampoFin titulo="Fornecedor (busca nos títulos a pagar)">
            <div style={{ position: 'relative' }}>
              <input className="ofin-inp" value={busca} onChange={(e) => { setBusca(e.target.value); setSel(null); }} placeholder="ex.: CAMBUCI" disabled={!conta} />
              {achados.length > 0 && !sel && (
                <div style={{ position: 'absolute', zIndex: 30, top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--portal-bg-card, #fefefe)', border: '1px solid var(--portal-border, #d7dee3)', borderRadius: 10, boxShadow: '0 14px 34px rgba(15,23,42,.16)', maxHeight: 220, overflow: 'auto' }}>
                  {achados.map((a) => (
                    <button key={a.codigo} type="button" onClick={() => { setSel({ codigo: a.codigo, nome: a.nome }); setBusca(a.nome); }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: 'inherit' }}>
                      {a.nome} <span style={{ color: '#94a3b8' }}>· {a.codigo} · {a.titulos} títulos</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </CampoFin>
          <div className="ofin-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <CampoFin titulo="Aguardando boleto após (dias)"><input className="ofin-inp num" type="number" value={dias} onChange={(e) => setDias(e.target.value)} /></CampoFin>
            <CampoFin titulo="Tolerância de valor (R$)"><input className="ofin-inp num" value={tol} onChange={(e) => setTol(e.target.value)} /></CampoFin>
          </div>
          <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}><input type="checkbox" checked={alinhar} onChange={(e) => setAlinhar(e.target.checked)} /> Alinhar o vencimento da duplicata à parcela (padrão)</label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <BotaoFin variante="prim" icone="fa-floppy-disk" disabled={!sel} onClick={() => sel && salvar({ codigoFornecedor: sel.codigo, nome: sel.nome, ativo: true, dias_tolerancia: Number(dias) || 10, tolerancia_valor: Number(String(tol).replace(',', '.')) || 1, alinhar_vencimento: alinhar })}>Salvar regra</BotaoFin>
            <span className={`ofin-msg${status.startsWith('Erro') ? ' erro' : status.includes('✓') ? ' ok' : ''}`}>{status}</span>
          </div>
        </div>
      )}
    </div>
  );
}
