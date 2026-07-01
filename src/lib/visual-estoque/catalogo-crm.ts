import { supabaseVE } from "./supabase";

// Preenche produtos.imagem_url VAZIAS com as fotos oficiais do catálogo do CRM
// (mesmo Supabase). Duas fontes, em ordem de preferência:
//   1. catalogo_produtos.foto_principal_url — casado por modelos_supabase
//      (lista de modelos) + filtro_supabase ({ marca_like, familia_nome[] }).
//   2. Equipamentos.imagem — casado por marca + modelo.
// Só toca em máquinas (familia != 'Peças') que estão SEM imagem.

// As fotos vêm como URL absoluta (http...) ou caminho relativo servido pelo CRM.
function normalizarFoto(url: string | null | undefined): string | null {
  if (!url) return null;
  const u = String(url).trim();
  if (!u) return null;
  if (u.startsWith("http")) return u;
  return "https://crm.novatratores.com" + (u.startsWith("/") ? u : "/" + u);
}

function norm(s: unknown): string {
  return String(s ?? "").toUpperCase().replace(/\s+/g, " ").trim();
}

interface CatalogoItem {
  foto: string;
  modelos: string[];     // normalizados
  marcaLike: string;     // normalizado ('' se não houver)
  familias: string[];    // normalizadas
}

export interface BackfillResultado {
  ok: boolean;
  semImagem: number;
  atualizados: number;
  porCatalogo: number;
  porEquipamentos: number;
  mensagem?: string;
}

// sobrescrever=false (padrão): só preenche máquinas SEM imagem.
// sobrescrever=true: também troca a imagem de máquinas que JÁ têm foto, quando
// houver correspondência no catálogo oficial (útil p/ trocar fotos do Bing pelas
// oficiais). Nunca apaga: só grava quando encontra uma foto oficial.
export async function backfillImagensCatalogo(contaFiltro?: string, sobrescrever = false): Promise<BackfillResultado> {
  try {
    // 1. Catálogo de marketing (catalogo_produtos)
    const { data: catRows } = await supabaseVE
      .from("catalogo_produtos")
      .select("modelos_supabase, filtro_supabase, foto_principal_url")
      .not("foto_principal_url", "is", null);

    const catalogo: CatalogoItem[] = [];
    for (const c of catRows || []) {
      const foto = normalizarFoto((c as any).foto_principal_url);
      if (!foto) continue;
      const modelos = Array.isArray((c as any).modelos_supabase) ? (c as any).modelos_supabase.map(norm).filter(Boolean) : [];
      const filtro = (c as any).filtro_supabase || {};
      const marcaLike = norm(filtro.marca_like);
      const familias = Array.isArray(filtro.familia_nome) ? filtro.familia_nome.map(norm) : [];
      catalogo.push({ foto, modelos, marcaLike, familias });
    }

    // 2. Equipamentos (marca + modelo -> imagem)
    const { data: equipRows } = await supabaseVE.from("Equipamentos").select("marca, modelo, imagem").not("imagem", "is", null);
    const equipamentos = (equipRows || [])
      .map((e: any) => ({ marca: norm(e.marca), modelo: norm(e.modelo), foto: normalizarFoto(e.imagem) }))
      .filter((e) => e.foto && e.modelo);

    // 3. Máquinas alvo (sem imagem; ou todas, quando sobrescrever)
    let q = supabaseVE
      .from("produtos")
      .select("codigo_produto, marca, modelo, familia_nome")
      .neq("familia_nome", "Peças")
      .gt("estoque", 0);
    if (!sobrescrever) q = q.or("imagem_url.is.null,imagem_url.eq.");
    if (contaFiltro && contaFiltro !== "todas") q = q.eq("conta_omie", contaFiltro);
    const { data: produtos } = await q;

    const semImagem = (produtos || []).length;
    let porCatalogo = 0;
    let porEquipamentos = 0;
    const updates: { codigo_produto: number; imagem_url: string }[] = [];

    for (const p of produtos || []) {
      const pModelo = norm((p as any).modelo);
      const pMarca = norm((p as any).marca);
      const pFamilia = norm((p as any).familia_nome);
      let foto: string | null = null;

      // 3a. catalogo_produtos por modelo (validando marca/família quando existem)
      if (pModelo) {
        for (const c of catalogo) {
          const modeloBate = c.modelos.some((m) => m && (m === pModelo || pModelo.includes(m) || m.includes(pModelo)));
          if (!modeloBate) continue;
          if (c.marcaLike && pMarca && !pMarca.includes(c.marcaLike)) continue;
          if (c.familias.length > 0 && pFamilia && !c.familias.includes(pFamilia)) continue;
          foto = c.foto;
          break;
        }
      }
      if (foto) porCatalogo++;

      // 3b. fallback: Equipamentos por marca + modelo
      if (!foto && pModelo) {
        const eq = equipamentos.find((e) => (e.modelo === pModelo || pModelo.includes(e.modelo) || e.modelo.includes(pModelo)) && (!e.marca || !pMarca || pMarca.includes(e.marca) || e.marca.includes(pMarca)));
        if (eq) { foto = eq.foto; porEquipamentos++; }
      }

      if (foto) updates.push({ codigo_produto: (p as any).codigo_produto, imagem_url: foto });
    }

    // 4. Grava em lotes (só imagem_url; não toca em mais nada)
    for (let i = 0; i < updates.length; i += 50) {
      await Promise.all(
        updates.slice(i, i + 50).map((u) =>
          supabaseVE.from("produtos").update({ imagem_url: u.imagem_url }).eq("codigo_produto", u.codigo_produto),
        ),
      );
    }

    return { ok: true, semImagem, atualizados: updates.length, porCatalogo, porEquipamentos };
  } catch (e) {
    return { ok: false, semImagem: 0, atualizados: 0, porCatalogo: 0, porEquipamentos: 0, mensagem: (e as Error).message };
  }
}
