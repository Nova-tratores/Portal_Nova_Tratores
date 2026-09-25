"""
Fase 0 do plano "Inteligência Agrícola por CAR" — PORTÃO SICOR (vários municípios numa passada).

Pergunta que este script responde: as glebas do SICOR (microdados do BCB) têm
geometria e produto utilizáveis nos municípios de atuação? E quantas delas caem
dentro de um CAR ativo (prévia do portão da Fase 2)?

Fontes (todas públicas, sem login):
  - https://www.bcb.gov.br/htms/sicor/DadosBrutos/SICOR_GLEBAS.gz
        um PONTO por linha: #REF_BACEN;NU_ORDEM;NU_IDENTIFICADOR;NU_INDICE_GLEBA;
        NU_INDICE_PONTO;VL_LATITUDE;VL_LONGITUDE;CGL_VL_ALTITUDE;ID_PONTO
        (arquivo único, todos os anos, ~2,1 GB gz, ~157 milhões de pontos). NÃO tem município.
  - https://www.bcb.gov.br/htms/sicor/DadosBrutos/SICOR_OPERACAO_BASICA_ESTADO_<ano>.gz
        uma OPERAÇÃO por linha (chave REF_BACEN+NU_ORDEM): CD_ESTADO, CD_EMPREENDIMENTO,
        VL_PARC_CREDITO, VL_AREA_FINANC, CD_PROGRAMA... NÃO tem município.
  - https://www.bcb.gov.br/htms/sicor/Empreendimento.csv
        domínio: CD_EMPREENDIMENTO -> FINALIDADE / ATIVIDADE / MODALIDADE / PRODUTO.
  - IBGE malhas (baixadas automaticamente): polígono de cada município.
  - (opcional) GeoJSON do SICAR por município, gerado por sicar_wfs_baixar.py,
        para a prévia de atribuição gleba->CAR.

Como o município não vem em lugar nenhum, o recorte é ESPACIAL: a gleba entra
no município em que o centróide dos pontos dela cai.

Uso (uma passada pelo arquivo de glebas serve todos os municípios):
  zcat SICOR_GLEBAS.gz | python sicor_portao_fase0.py \
      --municipios 3538808 3515400 3551207 3554201 3554607 \
      --ops SICOR_OPERACAO_BASICA_ESTADO_2019.gz ... SICOR_OPERACAO_BASICA_ESTADO_2024.gz \
      --empreendimento Empreendimento.csv --uf SP \
      --malhas ./malhas --car-dir ./car --saida-csv glebas_regiao.csv

Só biblioteca padrão (sem shapely/pandas) — roda em qualquer máquina. ~25 min por passada.
"""
import argparse
import csv
import gzip
import io
import json
import math
import os
import sys
import urllib.request
from collections import Counter, defaultdict


# ---------- geometria (puro Python) ----------

def _aneis_de_geojson(geom):
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    return [[[(p[0], p[1]) for p in ring] for ring in poly] for poly in polys]


def _bbox(aneis):
    xs = [p[0] for poly in aneis for ring in poly for p in ring]
    ys = [p[1] for poly in aneis for ring in poly for p in ring]
    return (min(xs), min(ys), max(xs), max(ys))


