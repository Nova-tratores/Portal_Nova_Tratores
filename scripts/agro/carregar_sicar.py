"""
Fase 1 — carga do SICAR (imóveis rurais) no Supabase: WFS → agro_car_imovel,
depois agro_calcular_sobreposicoes() por município.

Padrão do plano: cada rodada cria uma linha em agro_pipeline_execucao e todo
imóvel gravado aponta para ela (dá pra refazer/comparar/desfazer). Upsert por
cod_car: rodar de novo atualiza status/condição/área e reaponta a execução.

Escreve via PostgREST com a SERVICE ROLE (RLS ON sem policy: só ela grava).
Geometria vai como EWKT 'SRID=4674;MULTIPOLYGON(...)' — o Postgres converte
texto→geometry sozinho; Polygon do WFS é promovido a MultiPolygon.

Uso (lê NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY do .env.local):
  python scripts/agro/carregar_sicar.py --uf SP --municipios 3538808 3515400 3551207 3554201 3554607
  python scripts/agro/carregar_sicar.py --uf SP --municipios 3538808 --car-dir ./car   # reaproveita GeoJSON já baixado
  python scripts/agro/carregar_sicar.py ... --sem-sobreposicao                          # pula o cálculo no banco
"""
import argparse
import json
import os
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sicar_wfs_baixar import baixar as baixar_wfs  # noqa: E402


# ---------- Supabase REST ----------

def carregar_env(caminho=".env.local"):
    env = dict(os.environ)
    if os.path.exists(caminho):
        for l in open(caminho, encoding="utf-8"):
            l = l.strip()
            if "=" in l and not l.startswith("#"):
                k, v = l.split("=", 1)
                env.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    return env


class Rest:
    def __init__(self, url, key):
        self.url = url.rstrip("/") + "/rest/v1"
        self.h = {"apikey": key, "Authorization": "Bearer " + key, "Content-Type": "application/json"}

    def _req(self, method, path, body=None, prefer=None):
        h = dict(self.h)
        if prefer:
            h["Prefer"] = prefer
        r = urllib.request.Request(self.url + path, method=method, headers=h,
                                   data=json.dumps(body).encode("utf-8") if body is not None else None)
        # 8 tentativas com espera crescente (até ~4 min): na carga dos 45 municípios o
        # Supabase devolveu 521 (Cloudflare: origem fora do ar) e timeouts de conexão
        # por vários minutos — desistir cedo perdia a carga inteira.
        for tentativa in range(8):
            try:
                with urllib.request.urlopen(r, timeout=300) as resp:
                    t = resp.read().decode("utf-8")
                    return json.loads(t) if t else None
            except urllib.error.HTTPError as e:
                msg = e.read().decode("utf-8", "replace")[:500]
                if e.code in (502, 503, 504, 429, 520, 521, 522, 523, 524) and tentativa < 7:
                    time.sleep(min(10 * (tentativa + 1), 60)); continue
                raise RuntimeError(f"{method} {path} -> {e.code}: {msg}")
            except (urllib.error.URLError, TimeoutError, ConnectionError):
                if tentativa < 7:
                    time.sleep(min(10 * (tentativa + 1), 60)); continue
                raise

    def insert(self, tabela, linhas, upsert_em=None):
        path = f"/{tabela}" + (f"?on_conflict={upsert_em}" if upsert_em else "")
        prefer = "return=representation" + (",resolution=merge-duplicates" if upsert_em else "")
        return self._req("POST", path, linhas, prefer)

    def patch(self, tabela, filtro, body):
        return self._req("PATCH", f"/{tabela}?{filtro}", body, "return=representation")

    def rpc(self, nome, args):
        return self._req("POST", f"/rpc/{nome}", args)


# ---------- geometria ----------

def geojson_para_ewkt_multipolygon(geom):
    if geom["type"] == "Polygon":
        polys = [geom["coordinates"]]
    elif geom["type"] == "MultiPolygon":
        polys = geom["coordinates"]
    else:
        raise ValueError("geometria inesperada: " + geom["type"])
    def anel(r):
        pts = [(p[0], p[1]) for p in r]
        if pts[0] != pts[-1]:
            pts.append(pts[0])
        return "(" + ", ".join(f"{x} {y}" for x, y in pts) + ")"
    return "SRID=4674;MULTIPOLYGON(" + ", ".join("(" + ", ".join(anel(r) for r in poly) + ")" for poly in polys) + ")"


