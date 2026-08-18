'use client';
// Preview INLINE de documento — o pedido original: "ver o documento do carro
// sem precisar abrir o .pdf". PDF é rasterizado em <canvas> com o pdfjs-dist
// (mesma técnica do leitor de DANFE do financeiro); imagem vai direto.
// Miniatura no card; clique abre o lightbox com as primeiras páginas legíveis.
import { useEffect, useRef, useState } from 'react';
import { FileText, Loader2, X, Download } from 'lucide-react';

interface Props {
  url: string;
  nome?: string | null;
  alturaThumb?: number; // px
}

const ehPdf = (url: string, nome?: string | null) =>
  /\.pdf($|\?)/i.test(url) || /\.pdf$/i.test(nome || '');

async function pdfjs() {
  const lib = await import('pdfjs-dist');
  try {
    // @ts-expect-error — o worker não expõe tipos (é só o bundle do worker)
    lib.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs')).default;
  } catch {
    lib.GlobalWorkerOptions.workerSrc = '';
  }
  return lib;
}

async function renderPagina(pdf: any, numero: number, larguraAlvo: number): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(numero);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(3, Math.max(0.4, larguraAlvo / base.width));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return canvas;
}

export default function DocumentoInline({ url, nome, alturaThumb = 120 }: Props) {
  const thumbRef = useRef<HTMLDivElement>(null);
  const lightboxRef = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'erro'>('carregando');
  const [aberto, setAberto] = useState(false);
  const [carregandoLightbox, setCarregandoLightbox] = useState(false);
  const pdfDocRef = useRef<any>(null);

  // Miniatura (página 1)
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        if (!ehPdf(url, nome)) {
          if (thumbRef.current) {
            const img = document.createElement('img');
            img.src = url;
            img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
            img.onload = () => !cancelado && setEstado('ok');
            img.onerror = () => !cancelado && setEstado('erro');
            thumbRef.current.replaceChildren(img);
          }
          return;
        }
        const lib = await pdfjs();
        const buf = await (await fetch(url)).arrayBuffer();
        if (cancelado) return;
        const pdf = await lib.getDocument({ data: buf }).promise;
        pdfDocRef.current = pdf;
        const canvas = await renderPagina(pdf, 1, 480);
        if (cancelado || !thumbRef.current) return;
        canvas.style.cssText = 'width:100%;height:100%;object-fit:cover;object-position:top;display:block';
        thumbRef.current.replaceChildren(canvas);
        setEstado('ok');
      } catch {
        if (!cancelado) setEstado('erro');
      }
    })();
    return () => { cancelado = true; };
  }, [url, nome]);

  // Lightbox (até 5 páginas em tamanho de leitura)
  const abrirLightbox = async () => {
    setAberto(true);
    setCarregandoLightbox(true);
    // espera o portal montar
    setTimeout(async () => {
      try {
        const alvo = lightboxRef.current;
        if (!alvo) return;
        alvo.replaceChildren();
        if (!ehPdf(url, nome)) {
          const img = document.createElement('img');
          img.src = url;
          img.style.cssText = 'max-width:100%;border-radius:8px;display:block;margin:0 auto';
          alvo.appendChild(img);
        } else {
          let pdf = pdfDocRef.current;
          if (!pdf) {
            const lib = await pdfjs();
            const buf = await (await fetch(url)).arrayBuffer();
            pdf = await lib.getDocument({ data: buf }).promise;
            pdfDocRef.current = pdf;
          }
          const paginas = Math.min(pdf.numPages, 5);
          const largura = Math.min(900, window.innerWidth - 80);
          for (let n = 1; n <= paginas; n++) {
            const canvas = await renderPagina(pdf, n, largura);
            canvas.style.cssText = 'width:100%;border-radius:8px;display:block;margin:0 auto 12px;box-shadow:0 4px 20px rgba(0,0,0,0.35)';
            alvo.appendChild(canvas);
          }
          if (pdf.numPages > paginas) {
            const aviso = document.createElement('div');
            aviso.textContent = `… +${pdf.numPages - paginas} página(s) — baixe o arquivo pra ver tudo`;
            aviso.style.cssText = 'text-align:center;color:#cbd5e1;font-size:13px;padding:8px';
            alvo.appendChild(aviso);
          }
        }
      } catch { /* o botão de baixar continua lá */ }
      setCarregandoLightbox(false);
    }, 30);
  };

  return (
    <>
      <button
        onClick={abrirLightbox}
        title={nome || 'Ver o documento'}
        style={{
          position: 'relative', width: '100%', height: alturaThumb, padding: 0,
          border: '1px solid var(--portal-border)', borderRadius: 0, overflow: 'hidden',
          background: 'var(--portal-bg-secondary)', cursor: 'pointer', display: 'block',
        }}
      >
        <div ref={thumbRef} style={{ width: '100%', height: '100%' }} />
        {estado === 'carregando' && (
          <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-text)' }}>
            <Loader2 size={16} className="spin" />
          </span>
        )}
        {estado === 'erro' && (
          <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', justifyContent: 'center', color: 'var(--portal-text)', fontSize: 11 }}>
            <FileText size={18} /> ver arquivo
          </span>
        )}
      </button>

      {aberto && (
        <div
          onClick={() => setAberto(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 2000, display: 'flex', flexDirection: 'column', padding: '20px 16px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, maxWidth: 940, width: '100%', margin: '0 auto 10px' }}>
            <strong style={{ color: '#fff', fontSize: 14, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {nome || 'Documento'}
            </strong>
            <a
              href={url} target="_blank" rel="noopener noreferrer" download
              onClick={(e) => e.stopPropagation()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#fff', fontSize: 13.5, textDecoration: 'none', background: 'rgba(255,255,255,0.15)', padding: '6px 12px', borderRadius: 0 }}
            >
              <Download size={13} /> baixar
            </a>
            <button onClick={() => setAberto(false)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 0, padding: 6, cursor: 'pointer', color: '#fff' }}>
              <X size={16} />
            </button>
          </div>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ flex: 1, overflowY: 'auto', maxWidth: 940, width: '100%', margin: '0 auto' }}
          >
            {carregandoLightbox && (
              <div style={{ textAlign: 'center', color: '#cbd5e1', padding: 30 }}>
                <Loader2 size={20} className="spin" />
              </div>
            )}
            <div ref={lightboxRef} />
          </div>
        </div>
      )}
    </>
  );
}
