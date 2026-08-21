// A lib `qrcode` não traz tipos no bundle. Declaração mínima do que usamos
// (toDataURL no modal de QR; create nas etiquetas de peças, que montam o SVG
// por conta própria a partir da matriz — o SVG do toString desenha os módulos
// como traço e sai lavado na impressora, ver qrSvg em lib/ppv/etiquetas-html).
declare module 'qrcode' {
  interface QRCodeToDataURLOptions {
    width?: number;
    margin?: number;
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    color?: { dark?: string; light?: string };
  }
  interface QRCodeToStringOptions {
    type?: 'svg' | 'utf8' | 'terminal';
    width?: number;
    margin?: number;
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    color?: { dark?: string; light?: string };
  }
  interface QRCodeCreateOptions {
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    version?: number;
  }
  /** Matriz de módulos: `data` é linha a linha (1 = módulo escuro). */
  interface QRCodeMatriz {
    size: number;
    data: Uint8Array;
  }
  interface QRCodeCriado {
    modules: QRCodeMatriz;
  }
  export function toDataURL(text: string, options?: QRCodeToDataURLOptions): Promise<string>;
  export function toString(text: string, options?: QRCodeToStringOptions): Promise<string>;
  export function create(text: string, options?: QRCodeCreateOptions): QRCodeCriado;
  const _default: { toDataURL: typeof toDataURL; toString: typeof toString; create: typeof create };
  export default _default;
}
