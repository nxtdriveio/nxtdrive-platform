import { GET as liveGET } from "@/app/health/live/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return liveGET();
}
