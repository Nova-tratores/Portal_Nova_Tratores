"""
Fase 2 — carga do SICOR no Supabase a partir do CSV que o portão gera
(scripts/agro/sicor_portao_fase0.py --saida-csv): glebas → agro_sicor_gleba,
operações → agro_sicor_operacao, depois agro_atribuir_glebas() no banco.

Por que a partir do CSV: o portão já fez a parte cara (varrer 157 milhões de
pontos e recortar por município). O CSV traz o WKT da gleba, o centróide, o
município (recorte espacial) e os campos da operação — menos CD_EMPREENDIMENTO
e CNPJ_IF, que este script relê dos SICOR_OPERACAO_BASICA_ESTADO_<ano>.gz só
para as operações presentes no CSV.

Cada rodada = uma linha em agro_pipeline_execucao; upsert pelas chaves naturais
(gleba: ref_bacen+nu_ordem+nu_identificador+nu_indice_gleba; operação: ref_bacen+nu_ordem).
cultura_codigo da operação vem de agro_dominio_cultura.sicor_produtos (o vocabulário
único do plano) — produto sem tradução fica NULL, não vira "outro" calado.

Uso:
  python scripts/agro/carregar_sicor.py --glebas-csv docs/agro/dados/glebas_regiao_imediata_sicor.csv \
      --ops <pasta>/SICOR_OPERACAO_BASICA_ESTADO_2019.gz ... 2024.gz --empreendimento <pasta>/Empreendimento.csv --uf SP
"""
import argparse
import csv
import gzip
import os
import sys
import time
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from carregar_sicar import Rest, carregar_env  # noqa: E402


def norm(s):
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().upper().strip()


def iso(d):  # DD/MM/YYYY -> YYYY-MM-DD
    if not d or len(d) < 10:
        return None
    return f"{d[6:10]}-{d[3:5]}-{d[0:2]}"


def num(s):
    try:
        return float(s) if s not in (None, "") else None
    except ValueError:
        return None


def ler_empreendimento(caminho):
    m = {}
    with open(caminho, encoding="latin-1", newline="") as f:
        r = csv.reader(f, delimiter=";")
        cab = next(r); cab[0] = cab[0].lstrip("#"); ix = {c: i for i, c in enumerate(cab)}
        for row in r:
            if row:
                m[row[ix["CODIGO"]]] = {"finalidade": row[ix["FINALIDADE"]], "atividade": row[ix["ATIVIDADE"]],
                                        "modalidade": row[ix["MODALIDADE"]], "produto": row[ix["PRODUTO"]]}
    return m


