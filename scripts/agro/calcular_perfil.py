"""
Perfil consolidado por CAR (agro_car_perfil) — regras de negócio do plano
(docs/inteligencia-agricola-car-plano.md §5) + decisões do portão da Fase 1
(docs/agro/fase0-levantamento.md §3.3). Recalculado inteiro a cada execução.

Cultura principal: classe com maior área útil na safra mais recente do
MapBiomas, se ocupar >= 30% da área útil; abaixo disso = NULL ("Diversificado").
'mosaico' NUNCA é cultura principal (é o balde do que o MapBiomas não separa).

Confiança:
  alta   — validação de campo (agro_car_validacao) OU MapBiomas e SICOR concordam
           (alguma operação atribuída ao CAR, na safra ou nas 2 anteriores, com a
           mesma cultura)
  media  — só uma fonte com cultura >= 60% da área útil (MapBiomas), ou só SICOR
           com cultura; café/cana só por MapBiomas ficam no máximo em 'media'
  baixa  — o resto: < 60%, fontes discordantes, mosaico dominante, ou CAR com
           sobreposição > 20%
Validação de campo sempre vence a estimativa.

Crédito: VL_PARC_CREDITO das operações ligadas ao CAR via gleba
(agro_sicor_gleba_car), RATEADO pela área das glebas da operação (um contrato
com 5 glebas em 5 CARs não pode valer inteiro em cada um), nos últimos 12 e
36 meses; credito_invest_36m só finalidade Investimento (sinal de máquina).

Score (soma ponderada simples, explicável): componentes em score_detalhe —
  area   = min(area_cultura_ha / 100, 3)            (0..3)
  credito= 2 se investimento nos 36 m, 1 se custeio nos 12 m, 0 senão
  sem_compra = 1 se não há vínculo com cliente (ainda não é cliente), 0 senão
  prioridade = (6 - prioridade da regra) / 5 se existir regra ativa p/ cultura×área, senão 0.5
  pesos vêm de agro_oportunidade_regra quando há regra; padrão 1/1/1.
  score = area*peso_area + credito*peso_credito + sem_compra*peso_sem_compra + prioridade
  × 0.6 se confiança baixa, × 0.85 se média.

Uso:
  python scripts/agro/calcular_perfil.py
  python scripts/agro/calcular_perfil.py --safra 2024 --so-relatorio
"""
import argparse
import datetime as dt
import os
import sys
import time
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from carregar_sicar import Rest, carregar_env  # noqa: E402

NAO_PRINCIPAL = {"mosaico", "outro"}
SO_MEDIA_POR_MAPBIOMAS = {"cafe", "cana"}
SICOR_MAX_ANOS_ATRAS = 2


