import { supabase } from "./supabase";
import { VALOR_HORA, VALOR_KM } from "./constants";

export interface ConfigPOS {
  valor_hora: number;
  valor_km: number;
}

export async function getConfigPOS(): Promise<ConfigPOS> {
  const { data } = await supabase
    .from("configuracoes_pos")
    .select("valor_hora, valor_km")
    .eq("id", 1)
    .single();

  return {
    valor_hora: data?.valor_hora ?? VALOR_HORA,
    valor_km: data?.valor_km ?? VALOR_KM,
  };
}
