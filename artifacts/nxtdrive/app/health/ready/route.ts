import { GET as readyGET } from "@/app/api/health/ready/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return readyGET();
}
