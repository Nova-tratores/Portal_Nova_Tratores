'use client'
// Aba "Alertas" de /atividades: o que o vigia de atividade suspeita achou
// (lib/vigia-atividade). Só avisa: aqui a pessoa confere e marca cada um.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ShieldAlert, KeyRound, Download, Layers, RefreshCw, HelpCircle, ChevronDown, Check, Flag, Eye } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'

type Alerta = {
  id: number; tipo: 'permissao' | 'exportacao' | 'lote'; gravidade: 'alta' | 'media'
  user_id: string | null; user_nome: string | null; titulo: string; descricao: string | null
  quando: string; notificado: boolean; situacao: 'novo' | 'visto' | 'normal' | 'investigar'
  situacao_por: string | null; situacao_em: string | null
}

const TIPOS = {
  permissao: { rotulo: 'Permissão alterada', cor: '#7c3aed', Icone: KeyRound },
  exportacao: { rotulo: 'Exportação em volume', cor: '#0369a1', Icone: Download },
  lote: { rotulo: 'Ação sensível em lote', cor: '#c2410c', Icone: Layers },
} as const

const SITUACOES = [
  { v: 'novo', rotulo: 'Novo', cor: '#dc2626' },
  { v: 'visto', rotulo: 'Visto', cor: '#64748b' },
  { v: 'normal', rotulo: 'Era normal', cor: '#16a34a' },
  { v: 'investigar', rotulo: 'Investigar', cor: '#b45309' },
] as const

