import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import path from 'path';

// Devolve a versão do build em produção (BUILD_ID muda a cada deploy).
// Usada pelo AutoAtualiza: quando a versão muda, o navegador recarrega
// sozinho — ninguém mais precisa de Ctrl+Shift+R depois de um deploy.
export const dynamic = 'force-dynamic';

export async function GET() {
  let v = process.env.RAILWAY_GIT_COMMIT_SHA || '';
  try {
    v = readFileSync(path.join(process.cwd(), '.next', 'BUILD_ID'), 'utf8').trim() || v;
  } catch { /* dev server não tem BUILD_ID — usa o fallback */ }
  return NextResponse.json({ v }, { headers: { 'Cache-Control': 'no-store' } });
}
