"""
Fase 0/1 do plano "Inteligência Agrícola por CAR" — baixa os imóveis do SICAR
por município pelo WFS oficial (sem captcha), em GeoJSON.

Descoberta da Fase 0 (25/09/2026): o site consultapublica.car.gov.br exige
captcha para o shapefile por município, mas o GeoServer público responde WFS:
  https://geoserver.car.gov.br/geoserver/sicar/wfs
  camada sicar:sicar_imoveis_<uf>  (ex.: sicar_imoveis_sp)
  atributos: cod_imovel, status_imovel (AT/PE/CA), dat_criacao, area (ha),
             condicao, uf, municipio, cod_municipio_ibge, m_fiscal, tipo_imovel (IRU/AST/PCT)
  geometria: MultiPolygon, EPSG:4674 (SIRGAS 2000) — o mesmo SRID do schema agro.

Uso:
  python sicar_wfs_baixar.py --uf SP --municipios 3538808 3515400 3551207 --saida ./car
  python sicar_wfs_baixar.py --uf SP --municipios 3538808 --contar      # só conta

Gotchas vistos em Piraju: imóveis CANCELADOS (status_imovel='CA') podem cobrir o
município inteiro (52 mil ha num município de 50 mil) — filtrar por status antes
de somar área; a soma das áreas ativas ainda passa da área do município
(sobreposição real entre CARs, daí a tabela car_sobreposicao do plano).
"""
import argparse
import json
import os
import re
import sys
import urllib.parse
import urllib.request

WFS = "https://geoserver.car.gov.br/geoserver/sicar/wfs"


def _get(params, timeout=600):
    """GET via curl: o urllib do Python falha no TLS do geoserver.car.gov.br
    (SSLV3_ALERT_HANDSHAKE_FAILURE), o curl negocia normal."""
    import subprocess
    url = WFS + "?" + urllib.parse.urlencode(params)
    r = subprocess.run(["curl", "-s", "-L", "--max-time", str(timeout), "-A", "Mozilla/5.0 (portal-nova-tratores agro)", url],
                       capture_output=True, timeout=timeout + 30)
    if r.returncode != 0 or not r.stdout:
        raise RuntimeError(f"curl falhou ({r.returncode}) em {url[:120]}...: {r.stderr[:200]!r}")
    return r.stdout


def contar(uf, cod_ibge):
    xml = _get({
        "service": "WFS", "version": "1.1.0", "request": "GetFeature",
        "typeName": f"sicar:sicar_imoveis_{uf.lower()}", "resultType": "hits",
        "CQL_FILTER": f"cod_municipio_ibge={cod_ibge}",
    }).decode("utf-8", "replace")
    m = re.search(r'numberOfFeatures="(\d+)"', xml)
    return int(m.group(1)) if m else -1


def baixar(uf, cod_ibge, pasta):
    raw = _get({
        "service": "WFS", "version": "1.1.0", "request": "GetFeature",
        "typeName": f"sicar:sicar_imoveis_{uf.lower()}", "outputFormat": "application/json",
        "CQL_FILTER": f"cod_municipio_ibge={cod_ibge}",
    })
    d = json.loads(raw)
    os.makedirs(pasta, exist_ok=True)
    destino = os.path.join(pasta, f"car_{uf.lower()}_{cod_ibge}.geojson")
    with open(destino, "wb") as f:
        f.write(raw)
    fs = d.get("features", [])
    status = {}
    for f_ in fs:
        s = f_["properties"].get("status_imovel")
        status[s] = status.get(s, 0) + 1
    return destino, len(fs), status


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--uf", default="SP")
    ap.add_argument("--municipios", nargs="+", required=True, help="códigos IBGE de 7 dígitos")
    ap.add_argument("--saida", default="./car")
    ap.add_argument("--contar", action="store_true", help="só conta, não baixa")
    a = ap.parse_args()
    total = 0
    for cod in a.municipios:
        if a.contar:
            n = contar(a.uf, cod)
            print(f"{cod}: {n} imóveis")
            total += max(n, 0)
        else:
            destino, n, status = baixar(a.uf, cod, a.saida)
            print(f"{cod}: {n} imóveis {status} -> {destino}")
            total += n
    print(f"total: {total}", file=sys.stderr)


if __name__ == "__main__":
    main()
