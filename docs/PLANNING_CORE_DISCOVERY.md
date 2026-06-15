# Planning Core Discovery

Status: step 1 inventory for the new planning-kernel roadmap

## Goal

This document inventories the current lesson, appointment, trial-lesson, refill and student self-service flows that already create or mutate planning data.

It is the baseline for the new planning kernel:

- `canScheduleAppointment(...)`
- `scheduleAppointment(...)`
- `rescheduleAppointment(...)`
- `unassignAppointment(...)`
- `getPlanningPreview(...)`
- `getPlanningSuggestions(...)`

The purpose is to identify:

- where planning writes currently happen
- which authorization boundary is used today
- which validation lives in app code
- which validation lives in Postgres RPCs
- which flows must be rerouted through one central planning service

## Current planning domains

The current system already spreads planning logic across multiple domains:

- `lessons`
- `agenda_appointments`
- `trial_lessons`
- `lesson_refill_invitations`
- `exam_invitations`
- `lesson-planning` suggestions
- `trial-lessons` suggestions and route scoring
- student self-service rescheduling and cancellation

This confirms that the new architecture should be one shared planning engine, not a franchise-only extension.

## Inventory of mutating flows

| Flow | Entry point(s) | Current write path | Current auth check | Current validation | Centralization target |
| --- | --- | --- | --- | --- | --- |
| Schedule regular lesson | [app/backoffice/agenda/actions.ts](C:/Users/danny/Documents/Neijhof/nxtdrive-platform-pr-instructor-cockpit/artifacts/nxtdrive/app/backoffice/agenda/actions.ts:36) | `rpc("schedule_lesson")` | `requireStudentBackofficeAccess(...)`, `canManageAgendaForInstructor(...)`, branch-serving check via `instructorCanServeBranch(...)` | App: student exists, duration >= 15, instructor self/admin rules, branch-serving. DB: actor auth, instructor membership, student exists, balance/ledger, audit. Older migration variant checked agenda overlap; latest instructor-broadened function body inspected in [0057_schedule_lesson_instructor.sql](C:/Users/danny/Documents/Neijhof/nxtdrive-platform-pr-instructor-cockpit/supabase/migrations/0057_schedule_lesson_instructor.sql:20) does not include availability, travel, rayon, vehicle or capability checks. | Must become `scheduleAppointment(...)` for lesson-type bookings. |
| Complete lesson from backoffice | [app/backoffice/agenda/actions.ts](C:/Users/danny/Documents/Neijhof/nxtdrive-platform-pr-instructor-cockpit/artifacts/nxtdrive/app/backoffice/agenda/actions.ts:156) | `rpc("complete_lesson")` | `requireAgendaLessonAccess(..., "manage")` | Access + lesson state in RPC. No scheduling logic. | Keep outside kernel, but consume common lesson state/audit conventions. |
| Cancel lesson from backoffice | [app/backoffice/agenda/actions.ts](C:/Users/danny/Documents/Neijhof/nxtdrive-platform-pr-instructor-cockpit/artifacts/nxtdrive/app/backoffice/agenda/actions.ts:459) | `rpc("cancel_lesson")` | `requireAgendaLessonAccess(..., "manage")` | Access + cancellation policy in RPC. No unified planning preview or requeue behavior. | Should call central `unassignAppointment(...)` or cancellation orchestration later. |
| Create generic agenda appointment | [lib/agenda/actions.ts](C:/Users/danny/Documents/Neijhof/nxtdrive-platform-pr-instructor-cockpit/artifacts/nxtdrive/lib/agenda/actions.ts:83) | `rpc("create_agenda_appointment")` | `requireStudentBackofficeAccess(...)` or `requireAgendaAccessContext(...)`, `canManageAgendaForInstructor(...)`, branch checks | App: type, duration, date, branch/instructor routing. DB in [0049_agenda_appointments.sql](C:/Users/danny/Documents/Neijhof/nxtdrive-platform-pr-instructor-cockpit/supabase/migrations/0049_agenda_appointments.sql:351): actor auth, instructor membership, student eligibility by type, slot overlap against lessons/trials/appointments, audit. No availability, travel, rayon, vehicle or capability logic. | Must become `scheduleAppointment(...)` for non-lesson appointment types. |
| Update generic agenda appointment | [lib/agenda/actions.ts](C:/Users/danny/Documents/Neijhof/nxtdrive-platform-pr-instructor-cockpit/artifacts/nxtdrive/lib/agenda/actions.ts:224) | `rpc("update_agenda_appointment")` | `requireAgendaAppointmentAccess(..., "manage")`, optional student access, branch checks | App: type immutable, date/duration, branch/instructor branch serving. DB: status must be planned, overlap checks, audit. No availability, travel, rayon, vehicle or capability logic. | Must become `rescheduleAppointment(...)` or `scheduleAppointment(...)` mutation on the kernel. |
| Delete generic agenda appointment | [lib/agenda/actions.ts](C:/Users/danny/Documents/Neijhof/nxtdrive-platform-pr-instructor-cockpit/artifacts/nxtdrive/lib/agenda/actions.ts:332) | `rpc("delete_agenda_appointment")` | `requireAgendaAppointmentAccess(..., "manage")` | Access + audit only. | Should become `unassignAppointment(...)` or typed delete in central orchestration. |
| Set exam result/details | [lib/agenda/actions.ts](C:/Users/danny/Documents/Neijhof/nxtdrive-platform-pr-instructor-cockpit/artifacts/nxtdrive/lib/agenda/actions.ts:375), [lib/agenda/actions.ts](C:/Users/danny/Documents/Neijhof/nxtdrive-platform-pr-instructor-cockpit/artifacts/nxtdrive/lib/agenda/actions.ts:421) | `rpc("set_appointment_result")`, `rpc("set_exam_appointment_details")` | `requireAgendaAppointmentAccess(..., "manage")` | No scheduling logic; uses existing appointment ownership. | Keep outside kernel, but share audit/entity model. |
| Proefles direct on freed slot | [app/backoffice/leads/actions.ts](C:/Users/danny/Documents/Neijhof/nxtdrive-platform-pr-instructor-cockpit/artifacts/nxtdrive/app/backoffice/leads/actions.ts:224) | `rpc("book_trial_lesson")` | `requireLeadBackofficeAccess(..., "collaborate")` | App: future-only, lead status eligible, no linked student, no active trial. DB: trial-specific overlap/locking logic. No unified scope/availability/rayon/capability layer. | Must become queue-item scheduling through `scheduleAppointment(...)`. |
| Confirm trial lesson | [app/backoffice/leads/actions.ts](C:/Users/danny/Documents/Neijhof/nxtdrive-platform-pr-instructor-cockpit/artifacts/nxtdrive/app/backoffice/leads/actions.ts:180) | `rpc("confirm_trial_lesson")` | `requireLeadBackofficeAccess(..., "collaborate")` | Status transition only; no scheduling recomputation. | Keep as trial lifecycle action, but tied to common appointment entity later. |
| Reject trial lesson | [app/backoffice/leads/actions.ts](C:/Users/danny/Documents/Neijhof/nxtdrive-platform-pr-instructor-cockpit/artifacts/nxtdrive/app/backoffice/leads/actions.ts:302) | `rpc("reject_trial_lesson")` | `requireLeadBackofficeAccess(..., "collaborate")` | Status transition only. | Later part of queue lifecycle. |
| Reschedule trial lesson | [app/backoffice/leads/actions.ts](C:/Users/danny/Documents/Neijhof/nxtdrive-platform-pr-instructor-cockpit/artifacts/nxtdrive/app/backoffice/leads/actions.ts:333) | `rpc("reschedule_trial_lesson")` | `requireLeadBackofficeAccess(..., "collaborate")` | App: parses local date/time, allowed duration. DB: trial overlap logic. No unified availability/rayon/vehicle/capability rules. | Must become `rescheduleAppointment(...)` over a trial queue item or appointment. |
| Invite student to freed lesson slot | [app/backoffice/agenda/actions.ts](C:/Users/danny/Documents/Neijhof/nxtdrive-platform-pr-instructor-cockpit/artifacts/nxtdrive/app/backoffice/agenda/actions.ts:190) | `rpc("create_lesson_refill_invitation")` | Student access + source lesson access + instructor ownership/branch checks | App: future time, policy enabled, branch-serving. RPC atomically prevents duplicate/open conflicts. | Should later be fed by planning queue + suggestions engine, not separate slot invitation logic. |
| Cancel refill invitation | [app/backoffice/agenda/actions.ts](C:/Users/danny/Documents/Neijhof/nxtdrive-platform-pr-instructor-cockpit/artifacts/nxtdrive/app/backoffice/agenda/actions.ts:280) | `rpc("cancel_lesson_refill_invitation")` | Lesson access or global agenda manage access | Access + audit. | Keep as queue/invitation lifecycle. |
| Invite exam candidate | [app/backoffice/agenda/actions.ts](C:/Users/danny/Documents/Neijhof/nxtdrive-platform-pr-instructor-cockpit/artifacts/nxtdrive/app/backoffice/agenda/actions.ts:347) | `rpc("create_exam_invitation")` | `requireAgendaAppointmentAccess(..., "manage")` + student access | Policy enabled, appointment ownership, student readable. | Later reuse planning queue / candidate engine. |
| Cancel exam invitation | [app/backoffice/agenda/actions.ts](C:/Users/danny/Documents/Neijhof/nxtdrive-platform-pr-instructor-cockpit/artifacts/nxtdrive/app/backoffice/agenda/actions.ts:406) | `rpc("cancel_exam_invitation")` | Appointment access or global agenda manage access | Access + audit. | Keep as invitation lifecycle. |
| Student self-cancel lesson | [app/student/actions.ts](C:/Users/danny/Documents/Neijhof/nxtdrive-platform-pr-instructor-cockpit/artifacts/nxtdrive/app/student/actions.ts:21) | `rpc("student_cancel_lesson")` | `requireActiveTenant(["student","parent"])` + `getActiveStudent(...)` ownership re-check | App: own student, planned only, future-only, min notice. RPC repeats ownership/policy and writes ledger/audit. | Keep separate self-service endpoint, but cancellation semantics should share the same lesson kernel rules. |
| Student self-reschedule lesson | [app/student/actions.ts](C:/Users/danny/Documents/Neijhof/nxtdrive-platform-pr-instructor-cockpit/artifacts/nxtdrive/app/student/actions.ts:94) | `rpc("student_reschedule_lesson")` | `requireActiveTenant(["student","parent"])` + `getActiveStudent(...)` ownership re-check | App: own student, planned only, original lesson must still be future, new time future, min notice. DB in [0085_student_reschedule_lesson.sql](C:/Users/danny/Documents/Neijhof/nxtdrive-platform-pr-instructor-cockpit/supabase/migrations/0085_student_reschedule_lesson.sql:21): ownership, future-only, notice, overlap against lessons/trials/agenda, audit. No availability windows, travel time, rayon, vehicle or capability checks. | Must become a constrained `rescheduleAppointment(...)` call. |
| Student accept/decline refill invitation | [app/student/actions.ts](C:/Users/danny/Documents/Neijhof/nxtdrive-platform-pr-instructor-cockpit/artifacts/nxtdrive/app/student/actions.ts:266) | `rpc("respond_lesson_refill_invitation")` | `requireActiveTenant(["student","parent"])` | RPC handles ownership, expiry, atomic booking, balance, ledger, conflict checks. | Should eventually book through common kernel while preserving invitation lifecycle. |
| Student accept/decline exam invitation | [app/student/actions.ts](C:/Users/danny/Documents/Neijhof/nxtdrive-platform-pr-instructor-cockpit/artifacts/nxtdrive/app/student/actions.ts:305) | `rpc("respond_exam_invitation")` | `requireActiveTenant(["student","parent"])` | RPC handles ownership, expiry and linking to appointment. | Keep invitation lifecycle but align to common appointment model. |
| Instructor start lesson | [app/instructor/actions.ts](C:/Users/danny/Documents/Neijhof/nxtdrive-platform-pr-instructor-cockpit/artifacts/nxtdrive/app/instructor/actions.ts:160) | `rpc("start_lesson")` | `loadOwnedLesson(...)` permits own lesson or tenant_admin | Ownership only; no scheduling logic. | Outside kernel. |
| Instructor complete lesson | [app/instructor/actions.ts](C:/Users/danny/Documents/Neijhof/nxtdrive-platform-pr-instructor-cockpit/artifacts/nxtdrive/app/instructor/actions.ts:182) | `rpc("complete_lesson")` | `loadOwnedLesson(...)` | Ownership + status rules in RPC. | Outside kernel. |
| Instructor cancel lesson | [app/instructor/actions.ts](C:/Users/danny/Documents/Neijhof/nxtdrive-platform-pr-instructor-cockpit/artifacts/nxtdrive/app/instructor/actions.ts:207) | `rpc("cancel_lesson")` | `loadOwnedLesson(...)` | Ownership + RPC cancellation. | Should share later cancellation orchestration. |
| Instructor mark no-show | [app/instructor/actions.ts](C:/Users/danny/Documents/Neijhof/nxtdrive-platform-pr-instructor-cockpit/artifacts/nxtdrive/app/instructor/actions.ts:230) | `rpc("mark_lesson_no_show")` | `loadOwnedLesson(...)` | Ownership + status-only behavior. | Outside kernel. |
| Instructor drag move lesson | [app/instructor/actions.ts](C:/Users/danny/Documents/Neijhof/nxtdrive-platform-pr-instructor-cockpit/artifacts/nxtdrive/app/instructor/actions.ts:53) | direct `.from("lessons").update(...)` | `loadOwnedLesson(...)` | Only validates start/end parse and owner. No overlap, no agenda/trial conflict, no availability, no travel, no branch, no vehicle, no audit RPC. | Highest-priority bypass to replace with `rescheduleAppointment(...)`. |
| Instructor drag move appointment | [app/instructor/actions.ts](C:/Users/danny/Documents/Neijhof/nxtdrive-platform-pr-instructor-cockpit/artifacts/nxtdrive/app/instructor/actions.ts:88) | `rpc("update_agenda_appointment")` | `requireAgendaAppointmentAccess(..., "manage")` | Parse + end-after-start; DB overlap checks apply. Still no availability/travel/rayon/vehicle/capability logic. | Replace with central `rescheduleAppointment(...)`. |
| Instructor set appointment color | [app/instructor/actions.ts](C:/Users/danny/Documents/Neijhof/nxtdrive-platform-pr-instructor-cockpit/artifacts/nxtdrive/app/instructor/actions.ts:130) | direct `.from("agenda_appointments").update(...)` | `requireAgendaAppointmentAccess(..., "manage")` | Cosmetic only. | Can stay separate from kernel. |

