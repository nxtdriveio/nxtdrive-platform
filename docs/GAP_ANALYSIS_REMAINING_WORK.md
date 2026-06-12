# NXTDRIVE Gap Analysis & Remaining Work Plan

Status: working analysis
Last updated: 2026-06-11
Owner: product / architecture / delivery

## Purpose

This document translates the current codebase state into:

- what is already operationally real,
- what is partially built or visually present but still incomplete,
- what the organization canon still requires,
- and what remains before NXTDRIVE can be considered a mature, release-safe platform.

It also adds the current UI follow-up requirements:

- the student-app bottom-nav home button must stop being oversized and become visually consistent,
- all student and instructor PWA containers need a full scaling and responsive audit,
- and a complete product documentation set must be planned and delivered.

## Executive Summary

NXTDRIVE is no longer a simple MVP. The core platform is already substantial:

- multi-tenant SaaS foundation,
- organization / branch / role / permission model,
- leads and intake automation,
- lesson planning,
- invoices, credit and accounting,
- backoffice operations,
- instructor PWA,
- student PWA,
- parent portal,
- franchise foundation,
- white-label foundation,
- early AI assistance.

The strongest part of the system is the operational and authorization foundation.
The weakest part is not the data model anymore, but the finishing layer around it:

- entitlement enforcement,
- reporting depth,
- full white-label completion,
- device-perfect PWA polish,
- observability / hardening / release quality,
- and end-user documentation.

## Current Product Surface: Reality vs Gap

### 1. Platform Admin

Current state:

- platform admin dashboard exists,
- tenant creation exists,
- organization type, plan and onboarding metadata exist,
- email config exists,
- AI key/config exists,
- notification management exists,
- white-label flags are visible.

Working well:

- tenant overview and tenant detail management,
- organization profile editing,
- AI/email platform configuration,
- notifications control surface.

Main gaps:

- no complete subscription operations center,
- no unified feature-flag management surface,
- no support tooling such as impersonation / retry / maintenance tools,
- no full platform finance/commercial control layer,
- no operations/health center.

Conclusion:

- real foundation, not yet a mature SaaS control plane.

### 2. Backoffice

Current state:

- broad operational coverage is real and deep.

Strong modules:

- dashboard,
- leads,
- leerlingen,
- agenda,
- facturen,
- boekhouding,
- taken,
- medewerkers,
- organisatie,
- vestigingen,
- teams,
- permissions,
- voertuigen/locaties,
- rapportages,
- franchise,
- settings,
- notifications settings,
- branding/domains foundation.

What is truly operational:

- lead intake and conversion chain,
- branch-scoped reads/writes,
- student 360 dossier,
- invoice and credit logic,
- task routing,
- availability and appointment planning,
- organization/team/member governance.

Main gaps:

- some surfaces are functionally stronger than their UX maturity,
- theory is present but not yet at the same product depth as planning/finance/leads,
- reports exist but need richer visual and management depth,
- support and exception workflows are still limited,
- there is not yet one explicit admin-facing “ops center” for retries, failures, audit and recovery.

Conclusion:

- backoffice is the most operationally credible part of NXTDRIVE, but still needs managerial depth and support tooling.

### 3. Instructor PWA

Current state:

- instructor home cockpit exists,
- agenda/day-week-month flow exists,
- student list and student detail exist,
- messages/inbox exist,
- tasks exist,
- availability exists,
- lesson flow exists,
- settings exist,
- notifications exist.

Working well:

- role-routed dedicated instructor shell,
- agenda data model and planning context,
- student-context drilldown,
- lesson execution context,
- read/write operational flows.

Main gaps:

- mobile layout still needs a strict viewport pass,
- some modules are functionally real but visually uneven,
- container scaling and first-screen composition still drift on smaller breakpoints,
- some secondary routes still need consistency in spacing, empty states and information density,
- the app is strong as a cockpit, but not fully “finished product” on every screen.

Specific required follow-up:

- full responsive audit across all instructor routes,
- tablet-first must remain leading,
- mobile must still be fully usable and polished,
- container scaling, button rhythm and viewport-fit need one final systematic pass.

Conclusion:

- functionally real, visually close, but not yet uniformly perfect.

### 4. Student PWA

Current state:

- dedicated student shell exists,
- home, lessons, progress, theory, invoices, payments, messages, CBR, profile and account flows exist,
- multiple detail views are already real, not placeholders.

Working well:

