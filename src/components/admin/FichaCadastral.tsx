'use client'
// Aba "Ficha cadastral" do usuário no /admin (José, 09/11/2026). Os campos vêm de
// lib/admin/ficha-cadastral (mesma lista da impressão). Nada muda sozinho: quem edita
// clica em "Enviar para o Diretor autorizar"; só depois que ele autoriza a ficha muda
// (e vai ao RH). Se quem edita é o Diretor, salva direto (mesmo esquema da comissão).
// Níveis: Dev vê tudo; admin vê sem os sensíveis (cadeado); `eu` = a própria pessoa
// em Configurações → Minha ficha (tudo, menos salário).
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Printer, FileText, Plus, Trash2, Check, Loader2, AlertTriangle, HeartPulse, Lock, Building2, Send, Undo2, Hourglass, ChevronDown } from 'lucide-react'
import { SECOES, type Campo, type Dados, campoSensivel, campoVisivel, dataBR, htmlImpressao, idade, listarMudancas, mascarar, progresso, type Mudanca } from '@/lib/admin/ficha-cadastral'

type Estado = 'carregando' | 'pronto' | 'enviando' | 'erro'
type Nivel = 'total' | 'parcial' | 'proprio'
interface ResumoRH { ligado: boolean; motivo?: string; empresa?: string; cargo?: string; departamento?: string; admissao?: string; contrato?: string; status?: string; matricula?: string; dependentes_irrf?: number; salario?: number | null; comissao?: number | null }
interface Pendente { id: number; criado_em: string; atualizado_em: string; pedido_por_nome: string | null; mudancas: Mudanca[] }

