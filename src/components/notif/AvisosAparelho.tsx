'use client'
// Faixa do sino "Avisos neste aparelho" (28/10/2026): liga o push para o aviso chegar com o portal
// fechado. Mesmo visual da faixa "Aviso na tela" (AjustesIlha). Lógica em lib/push/portal-client.ts.
import { useEffect, useState } from 'react'
import { Smartphone, ChevronDown } from 'lucide-react'
import { ativarPush, desativarPush, estadoPush, ehCelular, type EstadoPush } from '@/lib/push/portal-client'

const RESUMO: Record<EstadoPush, string> = {
  'ativo': 'Ligado — chega mesmo com o portal fechado',
  'pode-ativar': 'Desligado — toque para ligar',
  'bloqueado': 'Bloqueado no navegador',
  'iphone-instalar': 'Falta pôr o portal na Tela de Início',
  'sem-suporte': 'Este navegador não recebe',
  'desligado': 'Ainda não liberado no servidor',
}

export function AvisosAparelho() {
  const [estado, setEstado] = useState<EstadoPush | null>(null)
  const [aberto, setAberto] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const celular = ehCelular()

  useEffect(() => { estadoPush().then(setEstado).catch(() => setEstado('sem-suporte')) }, [])

  if (!estado) return null
  // No computador só aparece quando dá para ligar ou já está ligado (sem poluir o sino).
  if (!celular && estado !== 'ativo' && estado !== 'pode-ativar') return null

  const ligar = async () => {
    setOcupado(true)
    try { setEstado(await ativarPush()) } finally { setOcupado(false) }
  }
  const desligar = async () => {
    setOcupado(true)
    try { await desativarPush(); setEstado(await estadoPush()) } finally { setOcupado(false) }
  }
  const cor = estado === 'ativo' ? '#16a34a' : estado === 'pode-ativar' ? '#dc2626' : '#d97706'

  return (
    <div className={`ilha-ajustes ${aberto ? 'aberto' : ''}`}>
      <style>{CSS}</style>
      <button className="ilha-aj-cab" onClick={() => estado === 'pode-ativar' && !aberto ? ligar() : setAberto((a) => !a)} aria-expanded={aberto} disabled={ocupado}>
        <span className="ilha-aj-ic" style={{ background: `color-mix(in srgb, ${cor} 12%, transparent)`, color: cor }}><Smartphone size={14} /></span>
        <span className="ilha-aj-tit">{celular ? 'Avisos no celular' : 'Avisos neste computador'}</span>
        <span className="ilha-aj-resumo" style={estado === 'pode-ativar' ? { color: cor, fontWeight: 700 } : undefined}>
          {ocupado ? 'Aguarde…' : RESUMO[estado]}
        </span>
        <ChevronDown size={15} className="ilha-aj-seta" onClick={(e) => { e.stopPropagation(); setAberto((a) => !a) }} />
      </button>
      {aberto && (
        <div className="ilha-aj-corpo avap-corpo">
          {estado === 'ativo' && (
            <>
              <p>Os avisos do sino chegam aqui mesmo com o portal fechado, como mensagem do WhatsApp. Tocar no aviso abre a tela certa.</p>
              <button className="avap-bt secundario" onClick={desligar} disabled={ocupado}>Parar de receber neste aparelho</button>
            </>
          )}
          {estado === 'pode-ativar' && (
            <>
              <p>Ligue para receber os avisos do sino mesmo com o portal fechado. O navegador vai perguntar — toque em <b>Permitir</b>.</p>
              <button className="avap-bt" onClick={ligar} disabled={ocupado}>Ligar avisos</button>
            </>
          )}
          {estado === 'iphone-instalar' && (
            <ol>
              <li>Abra o portal no <b>Safari</b>.</li>
              <li>Toque em <b>Compartilhar</b> (quadrado com a seta para cima).</li>
              <li>Toque em <b>Adicionar à Tela de Início</b>.</li>
              <li>Abra o portal pelo ícone novo e volte aqui no sino para ligar.</li>
            </ol>
          )}
          {estado === 'bloqueado' && (
            <p>Os avisos foram bloqueados neste navegador. Toque no cadeado ao lado do endereço → <b>Permissões</b> → <b>Notificações</b> → <b>Permitir</b>, e recarregue o portal.</p>
          )}
          {estado === 'sem-suporte' && <p>Este navegador não recebe avisos com o portal fechado. No Android use o <b>Chrome</b>; no iPhone, o Safari com o portal na Tela de Início (iOS 16.4 ou mais novo).</p>}
          {estado === 'desligado' && <p>O servidor ainda não está com as chaves de aviso configuradas. Avise o Dev.</p>}
        </div>
      )}
    </div>
  )
}

const CSS = `
.avap-corpo p, .avap-corpo ol { margin: 0; font-size: 12.5px; line-height: 1.5; color: var(--portal-text-secondary); }
.avap-corpo ol { padding-left: 18px; display: grid; gap: 3px; }
.avap-bt { justify-self: start; min-height: 40px; padding: 8px 16px; border-radius: 10px; border: none; background: #dc2626; color: #fff; font-weight: 700; font-size: 13px; cursor: pointer; font-family: inherit; }
.avap-bt.secundario { background: var(--portal-bg-hover); color: var(--portal-text-secondary); border: 1px solid var(--portal-border-hover); font-weight: 600; }
.avap-bt:disabled { opacity: .6; cursor: default; }
`
