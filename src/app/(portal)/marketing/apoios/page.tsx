'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// /marketing/apoios — CARTEIRA de apoio de fábrica.
//
// É a tela que justifica o módulo: mostra, numa lista só, quanto a empresa tem
// a receber das fábricas e o que ainda deve entregar em troca. Nada equivalente
// existia no portal, e é dinheiro com prazo.
//
// Ordem: o que venceu primeiro, depois o que vence antes. Quem já recebeu e
// entregou some da fila por padrão.
// =============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, UserX } from 'lucide-react';
import { STATUS_APOIO, STATUS_RELATORIO, rotulo, cor } from '@/lib/marketing/tipos';
import type { Apoio } from '@/lib/marketing/tipos';
import {
  apiGet, brl, dataBR, diasAte, Painel, Selo, Kpi, Vazio, AvisoMigracao, Erro, estiloInput,
} from '@/components/marketing/ui';

export default function ApoiosPage() {
  const [apoios, setApoios] = useState<Apoio[]>([]);
  const [acoes, setAcoes] = useState<Record<string, any>>({});
  const [inativos, setInativos] = useState<Set<string>>(new Set());
  const [carregando, setCarregando] = useState(true);
  const [migracao, setMigracao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarTudo, setTudo] = useState(false);
  const [fStatus, setFStatus] = useState('');

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await apiGet<any>(`/api/marketing/apoios${mostrarTudo ? '?todos=1' : ''}`);
      setApoios(r.itens ?? []);
      setAcoes(r.acoes ?? {});
      setInativos(new Set(r.inativos ?? []));
    } catch (e: any) {
      if (e?.corpo?.migracaoFaltando) setMigracao(true);
      else setErro(e?.message || 'Não foi possível carregar os apoios.');
    } finally {
      setCarregando(false);
    }
  }, [mostrarTudo]);

  useEffect(() => { carregar(); }, [carregar]);

  const lista = useMemo(() => {
    const filtrada = fStatus ? apoios.filter((a) => a.status === fStatus) : apoios;
    // Vencido primeiro, depois por prazo mais próximo, depois sem prazo.
    return [...filtrada].sort((a, b) => {
      const da = diasAte(a.contrapartida_prazo);
      const db = diasAte(b.contrapartida_prazo);
      if (da === null && db === null) return 0;
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db;
    });
  }, [apoios, fStatus]);

  const totais = useMemo(() => {
    let aprovado = 0, recebido = 0, devendo = 0, vencidos = 0;
    for (const a of apoios) {
      aprovado += Number(a.valor_aprovado ?? 0);
      recebido += Number(a.valor_recebido ?? 0);
      if (a.relatorio_status === 'pendente' || a.relatorio_status === 'em_elaboracao') {
        devendo += 1;
        const d = diasAte(a.contrapartida_prazo);
        if (d !== null && d < 0) vencidos += 1;
      }
    }
    return { aprovado, recebido, aReceber: Math.max(aprovado - recebido, 0), devendo, vencidos };
  }, [apoios]);

  if (migracao) return <AvisoMigracao />;

  return (
    <div style={{ padding: 16, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <Kpi rotulo="Aprovado" valor={brl(totais.aprovado)} dica="Tudo que as fábricas aprovaram nas ações listadas." />
        <Kpi rotulo="Já recebido" valor={brl(totais.recebido)} cor="#16a34a" />
        <Kpi rotulo="A receber" valor={brl(totais.aReceber)} dica="Aprovado que ainda não virou crédito." cor="#d97706" alerta={totais.aReceber > 0} />
        <Kpi
          rotulo="Relatórios devidos"
          valor={String(totais.devendo)}
          dica="Contrapartidas ainda não entregues à fábrica."
          cor={totais.devendo > 0 ? '#dc2626' : undefined}
          alerta={totais.vencidos > 0}
        />
        <Kpi rotulo="Prazos vencidos" valor={String(totais.vencidos)} cor={totais.vencidos > 0 ? '#dc2626' : undefined} alerta={totais.vencidos > 0} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <select style={{ ...estiloInput, flex: '0 1 200px' }} value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="">Todas as etapas</option>
          {STATUS_APOIO.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--portal-text)' }}>
          <input type="checkbox" checked={mostrarTudo} onChange={(e) => setTudo(e.target.checked)} />
          Incluir recusados e cancelados
        </label>
      </div>

      {erro && <Erro>{erro}</Erro>}

      {carregando ? (
        <Vazio>Carregando…</Vazio>
      ) : lista.length === 0 ? (
        <Vazio>Nenhum apoio de fábrica registrado. Cadastre pela ficha da ação.</Vazio>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {lista.map((a) => {
            const acao = acoes[a.acao_id];
            const dias = diasAte(a.contrapartida_prazo);
            const devendo = a.relatorio_status === 'pendente' || a.relatorio_status === 'em_elaboracao';
            const vencido = devendo && dias !== null && dias < 0;
            const semDono = !!a.responsavel_id && inativos.has(a.responsavel_id);
            const acaoSemDono = !!acao?.responsavel_id && inativos.has(acao.responsavel_id);

            return (
              <Painel key={a.id} style={{ borderLeft: `3px solid ${vencido ? '#dc2626' : cor(STATUS_APOIO, a.status)}` }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
                  <div style={{ minWidth: 220, flex: '2 1 260px' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--portal-text)' }}>{a.apoiador}</div>
                    <Link
                      href={`/marketing/${a.acao_id}`}
                      style={{ fontSize: 13, color: '#2563eb', textDecoration: 'none' }}
                    >
                      {acao?.nome ?? 'ação'}
                    </Link>
                  </div>

                  <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13, color: 'var(--portal-text)' }}>
                    <span title="O que a fábrica aprovou">Aprovado <b>{brl(a.valor_aprovado)}</b></span>
                    <span title="O que efetivamente entrou">Recebido <b>{brl(a.valor_recebido)}</b></span>
                    {a.documento_tipo && (
                      <span title="Documento do processo">
                        {a.documento_tipo} <b>{a.documento_numero || '—'}</b>
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <Selo texto={rotulo(STATUS_APOIO, a.status)} cor={cor(STATUS_APOIO, a.status)} />
                    <Selo
                      texto={`Relatório: ${rotulo(STATUS_RELATORIO, a.relatorio_status)}`}
                      cor={cor(STATUS_RELATORIO, a.relatorio_status)}
                    />
                  </div>
                </div>

                {(devendo || semDono || acaoSemDono) && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--portal-border)', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {devendo && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: vencido ? '#dc2626' : '#b45309' }}>
                        <AlertTriangle size={14} />
                        {a.contrapartida_prazo
                          ? vencido
                            ? `Relatório de contrapartida venceu em ${dataBR(a.contrapartida_prazo)} — há ${Math.abs(dias!)} dia(s)`
                            : `Relatório de contrapartida vence em ${dataBR(a.contrapartida_prazo)} — faltam ${dias} dia(s)`
                          : 'Relatório de contrapartida pendente, sem prazo registrado'}
                      </div>
                    )}
                    {(semDono || acaoSemDono) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#dc2626' }}>
                        <UserX size={14} />
                        Responsável não está mais ativo no portal — reatribuir
                      </div>
                    )}
                  </div>
                )}
              </Painel>
            );
          })}
        </div>
      )}
    </div>
  );
}
