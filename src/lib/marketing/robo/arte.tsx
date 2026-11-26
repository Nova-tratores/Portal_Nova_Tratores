// =============================================================================
// Arte do post (26/11/2026): monta a imagem 1080×1350 no estilo que o José aprovou nas artes da Supersafra:
// logo Nova | Concessionária autorizada MAHINDRA, título enorme (Quantum Rise) em duas cores, uma frase curta com
// destaque e o WhatsApp no rodapé. Sem emoji, sem enfeite.
// José (26/11): "deixar o título com a data comemorativa mais em evidência e mesclar imagens reais também, com trator
// ou sem trator ... pra não ficar repetitivo". Por isso: selo grande da data + 3 layouts (recorte / foto no topo /
// foto em janela) + 5 fundos; o robô alterna (ver variar.ts).
// Usa o ImageResponse do Next (sem navegador). Fontes .ttf em ./fontes (convertidas das .woff2 do site).
// =============================================================================
import fs from 'node:fs'
import path from 'node:path'
import { ImageResponse } from 'next/og'

export type Tema = 'creme' | 'vermelho' | 'branco' | 'dourado' | 'cinza'
/** cena = imagem montada pela IA ocupando a arte toda, texto por cima (José, 26/11: a imagem tem que lembrar a data)
 *  recorte = trator sem fundo (catálogo) · topo = foto real ocupando a parte de cima · janela = foto real em quadro */
export type Layout = 'cena' | 'recorte' | 'topo' | 'janela'

type Cores = { fundo: string; t1: string; t2: string; texto: string; destaque: string; fraco: string; selo: string; seloTexto: string; logo: 'cor' | 'branco' }
const TEMAS: Record<Tema, Cores> = {
  creme:    { fundo: '#f3eee7', t1: '#e11937', t2: '#2a2626', texto: '#2a2626', destaque: '#e11937', fraco: '#4b4545', selo: '#2a2626', seloTexto: '#ffffff', logo: 'cor' },
  vermelho: { fundo: 'linear-gradient(160deg, #e11937 0%, #a8102a 100%)', t1: '#e8b84a', t2: '#ffffff', texto: '#ffffff', destaque: '#e8b84a', fraco: '#fde7ea', selo: '#ffffff', seloTexto: '#c0142f', logo: 'branco' },
  branco:   { fundo: '#ffffff', t1: '#2a2626', t2: '#e11937', texto: '#2a2626', destaque: '#e11937', fraco: '#4b4545', selo: '#e11937', seloTexto: '#ffffff', logo: 'cor' },
  dourado:  { fundo: 'linear-gradient(160deg, #f1cf7a 0%, #d9a63a 100%)', t1: '#a8102a', t2: '#2a2626', texto: '#2a2626', destaque: '#a8102a', fraco: '#3d3326', selo: '#a8102a', seloTexto: '#ffffff', logo: 'cor' },
  cinza:    { fundo: 'linear-gradient(160deg, #e9e9eb 0%, #cfd0d4 100%)', t1: '#e11937', t2: '#2a2626', texto: '#2a2626', destaque: '#e11937', fraco: '#3f3f46', selo: '#e11937', seloTexto: '#ffffff', logo: 'cor' },
}
export const TEMAS_EM_ORDEM: Tema[] = ['creme', 'vermelho', 'branco', 'dourado', 'cinza']
export const LAYOUTS: Layout[] = ['recorte', 'topo', 'janela']

export type DadosArte = {
  data?: { nome: string; dia: string }   // ex.: { nome: 'Dia Mundial do Solo', dia: '05/12' } → selo grande no topo
  titulo: string          // ex.: "Solo bom não se aperta"
  frase: string           // frase curta
  destaque?: string       // pedaço da frase pintado
  foto: string            // data: URI ou URL. recorte = PNG transparente; topo/janela = foto real
  layout?: Layout
  tema?: Tema
  paleta?: Paleta         // só no layout 'cena'
  posicao?: Posicao       // só no layout 'cena': texto em cima (padrão) ou embaixo
  whatsapp?: string
}

import { PALETAS, PALETAS_EM_ORDEM, type Paleta, type Posicao } from './paletas'
export { PALETAS, PALETAS_EM_ORDEM, type Paleta, type Posicao }