def feature_para_linha(ft, uf, execucao_id):
    p = ft["properties"]
    status = (p.get("status_imovel") or "").upper()
    if status not in ("AT", "PE", "CA", "SU"):
        status = "SU"  # qualquer coisa fora do esperado cai como "suspenso" e fica visível
    return {
        "cod_car": p["cod_imovel"],
        "uf": uf.upper(),
        "municipio_ibge": int(p["cod_municipio_ibge"]),
        "municipio": p.get("municipio") or "",
        "area_ha": float(p.get("area") or 0),
        "modulos_fiscais": float(p["m_fiscal"]) if p.get("m_fiscal") not in (None, "") else None,
        "status_car": status,
        "condicao": p.get("condicao"),
        "tipo_imovel": p.get("tipo_imovel"),
        "criado_sicar_em": p.get("dat_criacao"),
        "geom": geojson_para_ewkt_multipolygon(ft["geometry"]),
        "execucao_id": execucao_id,
    }


# ---------- main ----------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--uf", default="SP")
    ap.add_argument("--municipios", nargs="+", required=True)
    ap.add_argument("--car-dir", default="./car", help="cache dos GeoJSON (baixa se não existir)")
    ap.add_argument("--lote", type=int, default=150)
    ap.add_argument("--sem-sobreposicao", action="store_true")
    ap.add_argument("--executado-por", default=os.environ.get("USERNAME") or os.environ.get("USER") or "pipeline")
    a = ap.parse_args()

    env = carregar_env()
    rest = Rest(env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"])

    exec_row = rest.insert("agro_pipeline_execucao", [{
        "fonte": "sicar", "versao": "sicar-wfs " + time.strftime("%Y-%m-%d"),
        "parametros": {"uf": a.uf, "municipios": a.municipios, "origem": "geoserver.car.gov.br WFS sicar_imoveis_" + a.uf.lower()},
        "executado_por": a.executado_por,
    }])[0]
    execucao_id = exec_row["id"]
    print(f"execução #{execucao_id} aberta", file=sys.stderr)

    total = 0
    resumo = []
    for cod in a.municipios:
        cam = os.path.join(a.car_dir, f"car_{a.uf.lower()}_{cod}.geojson")
        if not os.path.exists(cam):
            cam, _, _ = baixar_wfs(a.uf, cod, a.car_dir)
        with open(cam, encoding="utf-8") as f:
            fts = json.load(f).get("features", [])
        linhas, sem_geom = [], 0
        for ft in fts:
            if not ft.get("geometry"):
                sem_geom += 1; continue
            linhas.append(feature_para_linha(ft, a.uf, execucao_id))
        for i in range(0, len(linhas), a.lote):
            rest.insert("agro_car_imovel", linhas[i:i + a.lote], upsert_em="cod_car")
        total += len(linhas)
        n_sob = None
        if not a.sem_sobreposicao:
            try:
                n_sob = rest.rpc("agro_calcular_sobreposicoes", {"p_execucao_id": execucao_id, "p_municipio_ibge": int(cod)})
            except RuntimeError as e:
                # geometria inválida do SICAR (TopologyException) derruba a interseção; a carga
                # do município fica, a sobreposição roda depois de agro_corrigir_geometrias()
                n_sob = f"ERRO: {str(e)[:160]}"
        resumo.append((cod, len(linhas), sem_geom, n_sob))
        print(f"  {cod}: {len(linhas)} imóveis gravados ({sem_geom} sem geometria), sobreposições: {n_sob}", file=sys.stderr)

    rest.patch("agro_pipeline_execucao", f"id=eq.{execucao_id}", {
        "concluido_em": time.strftime("%Y-%m-%dT%H:%M:%S%z") or None, "linhas": total,
        "observacao": "; ".join(f"{c}: {n} imóveis, {s} sobreposições" for c, n, _, s in resumo),
    })
    print(f"execução #{execucao_id} concluída: {total} imóveis")


if __name__ == "__main__":
    main()