## Current non-mutating planning engines already in use

These modules do not schedule directly, but already contain logic we should reuse instead of rebuilding from scratch:

- [lib/trial-lessons/suggestions.ts](C:/Users/danny/Documents/Neijhof/nxtdrive-platform-pr-instructor-cockpit/artifacts/nxtdrive/lib/trial-lessons/suggestions.ts:1)
  - generates proefles suggestions
  - calculates busy intervals from lessons, trials and agenda appointments
  - includes route/buffer scoring and `validateChosenSlot(...)`
- [lib/trial-lessons/route.ts](C:/Users/danny/Documents/Neijhof/nxtdrive-platform-pr-instructor-cockpit/artifacts/nxtdrive/lib/trial-lessons/route.ts:131)
  - route matrix and travel estimation logic
- [lib/lesson-planning/candidates.ts](C:/Users/danny/Documents/Neijhof/nxtdrive-platform-pr-instructor-cockpit/artifacts/nxtdrive/lib/lesson-planning/candidates.ts:559)
  - suggests students/leads for open slots
  - already computes neighbouring busy intervals and route-aware scoring
- [lib/lesson-planning/policy.ts](C:/Users/danny/Documents/Neijhof/nxtdrive-platform-pr-instructor-cockpit/artifacts/nxtdrive/lib/lesson-planning/policy.ts:236)
  - configurable scoring policy for slot filling