def paginar(rest, path, tam=1000):
    out, off = [], 0
    sep = "&" if "?" in path else "?"
    while True:
        pag = rest._req("GET", f"{path}{sep}limit={tam}&offset={off}")
        out += pag
        if len(pag) < tam:
            return out
        off += tam


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--safra", type=int, default=None, help="safra base (default: a mais recente em agro_uso_solo_car)")
    ap.add_argument("--so-relatorio", action="store_true")
    ap.add_argument("--lote", type=int, default=300)
    ap.add_argument("--executado-por", default=os.environ.get("USERNAME") or os.environ.get("USER") or "pipeline")
    a = ap.parse_args()
    env = carregar_env()
    rest = Rest(env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"])
    hoje = dt.date.today()

    imoveis = paginar(rest, "/agro_car_imovel?select=cod_car,municipio,area_ha,area_util_ha,status_car&status_car=eq.AT&order=cod_car")
    # safra base primeiro (1 linha), depois só o uso daquela safra — com 45 municípios a
    # tabela tem 250 mil linhas e paginar tudo pela REST levava minutos
    if a.safra:
        safra = a.safra
    else:
        ult = rest._req("GET", "/agro_uso_solo_car?select=ano_safra&fonte=eq.mapbiomas&order=ano_safra.desc&limit=1")
        safra = ult[0]["ano_safra"] if ult else None
    uso = paginar(rest, f"/agro_uso_solo_car?select=cod_car,ano_safra,fonte,cultura_codigo,area_ha,pct_area_util&fonte=eq.mapbiomas&ano_safra=eq.{safra}&order=cod_car")
    gleba_car = paginar(rest, "/agro_sicor_gleba_car?select=cod_car,gleba_id,agro_sicor_gleba(ref_bacen,nu_ordem,area_ha)&order=gleba_id")
    glebas_todas = paginar(rest, "/agro_sicor_gleba?select=id,ref_bacen,nu_ordem,area_ha&order=id")
    ops = {(o["ref_bacen"], o["nu_ordem"]): o for o in paginar(rest, "/agro_sicor_operacao?select=ref_bacen,nu_ordem,dt_emissao,finalidade,cultura_codigo,valor&order=ref_bacen")}
    sobre = paginar(rest, "/agro_car_sobreposicao?select=cod_car_a,cod_car_b,pct_a,pct_b&order=cod_car_a")
    vinculos = paginar(rest, "/agro_car_cliente_vinculo?select=cod_car&order=cod_car")
    try:  # sugestões pendentes (visitas do CRM) — só informativo no score_detalhe; a tabela pode não existir ainda
        sugestoes = Counter(s["cod_car"] for s in paginar(rest, "/agro_car_vinculo_sugestao?select=cod_car&status=eq.pendente&order=cod_car"))
    except RuntimeError:
        sugestoes = Counter()
    validacoes = paginar(rest, "/agro_car_validacao?select=cod_car,ano_safra,cultura_real,confirmou,informado_por,informado_em&order=informado_em.desc")
    regras = [r for r in rest._req("GET", "/agro_oportunidade_regra?select=*") if r["ativo"]]
    print(f"imóveis {len(imoveis)} | uso {len(uso)} (safra base {safra}) | glebas atribuídas {len(gleba_car)} | ops {len(ops)} | sobreposições {len(sobre)} | vínculos {len(vinculos)} | validações {len(validacoes)}", file=sys.stderr)

    uso_por_car = defaultdict(list)
    for u in uso:
        if u["ano_safra"] == safra:
            uso_por_car[u["cod_car"]].append(u)
    # Uma operação pode ter N glebas em N CARs diferentes: o valor é RATEADO pela
    # área das glebas (senão cada CAR levaria o contrato inteiro — dobrava o crédito).
    area_total_op = defaultdict(float)
    for g in glebas_todas:
        area_total_op[(g["ref_bacen"], g["nu_ordem"])] += float(g["area_ha"] or 0) or 0.0
    n_glebas_op = defaultdict(int)
    for g in glebas_todas:
        n_glebas_op[(g["ref_bacen"], g["nu_ordem"])] += 1
    ops_por_car = defaultdict(list)
    for gc in gleba_car:
        g = gc["agro_sicor_gleba"]
        k = (g["ref_bacen"], g["nu_ordem"])
        o = ops.get(k)
        if o:
            tot = area_total_op.get(k, 0.0)
            fracao = (float(g["area_ha"] or 0) / tot) if tot > 0 else (1.0 / max(n_glebas_op.get(k, 1), 1))
            ops_por_car[gc["cod_car"]].append({**o, "valor_rateado": float(o["valor"] or 0) * fracao})
    sobre_max = defaultdict(float)
    for s in sobre:
        sobre_max[s["cod_car_a"]] = max(sobre_max[s["cod_car_a"]], float(s["pct_a"]))
        sobre_max[s["cod_car_b"]] = max(sobre_max[s["cod_car_b"]], float(s["pct_b"]))
    tem_vinculo = {v["cod_car"] for v in vinculos}
    validacao = {}
    for v in validacoes:  # a mais recente vence
        validacao.setdefault(v["cod_car"], v)

    def regra_para(cultura, area):
        cands = [r for r in regras if r["cultura_codigo"] == cultura and float(r["faixa_area_min"]) <= area
                 and (r["faixa_area_max"] is None or area < float(r["faixa_area_max"]))]
        return min(cands, key=lambda r: r["prioridade"]) if cands else None

    execucao_id = None
    if not a.so_relatorio:
        execucao_id = rest.insert("agro_pipeline_execucao", [{
            "fonte": "perfil", "versao": f"perfil safra {safra} " + time.strftime("%Y-%m-%d"),
            "parametros": {"safra": safra, "regras_ativas": len(regras)}, "executado_por": a.executado_por}])[0]["id"]

    linhas = []
    conf_cnt = defaultdict(int); cult_cnt = defaultdict(int)
    for im in imoveis:
        cod = im["cod_car"]
        area_util = float(im["area_util_ha"] or 0)
        usos = sorted(uso_por_car.get(cod, []), key=lambda u: -float(u["area_ha"]))
        # cultura principal pelo MapBiomas
        cand = [u for u in usos if u["cultura_codigo"] not in NAO_PRINCIPAL]
        principal, area_c, pct_c = None, None, None
        if cand and area_util > 0:
            top = cand[0]
            pct = float(top["area_ha"]) / area_util * 100
            if pct >= 30:
                principal, area_c, pct_c = top["cultura_codigo"], float(top["area_ha"]), pct
        mosaico_pct = next((float(u["area_ha"]) / area_util * 100 for u in usos if u["cultura_codigo"] == "mosaico" and area_util > 0), 0.0)

        # SICOR: culturas das operações recentes atribuídas ao CAR
        ops_car = ops_por_car.get(cod, [])
        cult_sicor = defaultdict(float)
        for o in ops_car:
            ano = int(o["dt_emissao"][:4])
            if o["cultura_codigo"] and safra - SICOR_MAX_ANOS_ATRAS <= ano <= safra + 1:
                cult_sicor[o["cultura_codigo"]] += o["valor_rateado"]
        sicor_principal = max(cult_sicor, key=cult_sicor.get) if cult_sicor else None
        sicor_sem_cultura = bool(ops_car) and not cult_sicor   # tem crédito, mas só investimento/sem produto agrícola

        # confiança
        val = validacao.get(cod)
        fonte = "mapbiomas"
        if val:
            principal = val["cultura_real"]
            confianca, motivo, fonte = "alta", f"Validado em campo por {val['informado_por']} em {val['informado_em'][:10]}", "campo"
        elif principal and sicor_principal == principal:
            confianca, motivo = "alta", f"MapBiomas ({pct_c:.0f}% da área útil) e SICOR (crédito de {principal}) concordam"
        elif principal and sicor_principal and sicor_principal != principal:
            confianca, motivo = "baixa", f"MapBiomas diz {principal} ({pct_c:.0f}%), SICOR diz {sicor_principal} — fontes discordam"
        elif principal and pct_c >= 60 and principal not in SO_MEDIA_POR_MAPBIOMAS:
            confianca, motivo = "media", f"Só MapBiomas, {principal} ocupa {pct_c:.0f}% da área útil"
        elif principal and pct_c >= 60:
            confianca, motivo = "media", f"Só MapBiomas, {principal} {pct_c:.0f}% — café/cana pedem SICOR ou validação para 'alta'"
        elif principal:
            confianca, motivo = "baixa", f"Só MapBiomas e {principal} ocupa apenas {pct_c:.0f}% da área útil"
        elif sicor_principal:
            principal, fonte = sicor_principal, "sicor"
            confianca, motivo = "media", f"MapBiomas diversificado (mosaico {mosaico_pct:.0f}%); cultura vem do crédito rural ({sicor_principal})"
        else:
            confianca, motivo = "baixa", (f"Diversificado: mosaico de usos ocupa {mosaico_pct:.0f}% da área útil" if mosaico_pct >= 30
                                          else "Diversificado: nenhuma cultura chega a 30% da área útil")
        if sicor_sem_cultura and not val:
            motivo += "; SICOR só com investimento/sem cultura"
        if sobre_max.get(cod, 0) > 20 and confianca != "alta":
            confianca = "baixa"; motivo += f"; CAR com {sobre_max[cod]:.0f}% de sobreposição"
        elif sobre_max.get(cod, 0) > 20:
            motivo += f" (atenção: {sobre_max[cod]:.0f}% de sobreposição)"

        # crédito
        c12 = c36 = ci36 = 0.0; ult_fin, ult_dt = None, None
        for o in sorted(ops_car, key=lambda o: o["dt_emissao"], reverse=True):
            d = dt.date.fromisoformat(o["dt_emissao"]); dias = (hoje - d).days; v = o["valor_rateado"]
            if dias <= 365: c12 += v
            if dias <= 3 * 365:
                c36 += v
                if (o["finalidade"] or "").lower().startswith("invest"): ci36 += v
            if ult_dt is None: ult_fin, ult_dt = o["finalidade"], o["dt_emissao"]

        # score
        regra = regra_para(principal, area_c or 0) if principal else None
        pa, pc, ps = (float(regra["peso_area"]), float(regra["peso_credito"]), float(regra["peso_sem_compra"])) if regra else (1, 1, 1)
        comp = {
            "area": round(min((area_c or 0) / 100, 3), 2),
            "credito": 2 if ci36 > 0 else (1 if c12 > 0 else 0),
            "sem_compra": 0 if cod in tem_vinculo else 1,
            "prioridade": round((6 - regra["prioridade"]) / 5, 2) if regra else 0.5,
            "sugestoes_pendentes": sugestoes.get(cod, 0),   # vínculo sugerido pelas visitas do CRM, ainda sem decisão humana
            "fator_confianca": 1.0 if confianca == "alta" else 0.85 if confianca == "media" else 0.6,
            "regra_id": regra["id"] if regra else None, "produto_sugerido": regra["produto_sugerido"] if regra else None,
        }
        score = (comp["area"] * pa + comp["credito"] * pc + comp["sem_compra"] * ps + comp["prioridade"]) * comp["fator_confianca"]
        conf_cnt[confianca] += 1; cult_cnt[principal or "(diversificado)"] += 1
        linhas.append({
            "cod_car": cod, "ano_safra": safra, "cultura_principal": principal,
            "area_cultura_ha": round(area_c, 4) if area_c is not None else None, "pct_area_util": round(pct_c, 2) if pct_c is not None else None,
            "confianca": confianca, "motivo_confianca": motivo, "fonte_principal": fonte,
            "credito_12m": round(c12, 2), "credito_36m": round(c36, 2), "credito_invest_36m": round(ci36, 2),
            "ultima_finalidade": ult_fin, "ultimo_credito_em": ult_dt,
            "score_oportunidade": round(score, 2), "score_detalhe": comp, "execucao_id": execucao_id,
        })

    print(f"\n=== PERFIL safra {safra}: {len(linhas)} CARs ===")
    print("confiança:", dict(conf_cnt))
    print("cultura principal:", sorted(cult_cnt.items(), key=lambda x: -x[1]))
    com_credito = sum(1 for l in linhas if l["credito_36m"] > 0)
    print(f"com crédito nos 36 m: {com_credito} | com investimento: {sum(1 for l in linhas if l['credito_invest_36m'] > 0)}")
    top = sorted(linhas, key=lambda l: -l["score_oportunidade"])[:8]
    for l in top:
        print(f"  {l['score_oportunidade']:>5} {l['cod_car'][:22]}… {l['cultura_principal'] or '-':<12} {l['confianca']:<5} área {l['area_cultura_ha'] or 0:>7.1f} ha  créd36m R$ {l['credito_36m']:>12,.0f}  {l['motivo_confianca'][:60]}")

    if not a.so_relatorio:
        for i in range(0, len(linhas), a.lote):
            rest.insert("agro_car_perfil", linhas[i:i + a.lote], upsert_em="cod_car")
        rest.patch("agro_pipeline_execucao", f"id=eq.{execucao_id}", {
            "concluido_em": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "linhas": len(linhas),
            "observacao": f"safra {safra}; confiança {dict(conf_cnt)}"})
        print(f"execução #{execucao_id} concluída: {len(linhas)} perfis")


if __name__ == "__main__":
    main()