- role-based routing to `/student`,
- payment and credit visibility,
- lesson detail and context,
- theory/homework surface,
- progress storytelling,
- messaging and status cards,
- modern visual layer is already present.

Main gaps:

- the student home nav still has an oversized home button and must be normalized,
- bottom-nav balance and safe-area composition still need polish,
- multiple cards need a scaling audit on real mobile widths,
- some layouts still stack too tall before meaningful content appears,
- some containers and typographic blocks are still inconsistent across screens.

Specific required follow-up:

- remove the oversized visual emphasis of the home button in the student bottom-nav,
- make all student bottom-nav items consistent in size and weight,
- perform a screen-by-screen responsive pass for spacing, scaling, typography and viewport fit,
- re-check sticky headers, notification tray alignment and content spacing on real devices.

Conclusion:

- the student app is already a real app surface, but still needs the final quality pass that turns “good” into “ship-quality”.

### 5. Parent Portal

Current state:

- parent portal exists with overview, planning, progress, exams, invoices, payments, package info, credit and documents.

Working well:

- read-only parent context is structurally present,
- child selection and section gating are in place,
- the portal is not just a stub.

Main gaps:

- less product-polished than student and instructor surfaces,
- likely behind in visual consistency,
- needs a deliberate product decision whether it remains secondary/minimal or becomes a first-class polished surface.

Conclusion:

- more real than the phase plan suggests, but still not yet a hero product surface.

### 6. White-label, Domains and Branding

Current state:

- white-label foundation is real,
- tenant-aware branding helpers exist,
- domain model exists,
- branded manifests and shell naming exist,
- host-based resolution exists.

Working well:

- visual brand propagation,
- custom domain foundation,
- manifest/app naming basis.

Main gaps:

- transactional email branding is not fully finished,
- deeper brand assets and iconography strategy are still light,
- plan-based white-label gating exists but broader entitlement discipline is still incomplete.

Conclusion:

- foundation complete, product completion incomplete.

### 7. Reporting, Monitoring and Ops

Current state:

- tenant, branch and franchise dashboards exist,
- reports page exists,
- accounting export exists,
- multiple domain metrics are already computed.

Working well:

- operational reporting,
- branch/franchise management dashboards,
- management layer direction is correct.

Main gaps:

- richer analytics and charting depth still needed,
- no full monitoring/alerting operations layer,
- no central failure/retry dashboard,
- hardening and release-quality tooling is still behind the product surface.

Conclusion:

- reporting exists, but observability and platform operations still need a dedicated phase.

## Canon Status

### What is effectively in place

- organization-first model,
- tenant as technical organization container,
- branch as optional operational scope,
- teams separate from roles,
- centralized permission registry,
- branch-aware operational modules,
- franchise positioned above branch model,
- white-label as a shared layer, not a separate codebase.

### What is partially fulfilled

- reporting canon,
- theory platform canon,
- subscription/entitlement canon,
- white-label completion canon,
- support/monitoring canon,
- documentation canon.

### What is still materially open

- one canonical entitlement layer across UI and server actions,
- full transactional white-label branding,
- mature monitoring and security operations,
- release-quality discipline and systematic E2E coverage,
- comprehensive product documentation for all audiences.

## Remaining Work Plan

## Stream 1 - Final PWA Polish and Responsive Cleanup

Priority: immediate

Scope:

- normalize the student bottom-nav home button so it is no longer oversized,
- audit all student PWA screens for scaling, spacing, safe-area padding and card rhythm,
- audit all instructor PWA screens for viewport fit, especially mobile and tablet landscape,
- fix container overflow, oversized heroes, inconsistent CTA sizing and poor stacking behavior,
- validate notifications, headers, bottom-nav and sticky elements on real-device dimensions.

Deliverables:

- student nav balance fixed,
- instructor and student PWA layout audit complete,
- shared responsive rules documented,
- all key PWA screens rechecked on real mobile/tablet viewports.

## Stream 2 - Backoffice Completion Pass

Priority: high

Scope:

- identify every backoffice surface that is already functionally real but still UX-inconsistent,
- deepen theory management into a more complete operator workflow,
- tighten support flows around students, invoices, planning exceptions and notifications,
- add better operational empty states and cross-links where flows still dead-end.

Deliverables:

- clearer completion level per module,
- fewer “present but awkward” admin screens,
- stronger operator experience around exception handling.

## Stream 3 - Subscription, Entitlements and Feature Gating

Priority: high

Scope:

