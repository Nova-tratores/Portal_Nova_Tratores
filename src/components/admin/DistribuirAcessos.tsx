'use client';
// Distribuir acessos de um usuário (José, 21/10/2026: "deixa uma forma mais interativa para distribuir
// permissões dos apps"). Três abas — Portal (módulos), App Mecânicos e App NT Vendas — no mesmo lugar.
// Portal: cartões com interruptor por módulo, busca, grupos com contador, ações finas no painel ao lado,
// e "copiar acessos de" outra pessoa. Usa as mesmas regras do catálogo (lib/permissoes/catalogo).
import { setorComFuncao, funcaoNoSetor, trocarFuncaoSetor } from '@/lib/permissoes/funcoes-setor'
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ShieldCheck, Copy, Smartphone, Wrench, LayoutGrid, Check, IdCard, Activity, Briefcase } from 'lucide-react';
import FichaCadastral from './FichaCadastral';
import AtividadesUsuario from './AtividadesUsuario';
import PermissoesLista from './PermissoesLista';

type Mod = { id: string; label: string; color?: string };
interface Props {
  nome: string; ehAdmin: boolean; souDev: boolean; disabled?: boolean
  modulos: string[]; catalogo: Mod[]; onModulos: (novo: string[]) => void
  mecanicoRole: 'tecnico' | 'observador' | null; mecanicoNome: string | null; onMecanico: (role: string, nome?: string) => void
  vendedor: boolean; salvandoVendedor?: boolean; onVendedor: (v: boolean) => void
  outros: { id: string; nome: string; modulos: string[] }[]
  /** com o id, aparecem as abas Ficha cadastral e Atividades (José, 09/11/2026) */
  userId?: string; funcao?: string; email?: string
  /** Categoria (setor) da pessoa: a aba de função só aparece em Pós Vendas, Peças e Comercial (José, 10/11/2026) */
  categoria?: string
  /** quem tem só o módulo Administração (não é Admin): só Permissões Portal e a função do setor */
  soPermissoes?: boolean
  /** pode abrir a Ficha cadastral (Admin ou módulo Ficha cadastral, José 10/11/2026); sem o valor, segue o soPermissoes */
  comFicha?: boolean
  /** só o módulo Ficha cadastral (sem Administração): a janela mostra só a Ficha, sem sensíveis */
  soFicha?: boolean
}

