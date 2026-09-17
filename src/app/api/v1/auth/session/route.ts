import { NextResponse } from "next/server";
import { AuthenticationError, AuthorizationError, getAuthenticatedActor } from "@/server/auth/actor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await getAuthenticatedActor();
    return NextResponse.json({ data: { authenticated: true, name: actor.name, roles: actor.roles } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
      return NextResponse.json({ data: { authenticated: false } }, { headers: { "Cache-Control": "no-store" } });
    }
    throw error;
  }
}