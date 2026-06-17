import { NextRequest, NextResponse } from 'next/server';
import { listarPecasDaOS } from '@/lib/garantias/os-pecas';

// GET /api/garantias/os-pecas?os=<id>
// Lista as peças da OS (PPV + requisições + peças manuais do relatório técnico).
export async function GET(req: NextRequest) {
  const osId = (req.nextUrl.searchParams.get('os') || '').trim();
  if (!osId) return NextResponse.json({ pecas: [] });
  const pecas = await listarPecasDaOS(osId);
  return NextResponse.json({ pecas });
}