def ler_operacoes(caminhos, uf, chaves):
    """Só as operações cujas chaves (ref_bacen, nu_ordem) estão no CSV."""
    ops = {}
    for caminho in caminhos:
        with gzip.open(caminho, "rt", encoding="latin-1", newline="") as f:
            r = csv.reader(f, delimiter=";")
            cab = next(r); cab[0] = cab[0].lstrip("#"); ix = {c: i for i, c in enumerate(cab)}
            for row in r:
                if len(row) < len(cab):
                    continue
                k = (row[ix["REF_BACEN"]], row[ix["NU_ORDEM"]])
                if k not in chaves or (uf and row[ix["CD_ESTADO"]] != uf):
                    continue
                ops[k] = {"dt_emissao": iso(row[ix["DT_EMISSAO"]]), "uf": row[ix["CD_ESTADO"]],
                          "cd_empreendimento": row[ix["CD_EMPREENDIMENTO"]], "valor": num(row[ix["VL_PARC_CREDITO"]]) or 0,
                          "area_financiada": num(row[ix["VL_AREA_FINANC"]]), "programa": row[ix["CD_PROGRAMA"]] or None,
                          "fonte_recurso": row[ix["CD_FONTE_RECURSO"]] or None, "cnpj_if": row[ix["CNPJ_IF"]] or None}
        print(f"  {os.path.basename(caminho)}: acumulado {len(ops)} operações do CSV", file=sys.stderr)
    return ops


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--glebas-csv", required=True)
    ap.add_argument("--ops", nargs="+", required=True)
    ap.add_argument("--empreendimento", required=True)
    ap.add_argument("--uf", default="SP")
    ap.add_argument("--lote", type=int, default=200)
    ap.add_argument("--sem-atribuicao", action="store_true")
    ap.add_argument("--executado-por", default=os.environ.get("USERNAME") or os.environ.get("USER") or "pipeline")
    a = ap.parse_args()

    env = carregar_env()
    rest = Rest(env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"])

    with open(a.glebas_csv, encoding="utf-8", newline="") as f:
        glebas = list(csv.DictReader(f))
    chaves = {(g["ref_bacen"], g["nu_ordem"]) for g in glebas}
    print(f"CSV: {len(glebas)} glebas, {len(chaves)} operações distintas", file=sys.stderr)

    emp = ler_empreendimento(a.empreendimento)
    ops = ler_operacoes(a.ops, a.uf, chaves)

    # vocabulário único: PRODUTO (SICOR) -> cultura_codigo
    dominio = rest._req("GET", "/agro_dominio_cultura?select=codigo,sicor_produtos")
    prod_para_cultura = {}
    for d in dominio:
        for p in d["sicor_produtos"] or []:
            prod_para_cultura[norm(p)] = d["codigo"]

    exec_row = rest.insert("agro_pipeline_execucao", [{
        "fonte": "sicor", "versao": "sicor glebas+ops " + time.strftime("%Y-%m-%d"),
        "parametros": {"uf": a.uf, "glebas_csv": os.path.basename(a.glebas_csv),
                       "ops": [os.path.basename(p) for p in a.ops],
                       "municipios": sorted({g["municipio_ibge"] for g in glebas})},
        "executado_por": a.executado_por,
    }])[0]
    execucao_id = exec_row["id"]
    print(f"execução #{execucao_id} aberta", file=sys.stderr)

    # 1) operações
    linhas_op = []
    sem_traducao = {}
    for (ref, ordem), o in ops.items():
        e = emp.get(o["cd_empreendimento"], {})
        cultura = prod_para_cultura.get(norm(e.get("produto")))
        if e.get("produto") and not cultura:
            sem_traducao[e["produto"]] = sem_traducao.get(e["produto"], 0) + 1
        linhas_op.append({
            "ref_bacen": int(ref), "nu_ordem": int(ordem), "dt_emissao": o["dt_emissao"], "uf": o["uf"],
            "cd_empreendimento": o["cd_empreendimento"], "finalidade": e.get("finalidade"), "atividade": e.get("atividade"),
            "modalidade": e.get("modalidade"), "produto": e.get("produto"), "cultura_codigo": cultura,
            "valor": o["valor"], "area_financiada": o["area_financiada"], "programa": o["programa"],
            "fonte_recurso": o["fonte_recurso"], "cnpj_if": o["cnpj_if"], "execucao_id": execucao_id,
        })
    for i in range(0, len(linhas_op), a.lote):
        rest.insert("agro_sicor_operacao", linhas_op[i:i + a.lote], upsert_em="ref_bacen,nu_ordem")
    print(f"  operações gravadas: {len(linhas_op)}", file=sys.stderr)
    if sem_traducao:
        print("  produtos SEM cultura no vocabulário (ficaram NULL): " +
              ", ".join(f"{p} ({n})" for p, n in sorted(sem_traducao.items(), key=lambda x: -x[1])[:15]), file=sys.stderr)

    # 2) glebas
    linhas_g = []
    for g in glebas:
        wkt = g["wkt"]
        linhas_g.append({
            "ref_bacen": int(g["ref_bacen"]), "nu_ordem": int(g["nu_ordem"]),
            "nu_identificador": int(g["nu_identificador"]), "nu_indice_gleba": int(g["nu_indice_gleba"]),
            "n_pontos": int(g["n_pontos"]),
            "geom": ("SRID=4674;" + wkt) if wkt.startswith("POLYGON") else None,
            "centroide": f"SRID=4674;POINT({g['centroide_lon']} {g['centroide_lat']})",
            "area_ha": num(g["area_gleba_ha"]), "municipio_ibge": int(g["municipio_ibge"]) if g.get("municipio_ibge") else None,
            "execucao_id": execucao_id,
        })
    for i in range(0, len(linhas_g), a.lote):
        rest.insert("agro_sicor_gleba", linhas_g[i:i + a.lote], upsert_em="ref_bacen,nu_ordem,nu_identificador,nu_indice_gleba")
    print(f"  glebas gravadas: {len(linhas_g)}", file=sys.stderr)

    # 3) atribuição gleba -> CAR no banco (regra >= 50% da área)
    n_atrib = None
    if not a.sem_atribuicao:
        n_atrib = rest.rpc("agro_atribuir_glebas", {"p_execucao_id": execucao_id})
        print(f"  glebas atribuídas a um CAR ativo: {n_atrib} de {len(linhas_g)} ({(n_atrib or 0)*100/max(len(linhas_g),1):.0f}%)", file=sys.stderr)

    rest.patch("agro_pipeline_execucao", f"id=eq.{execucao_id}", {
        "concluido_em": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "linhas": len(linhas_g),
        "observacao": f"{len(linhas_op)} operações, {len(linhas_g)} glebas, {n_atrib} atribuídas",
    })
    print(f"execução #{execucao_id} concluída")


if __name__ == "__main__":
    main()