const novoId = () => Math.random().toString(36).slice(2, 10)
/** linhas de lista ganham um _id (o servidor casa por ele para não perder dados ocultos) */
function comIds(d: Dados): Dados {
  const o = { ...d }
  for (const s of SECOES) if (s.lista && Array.isArray(o[s.lista.k])) o[s.lista.k] = o[s.lista.k].map((l: Dados) => l._id ? l : { ...l, _id: novoId() })
  return o
}
/** "há 1 ano e 3 meses" a partir da admissão */
function tempoDeCasa(iso: string) {
  const a = new Date(iso), h = new Date()
  if (isNaN(a.getTime())) return ''
  let m = (h.getFullYear() - a.getFullYear()) * 12 + (h.getMonth() - a.getMonth())
  if (h.getDate() < a.getDate()) m--
  if (m < 1) return 'menos de 1 mês'
  const anos = Math.floor(m / 12), meses = m % 12
  return [anos ? `${anos} ano${anos > 1 ? 's' : ''}` : '', meses ? `${meses} ${meses > 1 ? 'meses' : 'mês'}` : ''].filter(Boolean).join(' e ') + ' de casa'
}
const quandoBR = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

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
  /** como estava ao abrir (ou depois de enviar) — base para "o que mudou" */
  const [base, setBase] = useState<Dados>({})
  const [nivel, setNivel] = useState<Nivel>('parcial')
  const [souDiretor, setSouDiretor] = useState(false)
  const [rh, setRh] = useState<ResumoRH | null>(null)
  const [pend, setPend] = useState<Pendente | null>(null)
  const [verPend, setVerPend] = useState(false)
  const [estado, setEstado] = useState<Estado>('carregando')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [quando, setQuando] = useState<{ em: string | null; por: string | null }>({ em: null, por: null })
  const [versao, setVersao] = useState(0)
  const [verSalario, setVerSalario] = useState(false)
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
        const dados: Dados = comIds(j.dados || {})
        const inicial = { ...dados }
        // ficha nova: já começa com o que o portal sabe (conta como mudança a enviar)
        if (!dados.nome_completo && nome) dados.nome_completo = nome
        if (!dados.cargo && cargo) dados.cargo = cargo
        setD(dados); setBase(inicial); setNivel(j.nivel || 'parcial'); setSouDiretor(!!j.souDiretor); setRh(j.rh || null); setPend(j.pendente || null)
        setQuando({ em: j.atualizado_em, por: j.atualizado_por_nome }); setEstado('pronto')
      } catch { if (vivo) { setErro('Sem conexão com o servidor'); setEstado('erro') } }
    })()
    return () => { vivo = false }
  }, [userId, eu, nome, cargo, versao])

  const mudancasLocais = useMemo(() => listarMudancas(base, d), [base, d])

  const enviar = useCallback(async () => {
    setEstado('enviando'); setErro(''); setAviso('')
    try {
      const r = await fetch('/api/admin/ficha-cadastral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
        body: JSON.stringify(eu ? { eu: true, dados: d } : { user_id: userId, dados: d }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErro(j.error || 'Não deu para enviar'); setEstado('erro'); return }
      setAviso(j.situacao === 'aplicado' ? `Salvo.${j.rh?.ok && j.rh.campos?.length ? ' Também foi para o RH.' : ''}`
        : j.situacao === 'pendente' ? 'Enviado. A ficha só muda depois que o Diretor autorizar — o aviso chega no sino.'
        : 'Nada mudou em relação à ficha atual.')
      window.dispatchEvent(new Event('ficha-pedido'))
      setVersao((v) => v + 1)
    } catch { setErro('Sem conexão: não foi enviado'); setEstado('erro') }
  }, [d, eu, userId])

  const cancelarPedido = async () => {
    if (!pend || !confirm('Cancelar o pedido? A ficha continua como está hoje.')) return
    const r = await fetch('/api/admin/ficha-cadastral/pedidos', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` }, body: JSON.stringify({ id: pend.id, acao: 'cancelar' }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { alert(j.error || 'Não deu para cancelar'); return }
    setAviso('Pedido cancelado.'); window.dispatchEvent(new Event('ficha-pedido')); setVersao((v) => v + 1)
  }

  const mudar = (novo: Dados) => { setD(novo); setAviso('') }
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

      {/* Cadastro no RH (José, 10/11/2026: "que negócio feio, arruma isso") */}
      {rh && (rh.ligado ? (
        <section className="fc-rh" title="Depois que o Diretor autoriza, documentos, nascimento, estado civil, telefone e endereço vão também para o RH.">
          <header className="fc-rh-cab">
            <span className="fc-rh-ic"><Building2 size={17} /></span>
            <div className="fc-rh-nome"><small>Cadastro no RH</small><b>{rh.empresa || 'Empresa'}</b></div>
            <span className="fc-rh-chips">
              {rh.status && <em className={`st ${/ativ/i.test(rh.status) ? 'ok' : ''}`}>{rh.status}</em>}
              {rh.contrato && <em>{rh.contrato.toUpperCase()}</em>}
            </span>
          </header>
          <div className="fc-rh-grade">
            {rh.cargo && <div><small>Cargo</small><b>{rh.cargo}</b>{rh.departamento && <span>{rh.departamento}</span>}</div>}
            {rh.admissao && <div><small>Admissão</small><b>{dataBR(rh.admissao)}</b><span>{tempoDeCasa(rh.admissao)}</span></div>}
            {rh.matricula && <div><small>Matrícula</small><b>{rh.matricula}</b></div>}
            <div><small>Dependentes IRRF</small><b>{rh.dependentes_irrf ?? 0}</b></div>
            {nivel === 'total' && 'salario' in rh && (
              <button type="button" className={`fc-rh-sal ${verSalario ? 'ver' : ''}`} onClick={() => setVerSalario((v) => !v)} title={verSalario ? 'Esconder' : 'Mostrar (só Dev vê)'}>
                <small><Lock size={10} /> Salário · só Dev</small>
                <b>{rh.salario != null ? Number(rh.salario).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}</b>
                {rh.comissao != null && <span>comissão {rh.comissao}%</span>}
              </button>
            )}
          </div>
        </section>
      ) : (
        <section className="fc-rh off">
          <header className="fc-rh-cab">
            <span className="fc-rh-ic"><Building2 size={17} /></span>
            <div className="fc-rh-nome"><small>Cadastro no RH</small><b>Não encontrado</b></div>
          </header>
          <p className="fc-rh-pe">{rh.motivo} A ficha fica salva só no portal.</p>
        </section>
      ))}

      {aviso && <p className="fc-ok"><Check size={15} />{aviso}</p>}

      {pend && (
        <div className="fc-pend">
          <div className="fc-pend-cab">
            <span className="fc-pend-ic"><Hourglass size={16} /></span>
            <div>
              <b>Esperando o Diretor autorizar</b>
              <small>{pend.mudancas.length} mudança{pend.mudancas.length === 1 ? '' : 's'} pedida{pend.mudancas.length === 1 ? '' : 's'} por {pend.pedido_por_nome?.split(' ')[0] || 'alguém'} em {quandoBR(pend.atualizado_em || pend.criado_em)}. A ficha abaixo já mostra como vai ficar; até ele autorizar, vale a anterior.</small>
            </div>
          </div>
          <div className="fc-pend-bts">
            <button type="button" onClick={() => setVerPend((v) => !v)}><ChevronDown size={14} style={{ transform: verPend ? 'rotate(180deg)' : undefined }} />{verPend ? 'Esconder' : 'Ver'} o que muda</button>
            <button type="button" onClick={cancelarPedido}>Cancelar pedido</button>
          </div>
          {verPend && <ListaMudancas ms={pend.mudancas} />}
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
            {estado === 'erro' ? <><AlertTriangle size={13} />{erro}</>
              : quando.em ? <><Check size={13} />última atualização autorizada em {quandoBR(quando.em)}{quando.por ? ` · ${quando.por.split(' ')[0]}` : ''}</>
              : 'ainda não preenchida'}
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

      {mudancasLocais.length > 0 && (
        <div className="fc-envio">
          <div className="fc-envio-tx">
            <b>{mudancasLocais.length} mudança{mudancasLocais.length === 1 ? '' : 's'} ainda não enviada{mudancasLocais.length === 1 ? '' : 's'}</b>
            <small>{souDiretor ? 'Você é o Diretor: salva direto.' : 'Nada muda até o Diretor autorizar.'}</small>
          </div>
          <button type="button" className="fc-envio-sec" disabled={estado === 'enviando'} onClick={() => { if (confirm('Desfazer as mudanças não enviadas?')) setD(base) }}><Undo2 size={15} />Desfazer</button>
          <button type="button" className="fc-envio-pri" disabled={estado === 'enviando'} onClick={enviar}>
            {estado === 'enviando' ? <Loader2 size={15} className="fc-gira" /> : <Send size={15} />}
            {souDiretor ? 'Salvar' : 'Enviar para o Diretor autorizar'}
          </button>
        </div>
      )}

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
.fc-rh { display: grid; gap: 14px; border: 1px solid #e2e8f0; border-radius: 18px; padding: 16px; background: linear-gradient(180deg, #f8fafc, #fefefe 60%) }
.fc-rh.off { background: #f8fafc; gap: 8px }
.fc-rh-cab { display: flex; align-items: center; gap: 12px; flex-wrap: wrap }
.fc-rh-ic { width: 40px; height: 40px; border-radius: 12px; background: #0f172a; color: #fefefe; display: grid; place-items: center; flex-shrink: 0 } .fc-rh.off .fc-rh-ic { background: #e2e8f0; color: #94a3b8 }
.fc-rh-nome { display: grid; flex: 1; min-width: 0 } .fc-rh-nome small { font-size: 11px; letter-spacing: .5px; text-transform: uppercase; color: #94a3b8 } .fc-rh-nome b { font-size: 16px; font-weight: 600; color: #0f172a }
.fc-rh-chips { display: flex; gap: 6px; flex-wrap: wrap } .fc-rh-chips em { font-style: normal; font-size: 12px; border-radius: 999px; padding: 4px 11px; background: #f1f5f9; color: #475569; text-transform: capitalize } .fc-rh-chips em.st.ok { background: #ecfdf5; color: #047857 }
.fc-rh-grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(170px, 100%), 1fr)); gap: 8px }
.fc-rh-grade > div, .fc-rh-sal { display: grid; gap: 2px; align-content: start; border: 1px solid #eef2f7; background: #fefefe; border-radius: 14px; padding: 10px 12px; min-width: 0; text-align: left; font-family: inherit }
.fc-rh-grade small { font-size: 10.5px; letter-spacing: .5px; text-transform: uppercase; color: #94a3b8; display: inline-flex; align-items: center; gap: 4px }
.fc-rh-grade b { font-size: 14.5px; font-weight: 600; color: #0f172a; overflow-wrap: anywhere } .fc-rh-grade span { font-size: 12px; color: #64748b }
.fc-rh-sal { cursor: pointer; border-color: #fed7aa; background: #fffbf5 } .fc-rh-sal small { color: #c2410c } .fc-rh-sal b { filter: blur(6px); transition: filter .2s; user-select: none } .fc-rh-sal.ver b { filter: none; user-select: auto }
.fc-rh-pe { margin: 0; font-size: 12.5px; color: #64748b }
.fc-tranca { margin: 0; display: flex; align-items: center; gap: 7px; font-size: 13px; color: #64748b; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 10px; padding: 10px 12px } .fc-tranca.pq { grid-column: 1 / -1; font-size: 12px; padding: 6px 10px; order: 99 }
.fc-ok { margin: 0; display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: #047857; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 10px 14px }
.fc-pend { display: grid; gap: 10px; border: 1px solid #fde68a; background: #fffbeb; border-radius: 16px; padding: 12px 14px }
.fc-pend-cab { display: flex; gap: 12px; align-items: flex-start } .fc-pend-cab > div { display: grid; gap: 3px; min-width: 0 } .fc-pend-cab b { font-size: 14.5px; font-weight: 600; color: #78350f } .fc-pend-cab small { font-size: 12.5px; color: #92400e; line-height: 1.45 }
.fc-pend-ic { width: 32px; height: 32px; border-radius: 10px; background: #fef3c7; color: #b45309; display: grid; place-items: center; flex-shrink: 0 }
.fc-pend-bts { display: flex; gap: 8px; flex-wrap: wrap } .fc-pend-bts button { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; border: 1px solid #fcd34d; background: #fefefe; border-radius: 999px; padding: 6px 12px; font-family: inherit; font-size: 13px; color: #78350f; cursor: pointer }
.fc-envio { position: sticky; bottom: 0; z-index: 2; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; background: #0f172a; color: #fefefe; border-radius: 16px; padding: 12px 14px; box-shadow: 0 10px 30px rgba(15,23,42,.3) }
.fc-envio-tx { display: grid; flex: 1 1 200px; min-width: 0 } .fc-envio-tx b { font-size: 14px; font-weight: 600 } .fc-envio-tx small { font-size: 12.5px; color: #cbd5e1 }
.fc-envio button { display: inline-flex; align-items: center; gap: 7px; min-height: 40px; border-radius: 999px; padding: 8px 16px; font-family: inherit; font-size: 13.5px; cursor: pointer; border: 1px solid transparent }
.fc-envio-sec { background: transparent; color: #e2e8f0; border-color: #334155 !important } .fc-envio-pri { background: #dc2626; color: #fefefe } .fc-envio-pri:hover:not(:disabled) { background: #b91c1c } .fc-envio button:disabled { opacity: .6; cursor: wait }
@media (max-width: 520px) { .fc-envio button { flex: 1; justify-content: center } }
.fc-rodape { margin: 0; font-size: 12px; color: #94a3b8 }
@media (max-width: 520px) { .fc-campo.w2 { grid-column: 1 / -1 } .fc-sec, .fc-topo { padding: 12px } .fc-bts { width: 100% } .fc-bts button { flex: 1; justify-content: center } }
`

/** a lista "o que muda" — campo, de → para (dado sensível aparece só como alterado) */
export function ListaMudancas({ ms }: { ms: Mudanca[] }) {
  const porSecao: Record<string, Mudanca[]> = {}
  for (const m of ms) (porSecao[m.secao] ||= []).push(m)
  return (
    <div className="lm">
      <style>{ESTILO_LM}</style>
      {Object.entries(porSecao).map(([sec, xs]) => (
        <div key={sec} className="lm-sec">
          <small>{sec}</small>
          {xs.map((m, i) => (
            <div key={i} className={`lm-it ${m.tipo}`}>
              <b>{m.campo}</b>
              <span>
                {m.tipo === 'incluido' ? <><em className="tag">novo</em> {m.para}</>
                  : m.tipo === 'removido' ? <><em className="tag">tirar</em> <s>{m.de}</s></>
                  : <><s>{m.de}</s> <i>→</i> {m.para}</>}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

const ESTILO_LM = `
.lm { display: grid; gap: 8px; min-width: 0 }
.lm-sec { display: grid; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #fefefe }
.lm-sec > small { font-size: 10.5px; text-transform: uppercase; letter-spacing: .5px; color: #64748b; background: #f8fafc; padding: 5px 12px }
.lm-it { display: grid; grid-template-columns: minmax(110px, 38%) minmax(0, 1fr); gap: 10px; padding: 7px 12px; font-size: 13.5px; border-top: 1px solid #f1f5f9; align-items: baseline }
.lm-it b { font-weight: 500; color: #0f172a; overflow-wrap: anywhere } .lm-it span { color: #0f172a; overflow-wrap: anywhere } .lm-it s { color: #94a3b8 } .lm-it i { font-style: normal; color: #dc2626; margin: 0 2px }
.lm-it .tag { font-style: normal; font-size: 11px; border-radius: 99px; padding: 1px 7px; margin-right: 4px; background: #dcfce7; color: #166534 } .lm-it.removido .tag { background: #fee2e2; color: #b91c1c }
@media (max-width: 520px) { .lm-it { grid-template-columns: 1fr; gap: 2px } }
`