- [lib/availability/service](C:/Users/danny/Documents/Neijhof/nxtdrive-platform-pr-instructor-cockpit/artifacts/nxtdrive/lib/availability/service.ts)
  - currently used as instructor/branch-serving lookup, not yet the central source of truth for all schedule validation

These modules are the strongest starting point for:

- overlap windows
- neighbour lookups
- route buffers
- candidate scoring
- slot preview logic

## Concrete architectural gaps discovered

### 1. No single scheduling boundary

Scheduling rules currently live in multiple places:

- app-level guards
- several Postgres RPCs
- lesson planning helpers
- trial suggestion engines
- invitation acceptance flows

There is no single `canScheduleAppointment(...)` boundary yet.

### 2. At least one real write bypass exists today

The biggest gap is [moveOwnedLessonAction](C:/Users/danny/Documents/Neijhof/nxtdrive-platform-pr-instructor-cockpit/artifacts/nxtdrive/app/instructor/actions.ts:53):

- it updates `lessons.starts_at` and `lessons.ends_at` directly
- it does not call `schedule_lesson`
- it does not call a reschedule RPC
- it does not write through a centralized validator

That means instructor drag/drop can currently bypass:

- overlap checks outside DB constraints
- agenda appointment conflicts
- trial lesson conflicts
- availability windows
- travel time/rayon checks
- capability/vehicle logic
- explicit planning audit semantics

