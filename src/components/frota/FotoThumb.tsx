'use client';
// Miniatura de foto do Supabase Storage via transformação de imagem
// (render/image): foto de câmera de vários MB vira um thumb de KB no tamanho
// exibido. Se a transformação falhar (URL fora do Storage, formato não
// suportado, plano), o onError cai no arquivo ORIGINAL — nunca quebra a foto.
// Sempre lazy: só baixa quando entra na tela.
import { useState } from 'react';

export function thumbUrl(url: string, width: number): string {
  if (!url.includes('/storage/v1/object/public/')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return (
    url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/') +
    `${sep}width=${width}&quality=70`
  );
}

export default function FotoThumb({ src, width, alt = '', style }: {
  src: string;
  /** largura do thumb em px REAIS (use ~2x o tamanho exibido, por causa de telas retina) */
  width: number;
  alt?: string;
  style?: React.CSSProperties;
}) {
  const [falhou, setFalhou] = useState(false);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={falhou ? src : thumbUrl(src, width)}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFalhou(true)}
      style={style}
    />
  );
}
