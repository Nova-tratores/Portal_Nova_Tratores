'use client'
// Aba "Uso" de /atividades: quem usa o quê (contagens agregadas por dia de
// portal_uso_paginas / portal_uso_api / portal_uso_presenca via /api/uso/resumo).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Users, Globe, Activity, Wifi, RefreshCw } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import { Painel, Tile, useTemaEscuro, type Tema } from '@/components/comum/PainelBarras'
import type { Agregado } from '@/lib/ppv/relacao'
import type { ResumoUso } from '@/lib/uso/resumo'

const TEMA_USO: Tema = {
  accent: '#dc2626', accentDark: '#f87171', accentText: '#fff',
  surface: '#ffffff', border: '#f0f0f0', text: '#1a1a1a', textLight: '#a3a3a3',
  bg: '#fafafa', primaryLight: '#fef2f2', primaryText: '#dc2626',
}

type Resp = ResumoUso & { monitorLigado: boolean; podeVerTodos: boolean; erro?: string; migracaoFaltando?: boolean }

const PRESETS: Array<{ label: string; dias: number }> = [
  { label: '7 dias', dias: 7 }, { label: '30 dias', dias: 30 }, { label: '90 dias', dias: 90 },
]

function isoDia(d: Date): string { return d.toISOString().slice(0, 10) }
function hojeLocal(): string { return isoDia(new Date(Date.now() - 3 * 3600 * 1000)) }
function menosDias(ate: string, n: number): string { return isoDia(new Date(new Date(ate + 'T12:00:00Z').getTime() - (n - 1) * 86400000)) }
function fmtQuando(iso: string | null): string {
  if (!iso) return 'nunca'
  const d = new Date(iso)
  const min = Math.floor((Date.now() - d.getTime()) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min} min atrás`
  if (min < 1440) return `${Math.floor(min / 60)} h atrás`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}
const n = (v: number) => v.toLocaleString('pt-BR')

const th: React.CSSProperties = { fontSize: '10px', fontWeight: 700, color: '#a3a3a3', letterSpacing: '1.5px', textTransform: 'uppercase', padding: '10px 14px', textAlign: 'left', background: '#fafafa', borderBottom: '1px solid #f0f0f0', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { fontSize: '13px', color: '#1a1a1a', padding: '10px 14px', borderBottom: '1px solid #f5f5f5', verticalAlign: 'top' }
const card: React.CSSProperties = { background: '#ffffff', borderRadius: '16px', border: '1px solid #f0f0f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' }
const inp: React.CSSProperties = { padding: '8px 12px', borderRadius: '10px', background: '#fafafa', border: '1px solid #e5e5e5', color: '#1a1a1a', fontSize: '13px', fontFamily: 'Inter', outline: 'none' }

export default function UsoAba({ usuarios }: { usuarios: { id: string; nome: string }[] }) {
  const dark = useTemaEscuro()
  const [ate, setAte] = useState(hojeLocal())
  const [de, setDe] = useState(menosDias(hojeLocal(), 30))
  const [usuario, setUsuario] = useState('')
  const [dados, setDados] = useState<Resp | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [soAuto, setSoAuto] = useState<'todas' | 'manuais' | 'automaticas'>('manuais')

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('')
    try {
      const qs = new URLSearchParams({ de, ate }); if (usuario) qs.set('usuario', usuario)
      const r = await fetch(`/api/uso/resumo?${qs}`, { headers: await authHeaders(), cache: 'no-store' })
      const d = (await r.json()) as Resp
      if (!r.ok || d.erro) { setErro(d.erro || `Erro ${r.status}`); setDados(null); return }
      setDados(d)
    } catch (e) { setErro((e as Error).message) } finally { setCarregando(false) }
  }, [de, ate, usuario])
  useEffect(() => { carregar() }, [carregar])

  const porDia: Agregado[] = useMemo(() => (dados?.porDia || []).map((d) => ({ chave: d.dia, label: d.dia.slice(8, 10) + '/' + d.dia.slice(5, 7), n: d.acessos, valor: d.usuarios, ids: [] })), [dados])
  const porModulo: Agregado[] = useMemo(() => (dados?.porModulo || []).slice(0, 14).map((m) => ({ chave: m.modulo, label: m.modulo, n: m.acessos, valor: m.usuarios, ids: [] })), [dados])
  const api = useMemo(() => (dados?.apiPorRota || []).filter((a) => soAuto === 'todas' || (soAuto === 'automaticas') === a.automatica).slice(0, 40), [dados, soAuto])

  return (
    <div>
      {/* Filtros */}
      <div style={{ ...card, padding: '14px 20px', marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        {PRESETS.map((p) => {
          const ativo = de === menosDias(ate, p.dias)
          return (
            <button key={p.dias} onClick={() => setDe(menosDias(ate, p.dias))} style={{ ...inp, cursor: 'pointer', fontWeight: 600, background: ativo ? '#fef2f2' : '#fafafa', border: ativo ? '1px solid #fecaca' : '1px solid #e5e5e5', color: ativo ? '#dc2626' : '#737373' }}>{p.label}</button>
          )
        })}
        <input type="date" value={de} max={ate} onChange={(e) => setDe(e.target.value)} style={inp} />
        <span style={{ color: '#a3a3a3', fontSize: '12px' }}>até</span>
        <input type="date" value={ate} max={hojeLocal()} onChange={(e) => { setAte(e.target.value); if (de > e.target.value) setDe(e.target.value) }} style={inp} />
        {dados?.podeVerTodos !== false && (
          <select value={usuario} onChange={(e) => setUsuario(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
            <option value="">Todos os usuários</option>
            {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        )}
        <button onClick={carregar} disabled={carregando} title="Recarregar" style={{ ...inp, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto', color: '#737373' }}>
          <RefreshCw size={13} className={carregando ? 'animate-spin' : ''} /> {carregando ? 'Carregando…' : 'Atualizar'}
        </button>
      </div>

      {erro && (
        <div style={{ ...card, padding: '14px 20px', marginBottom: '20px', color: '#dc2626', fontSize: '13px' }}>{erro}</div>
      )}
      {dados && !dados.monitorLigado && (
        <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '12px', padding: '10px 16px', marginBottom: '20px', fontSize: '12px', color: '#92400e' }}>
          O monitor de uso está <strong>desligado</strong> neste ambiente (liga sozinho em produção; no local, variável <code>USO_MONITOR=on</code>). Os números abaixo são o que já foi gravado.
        </div>
      )}

      {dados && (
        <>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            <Tile tema={TEMA_USO} label="Acessos a páginas" valor={n(dados.totais.acessos)} sub={`${dados.periodo.dias} dias`} destaque />
            <Tile tema={TEMA_USO} label="Usuários que usaram" valor={n(dados.totais.usuarios)} sub={`${n(dados.porUsuario.filter((u) => u.acessos === 0).length)} sem uso`} />
            <Tile tema={TEMA_USO} label="Páginas distintas" valor={n(dados.totais.paginas)} sub={`${n(dados.porModulo.length)} módulos`} />
            <Tile tema={TEMA_USO} label="Chamadas de API (pessoa)" valor={n(dados.totais.chamadasApi)} sub="sem polling" />
            <Tile tema={TEMA_USO} label="Chamadas automáticas" valor={n(dados.totais.chamadasAuto)} sub="sinos, chat, e-mail" />
            <Tile tema={TEMA_USO} label="Online agora" valor={n(dados.online.length)} sub="últimos 5 min" cor="#059669" />
          </div>

          {/* Online */}
          {dados.online.length > 0 && (
            <div style={{ ...card, padding: '12px 20px', marginBottom: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <Wifi size={14} color="#059669" />
              {dados.online.map((o) => (
                <span key={o.user_id} title={o.rota || ''} style={{ fontSize: '12px', background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', borderRadius: '999px', padding: '4px 10px' }}>
                  <strong>{o.nome.split(' ')[0]}</strong> · {o.rota || '—'} · {o.minutos === 0 ? 'agora' : `${o.minutos} min`}
                </span>
              ))}
            </div>
          )}

          {/* Gráficos */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '16px', marginBottom: '20px' }}>
            <Painel tema={TEMA_USO} titulo="Acessos por dia" sub="páginas vistas (tooltip mostra usuários)" itens={porDia} metrica="n" horizontal={false} altura={240} dark={dark} />
            <Painel tema={TEMA_USO} titulo="Acessos por módulo" sub="1º segmento da rota" itens={porModulo} metrica="n" horizontal altura={Math.max(240, porModulo.length * 26 + 60)} dark={dark} />
          </div>

          {/* Por usuário */}
          <div style={{ ...card, marginBottom: '20px' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: '#1a1a1a' }}>
              <Users size={15} color="#dc2626" /> Por usuário
              <span style={{ fontSize: '11px', color: '#a3a3a3', fontWeight: 500 }}>— quem tem módulo e não usa aparece com zero</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Usuário', 'Função', 'Acessos', 'Páginas', 'Dias ativos', 'API (pessoa)', 'API (auto)', 'Página mais usada', 'Último acesso'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {dados.porUsuario.map((u) => (
                    <tr key={u.user_id} style={{ opacity: u.acessos === 0 ? 0.6 : 1 }}>
                      <td style={{ ...td, fontWeight: 600 }}>{u.nome}</td>
                      <td style={{ ...td, color: '#737373' }}>{u.funcao || '—'}</td>
                      <td style={td}>{n(u.acessos)}</td>
                      <td style={td}>{n(u.paginas)}</td>
                      <td style={td}>{n(u.diasAtivos)}</td>
                      <td style={td}>{n(u.chamadasApi)}</td>
                      <td style={{ ...td, color: '#a3a3a3' }}>{n(u.chamadasAuto)}</td>
                      <td style={{ ...td, fontFamily: 'monospace', fontSize: '12px' }}>{u.rotaTop || '—'}</td>
                      <td style={{ ...td, color: u.inativoHaDias != null && u.inativoHaDias >= 14 ? '#dc2626' : '#737373' }}>
                        {fmtQuando(u.ultimoAcesso)}{u.inativoHaDias != null && u.inativoHaDias >= 14 ? ` · inativo há ${u.inativoHaDias} d` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Por página */}
          <div style={{ ...card, marginBottom: '20px' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: '#1a1a1a' }}>
              <Globe size={15} color="#dc2626" /> Por página <span style={{ fontSize: '11px', color: '#a3a3a3', fontWeight: 500 }}>— ids e tokens viram [id]; query string nunca é gravada</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Rota', 'Módulo', 'Acessos', 'Usuários', 'Último acesso'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {dados.porPagina.slice(0, 80).map((p) => (
                    <tr key={p.rota}>
                      <td style={{ ...td, fontFamily: 'monospace', fontSize: '12px' }}>{p.rota}</td>
                      <td style={{ ...td, color: '#737373' }}>{p.modulo}</td>
                      <td style={td}>{n(p.acessos)}</td>
                      <td style={td}>{n(p.usuarios)}</td>
                      <td style={{ ...td, color: '#737373' }}>{fmtQuando(p.ultimo)}</td>
                    </tr>
                  ))}
                  {dados.porPagina.length === 0 && <tr><td style={{ ...td, color: '#a3a3a3' }} colSpan={5}>Nenhum acesso registrado no período.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* API */}
          <div style={card}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: '#1a1a1a', flexWrap: 'wrap' }}>
              <Activity size={15} color="#dc2626" /> Chamadas de API por rota
              <span style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
                {(['manuais', 'automaticas', 'todas'] as const).map((k) => (
                  <button key={k} onClick={() => setSoAuto(k)} style={{ ...inp, padding: '4px 10px', fontSize: '11px', cursor: 'pointer', fontWeight: 600, background: soAuto === k ? '#fef2f2' : '#fafafa', border: soAuto === k ? '1px solid #fecaca' : '1px solid #e5e5e5', color: soAuto === k ? '#dc2626' : '#737373' }}>
                    {k === 'manuais' ? 'Pessoa' : k === 'automaticas' ? 'Automáticas (polling)' : 'Todas'}
                  </button>
                ))}
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Rota', 'Chamadas', 'Usuários', 'Tipo'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {api.map((a) => (
                    <tr key={a.rota}>
                      <td style={{ ...td, fontFamily: 'monospace', fontSize: '12px' }}>{a.rota}</td>
                      <td style={td}>{n(a.chamadas)}</td>
                      <td style={td}>{n(a.usuarios)}</td>
                      <td style={{ ...td, color: a.automatica ? '#a3a3a3' : '#059669' }}>{a.automatica ? 'automática' : 'pessoa'}</td>
                    </tr>
                  ))}
                  {api.length === 0 && <tr><td style={{ ...td, color: '#a3a3a3' }} colSpan={4}>Nenhuma chamada registrada.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