This should be the first mutation path to eliminate once the kernel exists.

### 3. Lesson and appointment rules are inconsistent

- student self-reschedule currently checks overlap against lessons, trials and agenda appointments in DB
- agenda appointment create/update checks overlap against lessons, trials and appointments
- lesson scheduling appears to rely on a different function body and currently does not expose the same richer constraints

The future kernel must make lesson vs appointment vs trial validation identical.

### 4. Current scope model is implicit and scattered

Scope and authority are currently spread across:

- tenant role checks
- branch access checks
- instructor ownership checks
- lead/student access helpers

There is no explicit `PlanningScope` object yet.

### 5. No vehicle, rayon or capability rules exist in scheduling writes

Across all inspected write paths, the following hard constraints are not yet centrally enforced:

- instructor availability windows
- service area / rayon matching
- travel matrix requirements
- vehicle status / APK / maintenance / damage
- instructor capabilities
- vehicle capabilities
- student/appointment requirements
- franchise delegation permissions

### 6. Audit is present, but not yet planning-specific enough

Many RPCs already write to `audit_log`, which is good.

What is still missing for the new design:

- planning-specific before/after snapshots
- central override reasons
- scope metadata
- delegated franchise mutation attribution
- consistent action naming across lesson, agenda, trial and queue flows