- centralize plan gating and entitlements,
- make subscription tier behavior explicit in server actions and UI,
- define what Start, Pro and Elite actually enable or hide,
- build a platform admin flow for plan state and upgrade implications.

Deliverables:

- one entitlement source of truth,
- no scattered plan checks,
- safer white-label/franchise/multi-branch/AI gating,
- clearer commercial packaging.

## Stream 4 - Reporting and Management Depth

Priority: high

Scope:

- deepen organization, branch and franchise reporting,
- improve charts, summaries and executive decision views,
- close the gap between operational data and management insight,
- add explicit watchlists and exception metrics.

Deliverables:

- richer dashboards,
- more executive-grade reporting,
- better branch/franchise comparability,
- less dependence on raw list pages for decision-making.

## Stream 5 - Theory Platform Maturation

Priority: medium-high

Scope:

- define whether theory is only homework-tracked or a full learning module,
- add richer learning flow, assignment flow and progress depth,
- align student theory UX with backoffice and instructor workflows,
- close any content, toetsing and reporting gaps.

Deliverables:

- theory becomes clearly “core module” instead of “halfway module”,
- better end-to-end theory story for student and school.

## Stream 6 - White-label Completion

Priority: medium-high

Scope:

- finish branded transactional emails,
- align branded shell language across login, PWA, backoffice and notifications,
- improve tenant-facing brand preview and onboarding support,
- document the exact operational rules around domains and branding.

Deliverables:

- white-label becomes a complete product offer,
- branding is not just visual, but operationally coherent.

## Stream 7 - Hardening, QA and Operations

Priority: critical before broad rollout

Scope:

- monitoring and alerting,
- cron/job observability,
- payment and notification failure handling,
- auth and health checks,
- release checklists,
- rollback confidence,
- stronger E2E coverage for critical business flows.

Critical E2E flows:

- staff invite and first login,
- lead to trial lesson to student,
- lesson planning and lesson completion,
- invoice payment and credit release,
- student/instructor messaging,
- branch-scoped access isolation,
- white-label host routing.

Deliverables:

- release-safe platform behavior,
- lower operational risk,
- faster debugging in production.

## Stream 8 - Full Documentation and Handleidingen

Priority: critical

Yes: a complete documentation set should be built, and it should be a planned workstream, not an afterthought.

Required documentation set:

- Platform admin handleiding
- Tenant admin / backoffice handleiding
- Instructor app handleiding
- Student app quickstart
- Parent portal handleiding
- White-label and domain setup guide
- Finance and invoice operations guide
- Planning and lesson operations guide
- Support / troubleshooting playbook
- Deployment and rollback runbook
- Release checklist
- Change log / release notes format

Recommended documentation structure:

- `docs/manuals/platform-admin.md`
- `docs/manuals/tenant-admin.md`
- `docs/manuals/instructor-app.md`
- `docs/manuals/student-app.md`
- `docs/manuals/parent-portal.md`
- `docs/manuals/white-label-domains.md`
- `docs/manuals/finance-operations.md`
- `docs/manuals/planning-operations.md`
- `docs/manuals/support-playbook.md`
- `docs/manuals/release-checklist.md`

Documentation approach:

- write task-based documentation, not only feature descriptions,
- include screenshots later as a separate pass,
- document both normal flow and exception flow,
- keep the manuals aligned with the canon and release process.

## Recommended Execution Order

1. Final PWA polish and responsive cleanup
2. Entitlements and plan gating
3. Backoffice completion pass
4. Reporting depth
5. Theory maturation
6. White-label completion
7. Hardening / monitoring / E2E / release quality
8. Full manuals and support documentation, with screenshots once UI stabilizes

## My Product Recommendations Beyond the Current Canon

- Add a true support/ops center for failed notifications, payment reconciliation, retries and audit visibility.
- Add a single “system health” view for platform admins.
- Treat documentation as a product surface, not just technical aftercare.
- Freeze and document responsive layout rules once the final PWA polish pass is done.
- Add an explicit completion matrix per module so “visible in UI” and “operationally complete” are never confused again.

## Definition of Done for the Next Major Phase

The next phase should only be considered complete when all of the following are true:

- student and instructor PWAs pass a real device viewport audit,
- the student bottom-nav has consistent visual weight,
- key modules have no obvious “present but not mature” dead ends,
- entitlement logic is centralized and enforced,
- core business flows have end-to-end verification,
- monitoring and support basics are in place,
- and the first complete manual set exists for platform admin, tenant admin, instructor and student.
