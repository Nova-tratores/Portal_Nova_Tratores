'use client'
// =============================================
// DEV → ENVIOS DE E-MAIL
// Configura, no banco (email_envios_config), os relatórios que o portal manda
// por e-mail (PPV relação, DRE lista…): ligado/desligado, destinatários, cc,
// bcc e parâmetros. "Enviar agora" dispara pros configurados; "Enviar teste"
// manda só pro e-mail informado. Histórico em email_envios_log. SÓ Dev.
// =============================================
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { authHeaders } from '@/lib/auth/client'
import { MailCheck, RefreshCw, Save, Send, FlaskConical, AlertTriangle, CheckCircle2, XCircle, Clock } from 'lucide-react'

interface EnvioDef { chave: string; nome: string; descricao: string; agenda: string; workflow: string; rota: string; parametros: { k: string; label: string; tipo: 'number' | 'text'; padrao: string | number; ajuda?: string }[] }
interface ConfigEnvio { chave: string; ativo: boolean; to: string[]; cc: string[]; bcc: string[]; parametros: Record<string, unknown>; atualizadoEm?: string | null; atualizadoPor?: string | null; padrao: boolean; migrationFaltando: boolean }
interface LogLinha { id: number; chave: string; origem: string; ok: boolean; motivo: string | null; assunto: string | null; destinatarios: string[]; total: number | null; usuario: string | null; criado_em: string }
interface Painel { gmailConfigurado: boolean; gmailUser: string | null; migrationFaltando: boolean; itens: { def: EnvioDef; config: ConfigEnvio }[]; log: LogLinha[] }

interface FormEnvio { ativo: boolean; to: string; cc: string; bcc: string; parametros: Record<string, string>; teste: string }

const fmtData = (iso: string) => { try { return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) } catch { return iso } }

const card: React.CSSProperties = { background: 'var(--portal-bg-card, #fff)', border: '1px solid var(--portal-border, #e5e7eb)', borderRadius: 12, padding: 18 }
const lbl: React.CSSProperties = { display: 'block', fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--portal-text-secondary, #64748b)', marginBottom: 4 }
const input: React.CSSProperties = { width: '100%', padding: '9px 11px', fontSize: 14, borderRadius: 8, border: '1px solid var(--portal-border, #e5e7eb)', background: 'var(--portal-bg, #fff)', color: 'var(--portal-text, #1e293b)', outline: 'none', fontFamily: 'inherit' }
const btn = (cor: string, fundo: string, borda?: string): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 14px', borderRadius: 8, border: `1px solid ${borda || fundo}`, background: fundo, color: cor, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' })

