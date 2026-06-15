// Formatadores do modulo DRE Financeiro.
// Port FIEL dos helpers app.locals do server.js da fonte (financeiro-omie-dashboard).
// Estes formatadores sao puros e podem ser usados tanto server-side (import direto
// em rotas/calc) quanto client-side (nas telas).
//
// O hook client useDreConta vive em ./useDreConta e e reexportado aqui para casar
// com o BRIEF: ambos importaveis de '@/lib/dre-financeiro/format'.

// formatBRL(v): moeda pt-BR BRL, 2 casas. (server.js ~linha 36)
export const formatBRL = (v) => new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL',
  minimumFractionDigits: 2, maximumFractionDigits: 2
}).format(Number(v) || 0);

// formatBRLcurto(v): >=1M -> "R$ X,XM"; >=1k -> "R$ X,Xk"; senao "R$ N". (server.js ~linha 42)
export const formatBRLcurto = (v) => {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1000000) return 'R$ ' + (n / 1000000).toFixed(1).replace('.', ',') + 'M';
  if (Math.abs(n) >= 1000) return 'R$ ' + (n / 1000).toFixed(1).replace('.', ',') + 'k';
  return 'R$ ' + n.toFixed(0);
};

// formatData(iso): dd/mm/yyyy. (server.js ~linha 47 -> usa fmtBR de dates)
export const formatData = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
};

// nomeMes(m): array MESES Janeiro..Dezembro, indice (m-1+12)%12. (server.js ~linha 53)
const MESES = ['Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
                'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const nomeMes = (m) => MESES[(m - 1 + 12) % 12];

// Reexporta o hook de conta para que ele seja importavel deste modulo.
export { useDreConta } from './useDreConta';
