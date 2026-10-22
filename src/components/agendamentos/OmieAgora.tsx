'use client'
// Faixa "Omie agora" da tela /agendamentos: situação de cada chave (livre/bloqueada),
// chamadas do último minuto, fila por prioridade, o que está rodando e o que vem.
import { Activity, Ban, Clock, Loader2 } from 'lucide-react'
import type { Painel } from './tipos'
import { horaSP, tempoRelativo } from './tipos'

const LIMITE_MIN = 240

export default function OmieAgora({ painel }: { painel: Painel }) {
  const { porta, motor, agendamentos } = painel

  // contas que apareceram na porta (consumo ou bloqueio) — NOVA/CASTRO no uso normal
  const contas = Array.from(new Set([
    ...porta.ultimoMinuto.map((l) => l.conta),
    ...porta.ultimaHora.map((l) => l.conta),
    ...porta.bloqueios.map((b) => b.conta),
  ])).sort()

  const nome = (chave: string) => agendamentos.find((a) => a.chave === chave)?.nome ?? chave
  const proximos = agendamentos
    .filter((a) => a.ativo && a.proxima && !a.rodandoAgora)
    .sort((a, b) => new Date(a.proxima!).getTime() - new Date(b.proxima!).getTime())
    .slice(0, 4)

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px', marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: '.92rem', marginBottom: 10, color: '#111111' }}>
        <Activity size={16} style={{ color: '#dc2626' }} /> Omie agora
        <span style={{ fontWeight: 500, fontSize: '.72rem', color: '#6b7280' }}>
          · fila: {porta.fila.pessoa} de pessoas, {porta.fila.rapido} rápidos, {porta.fila.pesado} pesados
          {porta.coordenacao?.ativa && (
            <> · servidor {porta.coordenacao.papel}, coordenado com o {porta.coordenacao.papel === 'web' ? 'worker' : 'web'}
              {porta.coordenacao.esperandoVaga > 0 && <> · {porta.coordenacao.esperandoVaga} gravação(ões) esperando a vez</>}
            </>
          )}
        </span>
      </div>
      {porta.coordenacao?.ultimoErro && (
        <div style={{ fontSize: '.75rem', color: '#b45309', marginBottom: 8 }}>
          Coordenação com o outro servidor falhou ({porta.coordenacao.ultimoErro.msg}) — seguindo só com a fila deste servidor.
          {/omie_|schema cache|does not exist/i.test(porta.coordenacao.ultimoErro.msg) && <> Falta aplicar sql/omie-coordenacao.sql.</>}
        </div>
      )}

      {contas.length === 0 && (
        <div style={{ fontSize: '.8rem', color: '#6b7280', marginBottom: 8 }}>Nenhuma chamada à Omie neste servidor na última hora.</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
        {contas.map((conta) => {
          const min = porta.ultimoMinuto.filter((l) => l.conta === conta)
          const chamadas = min.reduce((s, l) => s + l.ok + l.erro + l.incerto, 0)
          const erros = min.reduce((s, l) => s + l.erro + l.incerto, 0)
          const hora = porta.ultimaHora.filter((l) => l.conta === conta).reduce((s, l) => s + l.ok + l.erro + l.incerto, 0)
          const bloq = porta.bloqueios.filter((b) => b.conta === conta)
          const emVoo = porta.emVoo.find((e) => e.conta === conta)?.chamadas ?? 0
          return (
            <div key={conta} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: '.8rem' }}>
              <strong style={{ minWidth: 110, color: '#111111' }}>{conta}</strong>
              {bloq.length ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#b91c1c', fontWeight: 700 }}>
                  <Ban size={13} /> BLOQUEADA {bloq.map((b) => `${b.metodo} até ${horaSP(b.ate)}`).join(' · ')}
                </span>
              ) : (
                <span style={{ color: '#047857', fontWeight: 700 }}>● livre</span>
              )}
              <span style={{ color: '#374151' }}>{chamadas} chamada(s) no último minuto <span style={{ color: '#9ca3af' }}>(limite {LIMITE_MIN} por método)</span></span>
              {erros > 0 && <span style={{ color: '#b91c1c' }}>{erros} com erro</span>}
              {emVoo > 0 && <span style={{ color: '#1d4ed8' }}>{emVoo} em andamento</span>}
              <span style={{ color: '#9ca3af' }}>{hora} na última hora</span>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: '.78rem', color: '#374151', borderTop: '1px solid #f3f4f6', paddingTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Loader2 size={13} style={{ color: '#1d4ed8' }} />
          <strong>Agora:</strong>
          {motor.rodando.length
            ? motor.rodando.map((r) => `${nome(r.chave)} (${tempoRelativo(r.desde).replace('há ', '')})`).join(' · ')
            : <span style={{ color: '#9ca3af' }}>nada rodando</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Clock size={13} style={{ color: '#6b7280' }} />
          <strong>Próximos:</strong>
          {proximos.length
            ? proximos.map((a) => `${a.nome} ${horaSP(a.proxima)}`).join(' · ')
            : <span style={{ color: '#9ca3af' }}>—</span>}
        </div>
      </div>
    </div>
  )
}
