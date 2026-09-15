import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/server/api";
import { publicListing } from "@/server/properties/service";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(_: Request, context: { params: Promise<{ slug: string }> }) { try { const { slug } = await context.params; return NextResponse.json({ data: await publicListing(slug) }, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return apiErrorResponse(error); } }
