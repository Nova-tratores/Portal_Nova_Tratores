// A lib `qrcode` não traz tipos no bundle. Declaração mínima do que usamos
// (toDataURL no modal de QR; toString type:'svg' nas etiquetas de peças).
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
  export function toDataURL(text: string, options?: QRCodeToDataURLOptions): Promise<string>;
  export function toString(text: string, options?: QRCodeToStringOptions): Promise<string>;
  const _default: { toDataURL: typeof toDataURL; toString: typeof toString };
  export default _default;
}
