import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const part = searchParams.get("part");

  if (!part) {
    return NextResponse.json(
      { error: "Parâmetro part (URL do PDF) é obrigatório." },
      { status: 400 }
    );
  }

  return NextResponse.redirect(part);
}
