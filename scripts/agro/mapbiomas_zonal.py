"""
Fase 1 — estatística zonal do MapBiomas por CAR, SEM Google Earth Engine.

A coleção 10 é publicada como GeoTIFF otimizado para nuvem (COG) no GCS:
  https://storage.googleapis.com/mapbiomas-public/initiatives/brasil/collection_10/lulc/coverage/brazil_coverage_<ano>.tif
  (EPSG:4326, 30 m, uint8 = classe, 154k × 146k px). Com /vsicurl/ o rasterio lê
  só a janela dos municípios por HTTP range (~4 s para a região de Piraju).

Para cada CAR (lido de agro_car_imovel via REST), rasteriza o polígono na
janela e conta pixels por classe → hectares (pixel ≈ 0,09 ha, corrigido pela
latitude). Traduz classe → cultura pelo vocabulário agro_dominio_cultura
(mapbiomas_classes) e grava agro_uso_solo_car (fonte 'mapbiomas'), uma linha por
CAR × safra × cultura. Também grava agro_car_imovel.area_util_ha (safra mais
recente) — a base do pct_area_util, que NUNCA é a área total do CAR.

Área útil = classes de uso agropecuário (lavouras, pastagem, mosaico,
silvicultura). Fica de fora: vegetação nativa, água, área urbana, não vegetado.

Portão da Fase 1: imprime a área por cultura por município para comparar com o
IBGE PAM (tolerância ±25% em cultura relevante = investigar antes de seguir).

Uso:
  python scripts/agro/mapbiomas_zonal.py --anos 2022 2023 2024 --municipios 3538808 3515400 3551207 3554201 3554607
  python scripts/agro/mapbiomas_zonal.py --anos 2024 --municipios 3538808 --so-relatorio   # não grava
"""
import argparse
import math
import os
import sys
import time
from collections import defaultdict

import numpy as np
import rasterio
from rasterio import features
from rasterio.windows import from_bounds
from shapely.geometry import shape

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from carregar_sicar import Rest, carregar_env  # noqa: E402

COG = "https://storage.googleapis.com/mapbiomas-public/initiatives/brasil/collection_10/lulc/coverage/brazil_coverage_{ano}.tif"