const pasta = path.join(process.cwd(), 'src/lib/marketing/robo')
const ler = (f: string) => fs.readFileSync(path.join(pasta, 'fontes', f))
const dataUri = (arq: string) => `data:image/png;base64,${fs.readFileSync(path.join(process.cwd(), 'public', arq)).toString('base64')}`

/** Quantum Rise é larga: ~1,2 da altura por letra (medido na arte "SOLO BOM"). Cabe em `largura`, até `max` px. */
const tamanho = (linha: string, max = 150, largura = 960) => Math.min(max, Math.floor(largura / (Math.max(linha.length, 1) * 1.2)))

/** Divide o título em 1 a 3 linhas escolhendo a que deixa a letra MAIOR (3 linhas só se ganhar 15%). */
function linhas(t: string, max: number): string[] {
  const p = t.toUpperCase().split(/\s+/).filter(Boolean)
  const opcoes: string[][] = [[p.join(' ')]]
  for (let i = 1; i < p.length; i++) {
    opcoes.push([p.slice(0, i).join(' '), p.slice(i).join(' ')])
    for (let j = i + 1; j < p.length; j++) opcoes.push([p.slice(0, i).join(' '), p.slice(i, j).join(' '), p.slice(j).join(' ')])
  }
  const tam = (o: string[]) => Math.min(...o.map((l) => tamanho(l, max))) * (o.length === 3 ? 0.87 : 1)
  return opcoes.reduce((a, b) => (tam(b) > tam(a) ? b : a))
}

function Frase({ frase, destaque, c, tam = 44 }: { frase: string; destaque?: string; c: Cores; tam?: number }) {
  const i = destaque ? frase.indexOf(destaque) : -1
  const partes = i < 0 ? [{ t: frase, d: false }] : [{ t: frase.slice(0, i), d: false }, { t: destaque!, d: true }, { t: frase.slice(i + destaque!.length), d: false }]
  // palavra por palavra (o gerador só quebra linha entre elementos); pontuação solta gruda na palavra anterior
  const palavras: { w: string; d: boolean; cola?: boolean }[] = []
  for (const p of partes) for (const w of p.t.split(/\s+/).filter(Boolean)) palavras.push({ w, d: p.d, cola: /^[.,!?;:]+$/.test(w) && palavras.length > 0 })
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', fontFamily: 'Georama', fontWeight: 600, fontSize: tam, lineHeight: 1.2, color: c.texto }}>
      {palavras.map((p, i) => <span key={i} style={{ color: p.d ? c.destaque : c.texto, marginRight: palavras[i + 1]?.cola ? 0 : Math.round(tam * 0.27) }}>{p.w}</span>)}
    </div>
  )
}

/** Selo da data: "05/12" grande + nome da data. É a primeira coisa que se lê. */
function Selo({ data, c }: { data: { nome: string; dia: string }; c: Cores }) {
  const nome = data.nome.toUpperCase()
  return (
    <div style={{ display: 'flex', alignItems: 'center', alignSelf: 'flex-start', background: c.selo, color: c.seloTexto, borderRadius: 18, padding: '14px 26px 14px 22px' }}>
      <span style={{ fontFamily: 'Quantum Rise', fontSize: 58, lineHeight: 1 }}>{data.dia}</span>
      <div style={{ display: 'flex', width: 3, height: 52, background: c.seloTexto, opacity: 0.45, margin: '0 20px' }} />
      <span style={{ fontFamily: 'Quantum Rise', fontSize: nome.length > 22 ? 26 : 32, lineHeight: 1.05, maxWidth: 640 }}>{nome}</span>
    </div>
  )
}

function Topo({ c, logoBranco }: { c: Cores; logoBranco?: boolean }) {
  const branco = logoBranco || c.logo === 'branco'
  const cor = branco ? '#ffffff' : c.texto
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={dataUri(branco ? 'Logo_Nova_Branca.png' : 'Logo_Nova.png')} height={50} style={{ height: 50 }} alt="" />
      <div style={{ display: 'flex', width: 2, height: 44, background: cor, margin: '0 22px', opacity: 0.55 }} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 17, color: cor, opacity: 0.85 }}>Concessionária autorizada</span>
        <span style={{ fontFamily: 'Quantum Rise', fontSize: 24, color: cor, letterSpacing: 1 }}>MAHINDRA</span>
      </div>
    </div>
  )
}

