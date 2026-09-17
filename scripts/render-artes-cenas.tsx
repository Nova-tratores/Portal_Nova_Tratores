// @ts-nocheck - roda com tsx a partir da RAIZ do repo: npx tsx scripts/render-artes-cenas.tsx <dir-saida>
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { writeFileSync } from 'fs';
import PicapeFrenteArte from '../src/components/frota/PicapeFrenteArte';
import PicapeFrenteMotorArte from '../src/components/frota/PicapeFrenteMotorArte';
import PicapeTraseiraArte from '../src/components/frota/PicapeTraseiraArte';
import PicapeInteriorArte from '../src/components/frota/PicapeInteriorArte';
import RodaArte from '../src/components/frota/RodaArte';
import PicapeArte from '../src/components/frota/PicapeArte';
import CarroArte from '../src/components/frota/CarroArte';
import CarroFrenteArte from '../src/components/frota/CarroFrenteArte';
import CarroFrenteMotorArte from '../src/components/frota/CarroFrenteMotorArte';
import CarroTraseiraArte from '../src/components/frota/CarroTraseiraArte';
import CarroInteriorArte from '../src/components/frota/CarroInteriorArte';
import MunckArte from '../src/components/frota/MunckArte';
import MunckFrenteArte from '../src/components/frota/MunckFrenteArte';
import MunckFrenteMotorArte from '../src/components/frota/MunckFrenteMotorArte';
import MunckTraseiraArte from '../src/components/frota/MunckTraseiraArte';
import MunckInteriorArte from '../src/components/frota/MunckInteriorArte';
import MunckBracoArte from '../src/components/frota/MunckBracoArte';

const ARTES: Record<string, React.ComponentType> = {
  frente: PicapeFrenteMotorArte,
  carroceria: PicapeFrenteArte,
  traseira: PicapeTraseiraArte,
  cabine: PicapeInteriorArte,
  roda: RodaArte,
  lateral: PicapeArte,
  'c-frente': CarroFrenteMotorArte,
  'c-carroceria': CarroFrenteArte,
  'c-traseira': CarroTraseiraArte,
  'c-cabine': CarroInteriorArte,
  'c-lateral': CarroArte,
  'mk-frente': MunckFrenteMotorArte,
  'mk-carroceria': MunckFrenteArte,
  'mk-traseira': MunckTraseiraArte,
  'mk-cabine': MunckInteriorArte,
  'mk-braco': MunckBracoArte,
  'mk-lateral': MunckArte,
};

const dir = process.argv[2];
for (const [nome, Fundo] of Object.entries(ARTES)) {
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0">${renderToStaticMarkup(
    <svg viewBox="0 0 1408 768" width={1408} height={768} style={{ display: 'block', background: '#fff' }}>
      <g color="#334155"><Fundo /></g>
    </svg>
  )}</body>`;
  writeFileSync(`${dir}/arte-${nome}.html`, html);
  console.log('ok', nome);
}


