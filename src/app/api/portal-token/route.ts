import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const PORTAL_SECRET = "nova-tratores-portal-2024";

export async function POST(req: NextRequest) {
  const { ts } = await req.json();
  if (!ts) return NextResponse.json({ error: "ts required" }, { status: 400 });
  const hash = crypto.createHmac("sha256", PORTAL_SECRET).update(String(ts)).digest("hex");
  return NextResponse.json({ hash });
}
