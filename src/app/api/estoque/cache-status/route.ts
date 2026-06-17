import { NextResponse } from 'next/server';
import { getCacheStatus } from '@/lib/estoque/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Status de sync per-conta. Portado de GET /api/cache-status (server.js:1546).
export async function GET() {
  return NextResponse.json(getCacheStatus());
}
