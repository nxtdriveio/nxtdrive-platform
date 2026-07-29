import "server-only";

import { permanentRedirect } from "next/navigation";
import {
  buildInstructorRoute,
  type InstructorRouteId,
  type InstructorSearchParams,
} from "./routes";

export function permanentRedirectToInstructorRoute(
  routeId: InstructorRouteId,
  params: Record<string, string | undefined> = {},
  searchParams: InstructorSearchParams = {},
): never {
  permanentRedirect(buildInstructorRoute(routeId, params, searchParams));
}