function Rodape({ c, zap }: { c: Cores; zap: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', flexDirection: 'column', fontSize: 24, color: c.texto }}>
        <span style={{ fontWeight: 700 }}>Nova Tratores</span>
        <span style={{ color: c.fraco, marginTop: 4 }}>Piraju-SP</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <svg width="46" height="46" viewBox="0 0 24 24" style={{ marginRight: 12 }}>
          <path fill={c.destaque} d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 1.8a8.2 8.2 0 1 1-4.2 15.3l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 0 1 12 3.8zm-3.3 4.4c-.2 0-.5 0-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3 2.4 1 2.9.8 3.4.7.5 0 1.7-.7 1.9-1.4.2-.7.2-1.3.2-1.4l-.5-.3-1.9-.9c-.3-.1-.4-.1-.6.1l-.9 1.1c-.2.2-.3.2-.6.1-.3-.1-1.2-.4-2.2-1.4-.8-.7-1.4-1.6-1.5-1.9-.2-.3 0-.4.1-.6l.4-.5.3-.5v-.5l-.9-2.1c-.2-.5-.4-.5-.6-.5h-.5z" />
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 19, fontWeight: 600, color: c.texto }}>Fale com a gente no WhatsApp</span>
          <span style={{ fontFamily: 'Quantum Rise', fontSize: 34, color: c.destaque }}>{zap}</span>
        </div>
      </div>
    </div>
  )
}

