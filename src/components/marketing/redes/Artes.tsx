'use client';
// Peças das artes por rede (José, 12/11/2026: "as promoções precisam ficar prontas para ser espelhadas no TikTok,
// YouTube Shorts, Insta, site e Facebook"; o designer manda cada tamanho). Usadas na Promoção e no Calendário.
import { useEffect, useRef, useState } from 'react';
import { fetchAuth } from '@/lib/auth/client';
import EnviarFoto from './EnviarFoto';
import { ARTES, REDES, REDE, faltas, type Arte, type Midia, type RedeId } from '@/lib/marketing/redes/redes';
import { T1, T2, T3, bt, ic } from './np';

/** Ícone da rede na cor dela. */
export function IconeRede({ id, tam = 14 }: { id: RedeId; tam?: number }) {
  const r = REDE[id];
  return <i className={r.icone} style={{ color: r.cor, fontSize: tam, fontWeight: r.icone.startsWith('fa-solid') ? 900 : 400 }} aria-label={r.nome} />;
}

/** Botões para escolher em quais redes sai (uma, várias ou todas). */
export function EscolherRedes({ valor, onChange, so }: { valor: RedeId[]; onChange: (v: RedeId[]) => void; so?: RedeId[] }) {
  const lista = REDES.filter((r) => !so || so.includes(r.id));
  const todas = lista.every((r) => valor.includes(r.id));
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {lista.map((r) => {
        const on = valor.includes(r.id);
        return (
          <button key={r.id} type="button" aria-pressed={on} onClick={() => onChange(on ? valor.filter((x) => x !== r.id) : [...valor, r.id])}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 40, padding: '7px 14px', borderRadius: 999, font: 'inherit', fontSize: 14, cursor: 'pointer',
              border: `1px solid ${on ? r.cor : 'var(--border)'}`, background: on ? `color-mix(in srgb, ${r.cor} 10%, var(--surface))` : 'var(--surface)', color: on ? T1 : T3 }}>
            <i className={r.icone} style={{ color: on ? r.cor : T3, fontWeight: r.icone.startsWith('fa-solid') ? 900 : 400 }} />
            {r.nome}
            {on && <i className="fa-solid fa-check" style={{ fontWeight: 900, fontSize: 11, color: r.cor }} />}
          </button>
        );
      })}
      <button type="button" style={{ ...bt('#64748b'), borderRadius: 999 }} onClick={() => onChange(todas ? [] : lista.map((r) => r.id))}>
        {todas ? 'Nenhuma' : 'Todas'}
      </button>
    </div>
  );
}

function useTamanho(url: string | null | undefined, video: boolean) {
  const [t, setT] = useState<{ url: string; w: number; h: number; s?: number } | null>(null);
  useEffect(() => {
    if (!url) return;
    if (video) {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => setT({ url, w: v.videoWidth, h: v.videoHeight, s: Math.round(v.duration) });
      v.src = url;
      return;
    }
    const img = new Image();
    img.onload = () => setT({ url, w: img.naturalWidth, h: img.naturalHeight });
    img.src = url;
  }, [url, video]);
  return url && t?.url === url ? t : null;
}

/** Verde quando a arte tem a proporção certa; âmbar quando não (e diz o ideal). */
export function SeloTamanho({ url, arte }: { url: string | null | undefined; arte: Arte }) {
  const ideal = ARTES[arte];
  const t = useTamanho(url, arte === 'video');
  if (!url) return <span style={{ fontSize: 12, color: T3 }}>Ideal: {ideal.w}×{ideal.h} px</span>;
  if (!t) return <span style={{ fontSize: 12, color: T3 }}>Medindo…</span>;
  const ok = Math.abs(t.w / t.h - ideal.w / ideal.h) < 0.08;
  const pequena = t.w < ideal.w * 0.6;
  const longo = arte === 'video' && (t.s || 0) > 60;
  const bom = ok && !pequena && !longo;
  return (
    <span style={{ fontSize: 12, color: bom ? '#16a34a' : '#b45309', display: 'flex', gap: 6, alignItems: 'flex-start', lineHeight: 1.45 }}>
      {ic(bom ? 'fa-circle-check' : 'fa-triangle-exclamation')}
      <span>
        {t.w}×{t.h} px{t.s ? ` · ${t.s} s` : ''}.{' '}
        {bom ? 'Tamanho certo.' : !ok ? `O ideal é ${ideal.w}×${ideal.h}: vai ficar cortada ou com faixas.` : longo ? 'Shorts aceita até 60 s.' : 'Pequena: pode ficar borrada.'}
      </span>
    </span>
  );
}