## Recommended refactor sequence based on this inventory

1. Build the central planning kernel and route preview API.
2. Replace `moveOwnedLessonAction(...)` first.
3. Replace lesson scheduling and student reschedule with the same kernel.
4. Replace agenda appointment create/update with the same kernel.
5. Fold proefles booking and trial rescheduling into planning queue semantics.
6. Add vehicles, availability, rayons and capabilities as hard kernel constraints.

## Initial centralization mapping

| Existing flow | Future kernel call |
| --- | --- |
| `scheduleLesson` | `scheduleAppointment({ type: "lesson", ... })` |
| `createAppointment` | `scheduleAppointment({ type: "agenda_appointment", ... })` |
| `updateAppointment` | `rescheduleAppointment({ entity: "agenda_appointment", ... })` |
| `moveOwnedLessonAction` | `rescheduleAppointment({ entity: "lesson", ... })` |
| `rescheduleLesson` | `rescheduleAppointment({ actor: student/guardian, entity: "lesson", ... })` |
| `bookTrialAtSlot` | `scheduleQueueItem(...)` or `scheduleAppointment({ type: "trial_lesson", ... })` |
| `rescheduleTrialLesson` | `rescheduleAppointment({ entity: "trial_lesson", ... })` |
| refill / exam invitation accept | kernel-backed schedule/link confirmation |

## Decision

This inventory confirms the proposed direction is correct:

> One central planning kernel for all organization types, with franchise and multi-branch behavior added as scope, delegation and governance layers on top.
