import { Trator, REVISOES_LISTA } from "./types";

export function calcularPrevisao(trator: Trator) {
  let ultimaRevHoras = 0;
  let ultimaRevData = new Date(trator.Entrega);
  let proximaRevHoras = 50;

  for (const rev of REVISOES_LISTA) {
    const dataRev = trator[`${rev} Data`];
    const horasRev = parseFloat(trator[`${rev} Horimetro`]);

    if (dataRev && !isNaN(horasRev)) {
      ultimaRevHoras = horasRev;
      ultimaRevData = new Date(dataRev);
      const index = REVISOES_LISTA.indexOf(rev);
      const proxima = REVISOES_LISTA[index + 1];
      proximaRevHoras = proxima ? parseInt(proxima) : 3000;
    }
  }

  const hoje = new Date();
  const entrega = new Date(trator.Entrega);
  const diasDesdeEntrega = Math.max(1, (hoje.getTime() - entrega.getTime()) / (1000 * 3600 * 24));

  const mediaHorasDia = ultimaRevHoras > 0 ? ultimaRevHoras / diasDesdeEntrega : 0.5;

  const horasFaltantes = Math.max(0, proximaRevHoras - ultimaRevHoras);
  const diasParaProxima = mediaHorasDia > 0 ? horasFaltantes / mediaHorasDia : 0;

  const dataEstimada = new Date(ultimaRevData);
  dataEstimada.setDate(dataEstimada.getDate() + Math.min(diasParaProxima, 3650));

  return {
    ultimaRevHoras,
    proximaRevHoras,
    dataEstimada,
    mediaHorasDia: Math.round(mediaHorasDia * 10) / 10,
    atrasada: dataEstimada < hoje && proximaRevHoras !== 3000
  };
}