/** Botão "Enviar vídeo": manda o arquivo direto para o Storage (endereço assinado), com a porcentagem. */
export function EnviarVideo({ pasta, rotulo = 'Enviar vídeo', onEnviado }: { pasta: string; rotulo?: string; onEnviado: (url: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [erro, setErro] = useState('');
  async function enviar(arq: File | undefined) {
    if (!arq) return;
    setErro(''); setPct(0);
    const r = await fetchAuth('/api/marketing/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pasta, tipo: arq.type, tamanho: arq.size }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) { setErro(j.erro || 'Não consegui enviar o vídeo.'); setPct(null); return; }
    await new Promise<void>((fim) => {
      const x = new XMLHttpRequest();
      x.open('PUT', j.envio);
      x.setRequestHeader('Content-Type', arq.type);
      x.upload.onprogress = (e) => e.lengthComputable && setPct(Math.round((e.loaded / e.total) * 100));
      x.onload = () => { if (x.status < 300) onEnviado(j.url); else setErro('O envio falhou. Tente de novo.'); fim(); };
      x.onerror = () => { setErro('Caiu a internet no meio do envio. Tente de novo.'); fim(); };
      x.send(arq);
    });
    setPct(null);
    if (input.current) input.current.value = '';
  }
  return (
    <span style={{ display: 'inline-grid', gap: 4 }}>
      <input ref={input} type="file" accept="video/mp4,video/quicktime" hidden onChange={(e) => enviar(e.target.files?.[0])} />
      <button type="button" style={bt('#d97706')} disabled={pct !== null} onClick={() => input.current?.click()}>
        {ic('fa-video')}{pct !== null ? `Enviando ${pct}%…` : rotulo}
      </button>
      {erro && <span style={{ fontSize: 12, color: '#dc2626' }}>{erro}</span>}
    </span>
  );
}

/** Uma caixa por tamanho de arte: moldura no formato certo, quais redes usam, enviar/trocar/tirar e o selo do tamanho. */
export function CaixaArte({ arte, url, pasta, onTroca, usadaPor }: { arte: Arte; url: string | null | undefined; pasta: string; onTroca: (u: string | null) => void; usadaPor: RedeId[] }) {
  const a = ARTES[arte];
  const video = arte === 'video';
  return (
    <div style={{ display: 'grid', gap: 8, alignContent: 'start', minWidth: 0 }}>
      <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, color: T2 }}>
        {a.nome}
        <span style={{ display: 'inline-flex', gap: 5, marginLeft: 'auto' }}>{usadaPor.map((id) => <IconeRede key={id} id={id} tam={13} />)}</span>
      </span>
      <span style={{ aspectRatio: `${a.w} / ${a.h}`, maxHeight: 260, width: '100%', borderRadius: 12, background: '#111111', display: 'grid', placeItems: 'center', overflow: 'hidden', border: '1px solid var(--border)', justifySelf: 'center' }}>
        {url ? (video
          ? <video src={url} muted loop playsInline controls style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          // eslint-disable-next-line @next/next/no-img-element
          : <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />)
          : <span style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', padding: 8 }}>{a.w} × {a.h}</span>}
      </span>
      <SeloTamanho url={url} arte={arte} />
      <span style={{ fontSize: 12, color: T3, lineHeight: 1.45 }}>{a.ajuda}</span>
      <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {video
          ? <EnviarVideo pasta={pasta} rotulo={url ? 'Trocar vídeo' : 'Enviar vídeo'} onEnviado={onTroca} />
          : <EnviarFoto pasta={pasta} rotulo={url ? 'Trocar' : 'Enviar arte'} onEnviada={([u]) => onTroca(u)} />}
        {url && <button type="button" style={bt('#64748b')} onClick={() => onTroca(null)}>{ic('fa-xmark')}Tirar</button>}
      </span>
    </div>
  );
}

/** Grade com as artes que as redes escolhidas pedem + o que ainda falta. */
export function ArtesDasRedes({ redes, midia, pasta, onTroca, semSite = false }: {
  redes: RedeId[]; midia: Midia; pasta: string; onTroca: (a: Arte, u: string | null) => void; semSite?: boolean;
}) {
  const precisa = (['site', 'feed', 'vertical', 'video'] as Arte[]).filter((a) => !(semSite && a === 'site') && redes.some((r) => REDE[r].artes.includes(a)));
  const f = faltas(redes, midia);
  if (!redes.length) return <span style={{ fontSize: 13, color: T3 }}>Escolha em quais redes vai sair para ver as artes que precisa.</span>;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(min(190px, 100%), 1fr))', alignItems: 'start' }}>
        {precisa.map((a) => (
          <CaixaArte key={a} arte={a} url={midia[a]} pasta={pasta} onTroca={(u) => onTroca(a, u)} usadaPor={redes.filter((r) => REDE[r].artes.includes(a))} />
        ))}
      </div>
      {f.length > 0 ? (
        <div style={{ display: 'grid', gap: 4, fontSize: 13, color: '#b45309' }}>
          {f.map((x) => <span key={x.rede} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><IconeRede id={x.rede} /> {REDE[x.rede].nome}: {x.falta}</span>)}
        </div>
      ) : <span style={{ fontSize: 13, color: '#16a34a' }}>{ic('fa-circle-check')} Tem arte para todas as redes escolhidas.</span>}
    </div>
  );
}

/** Texto do post com o contador de cada rede (Shorts: título de 100; Insta: 2.200). */
export function LegendaRedes({ valor, onChange, redes }: { valor: string; onChange: (v: string) => void; redes: RedeId[] }) {
  const soc = redes.filter((r) => r !== 'site');
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <textarea value={valor} onChange={(e) => onChange(e.target.value)} rows={5} placeholder={'Ex.: Komander K60 a pronta entrega 🚜\nLeve agora e pague metade em 2027.\nChama no WhatsApp: (14) 3351-6049\n#novatratores #agro'}
        style={{ width: '100%', boxSizing: 'border-box', minHeight: 110, padding: '10px 12px', borderRadius: 10, font: 'inherit', fontSize: 14, resize: 'vertical',
          border: '1px solid color-mix(in srgb, var(--portal-text, #0f172a) 18%, transparent)', background: 'var(--surface)', color: T1 }} />
      <span style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: T3 }}>
        {soc.map((id) => {
          const r = REDE[id];
          const passou = valor.length > r.limite;
          return <span key={id} style={{ display: 'inline-flex', gap: 5, alignItems: 'center', color: passou ? '#dc2626' : T3 }}><IconeRede id={id} tam={12} />{valor.length}/{r.limite}{id === 'youtube' ? ' (título)' : ''}</span>;
        })}
      </span>
    </div>
  );
}
