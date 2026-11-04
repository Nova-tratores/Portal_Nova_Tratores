'use client'
// Ficha da função (organograma → Funções): missão, a quem responde, responsabilidades (que agrupam as
// tarefas das planilhas), autoridade, requisitos e indicadores. Admin edita, gera rascunho com IA e
// aprova; os demais leem. Imprimir abre a ficha numa janela limpa.
import { useState } from 'react'
import { X, Sparkles, Printer, Plus, Trash2, CheckCircle2 } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import { CATALOGO } from '@/lib/planta/regras'
import { nomeDaFicha, tarefasSoltas, type FichaFuncao, type Responsabilidade, type Indicador } from '@/lib/organograma/fichas'
import { ORIGENS, type TarefaOrg } from '@/lib/organograma/tarefas'
import type { PessoaOrg } from '@/lib/organograma/arvore'

const KPIS = Object.entries(CATALOGO).filter(([id]) => id !== 'robos').map(([id, d]) => ({ id, rotulo: d.rotulo }))
const card: React.CSSProperties = { background: 'var(--portal-bg-card)', borderRadius: '16px', border: '1px solid var(--portal-border)' }
const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: '8px', background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', color: 'var(--portal-text)', fontSize: '13px', fontFamily: 'Inter', outline: 'none', width: '100%', boxSizing: 'border-box' }
const rot: React.CSSProperties = { fontSize: 11, fontWeight: 800, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: 1, margin: '16px 0 6px' }
const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, fontFamily: 'Inter', cursor: 'pointer', border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text)' }

type Form = Pick<FichaFuncao, 'titulo' | 'setor' | 'missao' | 'responde_a' | 'responsabilidades' | 'autoridade' | 'requisitos' | 'indicadores' | 'cargo_rh'>
const doForm = (f: FichaFuncao): Form => ({
  titulo: f.titulo, setor: f.setor, missao: f.missao, responde_a: f.responde_a, cargo_rh: f.cargo_rh,
  responsabilidades: f.responsabilidades || [], autoridade: f.autoridade || [], requisitos: f.requisitos || [], indicadores: f.indicadores || [],
})
const linhas = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

function imprimir(f: FichaFuncao, form: Form, tarefas: TarefaOrg[], pessoas: string[], chefe: string | null) {
  const porId = new Map(tarefas.map((t) => [t.id, t]))
  const soltas = tarefasSoltas(form, tarefas)
  const resp = form.responsabilidades.map((r) => `<li><b>${esc(r.titulo)}</b>${r.descricao ? ` — ${esc(r.descricao)}` : ''}<ul>${r.tarefas.map((id) => porId.get(id)).filter(Boolean).map((t) => `<li>${esc(t!.acao)}${t!.frequencia || t!.quando ? ` <i>(${esc([t!.frequencia, t!.quando].filter(Boolean).join(' · '))})</i>` : ''}</li>`).join('')}</ul></li>`).join('')
  const lista = (xs: string[]) => xs.length ? `<ul>${xs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="vazio">—</p>'
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ficha — ${esc(nomeDaFicha({ funcao: f.funcao, titulo: form.titulo }))}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:28px;font-size:12.5px;line-height:1.45}h1{font-size:20px;margin:0}h2{font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#555;border-bottom:1px solid #ddd;padding-bottom:3px;margin:18px 0 6px}
.sub{color:#555;margin:2px 0 0}.selo{display:inline-block;font-size:11px;font-weight:bold;padding:2px 8px;border-radius:6px;background:${f.status === 'aprovada' ? '#dcfce7;color:#166534' : '#fef3c7;color:#92400e'}}ul{margin:4px 0;padding-left:20px}li{margin:2px 0}.vazio{color:#888}table{border-collapse:collapse}td{padding:2px 12px 2px 0;vertical-align:top}
@media print{body{margin:12mm}}</style></head><body>
<h1>${esc(nomeDaFicha({ funcao: f.funcao, titulo: form.titulo }))}</h1>
<p class="sub">Função nas listas: ${esc(f.funcao)} · <span class="selo">${f.status === 'aprovada' ? 'Aprovada' + (f.aprovado_em ? ' em ' + new Date(f.aprovado_em).toLocaleDateString('pt-BR') : '') : 'Rascunho'}</span></p>
<table style="margin-top:10px"><tr><td><b>Setor</b></td><td>${esc(form.setor || '—')}</td></tr><tr><td><b>Responde a</b></td><td>${esc(chefe || '—')}</td></tr>
<tr><td><b>Cargo no RH</b></td><td>${esc(form.cargo_rh || '—')}</td></tr><tr><td><b>Quem ocupa hoje</b></td><td>${esc(pessoas.join(', ') || '—')}</td></tr></table>
<h2>Missão</h2><p>${esc(form.missao || '—')}</p>
<h2>Responsabilidades</h2>${resp ? `<ul>${resp}</ul>` : '<p class="vazio">—</p>'}${soltas.length ? `<p class="vazio">Tarefas ainda sem responsabilidade: ${esc(soltas.map((t) => t.acao).join('; '))}</p>` : ''}
<h2>Autoridade</h2>${lista(form.autoridade)}
<h2>Requisitos</h2>${lista(form.requisitos)}
<h2>Indicadores</h2>${lista(form.indicadores.map((i) => i.texto + (i.kpi ? ` (Planta Viva: ${CATALOGO[i.kpi]?.rotulo || i.kpi})` : '')))}
<p class="vazio" style="margin-top:24px">Nova Tratores — impresso em ${new Date().toLocaleDateString('pt-BR')} pelo portal.</p>
<script>window.onload=function(){window.print()}</script></body></html>`
  const w = window.open('', '_blank')
  if (!w) return
  w.document.open(); w.document.write(html); w.document.close()
}

