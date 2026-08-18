'use client';
// Recorte obrigatório antes de anexar NF / recibo / boleto.
//
// Por quê: as fotos chegavam com a mesa, o chão e meia oficina em volta do
// papel. Além de ficar ruim de ler, o PDF juntado (juntarAnexosEmPdf) fica com
// a folha inteira ocupada por fundo. Aqui o usuário enquadra só o documento.
//
// O retângulo inicial já vem sugerido: a foto é reduzida e procuramos as linhas
// e colunas "claras" (o papel costuma ser bem mais claro que a mesa). Se a
// heurística não convencer, é só arrastar — ela só decide onde a caixa começa.
import { useEffect, useRef, useState, useCallback } from 'react';
import { Crop, X, Check, RotateCcw, Loader2 } from 'lucide-react';

interface Props {
  arquivo: File;
  titulo: string;
  onCancelar: () => void;
  onConfirmar: (arquivo: File) => void;
}

// Retângulo em FRAÇÕES da imagem (0..1) — assim não depende do tamanho exibido.
interface Rect { x: number; y: number; w: number; h: number }

const CHEIO: Rect = { x: 0.02, y: 0.02, w: 0.96, h: 0.96 };

// Procura a área clara (o papel) no meio do fundo escuro (mesa/chão).
function sugerirRecorte(img: HTMLImageElement): Rect {
  try {
    const N = 320;
    const esc = Math.min(1, N / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(8, Math.round(img.naturalWidth * esc));
    const h = Math.max(8, Math.round(img.naturalHeight * esc));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    if (!ctx) return CHEIO;
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);

    const lum = new Float32Array(w * h);
    let min = 255, max = 0;
    for (let i = 0; i < w * h; i++) {
      const l = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
      lum[i] = l;
      if (l < min) min = l;
      if (l > max) max = l;
    }
    if (max - min < 40) return CHEIO;   // foto sem contraste: não arrisca
    const corte = min + (max - min) * 0.62;

    // Linha/coluna entra no documento quando boa parte dela é clara. Contar por
    // linha inteira ignora reflexo e sujeira soltos que um bounding box pegaria.
    const claraLinha: boolean[] = [], claraCol: boolean[] = [];
    for (let y = 0; y < h; y++) {
      let c = 0;
      for (let x = 0; x < w; x++) if (lum[y * w + x] > corte) c++;
      claraLinha[y] = c > w * 0.35;
    }
    for (let x = 0; x < w; x++) {
      let c = 0;
      for (let y = 0; y < h; y++) if (lum[y * w + x] > corte) c++;
      claraCol[x] = c > h * 0.35;
    }
    const y0 = claraLinha.indexOf(true), y1 = claraLinha.lastIndexOf(true);
    const x0 = claraCol.indexOf(true), x1 = claraCol.lastIndexOf(true);
    if (x0 < 0 || y0 < 0 || x1 - x0 < w * 0.12 || y1 - y0 < h * 0.12) return CHEIO;

    const folga = 0.006;  // respiro pra não comer a borda do papel
    return {
      x: Math.max(0, x0 / w - folga),
      y: Math.max(0, y0 / h - folga),
      w: Math.min(1, (x1 - x0 + 1) / w + folga * 2),
      h: Math.min(1, (y1 - y0 + 1) / h + folga * 2),
    };
  } catch {
    return CHEIO;
  }
}

type Alca = 'mover' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';

