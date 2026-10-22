// Tratores vendidos no território (app de vendas): quantos tratores nossos há no
// município (tabela `tratores`, cidade em texto livre) e quais já foram
// localizados em campo pelo vendedor (trator_localizacao). Regras puras.

export interface TratorVendido { Chassis: string; Modelo: string | null; Cliente: string | null; Cidade: string | null; Entrega: string | null }
export interface TratorLocalizado { chassis: string; lat: number | null; lng: number | null; cod_car: string | null; confirmado_em: string; vendedor_nome: string | null }

const UF = /\s*(?:\(|\/|-|\s)\s*(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\s*\)?$/;

/** Nome de município comparável: sem acento, maiúsculo, sem UF, sem fazenda/bairro. */
export function chaveMunicipio(texto: string | null | undefined): string {
  let t = String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
  t = t.split('/')[0].replace(UF, '').replace(/\s+(FAZ|FAZENDA|SITIO|BAIRRO)\b.*$/, '');
  t = t.replace(/^STA\.? /, 'SANTA ').replace(/^STO\.? /, 'SANTO ');
  return t.replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

export function tratoresDoMunicipio(
  municipio: string,
  vendidos: TratorVendido[],
  localizados: TratorLocalizado[],
  codCarsDoMunicipio: Set<string>,
) {
  const alvo = chaveMunicipio(municipio);
  const porChassi = new Map(localizados.map((l) => [l.chassis, l]));
  const lista = vendidos
    .filter((t) => t.Chassis && chaveMunicipio(t.Cidade) === alvo)
    .map((t) => ({
      chassis_fim: String(t.Chassis).slice(-6),
      modelo: t.Modelo, cliente: t.Cliente, entrega: t.Entrega,
      localizado: porChassi.has(t.Chassis),
    }));
  // pinos: localizados dentro de um imóvel deste município (ou vendidos aqui, se o GPS caiu fora do CAR)
  const chassisDaqui = new Set(vendidos.filter((t) => chaveMunicipio(t.Cidade) === alvo).map((t) => t.Chassis));
  const vendidosPorChassi = new Map(vendidos.map((t) => [t.Chassis, t]));
  const pinos = localizados
    .filter((l) => l.lat != null && l.lng != null && ((l.cod_car && codCarsDoMunicipio.has(l.cod_car)) || chassisDaqui.has(l.chassis)))
    .map((l) => {
      const t = vendidosPorChassi.get(l.chassis);
      return {
        lat: l.lat as number, lng: l.lng as number, cod_car: l.cod_car,
        modelo: t?.Modelo || null, cliente: t?.Cliente || null, chassis_fim: String(l.chassis).slice(-6),
        confirmado_em: l.confirmado_em, vendedor_nome: l.vendedor_nome,
      };
    });
  return { vendidos: lista.length, localizados: lista.filter((x) => x.localizado).length, lista, pinos };
}