export default function DistribuirAcessos(p: Props) {
  const setor = setorComFuncao(p.categoria);
  const funcao = funcaoNoSetor(p.modulos, p.categoria);
  // abas (José, 10/11/2026): os apps (Mecânicos e NT Vendas) ficam DENTRO de Permissões
  const verFicha = !!p.userId && (p.comFicha ?? !p.soPermissoes);
  const verAtividades = !!p.userId && !p.soPermissoes && !p.soFicha;
  const [aba, setAba] = useState<'portal' | 'funcao' | 'ficha' | 'atividades'>(verFicha ? 'ficha' : 'portal');
  const [copiar, setCopiar] = useState('');

  const seletorCopiar = (
    <label className="da-copiar"><Copy size={14} />
      <select value={copiar} disabled={p.disabled} onChange={(e) => { const o = p.outros.find((x) => x.id === e.target.value); setCopiar(''); if (o && confirm(`Copiar os acessos de ${o.nome} para ${p.nome}? Os acessos atuais de ${p.nome} serão trocados.`)) p.onModulos([...o.modulos]); }}>
        <option value="">copiar acessos de…</option>
        {p.outros.filter((o) => o.modulos.length).map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
      </select>
    </label>
  );

  return (
    <div className="da">
      <style>{ESTILO_DA}</style>
      <div className="da-abas">
        {/* ficha primeiro, depois as permissões (José, 09/11/2026) */}
        {verFicha && <button type="button" className={aba === 'ficha' ? 'on' : ''} onClick={() => setAba('ficha')}><IdCard size={15} />Ficha cadastral</button>}
        {!p.soFicha && <button type="button" className={aba === 'portal' ? 'on' : ''} onClick={() => setAba('portal')}><LayoutGrid size={15} />Permissões</button>}
        {setor && !p.soFicha && <button type="button" className={aba === 'funcao' ? 'on' : ''} onClick={() => setAba('funcao')}><Briefcase size={15} />{setor.nome}<em className={funcao ? 'ok' : ''}>{funcao?.rot.replace(' do Pós-Vendas', '') || 'sem função'}</em></button>}
        {verAtividades && <button type="button" className={aba === 'atividades' ? 'on' : ''} onClick={() => setAba('atividades')}><Activity size={15} />Atividades</button>}
      </div>

      {aba === 'ficha' && verFicha && p.userId && <FichaCadastral userId={p.userId} nome={p.nome} cargo={p.funcao} email={p.email} />}
      {aba === 'atividades' && verAtividades && p.userId && <AtividadesUsuario userId={p.userId} qtdModulos={new Set(p.modulos.map((m) => m.split(':')[0])).size} />}

      {aba === 'portal' && !p.soFicha && (
        <div className="da-portal">
          {p.ehAdmin && <p className="da-aviso"><ShieldCheck size={14} /> {p.nome.split(' ')[0]} é Admin e já vê tudo — estas marcações só valem se voltar a Usuário.</p>}

          {!p.soPermissoes && (
            <section className="da-apps">
              <h4>Aplicativos</h4>
              <div className="da-apps-grade">
                <div className={`da-appc ${p.mecanicoRole ? 'on' : ''}`}>
                  <span className="da-appc-ic mec"><Wrench size={18} /></span>
                  <div className="da-appc-tx">
                    <b>App Mecânicos</b>
                    <small>{p.mecanicoRole ? `aparece como ${p.mecanicoNome || p.nome}` : 'relatórios, fotos e jornada — mesmo login'}</small>
                  </div>
                  <div className="da-seg" role="radiogroup" aria-label="App Mecânicos">
                    {([['', 'Não'], ['tecnico', 'Técnico'], ['observador', 'Observador']] as const).map(([v, rot]) => (
                      <button key={v} type="button" role="radio" aria-checked={(p.mecanicoRole || '') === v} disabled={p.disabled}
                        className={(p.mecanicoRole || '') === v ? 'on' : ''} onClick={() => p.onMecanico(v)}
                        title={v === 'tecnico' ? 'preenche relatórios das suas OS, fotos e jornada' : v === 'observador' ? 'só acompanha o que os técnicos lançam' : 'não entra no app'}>{rot}</button>
                    ))}
                  </div>
                </div>
                <div className={`da-appc ${p.vendedor ? 'on' : ''}`}>
                  <span className="da-appc-ic ven"><Smartphone size={18} /></span>
                  <div className="da-appc-tx">
                    <b>App NT Vendas</b>
                    <small>visitas, carteira, propostas e rota do vendedor</small>
                  </div>
                  <button type="button" className={`da-sw ${p.vendedor ? 'on' : ''}`} disabled={p.salvandoVendedor} onClick={() => p.onVendedor(!p.vendedor)} aria-label={p.vendedor ? 'Tirar o app NT Vendas' : 'Liberar o app NT Vendas'}><i /></button>
                </div>
              </div>
            </section>
          )}

          <section className="da-mods">
            <div className="da-mods-cab"><h4>Portal</h4>{seletorCopiar}</div>
            <PermissoesLista modo="painel" modulos={p.modulos} catalogo={p.catalogo} onChange={p.onModulos} disabled={p.disabled} souDev={p.souDev} />
          </section>
        </div>
      )}

      {/* função dentro do setor: Pós-Vendas, Peças ou Comercial (José, 29/10 e 10/11/2026) */}
      {aba === 'funcao' && setor && !p.soFicha && (
        <div className="da-app">
          <p className="da-app-txt">A função de {p.nome.split(' ')[0]} dentro do {setor.nome}.{setor.categoria === 'Pós Vendas' ? ' Vale na comissão do escritório (Gestão Pós Vendas → Equipe → Comissões).' : ''}</p>
          <div className="da-opcoes">
            {[{ chave: '', rot: 'Sem função', txt: `não tem função no ${setor.nome}` }, ...setor.funcoes].map((f) => (
              <button key={f.chave} type="button" disabled={p.disabled} className={`da-op ${(funcao?.chave || '') === f.chave ? 'on' : ''}`} onClick={() => p.onModulos(trocarFuncaoSetor(p.modulos, setor.categoria, f.chave || null))}>
                <span className="da-radio">{(funcao?.chave || '') === f.chave && <Check size={13} />}</span><span><b>{f.rot}</b><small>{f.txt}</small></span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const ESTILO_DA = `
@keyframes daEntra { from { opacity: 0; transform: translateY(6px) } }
.da { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; animation: daEntra .25s both; font-family: inherit; min-width: 0 } .da > * { min-width: 0 }
.da-abas { display: inline-flex; gap: 4px; background: #f1f5f9; border-radius: 999px; padding: 4px; justify-self: start; flex-wrap: wrap }
.da-abas button { display: inline-flex; align-items: center; gap: 7px; border: none; background: none; border-radius: 999px; padding: 8px 14px; font-family: inherit; font-size: 13.5px; color: #475569; cursor: pointer; transition: all .15s }
@media (max-width: 640px) { .da-abas { display: flex; flex-wrap: nowrap; overflow-x: auto; border-radius: 14px; max-width: 100%; scrollbar-width: none } .da-abas button { flex-shrink: 0; min-height: 40px } }
.da-abas button.on { background: #fefefe; color: #0f172a; box-shadow: 0 1px 4px rgba(15,23,42,.12) } .da-abas em { font-style: normal; font-size: 11.5px; border-radius: 99px; padding: 1px 8px; background: #e2e8f0; color: #475569 } .da-abas em.ok { background: #dcfce7; color: #166534 }
.da-aviso { margin: 0; display: flex; align-items: center; gap: 6px; font-size: 13px; color: #92400e; background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 8px 12px }
.da-portal { display: grid; gap: 18px }
.da-apps, .da-mods { display: grid; gap: 10px; min-width: 0 }
.da-apps h4, .da-mods h4 { margin: 0; font-size: 11.5px; font-weight: 600; letter-spacing: .6px; text-transform: uppercase; color: #64748b }
.da-mods-cab { display: flex; align-items: center; gap: 10px; flex-wrap: wrap } .da-mods-cab .da-copiar { margin-left: auto }
.da-apps-grade { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(340px, 100%), 1fr)); gap: 10px }
.da-appc { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; border: 1px solid #e2e8f0; border-radius: 16px; padding: 12px 14px; background: #fefefe; transition: border-color .15s }
.da-appc.on { border-color: #cbd5e1; box-shadow: 0 2px 10px rgba(15,23,42,.05) }
.da-appc-ic { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; flex-shrink: 0; background: #f1f5f9; color: #94a3b8 }
.da-appc.on .da-appc-ic.mec { background: #ecfdf5; color: #047857 } .da-appc.on .da-appc-ic.ven { background: #fef2f2; color: #dc2626 }
.da-appc-tx { display: grid; gap: 1px; flex: 1 1 140px; min-width: 0 } .da-appc-tx b { font-size: 14px; font-weight: 600; color: #0f172a } .da-appc-tx small { font-size: 12.5px; color: #64748b }
.da-seg { display: inline-flex; gap: 3px; padding: 3px; border-radius: 999px; background: #f1f5f9 }
.da-seg button { border: none; background: none; border-radius: 999px; padding: 6px 12px; font-family: inherit; font-size: 12.5px; color: #475569; cursor: pointer; min-height: 32px }
.da-seg button.on { background: #fefefe; color: #0f172a; box-shadow: 0 1px 3px rgba(15,23,42,.14) } .da-seg button:disabled { cursor: wait }
.da-formato { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 12.5px; color: #64748b } .da-formato > button { border: 1px solid #e2e8f0; background: #fefefe; border-radius: 999px; padding: 5px 12px; font-family: inherit; font-size: 12.5px; color: #334155; cursor: pointer } .da-formato > button.on { background: #111111; border-color: #111111; color: #fefefe } .da-formato-copiar { margin-left: auto }
.da-barra { display: flex; gap: 10px; align-items: center; flex-wrap: wrap }
.da-busca { display: inline-flex; align-items: center; gap: 6px; border: 1px solid #e2e8f0; background: #fefefe; border-radius: 999px; padding: 7px 12px; color: #94a3b8 } .da-busca input { border: none; outline: none; font-family: inherit; font-size: 13.5px; width: 170px; color: #0f172a; background: none }
.da-grupos { display: flex; gap: 5px; flex-wrap: wrap } .da-grupos button { border: 1px solid #e2e8f0; background: #fefefe; border-radius: 999px; padding: 6px 12px; font-family: inherit; font-size: 12.5px; color: #334155; cursor: pointer; transition: all .15s }
.da-grupos button:hover { border-color: #94a3b8 } .da-grupos button.on { background: #0f172a; border-color: #0f172a; color: #fefefe } .da-grupos small { font-size: 11px; color: #94a3b8 } .da-grupos small.ok { color: #059669 } .da-grupos button.on small { color: #cbd5e1 }
.da-mais { display: flex; gap: 6px; align-items: center; margin-left: auto; flex-wrap: wrap } .da-mais > button { border: 1px solid #e2e8f0; background: #fefefe; border-radius: 999px; padding: 6px 12px; font-family: inherit; font-size: 12.5px; cursor: pointer; color: #334155 } .da-mais > button:hover { border-color: #0f172a }
.da-copiar { display: inline-flex; align-items: center; gap: 6px; border: 1px dashed #cbd5e1; border-radius: 999px; padding: 4px 6px 4px 12px; color: #64748b } .da-copiar select { border: none; background: none; font-family: inherit; font-size: 12.5px; color: #334155; outline: none; cursor: pointer; max-width: 200px }
.da-corpo { display: grid; grid-template-columns: 1fr; gap: 14px; align-items: start } .da-corpo.com-lado { grid-template-columns: 1fr 300px } @media (max-width: 1000px) { .da-corpo.com-lado { grid-template-columns: 1fr } }
.da-grade { display: grid; gap: 14px } .da-sec h4 { margin: 0 0 7px; font-size: 11px; font-weight: 500; color: #64748b; text-transform: uppercase; letter-spacing: .6px }
.da-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px }
.da-card { display: flex; align-items: center; gap: 10px; border: 1px solid #e2e8f0; background: #fefefe; border-radius: 14px; padding: 10px 12px; cursor: pointer; transition: border-color .15s, box-shadow .2s, transform .15s, background .2s; animation: daEntra .3s var(--d) both; user-select: none }
.da-card:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(15,23,42,.08) }
.da-card.total { border-color: color-mix(in srgb, var(--c) 40%, transparent); background: color-mix(in srgb, var(--c) 5%, #fefefe) } .da-card.parcial { border-color: #fcd34d; background: #fffdf5 } .da-card.sel { box-shadow: 0 0 0 2px var(--c) }
.da-ic { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; font-size: 14px; color: #94a3b8; background: #f1f5f9; flex-shrink: 0; transition: all .2s } .da-card.total .da-ic, .da-card.parcial .da-ic { background: var(--c); color: #fefefe }
.da-tx { display: grid; flex: 1; min-width: 0 } .da-tx b { font-size: 13px; font-weight: 500; color: #0f172a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap } .da-tx small { font-size: 11.5px; color: #94a3b8 } .da-card.total .da-tx small { color: #059669 } .da-card.parcial .da-tx small { color: #b45309 }
.da-sw { width: 36px; height: 21px; border-radius: 99px; border: none; background: #e2e8f0; position: relative; flex-shrink: 0; cursor: pointer; padding: 0; transition: background .2s } .da-sw i { position: absolute; top: 2px; left: 2px; width: 17px; height: 17px; border-radius: 50%; background: #fefefe; box-shadow: 0 1px 3px rgba(15,23,42,.25); transition: transform .22s cubic-bezier(.3,1.4,.5,1) }
.da-sw.on { background: #059669 } .da-sw.on i { transform: translateX(15px) } .da-sw.meio { background: #f59e0b } .da-sw.pq { width: 30px; height: 18px } .da-sw.pq i { width: 14px; height: 14px } .da-sw.pq.on i { transform: translateX(12px) } .da-sw:disabled { opacity: .5; cursor: not-allowed }
.da-lado { position: sticky; top: 0; border: 1px solid #e2e8f0; border-radius: 16px; background: #fefefe; padding: 14px; display: grid; gap: 10px; box-shadow: 0 12px 30px rgba(15,23,42,.08); animation: daEntra .2s both }
.da-lado-cab { display: flex; justify-content: space-between; align-items: center } .da-lado-cab b { font-size: 15px; font-weight: 500 } .da-lado-cab button { width: 28px; height: 28px; border-radius: 50%; border: none; background: #f1f5f9; cursor: pointer; font-size: 16px; color: #64748b }
.da-total { display: inline-flex; align-items: center; gap: 7px; justify-self: start; border: 1px solid #e2e8f0; background: #fefefe; border-radius: 999px; padding: 7px 14px; font-family: inherit; font-size: 13px; cursor: pointer; color: #334155 } .da-total.on { background: #059669; border-color: #059669; color: #fefefe }
.da-acoes { display: grid; gap: 2px; max-height: 420px; overflow: auto } .da-acao { display: flex; align-items: center; gap: 10px; border: none; background: none; border-radius: 9px; padding: 7px 6px; font-family: inherit; font-size: 13px; color: #0f172a; text-align: left; cursor: pointer } .da-acao:hover:not(:disabled) { background: #f8fafc } .da-acao small { color: #b45309 } .da-acao:disabled { opacity: .5; cursor: not-allowed }
.da-app { display: grid; gap: 12px; max-width: 760px } .da-app-txt { margin: 0; font-size: 13.5px; color: #475569 } .da-app-txt b { font-weight: 500; color: #0f172a }
.da-opcoes { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px }
.da-op { display: flex; gap: 10px; align-items: flex-start; border: 1px solid #e2e8f0; background: #fefefe; border-radius: 14px; padding: 12px; font-family: inherit; text-align: left; cursor: pointer; transition: all .15s } .da-op:hover { border-color: #94a3b8 } .da-op.on { border-color: #0f172a; box-shadow: 0 0 0 1px #0f172a }
.da-op b { display: block; font-size: 14px; font-weight: 500; color: #0f172a } .da-op small { font-size: 12.5px; color: #64748b }
.da-radio { width: 20px; height: 20px; border-radius: 50%; border: 2px solid #cbd5e1; display: grid; place-items: center; flex-shrink: 0; color: #fefefe } .da-op.on .da-radio { background: #0f172a; border-color: #0f172a }
.da-grande { display: flex; gap: 14px; align-items: center; border: 1px solid #e2e8f0; background: #fefefe; border-radius: 16px; padding: 16px 18px; font-family: inherit; text-align: left; cursor: pointer; transition: all .2s } .da-grande.on { border-color: #fecaca; background: #fff7f7 } .da-grande b { display: block; font-size: 15px; font-weight: 500; color: #0f172a } .da-grande small { font-size: 13px; color: #64748b } .da-grande .da-sw.on { background: #dc2626 }
`;

/** O editor de acessos num modal (José, 21/10/2026: "faz um modal"). */
export function ModalAcessos({ avatar, funcao, email, onFechar, ...p }: Props & { avatar?: string; funcao?: string; email?: string; onFechar: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', esc)
    const ov = document.body.style.overflow; document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', esc); document.body.style.overflow = ov }
  }, [onFechar])
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="mda-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar() }}>
      <style>{ESTILO_MDA}</style>
      <div className="mda" role="dialog" aria-label={`Acessos de ${p.nome}`}>
        <header className="mda-cab">
          <span className="mda-av">{avatar ? <img src={avatar} alt="" /> : p.nome.charAt(0)}</span>
          <div><b>{p.nome}</b><small>{[funcao, email].filter(Boolean).join(' · ') || 'acessos, ficha cadastral e atividades'}</small></div>
          <button type="button" className="mda-x" onClick={onFechar} aria-label="Fechar">×</button>
        </header>
        <div className="mda-corpo"><DistribuirAcessos {...p} funcao={funcao} email={email} /></div>
        <footer className="mda-pe"><span>Permissões gravam na hora; mudança na ficha cadastral só vale depois que o Diretor autorizar.</span><button type="button" onClick={onFechar}>Pronto</button></footer>
      </div>
    </div>, document.body)
}

const ESTILO_MDA = `
@keyframes mdaFundo { from { opacity: 0 } } @keyframes mdaSobe { from { opacity: 0; transform: translateY(16px) scale(.985) } }
.mda-fundo { position: fixed; inset: 0; z-index: 100100; background: rgba(15,23,42,.45); backdrop-filter: blur(3px); display: grid; place-items: center; padding: 16px; animation: mdaFundo .18s both }
.mda { width: min(1200px, 100%); height: min(860px, calc(100vh - 32px)); display: grid; grid-template-rows: auto 1fr auto; background: #fefefe; border-radius: 20px; box-shadow: 0 30px 80px rgba(15,23,42,.35); overflow: hidden; animation: mdaSobe .25s cubic-bezier(.2,.8,.2,1) both; font-family: inherit; color: #0f172a }
.mda-cab { display: flex; gap: 14px; align-items: center; padding: 18px 24px; border-bottom: 1px solid #eef2f7 } .mda-cab > div { display: grid; flex: 1; min-width: 0 } .mda-cab b { font-size: 19px; font-weight: 500 } .mda-cab small { font-size: 13px; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.mda-av { width: 46px; height: 46px; border-radius: 50%; overflow: hidden; display: grid; place-items: center; background: linear-gradient(135deg, #dc2626, #b91c1c); color: #fefefe; font-size: 18px; flex-shrink: 0 } .mda-av img { width: 100%; height: 100%; object-fit: cover }
.mda-x { width: 36px; height: 36px; border-radius: 50%; border: 1px solid #e2e8f0; background: #fefefe; color: #64748b; font-size: 20px; cursor: pointer } .mda-x:hover { border-color: #0f172a; color: #0f172a }
.mda-corpo { overflow: auto; padding: 18px 24px }
@media (max-width: 640px) { .mda-fundo { padding: 0 } .mda { width: 100%; height: 100dvh; border-radius: 0 } .mda-cab, .mda-corpo { padding: 12px 14px } .mda-pe { padding: 10px 14px } .mda-pe span { display: none } .mda-pe button { margin-left: auto } }
.mda-pe { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 24px; border-top: 1px solid #eef2f7; background: #f8fafc } .mda-pe span { font-size: 13px; color: #64748b } .mda-pe button { border: none; background: #0f172a; color: #fefefe; border-radius: 999px; padding: 10px 22px; font-family: inherit; font-size: 14px; cursor: pointer } .mda-pe button:hover { background: #1d4ed8 }
`