export default function RecorteAnexo({ arquivo, titulo, onCancelar, onConfirmar }: Props) {
  const [src, setSrc] = useState('');
  const [rect, setRect] = useState<Rect>(CHEIO);
  const [pronto, setPronto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const arraste = useRef<{ alca: Alca; x: number; y: number; r: Rect } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(arquivo);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [arquivo]);

  const aoCarregar = () => {
    if (imgRef.current) setRect(sugerirRecorte(imgRef.current));
    setPronto(true);
  };

  const iniciar = (alca: Alca) => (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault(); e.stopPropagation();
    const p = 'touches' in e ? e.touches[0] : e;
    arraste.current = { alca, x: p.clientX, y: p.clientY, r: rect };
  };

  const mover = useCallback((e: MouseEvent | TouchEvent) => {
    const a = arraste.current, box = boxRef.current;
    if (!a || !box) return;
    const p = 'touches' in e ? e.touches[0] : e;
    if (!p) return;
    if ('touches' in e) e.preventDefault(); // não rola/zooma a tela enquanto arrasta no celular
    const cx = box.clientWidth, cy = box.clientHeight;
    const dx = (p.clientX - a.x) / cx, dy = (p.clientY - a.y) / cy;
    const MIN = 0.06;
    let { x, y, w, h } = a.r;

    if (a.alca === 'mover') {
      x = Math.min(Math.max(0, a.r.x + dx), 1 - w);
      y = Math.min(Math.max(0, a.r.y + dy), 1 - h);
    } else {
      if (a.alca.includes('w')) { const nx = Math.min(Math.max(0, a.r.x + dx), a.r.x + a.r.w - MIN); w = a.r.w + (a.r.x - nx); x = nx; }
      if (a.alca.includes('e')) { w = Math.min(Math.max(MIN, a.r.w + dx), 1 - a.r.x); }
      if (a.alca.includes('n')) { const ny = Math.min(Math.max(0, a.r.y + dy), a.r.y + a.r.h - MIN); h = a.r.h + (a.r.y - ny); y = ny; }
      if (a.alca.includes('s')) { h = Math.min(Math.max(MIN, a.r.h + dy), 1 - a.r.y); }
    }
    setRect({ x, y, w, h });
  }, []);

  useEffect(() => {
    const soltar = () => { arraste.current = null; };
    window.addEventListener('mousemove', mover);
    window.addEventListener('mouseup', soltar);
    window.addEventListener('touchmove', mover, { passive: false });
    window.addEventListener('touchend', soltar);
    window.addEventListener('touchcancel', soltar);
    return () => {
      window.removeEventListener('mousemove', mover);
      window.removeEventListener('mouseup', soltar);
      window.removeEventListener('touchmove', mover);
      window.removeEventListener('touchend', soltar);
      window.removeEventListener('touchcancel', soltar);
    };
  }, [mover]);

  const confirmar = async () => {
    const img = imgRef.current;
    if (!img) return;
    setSalvando(true);
    try {
      const W = img.naturalWidth, H = img.naturalHeight;
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(rect.w * W));
      cv.height = Math.max(1, Math.round(rect.h * H));
      const ctx = cv.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, Math.round(rect.x * W), Math.round(rect.y * H), cv.width, cv.height, 0, 0, cv.width, cv.height);
      const blob: Blob = await new Promise((ok) => cv.toBlob((b) => ok(b!), 'image/jpeg', 0.92));
      const nome = arquivo.name.replace(/\.[^.]+$/, '') + '-recortado.jpg';
      onConfirmar(new File([blob], nome, { type: 'image/jpeg' }));
    } finally {
      setSalvando(false);
    }
  };

  const alcaEstilo: React.CSSProperties = {
    position: 'absolute', width: 22, height: 22, borderRadius: 5,
    background: '#fff', border: '2px solid #EA580C', zIndex: 3, touchAction: 'none',
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4" onClick={onCancelar}>
      <div className="bg-white w-full max-w-4xl max-h-[94dvh] rounded-2xl shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center gap-3">
          <Crop size={18} className="text-orange-600" />
          <div className="flex-1 min-w-0">
            <div className="text-[15px] text-black">Recortar {titulo}</div>
            <div className="text-[13px] text-black">Corte a imagem para que fique sem fundo aparente.</div>
          </div>
          <button onClick={onCancelar} className="w-9 h-9 rounded-lg flex items-center justify-center text-black hover:bg-zinc-100">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto bg-zinc-100 p-5 flex items-center justify-center">
          <div ref={boxRef} className="relative select-none" style={{ lineHeight: 0, touchAction: 'none' }}>
            {src && <img ref={imgRef} src={src} alt="" onLoad={aoCarregar} draggable={false}
              style={{ maxWidth: '100%', maxHeight: 'calc(94dvh - 250px)', display: 'block' }} />}

            {pronto && (
              <>
                {/* Escurece o que vai FORA do recorte — mostra o que será jogado away */}
                {([
                  { left: 0, top: 0, width: '100%', height: `${rect.y * 100}%` },
                  { left: 0, top: `${(rect.y + rect.h) * 100}%`, width: '100%', bottom: 0 },
                  { left: 0, top: `${rect.y * 100}%`, width: `${rect.x * 100}%`, height: `${rect.h * 100}%` },
                  { left: `${(rect.x + rect.w) * 100}%`, top: `${rect.y * 100}%`, right: 0, height: `${rect.h * 100}%` },
                ] as React.CSSProperties[]).map((s, i) => (
                  <div key={i} style={{ position: 'absolute', background: 'rgba(15,23,42,.62)', zIndex: 1, ...s }} />
                ))}

                <div
                  onMouseDown={iniciar('mover')}
                  onTouchStart={iniciar('mover')}
                  style={{
                    position: 'absolute', zIndex: 2, cursor: 'move',
                    left: `${rect.x * 100}%`, top: `${rect.y * 100}%`,
                    width: `${rect.w * 100}%`, height: `${rect.h * 100}%`,
                    border: '2px solid #EA580C', boxShadow: '0 0 0 9999px rgba(0,0,0,0)',
                  }}
                />
                {([
                  ['nw', rect.x, rect.y, 'nwse-resize'], ['ne', rect.x + rect.w, rect.y, 'nesw-resize'],
                  ['sw', rect.x, rect.y + rect.h, 'nesw-resize'], ['se', rect.x + rect.w, rect.y + rect.h, 'nwse-resize'],
                  ['n', rect.x + rect.w / 2, rect.y, 'ns-resize'], ['s', rect.x + rect.w / 2, rect.y + rect.h, 'ns-resize'],
                  ['w', rect.x, rect.y + rect.h / 2, 'ew-resize'], ['e', rect.x + rect.w, rect.y + rect.h / 2, 'ew-resize'],
                ] as [Alca, number, number, string][]).map(([alca, px, py, cur]) => (
                  <div key={alca} onMouseDown={iniciar(alca)} onTouchStart={iniciar(alca)}
                    style={{ ...alcaEstilo, left: `${px * 100}%`, top: `${py * 100}%`, transform: 'translate(-50%,-50%)', cursor: cur }} />
                ))}
              </>
            )}
          </div>
        </div>

        {/* Rodapé: no celular os botões QUEBRAM em duas linhas e o "Cortar e
            anexar" cresce — nada de botão escondido fora da tela */}
        <div className="px-3 sm:px-6 py-3 sm:py-4 border-t border-zinc-200 flex flex-wrap items-center gap-2 sm:gap-3">
          <button onClick={() => imgRef.current && setRect(sugerirRecorte(imgRef.current))}
            className="flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-xl border border-zinc-200 text-[13px] sm:text-[14px] text-black hover:bg-zinc-50">
            <RotateCcw size={15} /> Sugerir de novo
          </button>
          <button onClick={() => setRect({ x: 0, y: 0, w: 1, h: 1 })}
            className="px-3 sm:px-4 py-2.5 rounded-xl border border-zinc-200 text-[13px] sm:text-[14px] text-black hover:bg-zinc-50">
            Imagem inteira
          </button>
          <div className="hidden sm:block flex-1" />
          <button onClick={onCancelar} className="flex-1 sm:flex-none justify-center px-4 sm:px-5 py-3 sm:py-2.5 rounded-xl border border-zinc-200 text-[14px] text-black hover:bg-zinc-50">
            Cancelar
          </button>
          <button onClick={confirmar} disabled={!pronto || salvando}
            className="flex-[2] sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-3 sm:py-2.5 rounded-xl bg-orange-600 text-white text-[14px] font-semibold hover:bg-orange-500 disabled:opacity-60">
            {salvando ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Cortar e anexar
          </button>
        </div>
      </div>
    </div>
  );
}