export async function arteDoPost(d: DadosArte): Promise<Buffer> {
  const c = TEMAS[d.tema || 'creme']
  const layout = d.layout || 'recorte'
  const zap = d.whatsapp || '(14) 3351-6049'
  const PAD = 58

  let corpo: React.ReactElement
  if (layout === 'cena') {
    // a cena ocupa tudo; sombra em cima (texto) e embaixo (rodapé) para ler em qualquer imagem
    const ls = linhas(d.titulo, 118)
    const tam = Math.min(...ls.map((l) => tamanho(l, 118)))
    const p = PALETAS[d.paleta || 'ouro'] || PALETAS.ouro
    const baixo = d.posicao === 'baixo'
    const branco: Cores = { ...c, texto: '#ffffff', fraco: 'rgba(255,255,255,.82)', destaque: p.destaque }
    const bloco = (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {d.data && (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ fontFamily: 'Quantum Rise', fontSize: 40, color: p.t1 }}>{d.data.dia}</span>
            <div style={{ display: 'flex', width: 46, height: 3, background: p.t1, margin: '0 18px' }} />
            <span style={{ fontFamily: 'Quantum Rise', fontSize: d.data.nome.length > 22 ? 30 : 36, color: '#ffffff' }}>{d.data.nome.toUpperCase()}</span>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: d.data ? 22 : 0, fontFamily: 'Quantum Rise', fontSize: tam, lineHeight: 1.02 }}>
          {ls.map((l, i) => <span key={i} style={{ color: i === 0 ? p.t1 : p.t2, whiteSpace: 'nowrap' }}>{l}</span>)}
        </div>
        <div style={{ display: 'flex', marginTop: 22, maxWidth: 900 }}><Frase frase={d.frase} destaque={d.destaque} c={branco} tam={38} /></div>
      </div>
    )
    corpo = (
      <div style={{ width: 1080, height: 1350, display: 'flex', position: 'relative', fontFamily: 'Georama', background: '#111' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={d.foto} alt="" width={1080} height={1350} style={{ position: 'absolute', left: 0, top: 0, width: 1080, height: 1350, objectFit: 'cover' }} />
        <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: 1080, height: baixo ? 260 : 760, background: 'linear-gradient(180deg, rgba(10,10,12,.78) 0%, rgba(10,10,12,.55) 45%, rgba(10,10,12,0) 100%)' }} />
        <div style={{ display: 'flex', position: 'absolute', left: 0, bottom: 0, width: 1080, height: baixo ? 860 : 300, background: 'linear-gradient(0deg, rgba(10,10,12,.86) 0%, rgba(10,10,12,.6) 55%, rgba(10,10,12,0) 100%)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', position: 'relative', width: 1080, height: 1350, padding: `52px ${PAD}px 48px` }}>
          <Topo c={branco} logoBranco />
          {!baixo && <div style={{ display: 'flex', marginTop: d.data ? 56 : 64 }}>{bloco}</div>}
          <div style={{ display: 'flex', flex: 1 }} />
          {baixo && <div style={{ display: 'flex', marginBottom: 40 }}>{bloco}</div>}
          <Rodape c={branco} zap={zap} />
        </div>
      </div>
    )
  } else if (layout === 'topo') {
    // foto real ocupando os 52% de cima (sem borda), logo branco por cima; texto embaixo no fundo do tema
    const ls = linhas(d.titulo, 104)
    const tam = Math.min(...ls.map((l) => tamanho(l, 104)))
    corpo = (
      <div style={{ width: 1080, height: 1350, display: 'flex', flexDirection: 'column', background: c.fundo, fontFamily: 'Georama' }}>
        <div style={{ display: 'flex', position: 'relative', width: 1080, height: 700 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={d.foto} alt="" width={1080} height={700} style={{ width: 1080, height: 700, objectFit: 'cover' }} />
          <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: 1080, height: 200, background: 'linear-gradient(180deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,0) 100%)' }} />
          <div style={{ display: 'flex', position: 'absolute', left: PAD, top: 52 }}><Topo c={c} logoBranco /></div>
          {d.data && <div style={{ display: 'flex', position: 'absolute', left: PAD, bottom: -44 }}><Selo data={d.data} c={c} /></div>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: `${d.data ? 82 : 46}px ${PAD}px 48px` }}>
          <div style={{ display: 'flex', flexDirection: 'column', fontFamily: 'Quantum Rise', fontSize: tam, lineHeight: 1.02 }}>
            {ls.map((l, i) => <span key={i} style={{ color: i === 0 ? c.t1 : c.t2, whiteSpace: 'nowrap' }}>{l}</span>)}
          </div>
          <div style={{ display: 'flex', marginTop: 26, maxWidth: 940 }}><Frase frase={d.frase} destaque={d.destaque} c={c} tam={38} /></div>
          <div style={{ display: 'flex', flex: 1 }} />
          <Rodape c={c} zap={zap} />
        </div>
      </div>
    )
  } else {
    const max = layout === 'janela' ? 112 : 140
    const ls = linhas(d.titulo, max)
    const tam = Math.min(...ls.map((l) => tamanho(l, max)))
    corpo = (
      <div style={{ width: 1080, height: 1350, display: 'flex', flexDirection: 'column', background: c.fundo, padding: `52px ${PAD}px 48px`, fontFamily: 'Georama' }}>
        <Topo c={c} />
        {d.data && <div style={{ display: 'flex', marginTop: 44 }}><Selo data={d.data} c={c} /></div>}
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: d.data ? 30 : 64, fontFamily: 'Quantum Rise', fontSize: tam, lineHeight: 1.02 }}>
          {ls.map((l, i) => <span key={i} style={{ color: i === 0 ? c.t1 : c.t2, whiteSpace: 'nowrap' }}>{l}</span>)}
        </div>
        <div style={{ display: 'flex', marginTop: 24, maxWidth: 920 }}><Frase frase={d.frase} destaque={d.destaque} c={c} tam={layout === 'janela' ? 36 : 40} /></div>
        <div style={{ display: 'flex', flex: 1, alignItems: layout === 'janela' ? 'stretch' : 'flex-end', justifyContent: 'center', margin: '26px 0 28px', minHeight: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={d.foto} alt="" style={layout === 'janela'
            ? { width: 964, height: '100%', objectFit: 'cover', borderRadius: 26 }
            : { maxWidth: 700, maxHeight: '100%', objectFit: 'contain' }} />
        </div>
        <Rodape c={c} zap={zap} />
      </div>
    )
  }

  const r = new ImageResponse(corpo, {
    width: 1080, height: 1350,
    fonts: [
      { name: 'Quantum Rise', data: ler('quantum-rise-bold.ttf'), weight: 700, style: 'normal' },
      { name: 'Georama', data: ler('georama-semiexpanded-regular.ttf'), weight: 400, style: 'normal' },
      { name: 'Georama', data: ler('georama-semiexpanded-semibold.ttf'), weight: 600, style: 'normal' },
      { name: 'Georama', data: ler('georama-semiexpanded-bold.ttf'), weight: 700, style: 'normal' },
    ],
  })
  return Buffer.from(await r.arrayBuffer())
}
