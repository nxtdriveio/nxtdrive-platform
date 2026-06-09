import { readFileSync } from "node:fs";
import path from "node:path";

function repoPath(...parts: string[]) {
  return path.resolve(process.cwd(), "..", ...parts);
}

function expectIncludes(filePath: string, snippet: string, label: string) {
  const content = readFileSync(filePath, "utf8");
  if (!content.includes(snippet)) {
    throw new Error(`Expected ${label} in ${filePath}`);
  }
}

const brandingFile = repoPath("artifacts", "nxtdrive", "lib", "branding.ts");
const rootLayout = repoPath("artifacts", "nxtdrive", "app", "layout.tsx");
const rootManifest = repoPath("artifacts", "nxtdrive", "app", "manifest.webmanifest", "route.ts");
const studentLayout = repoPath("artifacts", "nxtdrive", "app", "student", "layout.tsx");
const studentManifest = repoPath("artifacts", "nxtdrive", "app", "student", "manifest.webmanifest", "route.ts");
const instructorLayout = repoPath("artifacts", "nxtdrive", "app", "instructor", "layout.tsx");
const instructorManifest = repoPath("artifacts", "nxtdrive", "app", "instructor", "manifest.webmanifest", "route.ts");
const settingsPage = repoPath("artifacts", "nxtdrive", "app", "backoffice", "instellingen", "page.tsx");
const settingsActions = repoPath("artifacts", "nxtdrive", "app", "backoffice", "instellingen", "actions.ts");
const previewCard = repoPath("artifacts", "nxtdrive", "components", "backoffice", "white-label-foundation-card.tsx");
const docsFile = repoPath("docs", "SPRINT_8_WHITE_LABEL_FOUNDATION.md");
const packageFile = repoPath("scripts", "package.json");

expectIncludes(brandingFile, "getBrandingContextByHost", "host-based branding context");
expectIncludes(brandingFile, "resolveBrandAppName", "brand app naming helper");
expectIncludes(brandingFile, "resolveThemeColor", "theme color helper");
expectIncludes(rootLayout, "generateMetadata", "dynamic root metadata");
expectIncludes(rootManifest, "brandingContext.brandName", "tenant-aware root manifest");
expectIncludes(studentLayout, "resolveBrandAppName(tenant, \"student\")", "student white-label metadata");
expectIncludes(studentManifest, "resolveBrandAppName(brandingContext.tenant, \"student\")", "student tenant-aware manifest");
expectIncludes(instructorLayout, "resolveBrandAppName(tenant, \"instructor\")", "instructor white-label metadata");
expectIncludes(instructorManifest, "resolveBrandAppName(brandingContext.tenant, \"instructor\")", "instructor tenant-aware manifest");
expectIncludes(settingsPage, "WhiteLabelFoundationCard", "settings white-label preview");
expectIncludes(settingsActions, "revalidatePath(\"/manifest.webmanifest\")", "branding manifest revalidation");
expectIncludes(previewCard, "White-label fundament", "white-label foundation preview card");
expectIncludes(docsFile, "# Sprint 8 - White-label Foundation", "sprint 8 docs");
expectIncludes(packageFile, '"test-white-label-foundation"', "package script registration");

console.log("test-white-label-foundation: ok");
