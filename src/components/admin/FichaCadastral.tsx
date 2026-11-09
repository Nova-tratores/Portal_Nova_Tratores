'use client'
// Aba "Ficha cadastral" do usuário no /admin (José, 09/11/2026). Os campos vêm de
// lib/admin/ficha-cadastral (mesma lista da impressão). Grava sozinho ~1s depois
// de parar de digitar, pela rota /api/admin/ficha-cadastral, que também manda ao RH.
// Níveis: Dev vê tudo; admin vê sem os sensíveis (cadeado); `eu` = a própria pessoa
// em Configurações → Minha ficha (tudo, menos salário).
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Printer, FileText, Plus, Trash2, Check, Loader2, AlertTriangle, HeartPulse, Lock, Building2 } from 'lucide-react'
import { SECOES, type Campo, type Dados, campoSensivel, campoVisivel, dataBR, htmlImpressao, idade, mascarar, progresso } from '@/lib/admin/ficha-cadastral'

type Estado = 'carregando' | 'pronto' | 'salvando' | 'salvo' | 'erro'
type Nivel = 'total' | 'parcial' | 'proprio'
interface ResumoRH { ligado: boolean; motivo?: string; empresa?: string; cargo?: string; departamento?: string; admissao?: string; contrato?: string; status?: string; matricula?: string; dependentes_irrf?: number; salario?: number | null; comissao?: number | null }

const novoId = () => Math.random().toString(36).slice(2, 10)
/** linhas de lista ganham um _id (o servidor casa por ele para não perder dados ocultos) */
function comIds(d: Dados): Dados {
  const o = { ...d }
  for (const s of SECOES) if (s.lista && Array.isArray(o[s.lista.k])) o[s.lista.k] = o[s.lista.k].map((l: Dados) => l._id ? l : { ...l, _id: novoId() })
  return o
}
const CAMPOS_RH: Record<string, string> = { cpf: 'CPF', rg: 'RG', data_nascimento: 'nascimento', sexo: 'sexo', estado_civil: 'estado civil', telefone: 'telefone', endereco: 'endereço', bairro: 'bairro', cidade: 'cidade', estado: 'UF', cep: 'CEP' }

async function token() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token || ''
}

function imprimir(d: Dados) {
  const w = window.open('', '_blank')
  if (!w) { alert('O navegador bloqueou a janela de impressão. Libere pop-ups para o portal.'); return }
  w.document.open()
  w.document.write(htmlImpressao(d, window.location.origin))
  w.document.close()
}