function EnviosEmailInner() {
  const [painel, setPainel] = useState<Painel | null>(null)
  const [erro, setErro] = useState('')
  const [forms, setForms] = useState<Record<string, FormEnvio>>({})
  const [ocupado, setOcupado] = useState<Record<string, string>>({}) // chave -> 'salvando' | 'enviando' | 'teste'
  const [aviso, setAviso] = useState<Record<string, { ok: boolean; msg: string }>>({})

  const carregar = useCallback(async () => {
    setErro('')
    try {
      const r = await fetch('/api/dev/envios-email', { headers: await authHeaders(), cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) { setErro(d.error || `HTTP ${r.status}`); return }
      setPainel(d)
      const f: Record<string, FormEnvio> = {}
      for (const it of d.itens as Painel['itens']) {
        const params: Record<string, string> = {}
        for (const p of it.def.parametros) params[p.k] = String(it.config.parametros?.[p.k] ?? p.padrao ?? '')
        f[it.def.chave] = { ativo: it.config.ativo, to: it.config.to.join(', '), cc: it.config.cc.join(', '), bcc: it.config.bcc.join(', '), parametros: params, teste: '' }
      }
      setForms(f)
    } catch (e) { setErro(e instanceof Error ? e.message : 'erro ao carregar') }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const setForm = (chave: string, patch: Partial<FormEnvio>) => setForms((f) => ({ ...f, [chave]: { ...f[chave], ...patch } }))

  const salvar = async (it: Painel['itens'][number]) => {
    const f = forms[it.def.chave]; if (!f) return
    setOcupado((o) => ({ ...o, [it.def.chave]: 'salvando' }))
    try {
      const parametros: Record<string, unknown> = {}
      for (const p of it.def.parametros) parametros[p.k] = p.tipo === 'number' ? Number(f.parametros[p.k]) || p.padrao : f.parametros[p.k]
      const r = await fetch('/api/dev/envios-email', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ chave: it.def.chave, ativo: f.ativo, to: f.to, cc: f.cc, bcc: f.bcc, parametros }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setAviso((a) => ({ ...a, [it.def.chave]: { ok: true, msg: 'Configuração salva.' } }))
      await carregar()
    } catch (e) { setAviso((a) => ({ ...a, [it.def.chave]: { ok: false, msg: e instanceof Error ? e.message : 'erro' } })) }
    finally { setOcupado((o) => ({ ...o, [it.def.chave]: '' })) }
  }

  const disparar = async (it: Painel['itens'][number], teste: boolean) => {
    const f = forms[it.def.chave]; if (!f) return
    if (teste && !f.teste.trim()) { setAviso((a) => ({ ...a, [it.def.chave]: { ok: false, msg: 'Informe o e-mail de teste.' } })); return }
    if (!teste && !window.confirm(`Enviar "${it.def.nome}" AGORA para os destinatários configurados?\n\n${f.to || '(nenhum destinatário — salve antes)'}`)) return
    setOcupado((o) => ({ ...o, [it.def.chave]: teste ? 'teste' : 'enviando' }))
    try {
      const r = await fetch('/api/dev/envios-email/disparar', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ chave: it.def.chave, teste: teste ? f.teste : '' }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      const res = d.resultado || {}
      const okEmail = res.email?.ok ?? (Array.isArray(res.resultados) ? res.resultados.every((x: { email?: { ok?: boolean } }) => x.email?.ok) : !res.pulado)
      const motivo = res.email?.erro || res.email?.motivo || res.motivo || (Array.isArray(res.resultados) ? res.resultados.map((x: { email?: { erro?: string; motivo?: string }; motivo?: string }) => x.email?.erro || x.email?.motivo || x.motivo).filter(Boolean).join('; ') : '')
      setAviso((a) => ({ ...a, [it.def.chave]: okEmail ? { ok: true, msg: `Enviado${teste ? ' (teste)' : ''}${res.total != null ? ` · ${res.total} registro(s)` : ''}.` } : { ok: false, msg: `Não enviado: ${motivo || 'falha'}` } }))
      await carregar()
    } catch (e) { setAviso((a) => ({ ...a, [it.def.chave]: { ok: false, msg: e instanceof Error ? e.message : 'erro' } })) }
    finally { setOcupado((o) => ({ ...o, [it.def.chave]: '' })) }
  }

  const nomeDe = (chave: string) => painel?.itens.find((i) => i.def.chave === chave)?.def.nome || chave

  return (
    <div style={{ padding: '24px 28px 60px', maxWidth: 1240, margin: '0 auto', color: 'var(--portal-text, #1e293b)', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}><MailCheck size={22} style={{ color: '#dc2626' }} /> Envios de e-mail <span style={{ fontSize: 11, fontWeight: 800, background: '#111111', color: '#fefefe', padding: '2px 8px', borderRadius: 999 }}>DEV</span></h1>
          <p style={{ margin: '4px 0 0', fontSize: 13.5, color: 'var(--portal-text-secondary, #64748b)' }}>Relatórios que o portal manda por e-mail. A configuração fica no banco (não no Railway): ligado/desligado, destinatários e parâmetros. O horário de cada um é o cron do GitHub Actions.</p>
        </div>
        <button type="button" onClick={carregar} style={btn('var(--portal-text, #1e293b)', 'var(--portal-bg-card, #fff)', 'var(--portal-border, #e5e7eb)')}><RefreshCw size={14} /> Atualizar</button>
      </div>

      {erro && <div style={{ ...card, borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c', marginBottom: 14 }}>{erro}</div>}
      {painel?.migrationFaltando && (
        <div style={{ ...card, borderColor: '#fcd34d', background: '#fffbeb', color: '#92400e', marginBottom: 14, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
          <div><b>Migration pendente.</b> As tabelas <code>email_envios_config</code> / <code>email_envios_log</code> ainda não existem. Rode <code>sql/email-envios-config.sql</code> no SQL Editor do Supabase. Até lá nada pode ser salvo e os crons ficam desligados.</div>
        </div>
      )}
      {painel && (
        <div style={{ ...card, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', fontSize: 13.5 }}>
          {painel.gmailConfigurado ? <CheckCircle2 size={18} style={{ color: '#047857' }} /> : <XCircle size={18} style={{ color: '#b91c1c' }} />}
          <span>Remetente (Gmail): {painel.gmailConfigurado ? <b>{painel.gmailUser}</b> : <b style={{ color: '#b91c1c' }}>não configurado no servidor (GMAIL_USER / GMAIL_APP_PASSWORD)</b>}</span>
        </div>
      )}

      {!painel && !erro && <div style={{ color: 'var(--portal-text-secondary)', padding: 30, textAlign: 'center' }}>Carregando…</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: 14 }}>
        {painel?.itens.map((it) => {
          const f = forms[it.def.chave]; if (!f) return null
          const oc = ocupado[it.def.chave] || ''
          const av = aviso[it.def.chave]
          const ultimo = painel.log.find((l) => l.chave === it.def.chave)
          return (
            <div key={it.def.chave} style={{ ...card, borderLeft: `5px solid ${f.ativo ? '#047857' : '#9ca3af'}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{it.def.nome}</div>
                  <div style={{ fontSize: 13, color: 'var(--portal-text-secondary, #64748b)', marginTop: 3 }}>{it.def.descricao}</div>
                  <div style={{ fontSize: 12, color: 'var(--portal-text-muted, #94a3b8)', marginTop: 5, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Clock size={12} /> {it.def.agenda} · <code style={{ fontSize: 11 }}>{it.def.workflow}</code> · <code style={{ fontSize: 11 }}>{it.def.rota}</code>
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: f.ativo ? '#047857' : 'var(--portal-text-secondary)' , whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={f.ativo} onChange={(e) => setForm(it.def.chave, { ativo: e.target.checked })} style={{ width: 18, height: 18, accentColor: '#047857' }} />
                  {f.ativo ? 'Ligado' : 'Desligado'}
                </label>
              </div>

              <div>
                <label style={lbl}>Para (separe por vírgula)</label>
                <input style={input} value={f.to} onChange={(e) => setForm(it.def.chave, { to: e.target.value })} placeholder="email@empresa.com, outro@empresa.com" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={lbl}>Cc</label><input style={input} value={f.cc} onChange={(e) => setForm(it.def.chave, { cc: e.target.value })} placeholder="opcional" /></div>
                <div><label style={lbl}>Cco (bcc)</label><input style={input} value={f.bcc} onChange={(e) => setForm(it.def.chave, { bcc: e.target.value })} placeholder="opcional" /></div>
              </div>
              {it.def.parametros.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                  {it.def.parametros.map((p) => (
                    <div key={p.k}>
                      <label style={lbl} title={p.ajuda}>{p.label}</label>
                      <input style={input} type={p.tipo === 'number' ? 'number' : 'text'} value={f.parametros[p.k] ?? ''} onChange={(e) => setForm(it.def.chave, { parametros: { ...f.parametros, [p.k]: e.target.value } })} />
                      {p.ajuda && <div style={{ fontSize: 11.5, color: 'var(--portal-text-muted, #94a3b8)', marginTop: 3 }}>{p.ajuda}</div>}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button type="button" disabled={!!oc || painel.migrationFaltando} onClick={() => salvar(it)} style={{ ...btn('#fefefe', '#dc2626'), opacity: oc || painel.migrationFaltando ? 0.6 : 1 }}><Save size={14} /> {oc === 'salvando' ? 'Salvando…' : 'Salvar'}</button>
                <button type="button" disabled={!!oc} onClick={() => disparar(it, false)} title="Envia agora pros destinatários SALVOS (ignora o ligado/desligado)" style={{ ...btn('#fefefe', '#111111'), opacity: oc ? 0.6 : 1 }}><Send size={14} /> {oc === 'enviando' ? 'Enviando…' : 'Enviar agora'}</button>
                <div style={{ flex: 1 }} />
                <input style={{ ...input, width: 230 }} value={f.teste} onChange={(e) => setForm(it.def.chave, { teste: e.target.value })} placeholder="e-mail de teste" />
                <button type="button" disabled={!!oc} onClick={() => disparar(it, true)} title="Manda só pro e-mail de teste (não usa os destinatários configurados)" style={{ ...btn('var(--portal-text, #1e293b)', 'var(--portal-bg-card, #fff)', 'var(--portal-border, #e5e7eb)'), opacity: oc ? 0.6 : 1 }}><FlaskConical size={14} /> {oc === 'teste' ? 'Enviando…' : 'Enviar teste'}</button>
              </div>

              {av && <div style={{ fontSize: 13, fontWeight: 600, color: av.ok ? '#047857' : '#b91c1c' }}>{av.msg}</div>}
              <div style={{ fontSize: 12, color: 'var(--portal-text-muted, #94a3b8)', borderTop: '1px dashed var(--portal-border, #e5e7eb)', paddingTop: 8 }}>
                {it.config.padrao ? 'Ainda não salvo no banco' : `Salvo em ${it.config.atualizadoEm ? fmtData(it.config.atualizadoEm) : '—'}${it.config.atualizadoPor ? ` por ${it.config.atualizadoPor}` : ''}`}
                {' · '}Último envio: {ultimo ? `${fmtData(ultimo.criado_em)} (${ultimo.origem}) — ${ultimo.ok ? 'OK' : `falhou: ${ultimo.motivo || '?'}`}` : 'nenhum'}
              </div>
            </div>
          )
        })}
      </div>

      {painel && (
        <div style={{ ...card, marginTop: 18, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', fontSize: 14, fontWeight: 800, borderBottom: '1px solid var(--portal-border, #e5e7eb)' }}>Histórico de envios (últimos {painel.log.length})</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--portal-bg-secondary, #f8fafc)' }}>
                  {['Quando', 'Envio', 'Origem', 'Resultado', 'Destinatários', 'Registros', 'Quem'].map((h) => <th key={h} style={{ textAlign: 'left', padding: '9px 14px', fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--portal-text-secondary, #64748b)', whiteSpace: 'nowrap' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {painel.log.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--portal-text-muted, #94a3b8)' }}>Nenhum envio registrado ainda.</td></tr>
                ) : painel.log.map((l) => (
                  <tr key={l.id} style={{ borderTop: '1px solid var(--portal-border, #e5e7eb)' }}>
                    <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>{fmtData(l.criado_em)}</td>
                    <td style={{ padding: '9px 14px' }}>{nomeDe(l.chave)}{l.assunto ? <div style={{ fontSize: 11.5, color: 'var(--portal-text-muted, #94a3b8)' }}>{l.assunto}</div> : null}</td>
                    <td style={{ padding: '9px 14px' }}><span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: l.origem === 'cron' ? '#e0e7ff' : l.origem === 'teste' ? '#fef3c7' : '#dcfce7', color: l.origem === 'cron' ? '#3730a3' : l.origem === 'teste' ? '#92400e' : '#166534' }}>{l.origem}</span></td>
                    <td style={{ padding: '9px 14px', fontWeight: 700, color: l.ok ? '#047857' : '#b91c1c', whiteSpace: 'nowrap' }}>{l.ok ? 'Enviado' : `Falhou · ${l.motivo || '?'}`}</td>
                    <td style={{ padding: '9px 14px', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={(l.destinatarios || []).join(', ')}>{(l.destinatarios || []).join(', ') || '—'}</td>
                    <td style={{ padding: '9px 14px' }}>{l.total ?? '—'}</td>
                    <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>{l.usuario || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default function EnviosEmailPage() {
  const { userProfile } = useAuth()
  const { isDev, loading } = usePermissoes(userProfile?.id)
  if (!loading && userProfile && !isDev) return <SemPermissao />
  if (loading || !userProfile) return null
  return <EnviosEmailInner />
}