const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function AlertasAba() {
  const [dias, setDias] = useState(30)
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [falta, setFalta] = useState(false)
  const [tipo, setTipo] = useState<'' | Alerta['tipo']>('')
  const [situacao, setSituacao] = useState<'' | 'abertos' | Alerta['situacao']>('abertos')
  const [rodando, setRodando] = useState(false)
  const [aviso, setAviso] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('')
    try {
      const r = await fetch(`/api/vigia-atividade?dias=${dias}`, { headers: await authHeaders() })
      const j = await r.json()
      if (!r.ok) throw new Error(j.erro || 'Erro ao carregar')
      setAlertas(j.alertas || []); setFalta(!!j.migracaoFaltando)
    } catch (e) { setErro((e as Error).message) }
    setCarregando(false)
  }, [dias])
  useEffect(() => { carregar() }, [carregar])

  const marcar = async (a: Alerta, s: Alerta['situacao']) => {
    setAlertas((l) => l.map((x) => (x.id === a.id ? { ...x, situacao: s } : x)))
    const r = await fetch('/api/vigia-atividade', { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ id: a.id, situacao: s }) })
    if (!r.ok) { setAviso((await r.json().catch(() => ({}))).erro || 'Não foi possível marcar'); carregar() }
  }

  const rodarAgora = async () => {
    setRodando(true); setAviso('')
    try {
      const r = await fetch('/api/vigia-atividade', { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ rodar: true }) })
      const j = await r.json()
      setAviso(r.ok ? (j.pular || j.resumo || 'Conferido') : (j.erro || 'Erro'))
      await carregar()
    } catch (e) { setAviso((e as Error).message) }
    setRodando(false)
  }

  const lista = useMemo(() => alertas.filter((a) =>
    (!tipo || a.tipo === tipo) &&
    (!situacao || (situacao === 'abertos' ? a.situacao === 'novo' || a.situacao === 'investigar' : a.situacao === situacao))), [alertas, tipo, situacao])
  const contTipo = (t: Alerta['tipo']) => alertas.filter((a) => a.tipo === t && (a.situacao === 'novo' || a.situacao === 'investigar')).length

  const btn = (ativo: boolean, cor = '#334155'): React.CSSProperties => ({
    minHeight: 40, padding: '0 14px', borderRadius: 999, fontSize: 14, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
    border: `1px solid ${ativo ? cor : 'var(--border, #e2e8f0)'}`, background: ativo ? cor : 'var(--surface, #fefefe)', color: ativo ? '#fefefe' : 'var(--portal-text, #0f172a)',
  })

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <details style={{ border: '1px solid var(--border, #e2e8f0)', borderRadius: 12, padding: '10px 14px', background: 'var(--surface, #fefefe)' }}>
        <summary style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, minHeight: 32 }}>
          <HelpCircle size={16} color="#2563eb" /> Como ler esta tela <ChevronDown size={14} style={{ marginLeft: 'auto' }} />
        </summary>
        <ul style={{ margin: '10px 0 4px', paddingLeft: 20, display: 'grid', gap: 6, fontSize: 14, lineHeight: 1.5 }}>
          <li>Um robô lê o histórico de ações do portal a cada 15 minutos e marca o que foge do comum. Ele <b style={{ fontWeight: 500 }}>só avisa</b>: ninguém é bloqueado.</li>
          <li><b style={{ fontWeight: 500 }}>Permissão alterada</b>: qualquer mudança de nível (Usuário, Admin, Dev), Diretor, categoria, módulos ou pacotes. Vira importante quando alguém vira Admin/Dev ou mexe nos próprios acessos.</li>
          <li><b style={{ fontWeight: 500 }}>Exportação em volume</b>: 10 ou mais exportações/impressões da mesma pessoa a até 1 hora uma da outra, um relatório com 5.000 linhas ou mais, ou 150 downloads de arquivo num dia.</li>
          <li><b style={{ fontWeight: 500 }}>Ação sensível em lote</b>: a mesma ação de apagar, cancelar, reverter, estornar ou liberar repetida 15 vezes ou mais, a até 30 minutos uma da outra.</li>
          <li>O aviso chega no sino. O que você mesmo fez fica gravado aqui, mas não toca o sino.</li>
          <li>Marque cada alerta como <b style={{ fontWeight: 500 }}>Visto</b>, <b style={{ fontWeight: 500 }}>Era normal</b> ou <b style={{ fontWeight: 500 }}>Investigar</b>. <b style={{ fontWeight: 500 }}>Abertos</b> mostra os novos e os marcados para investigar.</li>
        </ul>
      </details>

      {falta && <div style={{ padding: 12, borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 14 }}>
        O robô ainda não está ligado: falta aplicar <code>sql/vigia-atividade.sql</code> no banco.
      </div>}
      {erro && <div style={{ padding: 12, borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 14 }}>{erro}</div>}

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        {(Object.keys(TIPOS) as Alerta['tipo'][]).map((t) => {
          const T = TIPOS[t]
          return (
            <button key={t} onClick={() => setTipo(tipo === t ? '' : t)} style={{ textAlign: 'left', padding: 14, borderRadius: 12, cursor: 'pointer',
              border: `1px solid ${tipo === t ? T.cor : 'var(--border, #e2e8f0)'}`, borderLeft: `4px solid ${T.cor}`, background: 'var(--surface, #fefefe)', color: 'var(--portal-text, #0f172a)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}><T.Icone size={16} color={T.cor} />{T.rotulo}</div>
              <div style={{ fontSize: 26, marginTop: 4 }}>{contTipo(t)}</div>
              <div style={{ fontSize: 12, color: 'var(--portal-text-secondary, #64748b)' }}>em aberto</div>
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {[['abertos', 'Abertos'], ...SITUACOES.map((s) => [s.v, s.rotulo]), ['', 'Todos']].map(([v, r]) => (
          <button key={v || 'todos'} onClick={() => setSituacao(v as typeof situacao)} style={btn(situacao === v)}>{r}</button>
        ))}
        <select value={dias} onChange={(e) => setDias(Number(e.target.value))} aria-label="Período"
          style={{ minHeight: 40, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border, #e2e8f0)', background: 'var(--surface, #fefefe)', color: 'var(--portal-text, #0f172a)', fontSize: 14 }}>
          <option value={7}>Últimos 7 dias</option><option value={30}>Últimos 30 dias</option><option value={90}>Últimos 90 dias</option>
        </select>
        <button onClick={rodarAgora} disabled={rodando} style={{ ...btn(false), marginLeft: 'auto' }} title="Confere o histórico agora, sem esperar os 15 minutos">
          <RefreshCw size={14} className={rodando ? 'animate-spin' : ''} /> Conferir agora
        </button>
      </div>
      {aviso && <div style={{ fontSize: 13, color: 'var(--portal-text-secondary, #64748b)' }}>{aviso}</div>}

      {carregando ? <div style={{ padding: 24, color: 'var(--portal-text-secondary, #64748b)' }}>Carregando…</div>
        : lista.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center', borderRadius: 12, border: '1px dashed var(--border, #e2e8f0)', color: 'var(--portal-text-secondary, #64748b)' }}>
            <ShieldAlert size={22} style={{ marginBottom: 6 }} /><div>Nada por aqui neste filtro.</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {lista.map((a) => {
              const T = TIPOS[a.tipo]
              const S = SITUACOES.find((s) => s.v === a.situacao)!
              return (
                <div key={a.id} style={{ padding: 14, borderRadius: 12, border: '1px solid var(--border, #e2e8f0)', borderLeft: `4px solid ${T.cor}`, background: 'var(--surface, #fefefe)', display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', fontSize: 12 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, background: `${T.cor}18`, color: T.cor }}><T.Icone size={12} />{T.rotulo}</span>
                    {a.gravidade === 'alta' && <span style={{ padding: '2px 8px', borderRadius: 999, background: '#fee2e2', color: '#b91c1c' }}>Importante</span>}
                    <span style={{ padding: '2px 8px', borderRadius: 999, border: `1px solid ${S.cor}`, color: S.cor }}>{S.rotulo}</span>
                    {!a.notificado && <span style={{ color: 'var(--portal-text-secondary, #64748b)' }}>sem aviso no sino (ação sua)</span>}
                    <span style={{ marginLeft: 'auto', color: 'var(--portal-text-secondary, #64748b)' }}>{dataHora(a.quando)}</span>
                  </div>
                  <div style={{ fontSize: 15 }}>{a.titulo}</div>
                  {a.descricao && <div style={{ fontSize: 14, color: 'var(--portal-text-secondary, #475569)', lineHeight: 1.5, overflowWrap: 'anywhere' }}>{a.descricao}</div>}
                  {a.situacao_por && a.situacao !== 'novo' && <div style={{ fontSize: 12, color: 'var(--portal-text-secondary, #64748b)' }}>Marcado por {a.situacao_por}{a.situacao_em ? ` em ${dataHora(a.situacao_em)}` : ''}</div>}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <button onClick={() => marcar(a, 'visto')} style={btn(a.situacao === 'visto', '#64748b')}><Eye size={14} />Visto</button>
                    <button onClick={() => marcar(a, 'normal')} style={btn(a.situacao === 'normal', '#16a34a')}><Check size={14} />Era normal</button>
                    <button onClick={() => marcar(a, 'investigar')} style={btn(a.situacao === 'investigar', '#b45309')}><Flag size={14} />Investigar</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
    </div>
  )
}