export default function FichaFuncaoJanela({ ficha, tarefas, pessoas, funcoes, podeEditar, fichasFaltando, onFechar, onSalvo }: {
  ficha: FichaFuncao; tarefas: TarefaOrg[]; pessoas: PessoaOrg[]; funcoes: FichaFuncao[]
  podeEditar: boolean; fichasFaltando: boolean
  onFechar: () => void; onSalvo: (patch: Partial<FichaFuncao>) => void
}) {
  const [form, setForm] = useState<Form>(() => doForm(ficha))
  const [base, setBase] = useState<string>(() => JSON.stringify(doForm(ficha)))
  const [rascunhoIa, setRascunhoIa] = useState(ficha.rascunho_ia)
  const [avisos, setAvisos] = useState<string[]>([])
  const [ocupado, setOcupado] = useState<'' | 'ia' | 'salvar' | 'aprovar'>('')
  const [msg, setMsg] = useState<{ ok: boolean; txt: string } | null>(null)
  const editar = podeEditar && !fichasFaltando
  const sujo = JSON.stringify(form) !== base
  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setForm((f) => ({ ...f, [k]: v })); setMsg(null) }
  const porId = new Map(tarefas.map((t) => [t.id, t]))
  const soltas = tarefasSoltas(form, tarefas)
  const nomesPessoas = ficha.pessoas.map((c) => pessoas.find((p) => p.chave === c)?.nome).filter(Boolean) as string[]
  const chefeNome = form.responde_a ? nomeDaFicha(funcoes.find((x) => x.funcao === form.responde_a) || { funcao: form.responde_a, titulo: null }) : null

  const moverTarefa = (id: number, destino: number) => {
    const rs = form.responsabilidades.map((r) => ({ ...r, tarefas: r.tarefas.filter((x) => x !== id) }))
    if (destino >= 0 && rs[destino]) rs[destino].tarefas.push(id)
    set('responsabilidades', rs)
  }
  const mudarResp = (i: number, m: Partial<Responsabilidade>) => set('responsabilidades', form.responsabilidades.map((r, j) => (j === i ? { ...r, ...m } : r)))
  const mudarInd = (i: number, m: Partial<Indicador>) => set('indicadores', form.indicadores.map((r, j) => (j === i ? { ...r, ...m } : r)))

  const gerar = async () => {
    if (sujo || form.missao || form.responsabilidades.length) {
      if (!window.confirm('O rascunho da IA vai substituir o que está na ficha (você ainda revisa antes de salvar). Continuar?')) return
    }
    setOcupado('ia'); setMsg(null); setAvisos([])
    try {
      const r = await fetch('/api/organograma/funcoes/rascunho', { method: 'POST', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify({ funcao: ficha.funcao }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `Erro ${r.status}`)
      setForm((f) => ({ ...f, ...Object.fromEntries(Object.entries(j.ficha).filter(([, v]) => v !== null && v !== undefined)) }))
      setRascunhoIa(!!j.ia)
      setAvisos(j.avisos || [])
      setMsg({ ok: true, txt: j.ia ? 'Rascunho pronto — revise e salve.' : 'Rascunho simples (sem IA) — revise e salve.' })
    } catch (e) { setMsg({ ok: false, txt: (e as Error).message }) } finally { setOcupado('') }
  }
  const enviar = async (corpo: Record<string, unknown>, tipo: 'salvar' | 'aprovar') => {
    setOcupado(tipo); setMsg(null)
    try {
      const r = await fetch('/api/organograma/funcoes', { method: 'PATCH', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify({ funcao: ficha.funcao, ...corpo }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `Erro ${r.status}`)
      onSalvo(j.patch)
      if (tipo === 'salvar') setBase(JSON.stringify(form))
      setMsg({ ok: true, txt: tipo === 'aprovar' ? 'Ficha aprovada ✓' : 'Salvo ✓ (rascunho)' })
    } catch (e) { setMsg({ ok: false, txt: (e as Error).message }) } finally { setOcupado('') }
  }

  const listaCampo = (campo: 'autoridade' | 'requisitos', rotulo: string, dica: string) => (
    <>
      <div style={rot}>{rotulo}</div>
      {editar
        ? <textarea key={form[campo].join('|')} defaultValue={form[campo].join('\n')} onBlur={(e) => set(campo, linhas(e.target.value))} rows={Math.max(3, form[campo].length + 1)} placeholder={dica} style={{ ...inp, resize: 'vertical' }} />
        : form[campo].length ? <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{form[campo].map((x) => <li key={x}>{x}</li>)}</ul> : <p style={{ fontSize: 13, color: 'var(--portal-text-muted)', margin: 0 }}>—</p>}
    </>
  )

  return (
    <div onClick={onFechar} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 'min(820px, 100%)', padding: '20px 22px', color: 'var(--portal-text)' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{nomeDaFicha({ funcao: ficha.funcao, titulo: form.titulo })}</h3>
            <p style={{ fontSize: 12, color: 'var(--portal-text-muted)', margin: '2px 0 0' }}>
              Função nas listas: <strong>{ficha.funcao}</strong> · {tarefas.length} tarefas · ocupada por {nomesPessoas.join(', ') || 'ninguém ainda (aba Funções)'}
            </p>
          </div>
          <span style={{ fontSize: 12, fontWeight: 800, padding: '4px 10px', borderRadius: 8, background: ficha.status === 'aprovada' ? '#dcfce7' : '#fef3c7', color: ficha.status === 'aprovada' ? '#166534' : '#92400e' }}>
            {ficha.status === 'aprovada' ? `Aprovada${ficha.aprovado_em ? ' em ' + new Date(ficha.aprovado_em).toLocaleDateString('pt-BR') : ''}` : 'Rascunho'}
          </span>
          <button onClick={() => imprimir(ficha, form, tarefas, nomesPessoas, chefeNome)} style={btn} title="Imprimir / salvar em PDF"><Printer size={14} /> Imprimir</button>
          <button onClick={onFechar} aria-label="Fechar" style={{ ...btn, padding: 8 }}><X size={16} /></button>
        </div>

        {fichasFaltando && <div style={{ marginTop: 12, background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '8px 12px', fontSize: 12, color: '#92400e' }}>Para salvar a ficha falta aplicar <code>sql/organograma-fichas.sql</code> no Supabase.</div>}

        {editar && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 14, padding: 10, borderRadius: 10, background: 'var(--portal-bg-secondary)' }}>
            <button onClick={gerar} disabled={!!ocupado} style={{ ...btn, background: '#7c3aed', color: '#fff', border: 'none' }}><Sparkles size={14} /> {ocupado === 'ia' ? 'Gerando…' : 'Gerar rascunho com IA'}</button>
            <button onClick={() => enviar({ ...form, rascunho_ia: rascunhoIa }, 'salvar')} disabled={!!ocupado || !sujo} style={{ ...btn, background: '#0369A1', color: '#fff', border: 'none', opacity: !sujo ? 0.5 : 1 }}>{ocupado === 'salvar' ? 'Salvando…' : 'Salvar'}</button>
            <button onClick={() => enviar({ acao: 'aprovar' }, 'aprovar')} disabled={!!ocupado || sujo || ficha.status === 'aprovada'} title={sujo ? 'Salve antes de aprovar' : ''} style={{ ...btn, opacity: sujo || ficha.status === 'aprovada' ? 0.5 : 1 }}><CheckCircle2 size={14} /> Aprovar</button>
            {msg && <span style={{ fontSize: 12, fontWeight: 700, color: msg.ok ? '#047857' : '#b91c1c' }}>{msg.txt}</span>}
            {!msg && sujo && <span style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>alterações não salvas</span>}
          </div>
        )}
        {avisos.length > 0 && (
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: '#92400e' }}>{avisos.map((a) => <li key={a}>{a}</li>)}</ul>
        )}
        {rascunhoIa && <p style={{ fontSize: 11.5, color: 'var(--portal-text-muted)', margin: '8px 0 0' }}>Texto rascunhado pela IA a partir das tarefas. Itens com [VALIDAR] são dedução — confirme ou apague.</p>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginTop: 6 }}>
          {([['titulo', 'Nome da função'], ['setor', 'Setor'], ['cargo_rh', 'Cargo no RH']] as const).map(([k, l]) => (
            <label key={k} style={{ fontSize: 12, fontWeight: 700 }}>
              <div style={rot}>{l}</div>
              {editar ? <input value={form[k] || ''} onChange={(e) => set(k, e.target.value || null)} style={inp} /> : <div style={{ fontSize: 13, fontWeight: 400 }}>{form[k] || '—'}</div>}
            </label>
          ))}
          <label style={{ fontSize: 12, fontWeight: 700 }}>
            <div style={rot}>Responde a</div>
            {editar ? (
              <select value={form.responde_a || ''} onChange={(e) => set('responde_a', e.target.value || null)} style={inp}>
                <option value="">—</option>
                {funcoes.filter((x) => x.funcao !== ficha.funcao && x.tipo !== 'grupo').map((x) => <option key={x.funcao} value={x.funcao}>{nomeDaFicha(x)}</option>)}
              </select>
            ) : <div style={{ fontSize: 13, fontWeight: 400 }}>{chefeNome || '—'}</div>}
          </label>
        </div>

        <div style={rot}>Missão</div>
        {editar
          ? <textarea value={form.missao || ''} onChange={(e) => set('missao', e.target.value || null)} rows={2} placeholder="Para que essa função existe — o resultado que entrega" style={{ ...inp, resize: 'vertical' }} />
          : <p style={{ fontSize: 13.5, margin: 0 }}>{form.missao || '—'}</p>}

        <div style={rot}>Responsabilidades e tarefas</div>
        {form.responsabilidades.map((r, i) => (
          <div key={i} style={{ border: '1px solid var(--portal-border)', borderRadius: 10, padding: 10, marginBottom: 8 }}>
            {editar ? (
              <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <input value={r.titulo} onChange={(e) => mudarResp(i, { titulo: e.target.value })} style={{ ...inp, fontWeight: 700 }} />
                <button onClick={() => set('responsabilidades', form.responsabilidades.filter((_, j) => j !== i))} title="Tirar (as tarefas voltam para 'sem responsabilidade')" style={{ ...btn, padding: 8 }}><Trash2 size={14} /></button>
              </div>
            ) : <div style={{ fontWeight: 800, fontSize: 13.5 }}>{r.titulo}</div>}
            {editar
              ? <input value={r.descricao} onChange={(e) => mudarResp(i, { descricao: e.target.value })} placeholder="O que entrega (1 frase)" style={{ ...inp, marginBottom: 6 }} />
              : r.descricao && <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted)', marginBottom: 4 }}>{r.descricao}</div>}
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>
              {r.tarefas.map((id) => porId.get(id)).filter(Boolean).map((t) => (
                <li key={t!.id} style={{ padding: '2px 0' }}>
                  {t!.acao}
                  {(t!.frequencia || t!.quando) && <span style={{ color: 'var(--portal-text-muted)' }}> — {[t!.frequencia, t!.quando].filter(Boolean).join(' · ')}</span>}
                  {editar && (
                    <select value={i} onChange={(e) => moverTarefa(t!.id, Number(e.target.value))} style={{ ...inp, width: 'auto', padding: '1px 4px', fontSize: 11, marginLeft: 6 }} title="Mover para outra responsabilidade">
                      {form.responsabilidades.map((x, j) => <option key={j} value={j}>{x.titulo.slice(0, 30)}</option>)}
                      <option value={-1}>sem responsabilidade</option>
                    </select>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {editar && <button onClick={() => set('responsabilidades', [...form.responsabilidades, { titulo: 'Nova responsabilidade', descricao: '', tarefas: [] }])} style={{ ...btn, fontSize: 12 }}><Plus size={13} /> Responsabilidade</button>}
        {soltas.length > 0 && (
          <div style={{ marginTop: 8, padding: 10, borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#92400e', marginBottom: 4 }}>{soltas.length} tarefa(s) sem responsabilidade</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: '#1a1a1a' }}>
              {soltas.map((t) => (
                <li key={t.id} style={{ padding: '2px 0' }}>
                  {t.acao} <span style={{ color: '#92400e', fontSize: 11 }}>({ORIGENS[t.origem]?.split(' (')[0] || t.origem})</span>
                  {editar && form.responsabilidades.length > 0 && (
                    <select value="" onChange={(e) => e.target.value !== '' && moverTarefa(t.id, Number(e.target.value))} style={{ ...inp, width: 'auto', padding: '1px 4px', fontSize: 11, marginLeft: 6 }}>
                      <option value="">pôr em…</option>
                      {form.responsabilidades.map((x, j) => <option key={j} value={j}>{x.titulo.slice(0, 30)}</option>)}
                    </select>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {listaCampo('autoridade', 'Autoridade', 'Uma por linha. Ex.: Envia garantia sem aprovação\nPrecisa do gerente para desconto acima de 5%')}
        {listaCampo('requisitos', 'Requisitos', 'Uma por linha. Ex.: Saber usar o portal de garantias da Mahindra')}

        <div style={rot}>Indicadores</div>
        {form.indicadores.map((ind, i) => (
          editar ? (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
              <input value={ind.texto} onChange={(e) => mudarInd(i, { texto: e.target.value })} placeholder="Como medir se vai bem" style={{ ...inp, flex: '2 1 240px' }} />
              <select value={ind.kpi || ''} onChange={(e) => mudarInd(i, { kpi: e.target.value || null })} style={{ ...inp, flex: '1 1 200px' }} title="Número que o portal já mede (Planta Viva)">
                <option value="">— sem número do portal —</option>
                {KPIS.map((k) => <option key={k.id} value={k.id}>{k.rotulo}</option>)}
              </select>
              <button onClick={() => set('indicadores', form.indicadores.filter((_, j) => j !== i))} style={{ ...btn, padding: 8 }}><Trash2 size={14} /></button>
            </div>
          ) : (
            <div key={i} style={{ fontSize: 13, padding: '2px 0' }}>• {ind.texto}{ind.kpi && <span style={{ fontSize: 11, marginLeft: 6, padding: '1px 6px', borderRadius: 6, background: '#e0f2fe', color: '#075985' }}>Planta Viva: {CATALOGO[ind.kpi]?.rotulo || ind.kpi}</span>}</div>
          )
        ))}
        {!form.indicadores.length && !editar && <p style={{ fontSize: 13, color: 'var(--portal-text-muted)', margin: 0 }}>—</p>}
        {editar && <button onClick={() => set('indicadores', [...form.indicadores, { texto: '', kpi: null }])} style={{ ...btn, fontSize: 12 }}><Plus size={13} /> Indicador</button>}
      </div>
    </div>
  )
}