export default function FichaCadastral({ userId, eu, nome, cargo, email }: { userId?: string; eu?: boolean; nome: string; cargo?: string; email?: string }) {
  const [d, setD] = useState<Dados>({})
  const [nivel, setNivel] = useState<Nivel>('parcial')
  const [rh, setRh] = useState<ResumoRH | null>(null)
  const [rhEnvio, setRhEnvio] = useState<{ ok: boolean; campos: string[]; motivo?: string } | null>(null)
  const [estado, setEstado] = useState<Estado>('carregando')
  const [erro, setErro] = useState('')
  const [quando, setQuando] = useState<{ em: string | null; por: string | null }>({ em: null, por: null })
  const pendente = useRef<Dados | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refs = useRef<Record<string, HTMLElement | null>>({})

  useEffect(() => {
    let vivo = true
    setEstado('carregando'); setErro('')
    ;(async () => {
      try {
        const r = await fetch(`/api/admin/ficha-cadastral?${eu ? 'eu=1' : `user_id=${encodeURIComponent(userId || '')}`}`, { headers: { Authorization: `Bearer ${await token()}` } })
        const j = await r.json().catch(() => ({}))
        if (!vivo) return
        if (!r.ok) { setErro(j.error || 'Não deu para abrir a ficha'); setEstado('erro'); return }
        const dados: Dados = j.dados || {}
        // ficha nova: já começa com o que o portal sabe
        if (!Object.keys(dados).length) {
          if (nome) dados.nome_completo = nome
          if (cargo) dados.cargo = cargo
        }
        setD(comIds(dados)); setNivel(j.nivel || 'parcial'); setRh(j.rh || null); setQuando({ em: j.atualizado_em, por: j.atualizado_por_nome }); setEstado('pronto')
      } catch { if (vivo) { setErro('Sem conexão com o servidor'); setEstado('erro') } }
    })()
    return () => { vivo = false }
  }, [userId, eu, nome, cargo])

  const gravar = useCallback(async () => {
    const dados = pendente.current
    if (!dados) return
    pendente.current = null
    setEstado('salvando')
    try {
      const r = await fetch('/api/admin/ficha-cadastral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
        body: JSON.stringify(eu ? { eu: true, dados } : { user_id: userId, dados }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErro(j.error || 'Falha ao salvar'); setEstado('erro'); return }
      setErro(''); setQuando({ em: j.atualizado_em, por: j.atualizado_por_nome })
      if (j.rh) setRhEnvio((ant) => j.rh.ok && !j.rh.campos.length && ant?.campos.length ? ant : j.rh)
      setEstado(pendente.current ? 'salvando' : 'salvo')
    } catch { setErro('Sem conexão: a última mudança não foi salva'); setEstado('erro') }
  }, [userId, eu])

  // ao trocar de aba / fechar: grava o que faltou
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); if (pendente.current) gravar() }, [gravar])

  const mudar = (novo: Dados) => {
    setD(novo)
    pendente.current = novo
    setEstado('salvando')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(gravar, 900)
  }
  const set = (k: string, v: any) => mudar({ ...d, [k]: v })

  const buscarCep = async (cep: string) => {
    const n = cep.replace(/\D/g, '')
    if (n.length !== 8) return
    try {
      const r = await fetch(`https://viacep.com.br/ws/${n}/json/`)
      const j = await r.json()
      if (j.erro) return
      mudar({ ...d, cep: mascarar(n, 'cep'), rua: d.rua || j.logradouro || '', bairro: d.bairro || j.bairro || '', cidade: d.cidade || j.localidade || '', uf: d.uf || j.uf || '' })
    } catch { /* sem internet: preenche à mão */ }
  }

  if (estado === 'carregando') return <p className="fc-msg"><Loader2 size={16} className="fc-gira" /> Abrindo a ficha…</p>

  const verSens = nivel !== 'parcial'
  const prog = progresso(d, verSens)
  const pct = prog.total ? Math.round((prog.feitos / prog.total) * 100) : 0
  const filhos: Dados[] = Array.isArray(d.filhos) ? d.filhos : []

  const entrada = (c: Campo, valor: any, onV: (v: any) => void, chave: string) => {
    if (c.t === 'opcoes' || c.t === 'multi') {
      const lista: string[] = c.t === 'multi' ? (Array.isArray(valor) ? valor : []) : []
      return (
        <div className="fc-chips">
          {c.o!.map((o) => {
            const on = c.t === 'multi' ? lista.includes(o) : valor === o
            return (
              <button key={o} type="button" className={on ? 'on' : ''}
                onClick={() => c.t === 'multi' ? onV(on ? lista.filter((x) => x !== o) : [...lista, o]) : onV(on ? '' : o)}>
                {on && <Check size={12} />}{o}
              </button>
            )
          })}
        </div>
      )
    }
    if (c.t === 'longo') return <textarea id={chave} rows={3} value={valor || ''} placeholder={c.ph} onChange={(e) => onV(e.target.value)} />
    return (
      <input id={chave} type={c.t === 'data' ? 'date' : c.k.includes('email') ? 'email' : 'text'} inputMode={c.m ? 'numeric' : undefined}
        value={valor || ''} placeholder={c.ph}
        onChange={(e) => onV(c.m ? mascarar(e.target.value, c.m) : e.target.value)}
        onBlur={c.t === 'cep' ? (e) => buscarCep(e.target.value) : undefined} />
    )
  }

  return (
    <div className="fc">
      <style>{ESTILO}</style>

      {rh && (
        <div className={`fc-rh ${rh.ligado ? '' : 'off'}`}>
          <span className="fc-rh-ic"><Building2 size={16} /></span>
          {rh.ligado ? (
            <div className="fc-rh-tx">
              <b>Cadastro no RH{rh.empresa ? ` · ${rh.empresa}` : ''}</b>
              <div className="fc-rh-itens">
                {rh.cargo && <span><small>Cargo</small>{[rh.cargo, rh.departamento].filter(Boolean).join(' · ')}</span>}
                {rh.admissao && <span><small>Admissão</small>{dataBR(rh.admissao)}</span>}
                {rh.contrato && <span><small>Contrato</small>{rh.contrato.toUpperCase()}</span>}
                {rh.status && <span><small>Situação</small>{rh.status}</span>}
                {rh.matricula && <span><small>Matrícula</small>{rh.matricula}</span>}
                <span><small>Dependentes IRRF</small>{rh.dependentes_irrf ?? 0}</span>
                {nivel === 'total' && 'salario' in rh && <span className="dev"><small><Lock size={10} /> Salário (só Dev)</small>{rh.salario != null ? Number(rh.salario).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}</span>}
                {nivel === 'total' && rh.comissao != null && <span className="dev"><small><Lock size={10} /> Comissão (só Dev)</small>{rh.comissao}%</span>}
              </div>
              <small className="fc-rh-pe">
                {rhEnvio && !rhEnvio.ok ? <span className="err"><AlertTriangle size={12} /> Não foi para o RH: {rhEnvio.motivo}</span>
                  : rhEnvio?.campos.length ? <span className="ok"><Check size={12} /> Enviado ao RH: {rhEnvio.campos.map((c) => CAMPOS_RH[c] || c).join(', ')}</span>
                  : 'O que for preenchido aqui (documentos, nascimento, estado civil, telefone e endereço) vai sozinho para o RH.'}
              </small>
            </div>
          ) : (
            <div className="fc-rh-tx"><b>Sem cadastro no RH</b><small className="fc-rh-pe">{rh.motivo} A ficha fica salva só no portal.</small></div>
          )}
        </div>
      )}

      <div className="fc-topo">
        <div className="fc-prog">
          <div className="fc-prog-tx">
            <b>{pct}% preenchida</b>
            <small>{prog.feitos} de {prog.total} campos{filhos.length ? ` · ${filhos.length} filho${filhos.length > 1 ? 's' : ''}` : ''}</small>
          </div>
          <div className="fc-barra"><i style={{ width: `${pct}%` }} /></div>
          <small className={`fc-est ${estado}`}>
            {estado === 'salvando' ? <><Loader2 size={13} className="fc-gira" />salvando…</>
              : estado === 'erro' ? <><AlertTriangle size={13} />{erro}</>
              : quando.em ? <><Check size={13} />salva {new Date(quando.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}{quando.por ? ` por ${quando.por.split(' ')[0]}` : ''}</>
              : 'ainda não preenchida — grava sozinha ao digitar'}
          </small>
        </div>
        <div className="fc-bts">
          <button type="button" onClick={() => imprimir({ ...d, _atualizado_em: quando.em })}><Printer size={15} />Imprimir preenchida</button>
          <button type="button" onClick={() => imprimir({})}><FileText size={15} />Imprimir em branco</button>
        </div>
      </div>

      <nav className="fc-nav">
        {SECOES.map((s, i) => (
          <button key={s.id} type="button" onClick={() => refs.current[s.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{i + 1}. {s.titulo}</button>
        ))}
      </nav>

      {SECOES.map((s, i) => (
        <section key={s.id} className="fc-sec" ref={(el) => { refs.current[s.id] = el }}>
          <h4><span>{i + 1}</span>{s.titulo}{s.lista && Array.isArray(d[s.lista.k]) && d[s.lista.k].length ? <em>{d[s.lista.k].length}</em> : null}</h4>
          {s.nota && <p className="fc-nota">{s.nota}</p>}

          {s.campos && !verSens && s.sens && <p className="fc-tranca"><Lock size={14} />Dado sensível — só Dev vê e edita esta parte.</p>}
          {s.campos && (verSens || !s.sens) && (
            <div className="fc-grade">
              {!verSens && s.campos.some((c) => campoVisivel(c, d) && campoSensivel(s, c)) && <p className="fc-tranca pq"><Lock size={13} />{s.campos.filter((c) => campoVisivel(c, d) && campoSensivel(s, c)).map((c) => c.saude ? 'saúde' : c.l).filter((v, i, a) => a.indexOf(v) === i).join(', ')}: só Dev vê</p>}
              {s.campos.filter((c) => campoVisivel(c, d) && (verSens || !campoSensivel(s, c))).map((c, x, arr) => (
                <Fragment key={c.k}>
                  {c.saude && !arr[x - 1]?.saude && <p className="fc-sub"><HeartPulse size={14} />Saúde {s.id === 'familia' ? 'do(a) cônjuge' : ''}</p>}
                  <label className={`fc-campo w${c.w || 1}`} htmlFor={`fc-${c.k}`}>
                    <span>{c.l}{c.t === 'data' && /nascimento$/.test(c.k) && idade(d[c.k]) !== null ? <em> · {idade(d[c.k])} anos</em> : null}</span>
                    {entrada(c, d[c.k], (v) => set(c.k, v), `fc-${c.k}`)}
                  </label>
                </Fragment>
              ))}
            </div>
          )}

          {s.lista && (() => {
            const lk = s.lista.k
            const linhas: Dados[] = Array.isArray(d[lk]) ? d[lk] : []
            const setLinha = (j: number, k: string, v: any) => set(lk, linhas.map((l, x) => x === j ? { ...l, [k]: v } : l))
            return (
              <div className="fc-lista">
                {linhas.map((l, j) => {
                  const id = idade(l.nascimento)
                  return (
                    <div key={j} className="fc-linha">
                      <div className="fc-linha-cab">
                        <b>{l.nome || `${s.id === 'filhos' ? 'Filho(a)' : 'Dependente'} ${j + 1}`}</b>
                        {id !== null && <span className={`fc-idade ${s.id === 'filhos' && id <= 14 ? 'sf' : ''}`} title={s.id === 'filhos' && id <= 14 ? 'até 14 anos: pode ter salário-família' : undefined}>{id} anos · {dataBR(l.nascimento)}</span>}
                        <button type="button" className="fc-tira" onClick={() => { if (confirm('Tirar esta linha da ficha?')) set(lk, linhas.filter((_, x) => x !== j)) }} aria-label="Tirar"><Trash2 size={14} /></button>
                      </div>
                      <div className="fc-grade">
                        {s.lista!.colunas.filter((c) => verSens || !campoSensivel(s, c)).map((c, x, arr) => (
                          <Fragment key={c.k}>
                            {c.saude && !arr[x - 1]?.saude && <p className="fc-sub"><HeartPulse size={14} />Saúde de {String(l.nome || '').split(' ')[0] || (s.id === 'filhos' ? 'filho(a)' : 'dependente')}</p>}
                            <label className={`fc-campo w${c.w || 1}`} htmlFor={`fc-${lk}-${j}-${c.k}`}>
                              <span>{c.l}</span>
                              {entrada(c, l[c.k], (v) => setLinha(j, c.k, v), `fc-${lk}-${j}-${c.k}`)}
                            </label>
                          </Fragment>
                        ))}
                      </div>
                    </div>
                  )
                })}
                {!verSens && <p className="fc-tranca pq"><Lock size={13} />CPF e saúde de cada um: só Dev vê</p>}
                <button type="button" className="fc-add" onClick={() => set(lk, [...linhas, { _id: novoId() }])}><Plus size={15} />{s.lista.novo}</button>
              </div>
            )
          })()}
        </section>
      ))}

      <p className="fc-rodape">Dados pessoais (LGPD): {eu ? 'só você e a administração do portal veem esta ficha; documentos, saúde e banco, só a T.I.' : 'documentos, saúde, banco e salário só Dev vê; o restante, os administradores.'}{email ? ` Login: ${email}.` : ''}</p>
    </div>
  )
}

const ESTILO = `
@keyframes fcGira { to { transform: rotate(360deg) } } .fc-gira { animation: fcGira 1s linear infinite }
.fc { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; max-width: 1100px; min-width: 0 } .fc > * { min-width: 0 }
.fc-msg { display: flex; align-items: center; gap: 8px; color: #64748b; font-size: 14px; margin: 0 }
.fc-topo { display: flex; gap: 14px; align-items: center; justify-content: space-between; flex-wrap: wrap; border: 1px solid #e2e8f0; border-radius: 16px; padding: 14px 16px; background: #fefefe }
.fc-prog { display: grid; gap: 6px; flex: 1 1 280px; min-width: 0 }
.fc-prog-tx { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap } .fc-prog-tx b { font-size: 17px; font-weight: 600; color: #0f172a } .fc-prog-tx small { font-size: 12.5px; color: #64748b }
.fc-barra { height: 7px; border-radius: 99px; background: #f1f5f9; overflow: hidden } .fc-barra i { display: block; height: 100%; background: linear-gradient(90deg, #dc2626, #ef4444); border-radius: 99px; transition: width .4s }
.fc-est { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: #64748b } .fc-est.salvo { color: #059669 } .fc-est.erro { color: #dc2626 }
.fc-bts { display: flex; gap: 8px; flex-wrap: wrap }
.fc-bts button { display: inline-flex; align-items: center; gap: 7px; min-height: 40px; border: 1px solid #e2e8f0; background: #fefefe; border-radius: 999px; padding: 8px 14px; font-family: inherit; font-size: 13px; color: #334155; cursor: pointer }
.fc-bts button:first-child { background: #0f172a; border-color: #0f172a; color: #fefefe } .fc-bts button:hover { border-color: #0f172a }
.fc-nav { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: thin }
.fc-nav button { flex-shrink: 0; border: 1px solid #e2e8f0; background: #fefefe; border-radius: 999px; padding: 6px 12px; font-family: inherit; font-size: 12.5px; color: #475569; cursor: pointer; white-space: nowrap } .fc-nav button:hover { border-color: #94a3b8; color: #0f172a }
.fc-sec { border: 1px solid #e2e8f0; border-radius: 16px; padding: 14px 16px; background: #fefefe; scroll-margin-top: 8px; display: grid; gap: 10px }
.fc-sec h4 { margin: 0; display: flex; align-items: center; gap: 9px; font-size: 14.5px; font-weight: 600; color: #0f172a }
.fc-sec h4 span { width: 24px; height: 24px; border-radius: 8px; background: #fef2f2; color: #dc2626; display: grid; place-items: center; font-size: 12px }
.fc-sec h4 em { font-style: normal; font-size: 11.5px; background: #f1f5f9; color: #475569; border-radius: 99px; padding: 1px 8px; font-weight: 500 }
.fc-nota { margin: -4px 0 0; font-size: 12.5px; color: #64748b }
.fc-grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(210px, 100%), 1fr)); gap: 10px 12px }
.fc-campo { display: grid; gap: 4px; min-width: 0 } .fc-campo.w2 { grid-column: span 2 } .fc-campo.w3 { grid-column: 1 / -1 }
.fc-campo > span { font-size: 11px; text-transform: uppercase; letter-spacing: .4px; color: #64748b; font-weight: 500 } .fc-campo > span em { font-style: normal; text-transform: none; color: #dc2626 }
.fc-campo input, .fc-campo textarea { width: 100%; box-sizing: border-box; min-height: 40px; border: 1px solid #e2e8f0; border-radius: 10px; padding: 8px 11px; font-family: inherit; font-size: 14px; color: #0f172a; background: #fefefe; outline: none; transition: border-color .15s, box-shadow .15s }
.fc-campo textarea { resize: vertical } .fc-campo input:focus, .fc-campo textarea:focus { border-color: #dc2626; box-shadow: 0 0 0 3px rgba(220,38,38,.12) }
.fc-sub { grid-column: 1 / -1; margin: 6px 0 -2px; padding-top: 10px; border-top: 1px dashed #e2e8f0; display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; color: #dc2626 }
.fc-chips { display: flex; flex-wrap: wrap; gap: 6px }
.fc-chips button { display: inline-flex; align-items: center; gap: 5px; min-height: 36px; border: 1px solid #e2e8f0; background: #fefefe; border-radius: 999px; padding: 6px 12px; font-family: inherit; font-size: 13px; color: #334155; cursor: pointer; transition: all .15s }
.fc-chips button:hover { border-color: #94a3b8 } .fc-chips button.on { background: #dc2626; border-color: #dc2626; color: #fefefe }
.fc-lista { display: grid; gap: 10px }
.fc-linha { border: 1px solid #eef2f7; border-radius: 12px; padding: 10px 12px; display: grid; gap: 8px; background: #fbfcfd }
.fc-linha-cab { display: flex; align-items: center; gap: 10px; flex-wrap: wrap } .fc-linha-cab b { font-size: 13.5px; font-weight: 600; color: #0f172a; overflow-wrap: anywhere }
.fc-idade { font-size: 12px; background: #f1f5f9; color: #475569; border-radius: 99px; padding: 2px 9px } .fc-idade.sf { background: #ecfdf5; color: #047857 }
.fc-tira { margin-left: auto; width: 36px; height: 36px; border-radius: 50%; border: 1px solid #fecaca; background: #fff; color: #dc2626; display: grid; place-items: center; cursor: pointer }
.fc-add { justify-self: start; display: inline-flex; align-items: center; gap: 6px; min-height: 40px; border: 1px dashed #cbd5e1; background: none; border-radius: 999px; padding: 8px 14px; font-family: inherit; font-size: 13px; color: #334155; cursor: pointer } .fc-add:hover { border-color: #dc2626; color: #dc2626 }
.fc-rh { display: flex; gap: 12px; align-items: flex-start; border: 1px solid #e2e8f0; border-radius: 16px; padding: 12px 14px; background: #fefefe }
.fc-rh.off { background: #f8fafc } .fc-rh-ic { width: 32px; height: 32px; border-radius: 10px; background: #eff6ff; color: #1d4ed8; display: grid; place-items: center; flex-shrink: 0 } .fc-rh.off .fc-rh-ic { background: #f1f5f9; color: #94a3b8 }
.fc-rh-tx { display: grid; gap: 6px; min-width: 0; flex: 1 } .fc-rh-tx > b { font-size: 14px; font-weight: 600; color: #0f172a }
.fc-rh-itens { display: flex; flex-wrap: wrap; gap: 6px 18px } .fc-rh-itens span { display: grid; font-size: 13px; color: #0f172a; min-width: 0; overflow-wrap: anywhere } .fc-rh-itens small { font-size: 10.5px; text-transform: uppercase; letter-spacing: .4px; color: #94a3b8; display: inline-flex; align-items: center; gap: 3px }
.fc-rh-itens span.dev { color: #7c2d12 } .fc-rh-itens span.dev small { color: #c2410c }
.fc-rh-pe { font-size: 12px; color: #64748b } .fc-rh-pe span { display: inline-flex; align-items: center; gap: 4px } .fc-rh-pe .ok { color: #059669 } .fc-rh-pe .err { color: #dc2626 }
.fc-tranca { margin: 0; display: flex; align-items: center; gap: 7px; font-size: 13px; color: #64748b; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 10px; padding: 10px 12px } .fc-tranca.pq { grid-column: 1 / -1; font-size: 12px; padding: 6px 10px; order: 99 }
.fc-rodape { margin: 0; font-size: 12px; color: #94a3b8 }
@media (max-width: 520px) { .fc-campo.w2 { grid-column: 1 / -1 } .fc-sec, .fc-topo { padding: 12px } .fc-bts { width: 100% } .fc-bts button { flex: 1; justify-content: center } }
`