# Coleção 10 — classes de USO agropecuário (contam na área útil)
CLASSES_USO = {15, 9, 21, 39, 20, 40, 62, 41, 46, 47, 35, 48}
NOMES = {3: "Formação florestal", 4: "Savânica", 5: "Mangue", 6: "Alagada", 49: "Restinga arbórea", 11: "Campo alagado",
         12: "Campestre", 13: "Outra não florestal", 50: "Restinga herbácea", 32: "Apicum", 29: "Afloramento rochoso",
         24: "Área urbanizada", 30: "Mineração", 25: "Outra não vegetada", 23: "Praia/duna", 33: "Rio/lago", 31: "Aquicultura",
         15: "Pastagem", 9: "Silvicultura", 21: "Mosaico de usos", 39: "Soja", 20: "Cana", 40: "Arroz", 62: "Algodão",
         41: "Outras temporárias", 46: "Café", 47: "Citros", 35: "Dendê", 48: "Outras perenes", 0: "Sem dado"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--anos", nargs="+", type=int, required=True)
    ap.add_argument("--municipios", nargs="+", required=True)
    ap.add_argument("--so-relatorio", action="store_true")
    ap.add_argument("--apenas-area-util", action="store_true",
                    help="não grava uso do solo nem abre execução: só (re)calcula area_util_ha do último ano (retomar carga interrompida)")
    ap.add_argument("--lote", type=int, default=300)
    ap.add_argument("--executado-por", default=os.environ.get("USERNAME") or os.environ.get("USER") or "pipeline")
    a = ap.parse_args()
    os.environ.setdefault("GDAL_HTTP_MULTIRANGE", "YES")
    os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")

    env = carregar_env()
    rest = Rest(env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"])

    # vocabulário: classe -> cultura
    classe_para_cultura = {}
    for d in rest._req("GET", "/agro_dominio_cultura?select=codigo,mapbiomas_classes"):
        for c in d["mapbiomas_classes"] or []:
            classe_para_cultura[int(c)] = d["codigo"]

    # imóveis ATIVOS dos municípios (geometria vem como GeoJSON pelo PostgREST)
    imoveis = []
    for cod in a.municipios:
        off = 0
        while True:
            pag = rest._req("GET", f"/agro_car_imovel?select=cod_car,municipio_ibge,municipio,geom&status_car=eq.AT&municipio_ibge=eq.{cod}&order=cod_car&limit=1000&offset={off}")
            imoveis += pag
            if len(pag) < 1000:
                break
            off += 1000
    print(f"imóveis ativos: {len(imoveis)}", file=sys.stderr)
    geoms = [(i["cod_car"], i["municipio_ibge"], i["municipio"], shape(i["geom"])) for i in imoveis]
    minx = min(g.bounds[0] for *_, g in geoms) - 0.01; miny = min(g.bounds[1] for *_, g in geoms) - 0.01
    maxx = max(g.bounds[2] for *_, g in geoms) + 0.01; maxy = max(g.bounds[3] for *_, g in geoms) + 0.01

    execucao_id = None
    if a.apenas_area_util:
        a.anos = [max(a.anos)]
    if not a.so_relatorio and not a.apenas_area_util:
        execucao_id = rest.insert("agro_pipeline_execucao", [{
            "fonte": "mapbiomas", "versao": "mapbiomas col10 COG " + ",".join(map(str, a.anos)),
            "parametros": {"anos": a.anos, "municipios": a.municipios, "classes_uso": sorted(CLASSES_USO), "origem": COG},
            "executado_por": a.executado_por,
        }])[0]["id"]
        print(f"execução #{execucao_id} aberta", file=sys.stderr)

    total_linhas = 0
    area_util_ultima = {}
    for ano in a.anos:
        t = time.time()
        with rasterio.open("/vsicurl/" + COG.format(ano=ano)) as src:
            win = from_bounds(minx, miny, maxx, maxy, src.transform)
            arr = src.read(1, window=win)
            tr = src.window_transform(win)
        print(f"[{ano}] janela {arr.shape} lida em {time.time()-t:.1f}s", file=sys.stderr)
        # pixel em ha depende da latitude (30 m × 30 m no equador em graus)
        px_deg = abs(tr.a)
        linhas = []
        por_mun = defaultdict(lambda: defaultdict(float))
        for cod_car, mun, mun_nome, g in geoms:
            # recorta a sub-janela do imóvel (rasterizar na janela inteira por CAR seria 100x mais lento)
            bx0, by0, bx1, by1 = g.bounds
            sub = from_bounds(bx0, by0, bx1, by1, tr)
            r0 = max(int(math.floor(sub.row_off)), 0); c0 = max(int(math.floor(sub.col_off)), 0)
            r1 = min(int(math.ceil(sub.row_off + sub.height)) + 1, arr.shape[0]); c1 = min(int(math.ceil(sub.col_off + sub.width)) + 1, arr.shape[1])
            if r1 <= r0 or c1 <= c0:
                continue
            sub_arr = arr[r0:r1, c0:c1]
            sub_tr = tr * tr.translation(c0, r0)
            mask = features.geometry_mask([g.__geo_interface__], out_shape=sub_arr.shape, transform=sub_tr, invert=True)
            vals = sub_arr[mask]
            if vals.size == 0:
                continue
            lat = g.centroid.y
            ha_px = (px_deg * 111_320 * math.cos(math.radians(lat))) * (px_deg * 110_570) / 10_000
            cont = np.bincount(vals, minlength=256)
            area_util = float(sum(cont[c] for c in CLASSES_USO)) * ha_px
            area_util_ultima[cod_car] = area_util
            por_cultura = defaultdict(float)
            for classe in np.nonzero(cont)[0]:
                cult = classe_para_cultura.get(int(classe))
                if cult:
                    por_cultura[cult] += float(cont[classe]) * ha_px
            for cult, ha in por_cultura.items():
                por_mun[mun_nome][cult] += ha
                linhas.append({"cod_car": cod_car, "ano_safra": ano, "fonte": "mapbiomas", "cultura_codigo": cult,
                               "area_ha": round(ha, 4), "pct_area_util": round(ha / area_util * 100, 2) if area_util > 0 else None,
                               "execucao_id": execucao_id})
            por_mun[mun_nome]["_area_util"] += area_util
        print(f"[{ano}] {len(linhas)} linhas CAR×cultura", file=sys.stderr)
        print(f"\n=== MapBiomas {ano} — área por cultura por município (ha, só CARs ativos) — comparar com IBGE PAM ===")
        for mun_nome, d in por_mun.items():
            itens = sorted(((k, v) for k, v in d.items() if not k.startswith("_")), key=lambda x: -x[1])
            print(f"  {mun_nome:<14} área útil {d['_area_util']:>9,.0f} | " + " · ".join(f"{k} {v:,.0f}" for k, v in itens[:7]))
        if not a.so_relatorio and not a.apenas_area_util:
            for i in range(0, len(linhas), a.lote):
                rest.insert("agro_uso_solo_car", linhas[i:i + a.lote], upsert_em="cod_car,ano_safra,fonte,cultura_codigo")
            total_linhas += len(linhas)

    if not a.so_relatorio:
        # área útil do imóvel = safra mais recente: UMA RPC em SQL (agro_recalcular_area_util).
        # Antes era um PATCH por imóvel em 8 threads — 28 mil PATCHes saturaram o Supabase.
        try:
            n = rest.rpc("agro_recalcular_area_util", {"p_ano_safra": max(a.anos)})
            print(f"area_util_ha recalculada em {n} imóveis (RPC)", file=sys.stderr)
        except RuntimeError as e:
            print(f"RPC agro_recalcular_area_util indisponível ({str(e)[:80]}); caindo pro PATCH por imóvel, 2 threads", file=sys.stderr)
            from concurrent.futures import ThreadPoolExecutor
            itens = list(area_util_ultima.items()); falhas = []
            def patch1(it):
                try:
                    rest.patch("agro_car_imovel", f"cod_car=eq.{it[0]}", {"area_util_ha": round(it[1], 4)})
                except Exception as e2:
                    falhas.append((it[0], str(e2)[:80]))
            with ThreadPoolExecutor(max_workers=2) as ex:
                list(ex.map(patch1, itens))
            n = len(itens) - len(falhas)
            print(f"area_util_ha gravada em {n} imóveis; falhas: {len(falhas)}", file=sys.stderr)
        if a.apenas_area_util:
            return
        rest.patch("agro_pipeline_execucao", f"id=eq.{execucao_id}", {
            "concluido_em": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "linhas": total_linhas,
            "observacao": f"{len(geoms)} CARs × {len(a.anos)} safras; area_util_ha atualizada em {n} imóveis",
        })
        print(f"\nexecução #{execucao_id} concluída: {total_linhas} linhas em agro_uso_solo_car")


if __name__ == "__main__":
    main()
