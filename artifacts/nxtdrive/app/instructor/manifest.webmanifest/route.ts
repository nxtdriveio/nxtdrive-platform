import { NextRequest, NextResponse } from "next/server";

export function GET(request: NextRequest) {
  const destination = new URL("/instructeur/manifest.webmanifest", request.url);
  destination.search = request.nextUrl.search;
  return NextResponse.redirect(destination, 308);
}
