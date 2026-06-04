import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { clearActiveTenant } from "@/lib/auth/active-tenant";
import { getPublicOrigin } from "@/lib/utils/public-origin";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  await clearActiveTenant();
  const origin = await getPublicOrigin();
  return NextResponse.redirect(`${origin}/login`, { status: 303 });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
