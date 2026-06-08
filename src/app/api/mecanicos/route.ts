import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { normName, cleanName, namesMatch, splitTecnicos as splitTecsUtil, nomesBatem } from "@/lib/tecnico-utils";

/**
 * GET /api/mecanicos
 * Lista mecânicos do portal (financeiro_usu + portal_permissoes com mecanico_role)
 * ?nome=X → filtra por nome (busca perfil individual)
 */
export async function GET(req: NextRequest) {
  const nome = req.nextUrl.searchParams.get("nome");

  try {
    // Buscar usuarios com role de mecanico
    const { data: perms, error: permErr } = await supabase
      .from("portal_permissoes")
      .select("user_id, mecanico_role, mecanico_tecnico_nome, is_admin, modulos_permitidos, created_at")
      .eq("mecanico_role", "tecnico");

    if (permErr) throw permErr;
    if (!perms || perms.length === 0) {
      return NextResponse.json([]);
    }

    const userIds = perms.map((p) => p.user_id);

    // Buscar perfis
    const { data: users, error: usrErr } = await supabase
      .from("financeiro_usu")
      .select("id, nome, email, funcao, avatar_url")
      .in("id", userIds);

    if (usrErr) throw usrErr;

    // Montar lista
    const mecanicos = (users || []).map((u) => {
      const perm = perms.find((p) => p.user_id === u.id);
      return {
        id: u.id,
        nome: u.nome,
        email: u.email,
        funcao: u.funcao,
        avatar_url: u.avatar_url,
        mecanico_role: perm?.mecanico_role || "tecnico",
        tecnico_nome: perm?.mecanico_tecnico_nome || u.nome,
      };
    });

    // Se pediu por nome especifico
    if (nome) {
      const found = mecanicos.find((m) => {
        return nomesBatem(m.tecnico_nome || m.nome, nome);
      });
      if (!found) return NextResponse.json(null);

      // Buscar dados extras para perfil individual
      const tecNome = found.tecnico_nome || found.nome;
      const mesParam = req.nextUrl.searchParams.get("mes");
      const now = new Date();
      const mesAtual = mesParam || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const [anoMes, mesMes] = mesAtual.split("-").map(Number);
      const primeiro = `${mesAtual}-01`;
      const ultimo = `${mesAtual}-${new Date(anoMes, mesMes, 0).getDate()}`;

      // Ordens do tecnico no mes, ocorrencias, GPS, resumo diario
      const tecFirstName = normName(tecNome).split(/\s+/)[0];
      const [allOrdensRes, ocorrenciasRes, gpsRes, resumoDiarioRes, reqRes] = await Promise.all([
        supabase
          .from("Ordens_Omie")
          .select("os_num, cod_int, data, horas, km, valor, status, faturada, interno, cidade, empresa, descricao, obs, tecnicos, vendedor_nome")
          .neq("status", "Cancelada")
          .gte("data", primeiro)
          .lte("data", ultimo)
          .order("data", { ascending: false })
          .limit(5000),
        supabase
          .from("mecanico_ocorrencias")
          .select("*")
          .eq("tecnico_nome", tecNome)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("GPS_Viagens")
          .select("tecnico_nome, data, km_total, placa, saida_loja, chegada_cliente, saida_cliente, retorno_loja, eventos")
          .ilike("tecnico_nome", `%${tecFirstName}%`)
          .gte("data", primeiro)
          .lte("data", ultimo),
        supabase
          .from("resumo_diario_tecnico")
          .select("tecnico_nome, data, horas_dirigindo")
          .ilike("tecnico_nome", `%${tecFirstName}%`)
          .gte("data", primeiro)
          .lte("data", ultimo),
        supabase
          .from("pedidos")
          .select("id_pedido, Id_Os, status, data, pedido_omie, valor_total, Tipo_Pedido")
          .ilike("tecnico", `%${tecNome}%`),
      ]);

      // Filtrar GPS e resumo_diario pelo nome normalizado
      const gpsData = (gpsRes.data || []).filter((g: any) => nomesBatem(g.tecnico_nome || '', tecNome));
      const resumoDiarioData = (resumoDiarioRes.data || []).filter((r: any) => nomesBatem(r.tecnico_nome || '', tecNome));

      // Map resumo_diario para lookup rápido
      const resumoDiarioMap: Record<string, number> = {};
      for (const r of resumoDiarioData) {
        const key = String(r.data);
        resumoDiarioMap[key] = (resumoDiarioMap[key] || 0) + (parseFloat(r.horas_dirigindo) || 0);
      }

      // Filtrar ordens do tecnico no JS (mais confiavel que filtro Supabase em array)
      const ordens = (allOrdensRes.data || []).filter((o: Record<string, unknown>) => {
        const tecs = (o.tecnicos as string[]) || [];
        return tecs.some(t => nomesBatem(t, tecNome));
      }).map((o: Record<string, unknown>) => {
        // Extrair servico_solicitado e relatorio do campo descricao
        const desc = String(o.descricao || "");
        let servico_solicitado = "";
        let relatorio = "";
        const solMatch = desc.match(/Solicit[aã][çc][aã]o\s+(?:d[oe]\s+)?cliente:\s*([\s\S]*?)(?=\|*Diagn|\|*Servi|$)/i);
        if (solMatch) servico_solicitado = solMatch[1].replace(/\|/g, " ").trim();
        const servMatch = desc.match(/Servi[çc]o\s+[Rr]ealizado:\s*([\s\S]*?)$/i);
        if (servMatch) relatorio = servMatch[1].replace(/\|/g, " ").trim();
        if (!relatorio && !servico_solicitado && desc) relatorio = desc.replace(/\|/g, " ").trim();
        return { ...o, relatorio, servico_solicitado };
      });

      // Buscar dados complementares: PPVs, cliente (Ordem_Servico), relatorio tecnico (Ordem_Servico_Tecnicos)
      const osCodInts = ordens.map((o: Record<string, unknown>) => String(o.cod_int)).filter(Boolean);
      let ppvsPorOs: Record<string, { id: string; pedido_omie: string; status: string; produtos: { codigo: string; descricao: string; qtd: number; preco: number; devolvido: number }[] }[]> = {};
      let clientePorOs: Record<string, { cliente: string; cidade_cliente: string }> = {};
      let relatorioTecPorOs: Record<string, { motivo: string; servico_realizado: string; status: string }> = {};

      if (osCodInts.length > 0) {
        // Buscar em paralelo: pedidos, cliente, relatorio tecnico
        const [pedidosRes, osRes, tecRes] = await Promise.all([
          supabase
            .from("pedidos")
            .select("id_pedido, Id_Os, status, valor_total, pedido_omie")
            .in("Id_Os", osCodInts),
          supabase
            .from("Ordem_Servico")
            .select("Id_Ordem, Os_Cliente, Cidade_Cliente")
            .in("Id_Ordem", osCodInts),
          supabase
            .from("Ordem_Servico_Tecnicos")
            .select("Ordem_Servico, Motivo, ServicoRealizado, Status")
            .in("Ordem_Servico", osCodInts),
        ]);

        // Mapear cliente por OS
        for (const os of osRes.data || []) {
          clientePorOs[String(os.Id_Ordem)] = {
            cliente: String(os.Os_Cliente || ""),
            cidade_cliente: String(os.Cidade_Cliente || ""),
          };
        }

        // Mapear relatorio tecnico por OS (pegar o mais recente/enviado)
        for (const rt of tecRes.data || []) {
          const osId = String(rt.Ordem_Servico);
          // Preferir status 'enviado' sobre 'rascunho'
          if (!relatorioTecPorOs[osId] || rt.Status === "enviado") {
            relatorioTecPorOs[osId] = {
              motivo: String(rt.Motivo || ""),
              servico_realizado: String(rt.ServicoRealizado || ""),
              status: String(rt.Status || ""),
            };
          }
        }

        // PPVs
        const pedidos = pedidosRes.data;
        if (pedidos && pedidos.length > 0) {
          const ppvIds = pedidos.map((p: Record<string, unknown>) => String(p.id_pedido));

          const { data: movs } = await supabase
            .from("movimentacoes")
            .select("Id_PPV, CodProduto, Descricao, Qtde, Preco, TipoMovimento")
            .in("Id_PPV", ppvIds);

          for (const ped of pedidos) {
            const osId = String(ped.Id_Os);
            const ppvId = String(ped.id_pedido);
            const pedasMovs = (movs || []).filter((m: Record<string, unknown>) => String(m.Id_PPV) === ppvId);

            const prodMap: Record<string, { codigo: string; descricao: string; qtd: number; preco: number; devolvido: number }> = {};
            for (const m of pedasMovs) {
              const tipo = String(m.TipoMovimento || "").toLowerCase();
              const cod = String(m.CodProduto || "");
              const qtd = Math.abs(parseFloat(String(m.Qtde || 0)));
              const preco = parseFloat(String(m.Preco || 0));
              const desc = String(m.Descricao || "");

              if (tipo.includes("saida") || tipo.includes("saída")) {
                if (prodMap[cod]) prodMap[cod].qtd += qtd;
                else prodMap[cod] = { codigo: cod, descricao: desc, qtd, preco, devolvido: 0 };
              } else if (tipo.includes("devolu")) {
                if (prodMap[cod]) prodMap[cod].devolvido += qtd;
                else prodMap[cod] = { codigo: cod, descricao: desc, qtd: 0, preco, devolvido: qtd };
              }
            }

            if (!ppvsPorOs[osId]) ppvsPorOs[osId] = [];
            ppvsPorOs[osId].push({
              id: ppvId,
              pedido_omie: String(ped.pedido_omie || ""),
              status: String(ped.status || ""),
              produtos: Object.values(prodMap),
            });
          }
        }
      }

      // Resumo GPS — mesma lógica do relatório frontend para consistência
      let gpsKmMes = 0;
      let gpsDias = 0;
      let gpsDirigindoHoras = 0;
      let gpsForaHoras = 0;
      let gpsParadoForaHoras = 0;

      const calcHorasServicoDia = (eventos: any[]): number => {
        if (!eventos || eventos.length === 0) return 0;
        let horas = 0;
        let ultimaSaida: Date | null = null;
        for (const ev of eventos) {
          if (ev.tipo === 'saida_loja') {
            ultimaSaida = new Date(ev.horario);
          } else if (ev.tipo === 'retorno_loja' && ultimaSaida) {
            const diffMin = (new Date(ev.horario).getTime() - ultimaSaida.getTime()) / 60000;
            if (diffMin > 30) horas += diffMin / 60;
            ultimaSaida = null;
          }
        }
        if (ultimaSaida && eventos.length > 0) {
          const diffMin = (new Date(eventos[eventos.length - 1].horario).getTime() - ultimaSaida.getTime()) / 60000;
          if (diffMin > 30) horas += diffMin / 60;
        }
        return horas;
      };

      for (const g of gpsData) {
        gpsKmMes += parseFloat(g.km_total) || 0;
        gpsDias++;

        const horasFora = calcHorasServicoDia(g.eventos || []);
        const dirigindo = resumoDiarioMap[String(g.data)] || 0;
        const parado = Math.max(0, horasFora - dirigindo);

        gpsForaHoras += horasFora;
        gpsDirigindoHoras += dirigindo;
        gpsParadoForaHoras += parado;
      }

      const gpsDirigindoMin = Math.round(gpsDirigindoHoras * 60);
      const gpsParadoForaMin = Math.round(gpsParadoForaHoras * 60);

      // Montar ordens com dados complementares
      const ordensComPpv: any[] = ordens.map((o: Record<string, unknown>) => {
        const codInt = String(o.cod_int);
        const cli = clientePorOs[codInt];
        const relTec = relatorioTecPorOs[codInt];
        return {
          ...o,
          cliente: cli?.cliente || "",
          cidade_cliente: cli?.cidade_cliente || "",
          relatorio_tecnico: relTec?.servico_realizado || "",
          diagnostico_tecnico: relTec?.motivo || "",
          ppvs: ppvsPorOs[codInt] || [],
        };
      });

      // Montar alertas e sincronizar com tabela mecanico_alertas
      const alertasDetectados: { tipo: string; descricao: string; id_ordem: string; data_referencia: string; detalhes: string }[] = [];

      // 1. OS sem relatorio do tecnico (atraso)
      for (const o of ordensComPpv as Array<Record<string, unknown>>) {
        const codInt = String(o.cod_int);
        if (!relatorioTecPorOs[codInt] || !relatorioTecPorOs[codInt].servico_realizado) {
          alertasDetectados.push({
            tipo: "atraso_relatorio",
            descricao: `OS ${o.os_num} sem relatorio do tecnico`,
            id_ordem: codInt,
            data_referencia: String(o.data || primeiro),
            detalhes: `${o.cliente || o.cidade || "Sem cliente"}`,
          });
        }
      }

      // 2. Divergencia de KM: GPS vs relatado na OS
      const gpsKmPorData: Record<string, number> = {};
      for (const g of gpsData) {
        gpsKmPorData[String(g.data)] = (gpsKmPorData[String(g.data)] || 0) + (parseFloat(g.km_total) || 0);
      }
      for (const o of ordensComPpv as Array<Record<string, unknown>>) {
        const kmOs = parseFloat(String(o.km)) || 0;
        const dataOs = String(o.data || "");
        const kmGps = gpsKmPorData[dataOs] || 0;
        if (kmOs > 0 && kmGps > 0) {
          const diff = Math.abs(kmOs - kmGps);
          const pct = diff / Math.max(kmOs, kmGps) * 100;
          if (pct > 30 && diff > 20) {
            alertasDetectados.push({
              tipo: "divergencia_km",
              descricao: `OS ${o.os_num} - KM divergente (OS: ${kmOs.toFixed(0)} km | GPS: ${kmGps.toFixed(0)} km)`,
              id_ordem: String(o.cod_int),
              data_referencia: dataOs || primeiro,
              detalhes: `Diferenca: ${diff.toFixed(0)} km (${pct.toFixed(0)}%)`,
            });
          }
        }
      }

      // Buscar alertas existentes do tecnico no mes
      const { data: alertasExistentes } = await supabase
        .from("mecanico_alertas")
        .select("*")
        .eq("tecnico_nome", tecNome)
        .gte("data_referencia", primeiro)
        .lte("data_referencia", ultimo);

      const alertasMap = new Map((alertasExistentes || []).map((a: Record<string, unknown>) => [`${a.tipo}_${a.id_ordem}`, a]));

      // Inserir novos alertas que nao existem ainda
      const novos = alertasDetectados.filter(a => !alertasMap.has(`${a.tipo}_${a.id_ordem}`));
      if (novos.length > 0) {
        await supabase.from("mecanico_alertas").insert(
          novos.map(a => ({
            tecnico_nome: tecNome,
            tipo: a.tipo,
            descricao: a.descricao,
            detalhes: a.detalhes,
            id_ordem: a.id_ordem,
            data_referencia: a.data_referencia,
            status: "pendente",
          }))
        );
      }

      // Rebuscar alertas do mes + pendentes de meses anteriores (carryover)
      const [alertasMesRes, alertasCarryoverRes] = await Promise.all([
        supabase
          .from("mecanico_alertas")
          .select("*")
          .eq("tecnico_nome", tecNome)
          .gte("data_referencia", primeiro)
          .lte("data_referencia", ultimo)
          .order("data_referencia", { ascending: false }),
        supabase
          .from("mecanico_alertas")
          .select("*")
          .eq("tecnico_nome", tecNome)
          .eq("status", "pendente")
          .lt("data_referencia", primeiro)
          .order("data_referencia", { ascending: false }),
      ]);

      // Montar mapa de ordens do mes atual
      const ordensMap = new Map<string, any>();
      for (const o of ordensComPpv) {
        ordensMap.set(String((o as any).cod_int), o);
      }

      // Buscar dados de OS para alertas de carryover (meses anteriores)
      const carryoverOrdemIds = (alertasCarryoverRes.data || [])
        .map((a: any) => String(a.id_ordem))
        .filter((id: string) => id && !ordensMap.has(id));

      if (carryoverOrdemIds.length > 0) {
        const uniqueIds = [...new Set(carryoverOrdemIds)];
        const [carryOsRes, carryCliRes, carryTecRes] = await Promise.all([
          supabase.from("Ordens_Omie")
            .select("os_num, cod_int, data, horas, km, valor, status, faturada, interno, cidade, empresa, descricao, obs, tecnicos")
            .in("cod_int", uniqueIds),
          supabase.from("Ordem_Servico")
            .select("Id_Ordem, Os_Cliente, Cidade_Cliente")
            .in("Id_Ordem", uniqueIds),
          supabase.from("Ordem_Servico_Tecnicos")
            .select("Ordem_Servico, Motivo, ServicoRealizado, Status")
            .in("Ordem_Servico", uniqueIds),
        ]);

        const carryCliMap: Record<string, { cliente: string; cidade_cliente: string }> = {};
        for (const os of carryCliRes.data || []) {
          carryCliMap[String(os.Id_Ordem)] = { cliente: String(os.Os_Cliente || ""), cidade_cliente: String(os.Cidade_Cliente || "") };
        }
        const carryTecMap: Record<string, { motivo: string; servico_realizado: string }> = {};
        for (const rt of carryTecRes.data || []) {
          const osId = String(rt.Ordem_Servico);
          if (!carryTecMap[osId] || rt.Status === "enviado") {
            carryTecMap[osId] = { motivo: String(rt.Motivo || ""), servico_realizado: String(rt.ServicoRealizado || "") };
          }
        }

        for (const os of carryOsRes.data || []) {
          const codInt = String(os.cod_int);
          const cli = carryCliMap[codInt];
          const relTec = carryTecMap[codInt];
          const desc = String(os.descricao || "");
          let servico_solicitado = "";
          const solMatch = desc.match(/Solicit[aã][çc][aã]o\s+(?:d[oe]\s+)?cliente:\s*([\s\S]*?)(?=\|*Diagn|\|*Servi|$)/i);
          if (solMatch) servico_solicitado = solMatch[1].replace(/\|/g, " ").trim();
          ordensMap.set(codInt, {
            os_num: os.os_num, cod_int: codInt, data: os.data, horas: os.horas,
            km: os.km, valor: os.valor, status: os.status, faturada: os.faturada,
            interno: os.interno, cidade: os.cidade, empresa: os.empresa,
            cliente: cli?.cliente || "", cidade_cliente: cli?.cidade_cliente || "",
            relatorio_tecnico: relTec?.servico_realizado || "",
            diagnostico_tecnico: relTec?.motivo || "",
            servico_solicitado,
            ppvs: [],
          });
        }
      }

      // Enriquecer cada alerta com dados da OS vinculada
      const enriquecerAlerta = (a: any, isCarryover: boolean) => {
        const ordem = ordensMap.get(String(a.id_ordem));
        return {
          ...a,
          carryover: isCarryover,
          ordem: ordem ? {
            os_num: ordem.os_num,
            data: ordem.data,
            status: ordem.status,
            faturada: ordem.faturada,
            cliente: ordem.cliente || "",
            cidade_cliente: ordem.cidade_cliente || "",
            horas: String(ordem.horas || ""),
            km: String(ordem.km || ""),
            valor: String(ordem.valor || ""),
            relatorio_tecnico: ordem.relatorio_tecnico || "",
            diagnostico_tecnico: ordem.diagnostico_tecnico || "",
            servico_solicitado: ordem.servico_solicitado || "",
            ppvs: ordem.ppvs || [],
          } : null,
        };
      };

      const alertasEnriquecidos = [
        ...(alertasMesRes.data || []).map((a: any) => enriquecerAlerta(a, false)),
        ...(alertasCarryoverRes.data || []).map((a: any) => enriquecerAlerta(a, true)),
      ];

      // Filtrar requisicoes do mes selecionado (data formato DD/MM/YYYY HH:MM)
      const mesNum = mesMes;
      const anoNum = anoMes;
      const reqDoMes = (reqRes.data || []).filter((r: Record<string, unknown>) => {
        const d = String(r.data || "");
        const parts = d.split("/");
        if (parts.length < 3) return false;
        const mes = parseInt(parts[1]);
        const ano = parseInt(parts[2].split(" ")[0]);
        return mes === mesNum && ano === anoNum;
      });

      // Buscar veiculo vinculado do tecnico (mesmo que o mapeamento tecnico)
      const { data: vinculos } = await supabase
        .from("tecnico_veiculos")
        .select("placa, tecnico_nome, adesao_id")
        .eq("tecnico_nome", tecNome);

      let veiculoInfo: { placa: string; descricao: string } | null = null;
      if (vinculos && vinculos.length > 0) {
        const vinc = vinculos[0];
        try {
          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
          const veicRes = await fetch(`${baseUrl}/api/pos/rastreamento?acao=veiculos`);
          if (veicRes.ok) {
            const veicList = await veicRes.json();
            const placaNorm = (vinc.placa || '').replace(/[^A-Z0-9]/g, '').toUpperCase();
            const found_v = veicList.find((v: any) => (v.placa || '').replace(/[^A-Z0-9]/g, '').toUpperCase() === placaNorm);
            veiculoInfo = { placa: vinc.placa, descricao: found_v?.descricao || found_v?.modelo || '' };
          } else {
            veiculoInfo = { placa: vinc.placa, descricao: '' };
          }
        } catch {
          veiculoInfo = { placa: vinc.placa, descricao: '' };
        }
      }

      // Data de entrada: primeira OS do tecnico no Omie
      const { data: todasOsOrdenadas } = await supabase
        .from("Ordens_Omie")
        .select("data, tecnicos")
        .order("data", { ascending: true })
        .limit(2000);

      let dataEntrada: string | null = null;
      if (todasOsOrdenadas) {
        for (const o of todasOsOrdenadas) {
          if (((o as any).tecnicos || []).some((t: string) => nomesBatem(t, tecNome))) {
            dataEntrada = (o as any).data;
            break;
          }
        }
      }

      return NextResponse.json({
        ...found,
        mes: mesAtual,
        ordens: ordensComPpv,
        ocorrencias: ocorrenciasRes.data || [],
        requisicoes: reqDoMes,
        alertas: alertasEnriquecidos,
        gps: { kmMes: Math.round(gpsKmMes), dias: gpsDias, dirigindoMin: gpsDirigindoMin, paradoForaMin: gpsParadoForaMin },
        veiculo: veiculoInfo,
        data_entrada: dataEntrada,
      });
    }

    // Retornar lista completa (para a tela principal)
    // Buscar contagem de ordens do mes para cada tecnico
    const now = new Date();
    const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const primeiro = `${mesAtual}-01`;
    const ultimo = `${mesAtual}-${new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()}`;

    const { data: ordens } = await supabase
      .from("Ordens_Omie")
      .select("os_num, tecnicos, horas, km, valor, interno")
      .neq("status", "Cancelada")
      .gte("data", primeiro)
      .lte("data", ultimo)
      .limit(5000);

    // Buscar ocorrencias, alertas pendentes e dados do relatorio geral
    const mesP = mesAtual.split("-")[1];
    const anoP = mesAtual.split("-")[0];
    const patBR = `%/${mesP}/${anoP}`;
    const patISO = `${mesAtual}-%`;

    const [ocPendentesRes, alertasPendentesRes, osRelRes, pvRelRes, despRelRes, configRelRes] = await Promise.all([
      supabase.from("mecanico_ocorrencias").select("tecnico_nome, id").eq("pontos", 0),
      supabase.from("mecanico_alertas").select("tecnico_nome, id").eq("status", "pendente"),
      supabase.from("ordens_servico_relatorio")
        .select("numero_os, nome_vendedor, valor_total, data_emissao, data_abertura, nome_etapa, status_cancelada, nome_cliente, numero_contrato")
        .or(`data_emissao.like.${patBR},data_emissao.like.${patISO},data_abertura.like.${patBR},data_abertura.like.${patISO}`)
        .limit(5000),
      supabase.from("pedidos_venda_relatorio")
        .select("numero_venda, vendedor, valor_total, data_emissao, data_abertura, etapa, cancelada, devolvido, cliente")
        .or(`data_emissao.like.${patBR},data_emissao.like.${patISO},data_abertura.like.${patBR},data_abertura.like.${patISO}`)
        .limit(5000),
      supabase.from("despesas_relatorio")
        .select("id, vendedor, valor, tipo, subtipo, setor, fase")
        .gte("data_iso", primeiro)
        .lte("data_iso", ultimo)
        .limit(5000),
      supabase.from("config_vendedores_relatorio")
        .select("nome, salario, encargos, cargo"),
    ]);

    const resultado = mecanicos.map((m) => {
      const tecNome = m.tecnico_nome || m.nome;
      let total = 0, horas = 0, km = 0, valor = 0;
      for (const o of ordens || []) {
        const tecs = (o.tecnicos || []) as string[];
        if (tecs.some((t: string) => nomesBatem(t, tecNome))) {
          total++;
          horas += parseFloat(o.horas) || 0;
          km += parseFloat(o.km) || 0;
          valor += parseFloat(o.valor) || 0;
        }
      }
      const ocPendentes = (ocPendentesRes.data || []).filter((oc: any) => nomesBatem(oc.tecnico_nome || "", tecNome)).length;
      const alertasPendentes = (alertasPendentesRes.data || []).filter((al: any) => nomesBatem(al.tecnico_nome || "", tecNome)).length;
      return {
        ...m,
        stats: { total, horas, km, valor },
        ocorrencias_pendentes: ocPendentes,
        alertas_pendentes: alertasPendentes,
      };
    });

    // ── RESUMO GERAL DA OFICINA ──
    const cleanNL = cleanName;
    const canonBateL = namesMatch;
    const splitTecsL = (raw: string | null) => {
      if (!raw) return [];
      return splitTecsUtil(raw).map(p => cleanName(p)).filter(Boolean) as string[];
    };

    const configRowsL = ((configRelRes.data || []) as any[]);
    const vendedoresL: string[] = [];
    const tecnicosL: string[] = [];
    for (const c of configRowsL) {
      const can = cleanNL(c.nome);
      if (!can) continue;
      const cargoU = String(c.cargo || "").toUpperCase();
      if (cargoU === "VENDEDOR") { if (!vendedoresL.includes(can)) vendedoresL.push(can); }
      else { if (!tecnicosL.includes(can)) tecnicosL.push(can); }
    }
    const algumBateL = (can: string, lista: string[]) => lista.some(c => canonBateL(can, c));
    const temTecL = (raw: string | null) => {
      const tecs = splitTecsL(raw);
      return tecs.some(t => !algumBateL(t, vendedoresL));
    };

    const RE_OS_FAT_L = /FATURAD|FINALIZAD|ENTREGUE|CONCLU|ENCERRADO/i;
    const RE_OS_INT_L = /INTERNO|CORTESIA/i;
    const RE_PV_FAT_L = /FATURAD|FINALIZAD|ENTREGUE|CONCLU|\b60\b|\b70\b/i;
    const RE_PV_CANC_L = /CANCELAD|\b80\b/i;
    const isCancL = (f: string | null) => { const v = String(f || "").trim().toUpperCase(); return v === "SIM" || v.startsWith("S"); };
    const ehVIL = (c: string | null) => { const u = String(c || "").toUpperCase(); return u.includes("NOVA TRATORES") || u.includes("CASTRO MAQUINAS") || u.includes("CASTRO MÁQUINAS"); };

    const osAprovL = ((osRelRes.data || []) as any[]).filter(o => {
      const et = String(o.nome_etapa || "").toUpperCase();
      if (et.includes("CANCELAD") || isCancL(o.status_cancelada)) return false;
      return RE_OS_FAT_L.test(et);
    });
    const osProdsL = osAprovL.filter(o => !RE_OS_INT_L.test(String(o.numero_contrato || "").toUpperCase()) && !ehVIL(o.nome_cliente));
    const osTecL = osProdsL.filter(o => temTecL(o.nome_vendedor));

    const pvAprovL = ((pvRelRes.data || []) as any[]).filter(p => {
      const et = String(p.etapa || "").toUpperCase();
      if (RE_PV_CANC_L.test(et) || isCancL(p.cancelada) || isCancL(p.devolvido)) return false;
      if (!RE_PV_FAT_L.test(et) || ehVIL(p.cliente)) return false;
      return true;
    });
    const pvTecL = pvAprovL.filter(p => temTecL(p.vendedor));

    const despTecL = ((despRelRes.data || []) as any[]).filter(d => {
      const setor = String(d.setor || "").toUpperCase().replace(/[\s\-_]/g, "");
      if (setor.includes("TRATORLOJA")) return false;
      const fase = String(d.fase || "").toUpperCase();
      if (["AGUARDANDO", "COTACAO", "COTAÇÃO", "APROVACAO", "APROVAÇÃO"].some(x => fase.includes(x))) return false;
      return true;
    });

    const receitaOS = osTecL.reduce((a: number, o: any) => a + Number(o.valor_total || 0), 0);
    const receitaPV = pvTecL.reduce((a: number, p: any) => a + Number(p.valor_total || 0), 0);
    const despOp = despTecL.reduce((a: number, d: any) => a + Number(d.valor || 0), 0);
    const custoRHTot = configRowsL.reduce((a: number, c: any) => {
      const cu = String(c.cargo || "PADRAO").toUpperCase();
      if (!(cu === "PADRAO" || cu.includes("TECNICO") || cu.includes("MECANICO"))) return a;
      return a + Number(c.salario || 0) + Number(c.encargos || 0);
    }, 0);

    // Ranking
    const rankMapL = new Map<string, { valor: number; qtd: number }>();
    for (const o of osProdsL) {
      const tecs = splitTecsL(o.nome_vendedor).filter(t => !algumBateL(t, vendedoresL));
      if (tecs.length === 0) continue;
      const vpt = Number(o.valor_total || 0) / tecs.length;
      for (const t of tecs) {
        const at = rankMapL.get(t) || { valor: 0, qtd: 0 };
        at.valor += vpt; at.qtd++;
        rankMapL.set(t, at);
      }
    }
    const rankingL = Array.from(rankMapL.entries())
      .map(([can, agg]) => ({ nome: can.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()), valor: agg.valor, qtd: agg.qtd }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10);

    const resumoGeral = {
      receitaTotal: receitaOS + receitaPV,
      despesaTotal: despOp + custoRHTot,
      despesaOperacional: despOp,
      custoRH: custoRHTot,
      qtdOS: osTecL.length,
      qtdPV: pvTecL.length,
      ranking: rankingL,
    };

    return NextResponse.json({ mecanicos: resultado, resumo: resumoGeral });
  } catch (e: any) {
    console.error("[mecanicos]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * POST /api/mecanicos
 * Cria ocorrencia para um mecanico
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { acao } = body;

    if (acao === "criar_ocorrencia") {
      const { tecnico_nome, tipo, titulo, descricao, criado_por } = body;
      if (!tecnico_nome || !tipo || !titulo) {
        return NextResponse.json({ error: "tecnico_nome, tipo e titulo obrigatorios" }, { status: 400 });
      }

      const textoDescricao = titulo + (descricao ? ` - ${descricao}` : "");

      const { data, error } = await supabase.from("mecanico_ocorrencias").insert({
        tecnico_nome,
        tipo,
        descricao: textoDescricao,
        data_referencia: new Date().toISOString().slice(0, 10),
        admin_nome: criado_por || "portal",
      }).select().single();

      if (error) throw error;
      return NextResponse.json(data);
    }

    if (acao === "atualizar_ocorrencia") {
      const { id, status, resposta, admin_nome } = body;
      if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });

      const update: Record<string, unknown> = {};
      if (admin_nome) update.admin_nome = admin_nome;
      // Usar pontos como flag de status: 0=pendente, 1=resolvida, -1=cancelada, 2=justificada
      if (status === "resolvida") update.pontos = 1;
      else if (status === "cancelada") update.pontos = -1;
      else if (status === "justificada") update.pontos = 2;

      const { error } = await supabase.from("mecanico_ocorrencias").update(update).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (acao === "justificar_alerta") {
      const { id, admin_comentario, admin_nome } = body;
      if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });

      const { error } = await supabase.from("mecanico_alertas").update({
        status: "justificada",
        admin_comentario: admin_comentario || "",
        admin_nome: admin_nome || "portal",
        resolvido_em: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (acao === "alerta_para_ocorrencia") {
      const { id, admin_nome } = body;
      if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });

      // Buscar alerta
      const { data: alerta, error: aErr } = await supabase
        .from("mecanico_alertas")
        .select("*")
        .eq("id", id)
        .single();
      if (aErr || !alerta) return NextResponse.json({ error: "alerta nao encontrado" }, { status: 404 });

      // Criar ocorrencia a partir do alerta
      const tipoOc = alerta.tipo === "atraso_relatorio" ? "atraso" : "observacao";
      await supabase.from("mecanico_ocorrencias").insert({
        tecnico_nome: alerta.tecnico_nome,
        tipo: tipoOc,
        descricao: alerta.descricao + (alerta.detalhes ? ` - ${alerta.detalhes}` : ""),
        data_referencia: alerta.data_referencia || new Date().toISOString().slice(0, 10),
        admin_nome: admin_nome || "portal",
        id_alerta: String(alerta.id),
      });

      // Atualizar alerta como virou ocorrencia
      await supabase.from("mecanico_alertas").update({
        status: "ocorrencia",
        admin_nome: admin_nome || "portal",
        resolvido_em: new Date().toISOString(),
      }).eq("id", id);

      return NextResponse.json({ ok: true });
    }

    if (acao === "sync_alertas") {
      // Gera alertas para TODOS os técnicos de uma vez (chamado em background)
      const now = new Date();
      const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const primeiro = `${mesAtual}-01`;
      const [anoMes, mesMes] = mesAtual.split("-").map(Number);
      const ultimo = `${mesAtual}-${new Date(anoMes, mesMes, 0).getDate()}`;

      const [permsRes, ordensRes, gpsRes, tecRelRes] = await Promise.all([
        supabase.from("portal_permissoes").select("mecanico_tecnico_nome").eq("mecanico_role", "tecnico"),
        supabase.from("Ordens_Omie").select("os_num, cod_int, data, km, tecnicos").neq("status", "Cancelada").gte("data", primeiro).lte("data", ultimo).limit(5000),
        supabase.from("GPS_Viagens").select("tecnico_nome, data, km_total").gte("data", primeiro).lte("data", ultimo),
        supabase.from("Ordem_Servico_Tecnicos").select("Ordem_Servico, ServicoRealizado, Status"),
      ]);

      const tecnicos = (permsRes.data || []).map((p: any) => p.mecanico_tecnico_nome).filter(Boolean);
      const ordens = ordensRes.data || [];
      const gpsViagens = gpsRes.data || [];

      const relTecMap: Record<string, boolean> = {};
      for (const rt of tecRelRes.data || []) {
        if (rt.ServicoRealizado) relTecMap[String(rt.Ordem_Servico)] = true;
      }

      let totalNovos = 0;

      for (const tecNome of tecnicos) {
        const ordTec = ordens.filter((o: any) => ((o.tecnicos || []) as string[]).some((t: string) => nomesBatem(t, tecNome)));
        const alertasDetectados: { tipo: string; descricao: string; id_ordem: string; data_referencia: string; detalhes: string }[] = [];

        // OS sem relatorio
        for (const o of ordTec) {
          if (!relTecMap[String(o.cod_int)]) {
            alertasDetectados.push({ tipo: "atraso_relatorio", descricao: `OS ${o.os_num} sem relatorio do tecnico`, id_ordem: String(o.cod_int), data_referencia: String(o.data || primeiro), detalhes: "" });
          }
        }

        // Divergencia KM
        const gpsKmPorData: Record<string, number> = {};
        for (const g of gpsViagens.filter((g: any) => nomesBatem(g.tecnico_nome || "", tecNome))) {
          gpsKmPorData[String(g.data)] = (gpsKmPorData[String(g.data)] || 0) + (parseFloat(g.km_total) || 0);
        }
        for (const o of ordTec) {
          const kmOs = parseFloat(String(o.km)) || 0;
          const kmGps = gpsKmPorData[String(o.data || "")] || 0;
          if (kmOs > 0 && kmGps > 0) {
            const diff = Math.abs(kmOs - kmGps);
            const pct = diff / Math.max(kmOs, kmGps) * 100;
            if (pct > 30 && diff > 20) {
              alertasDetectados.push({ tipo: "divergencia_km", descricao: `OS ${o.os_num} - KM divergente (OS: ${kmOs.toFixed(0)} | GPS: ${kmGps.toFixed(0)})`, id_ordem: String(o.cod_int), data_referencia: String(o.data || primeiro), detalhes: `${diff.toFixed(0)} km (${pct.toFixed(0)}%)` });
            }
          }
        }

        if (alertasDetectados.length === 0) continue;

        const { data: existentes } = await supabase.from("mecanico_alertas").select("tipo, id_ordem").eq("tecnico_nome", tecNome).gte("data_referencia", primeiro).lte("data_referencia", ultimo);
        const existSet = new Set((existentes || []).map((a: any) => `${a.tipo}_${a.id_ordem}`));
        const novos = alertasDetectados.filter(a => !existSet.has(`${a.tipo}_${a.id_ordem}`));

        if (novos.length > 0) {
          await supabase.from("mecanico_alertas").insert(novos.map(a => ({ tecnico_nome: tecNome, tipo: a.tipo, descricao: a.descricao, detalhes: a.detalhes, id_ordem: a.id_ordem, data_referencia: a.data_referencia, status: "pendente" })));
          totalNovos += novos.length;
        }
      }

      return NextResponse.json({ ok: true, tecnicos: tecnicos.length, alertas_criados: totalNovos });
    }

    return NextResponse.json({ error: "acao desconhecida" }, { status: 400 });
  } catch (e: any) {
    console.error("[mecanicos POST]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
