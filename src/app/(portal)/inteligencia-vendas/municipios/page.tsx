// A Inteligência de Vendas virou uma página só (21/10/2026): este endereço antigo abre
// a página já no módulo, mantendo o resto do link.
import { irParaModuloIV } from '../redirecionar';

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return irParaModuloIV('municipios', await searchParams);
}
