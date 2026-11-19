// Logo de cada rede em selo quadrado, com a cara oficial (José, 13/11/2026: "coloca as logos").
// Site = ícone da Nova Tratores; as redes usam o símbolo oficial (Font Awesome Brands) no fundo da marca.
import type { RedeId } from '@/lib/marketing/redes/redes';

const FUNDO: Record<RedeId, string> = {
  site: '#c8102e',
  instagram: 'radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%)',
  facebook: '#1877f2',
  tiktok: '#000000',
  youtube: '#ff0000',
};
const SIMBOLO: Record<Exclude<RedeId, 'site'>, string> = {
  instagram: 'fa-instagram', facebook: 'fa-facebook-f', tiktok: 'fa-tiktok', youtube: 'fa-youtube',
};

export function LogoRede({ id, tam = 28 }: { id: RedeId; tam?: number }) {
  const caixa = { width: tam, height: tam, borderRadius: Math.round(tam * 0.28), flex: 'none' as const, display: 'inline-grid', placeItems: 'center', overflow: 'hidden' };
  if (id === 'site') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src="/icon-192.png" alt="Site Nova Tratores" width={tam} height={tam} style={{ ...caixa, objectFit: 'cover' }} />;
  }
  return (
    <span style={{ ...caixa, background: FUNDO[id] }} aria-label={id}>
      <i className={`fa-brands ${SIMBOLO[id]}`} style={{ color: '#ffffff', fontSize: Math.round(tam * 0.58), fontWeight: 400, textShadow: id === 'tiktok' ? `${tam/24}px ${tam/24}px 0 #fe2c55, -${tam/24}px -${tam/24}px 0 #25f4ee` : undefined }} />
    </span>
  );
}