def _dentro_anel(x, y, anel):
    dentro = False
    j = len(anel) - 1
    for i in range(len(anel)):
        xi, yi = anel[i]
        xj, yj = anel[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            dentro = not dentro
        j = i
    return dentro


def dentro_poligono(x, y, aneis):
    for poly in aneis:
        if _dentro_anel(x, y, poly[0]) and not any(_dentro_anel(x, y, b) for b in poly[1:]):
            return True
    return False


def area_ha(pontos):
    """Área aproximada (shoelace em graus -> hectares, válido p/ polígono pequeno)."""
    if len(pontos) < 3:
        return 0.0
    lat0 = sum(p[1] for p in pontos) / len(pontos)
    kx = 111.32 * math.cos(math.radians(lat0))
    ky = 110.57
    s = 0.0
    n = len(pontos)
    for i in range(n):
        x1, y1 = pontos[i][0] * kx, pontos[i][1] * ky
        x2, y2 = pontos[(i + 1) % n][0] * kx, pontos[(i + 1) % n][1] * ky
        s += x1 * y2 - x2 * y1
    return abs(s) / 2 * 100


def decimais(txt):
    return len(txt.split(".")[1].rstrip("0")) if "." in txt else 0


# ---------- municípios (IBGE) ----------

def carregar_municipio(cod, pasta):
    """Baixa (uma vez) a malha e o nome do município no IBGE."""
    os.makedirs(pasta, exist_ok=True)
    geo = os.path.join(pasta, f"{cod}.geojson")
    meta = os.path.join(pasta, f"{cod}.json")
    def baixar(url, destino):
        # urllib primeiro; se o TLS do servidor recusar (acontece no geoserver do CAR), cai pro curl
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (portal-nova-tratores agro)"})
            with urllib.request.urlopen(req, timeout=120) as r:
                dados = r.read()
        except Exception:
            import subprocess
            dados = subprocess.run(["curl", "-s", "-L", "--max-time", "120", "-A", "Mozilla/5.0", url],
                                   capture_output=True, timeout=150).stdout
        if not dados:
            raise RuntimeError("falhou ao baixar " + url)
        if dados[:2] == b"\x1f\x8b":  # o IBGE devolve gzip mesmo sem Accept-Encoding
            dados = gzip.decompress(dados)
        with open(destino, "wb") as f:
            f.write(dados)

    if not os.path.exists(geo):
        baixar(f"https://servicodados.ibge.gov.br/api/v3/malhas/municipios/{cod}?formato=application/vnd.geo+json&qualidade=maxima", geo)
    if not os.path.exists(meta):
        baixar(f"https://servicodados.ibge.gov.br/api/v1/localidades/municipios/{cod}", meta)
    with open(geo, encoding="utf-8") as f:
        g = json.load(f)
    with open(meta, encoding="utf-8") as f:
        nome = json.load(f)["nome"]
    geom = g["features"][0]["geometry"] if "features" in g else g
    aneis = _aneis_de_geojson(geom)
    return {"cod": cod, "nome": nome, "aneis": aneis, "bbox": _bbox(aneis),
            "area_ha": sum(area_ha(poly[0]) for poly in aneis)}


def carregar_car(caminho):
    """CARs ATIVOS de um GeoJSON do SICAR (sicar_wfs_baixar.py)."""
    with open(caminho, encoding="utf-8") as f:
        d = json.load(f)
    cars = []
    for ft in d.get("features", []):
        p = ft["properties"]
        if p.get("status_imovel") != "AT" or not ft.get("geometry"):
            continue
        aneis = _aneis_de_geojson(ft["geometry"])
        cars.append((p["cod_imovel"], aneis, _bbox(aneis)))
    return cars


def cars_do_ponto(x, y, cars):
    hits = []
    for cod, aneis, bb in cars:
        if bb[0] <= x <= bb[2] and bb[1] <= y <= bb[3] and dentro_poligono(x, y, aneis):
            hits.append(cod)
    return hits


# ---------- SICOR ----------

def ler_empreendimento(caminho):
    m = {}
    with open(caminho, encoding="latin-1", newline="") as f:
        r = csv.reader(f, delimiter=";")
        cab = next(r)
        cab[0] = cab[0].lstrip("#")
        ix = {c: i for i, c in enumerate(cab)}
        for row in r:
            if row:
                m[row[ix["CODIGO"]]] = {"finalidade": row[ix["FINALIDADE"]], "atividade": row[ix["ATIVIDADE"]],
                                        "modalidade": row[ix["MODALIDADE"]], "produto": row[ix["PRODUTO"]]}
    return m


def ler_operacoes(caminhos, uf):
    ops = {}
    for caminho in caminhos:
        with gzip.open(caminho, "rt", encoding="latin-1", newline="") as f:
            r = csv.reader(f, delimiter=";")
            cab = next(r)
            cab[0] = cab[0].lstrip("#")
            ix = {c: i for i, c in enumerate(cab)}
            for row in r:
                if len(row) < len(cab) or (uf and row[ix["CD_ESTADO"]] != uf):
                    continue
                ops[(row[ix["REF_BACEN"]], row[ix["NU_ORDEM"]])] = {
                    "emissao": row[ix["DT_EMISSAO"]], "ano": row[ix["DT_EMISSAO"]][-4:],
                    "empreendimento": row[ix["CD_EMPREENDIMENTO"]], "programa": row[ix["CD_PROGRAMA"]],
                    "fonte": row[ix["CD_FONTE_RECURSO"]], "valor": row[ix["VL_PARC_CREDITO"]],
                    "area_financ": row[ix["VL_AREA_FINANC"]], "cnpj_if": row[ix["CNPJ_IF"]],
                }
        print(f"  operações lidas de {os.path.basename(caminho)}: acumulado {len(ops)}", file=sys.stderr)
    return ops


def ler_glebas_stdin(bbox, refs_interesse):
    minx, miny, maxx, maxy = bbox
    glebas = defaultdict(list)
    refs_com_gleba = set()
    total = 0
    entrada = io.TextIOWrapper(sys.stdin.buffer, encoding="latin-1", newline="")
    cab = entrada.readline()
    if not cab.startswith("#REF_BACEN"):
        sys.exit("stdin não parece o SICOR_GLEBAS (cabeçalho inesperado): " + cab[:80])
    for linha in entrada:
        total += 1
        partes = linha.rstrip("\r\n").split(";")
        if len(partes) < 7:
            continue
        chave_op = (partes[0], partes[1])
        if refs_interesse and chave_op in refs_interesse:
            refs_com_gleba.add(chave_op)
        try:
            lat = float(partes[5]); lon = float(partes[6])
        except ValueError:
            continue
        if minx <= lon <= maxx and miny <= lat <= maxy:
            glebas[(partes[0], partes[1], partes[2], partes[3])].append(
                (int(partes[4]) if partes[4].isdigit() else 0, lon, lat,
                 max(decimais(partes[5]), decimais(partes[6]))))
        if total % 20_000_000 == 0:
            print(f"  ...{total:,} pontos varridos, {len(glebas)} glebas na bbox", file=sys.stderr)
    return glebas, refs_com_gleba, total


# ---------- relatório ----------

def faixa_pontos(n):
    return "1 ponto" if n == 1 else "2 pontos" if n == 2 else "3-4" if n <= 4 else "5-20" if n <= 20 else "21-100" if n <= 100 else ">100"


def faixa_precisao(dec):
    return "<=2 casas (~1 km)" if dec <= 2 else "3 casas (~100 m)" if dec == 3 else "4 casas (~10 m)" if dec == 4 else ">=5 casas (~1 m)"


def top(c, n=12):
    tot = sum(c.values()) or 1
    return "\n".join(f"  {k:<45} {v:>6}  ({v*100/tot:.0f}%)" for k, v in c.most_common(n)) or "  (nada)"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--municipios", nargs="+", required=True, help="códigos IBGE (7 dígitos)")
    ap.add_argument("--malhas", default="./malhas", help="pasta de cache das malhas IBGE")
    ap.add_argument("--car-dir", default=None, help="pasta com car_<uf>_<ibge>.geojson (sicar_wfs_baixar.py) p/ prévia gleba->CAR")
    ap.add_argument("--ops", nargs="+", required=True)
    ap.add_argument("--empreendimento", required=True)
    ap.add_argument("--uf", default="SP")
    ap.add_argument("--cobertura-ano", default=None)
    ap.add_argument("--saida-csv", default=None)
    a = ap.parse_args()

    muns = [carregar_municipio(c, a.malhas) for c in a.municipios]
    bbox = (min(m["bbox"][0] for m in muns), min(m["bbox"][1] for m in muns),
            max(m["bbox"][2] for m in muns), max(m["bbox"][3] for m in muns))
    print(f"[1/4] municípios: {', '.join(m['nome'] for m in muns)}; bbox união={bbox}", file=sys.stderr)
    emp = ler_empreendimento(a.empreendimento)
    print(f"[2/4] empreendimentos: {len(emp)}", file=sys.stderr)
    ops = ler_operacoes(a.ops, a.uf)
    anos_ops = sorted({o["ano"] for o in ops.values()})
    ano_cob = a.cobertura_ano or (anos_ops[-1] if anos_ops else None)
    refs_interesse = {k for k, o in ops.items() if o["ano"] == ano_cob}
    print(f"[3/4] operações {a.uf} {anos_ops}: {len(ops)}; cobertura medida em {ano_cob}: {len(refs_interesse)} ops", file=sys.stderr)

    glebas, refs_com_gleba, total_pontos = ler_glebas_stdin(bbox, refs_interesse)
    print(f"[4/4] {total_pontos:,} pontos varridos; {len(glebas)} glebas na bbox união", file=sys.stderr)

    # gleba -> município (centróide)
    por_mun = {m["cod"]: [] for m in muns}
    for chave, pts in glebas.items():
        pts.sort()
        lon = sum(p[1] for p in pts) / len(pts)
        lat = sum(p[2] for p in pts) / len(pts)
        for m in muns:
            bb = m["bbox"]
            if bb[0] <= lon <= bb[2] and bb[1] <= lat <= bb[3] and dentro_poligono(lon, lat, m["aneis"]):
                por_mun[m["cod"]].append((chave, lon, lat, pts))
                break

    cob = len(refs_com_gleba) / len(refs_interesse) * 100 if refs_interesse else float("nan")
    print(f"\n=== PORTÃO SICOR — {len(muns)} município(s) ===")
    print(f"Pontos varridos: {total_pontos:,} | glebas na bbox união: {len(glebas)}")
    print(f"Cobertura estadual: operações {a.uf} de {ano_cob} com ALGUMA gleba: {len(refs_com_gleba):,} de {len(refs_interesse):,} = {cob:.1f}%")

    linhas_csv = []
    resumo = []
    for m in muns:
        lista = por_mun[m["cod"]]
        cars = None
        if a.car_dir:
            cam = os.path.join(a.car_dir, f"car_{a.uf.lower()}_{m['cod']}.geojson")
            if os.path.exists(cam):
                cars = carregar_car(cam)
        n_pontos = Counter(); precisao = Counter(); anos = Counter(); produtos = Counter()
        finalidades = Counter(); atividades = Counter(); valor_ano = defaultdict(float)
        areas = []; com_op = 0; poligonos = 0
        atrib = Counter(); cars_com_gleba = set(); toca_varios = 0
        for (ref, ordem, ident, igleba), lon, lat, pts in lista:
            npts = len(pts)
            n_pontos[faixa_pontos(npts)] += 1
            dec = max(p[3] for p in pts)
            precisao[faixa_precisao(dec)] += 1
            ha = area_ha([(p[1], p[2]) for p in pts]) if npts >= 3 else 0.0
            if npts >= 3:
                poligonos += 1; areas.append(ha)
            op = ops.get((ref, ordem)); e = emp.get(op["empreendimento"]) if op else None
            if op:
                com_op += 1; anos[op["ano"]] += 1
                try: valor_ano[op["ano"]] += float(op["valor"] or 0)
                except ValueError: pass
            if e:
                produtos[e["produto"]] += 1; finalidades[e["finalidade"]] += 1; atividades[e["atividade"]] += 1
            car_atrib = ""
            if cars is not None:
                votos = Counter()
                for p in pts:
                    for cod in cars_do_ponto(p[1], p[2], cars):
                        votos[cod] += 1
                if not votos:
                    atrib["sem CAR embaixo"] += 1
                else:
                    cod, v = votos.most_common(1)[0]
                    if v / npts >= 0.5:
                        atrib[">=50% num CAR (atribuída)"] += 1; cars_com_gleba.add(cod); car_atrib = cod
                    else:
                        atrib["<50% (sem atribuição)"] += 1
                    if len(votos) > 1:
                        toca_varios += 1
            linhas_csv.append({
                "municipio_ibge": m["cod"], "municipio": m["nome"],
                "ref_bacen": ref, "nu_ordem": ordem, "nu_identificador": ident, "nu_indice_gleba": igleba,
                "n_pontos": npts, "decimais": dec, "centroide_lon": round(lon, 6), "centroide_lat": round(lat, 6),
                "area_gleba_ha": round(ha, 2), "ano": op["ano"] if op else "", "emissao": op["emissao"] if op else "",
                "finalidade": e["finalidade"] if e else "", "atividade": e["atividade"] if e else "",
                "modalidade": e["modalidade"] if e else "", "produto": e["produto"] if e else "",
                "valor": op["valor"] if op else "", "area_financ": op["area_financ"] if op else "",
                "programa": op["programa"] if op else "", "fonte_recurso": op["fonte"] if op else "",
                "car_atribuido": car_atrib,
                "wkt": ("POLYGON((" + ", ".join(f"{p[1]} {p[2]}" for p in pts + [pts[0]]) + "))") if npts >= 3
                       else (f"POINT({pts[0][1]} {pts[0][2]})" if npts == 1 else ""),
            })
        n = len(lista)
        mediana = sorted(areas)[len(areas) // 2] if areas else 0.0
        pct_atrib = atrib[">=50% num CAR (atribuída)"] * 100 / n if (cars is not None and n) else None
        resumo.append((m["nome"], m["cod"], round(m["area_ha"]), n, poligonos, com_op,
                       len(cars) if cars is not None else None, pct_atrib,
                       len(cars_com_gleba) if cars is not None else None))
        print(f"""
--- {m['nome']} (IBGE {m['cod']}, {m['area_ha']:,.0f} ha) ---
Glebas com centróide dentro ............... {n}
  - com polígono (>=3 pontos) ............. {poligonos}
  - com operação nos anos baixados ........ {com_op}  ({com_op*100/max(n,1):.0f}%)
  - área mediana da gleba-polígono (ha) ... {mediana:.1f}
Pontos por gleba:
{top(n_pontos)}
Precisão das coordenadas:
{top(precisao)}
Ano de emissão da operação:
{top(anos)}
Valor contratado por ano (R$):
""" + ("\n".join(f"  {y}: R$ {v:,.0f}" for y, v in sorted(valor_ano.items())) or "  (nada)") + f"""
Finalidade:
{top(finalidades)}
Atividade:
{top(atividades)}
Produto (top 12):
{top(produtos)}""")
        if cars is not None:
            print(f"""Prévia Fase 2 — atribuição gleba->CAR ({len(cars)} CARs ativos):
{top(atrib)}
  glebas cujos vértices tocam >1 CAR ........ {toca_varios}
  CARs ativos com >=1 gleba ................. {len(cars_com_gleba)} de {len(cars)} ({len(cars_com_gleba)*100/max(len(cars),1):.0f}%)""")

    print("\n=== RESUMO ===")
    print(f"{'município':<24}{'IBGE':>9}{'área ha':>10}{'glebas':>8}{'polig.':>8}{'c/ op':>7}{'CARs at.':>10}{'% gleba->CAR':>14}{'CARs c/ gleba':>15}")
    for nome, cod, area, n, pol, cop, ncar, pct, ncg in resumo:
        print(f"{nome:<24}{cod:>9}{area:>10,}{n:>8}{pol:>8}{cop:>7}"
              f"{(ncar if ncar is not None else '-'):>10}{(f'{pct:.0f}%' if pct is not None else '-'):>14}{(ncg if ncg is not None else '-'):>15}")

    if a.saida_csv and linhas_csv:
        with open(a.saida_csv, "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(linhas_csv[0].keys()))
            w.writeheader(); w.writerows(linhas_csv)
        print(f"\nCSV: {a.saida_csv} ({len(linhas_csv)} glebas)")


if __name__ == "__main__":
    main()
