import type { SupabaseClient } from "@supabase/supabase-js";

export type PrivacyRequestType =
  | "DATA_EXPORT"
  | "ACCOUNT_DELETION"
  | "STUDENT_DELETION";

export type PrivacyRequestRecord = {
  id: string;
  tenant_id: string;
  request_type: PrivacyRequestType;
  status: string;
  subject_user_id: string | null;
  subject_student_id: string | null;
  requested_by: string;
  export_storage_path: string | null;
  export_expires_at: string | null;
};

export function mayAccessPrivacyRequest(
  request: Pick<
    PrivacyRequestRecord,
    "tenant_id" | "subject_user_id" | "requested_by"
  >,
  actorUserId: string,
  authorizedTenantIds: string[],
): boolean {
  return (
    request.subject_user_id === actorUserId ||
    request.requested_by === actorUserId ||
    authorizedTenantIds.includes(request.tenant_id)
  );
}

export async function createPrivacyRequest(
  service: SupabaseClient,
  input: {
    tenantId: string;
    requestType: PrivacyRequestType;
    subjectUserId: string | null;
    subjectStudentId: string | null;
    requestedBy: string;
    idempotencyKey: string;
  },
): Promise<PrivacyRequestRecord> {
  const { data, error } = await service
    .from("privacy_requests")
    .upsert(
      {
        tenant_id: input.tenantId,
        request_type: input.requestType,
        subject_user_id: input.subjectUserId,
        subject_student_id: input.subjectStudentId,
        requested_by: input.requestedBy,
        idempotency_key: input.idempotencyKey,
      },
      { onConflict: "tenant_id,idempotency_key", ignoreDuplicates: false },
    )
    .select(
      "id, tenant_id, request_type, status, subject_user_id, subject_student_id, requested_by, export_storage_path, export_expires_at",
    )
    .single();
  if (error || !data) {
    throw new Error("Privacy request could not be registered.");
  }
  await service.from("privacy_audit_events").insert({
    tenant_id: input.tenantId,
    request_id: data.id,
    actor_user_id: input.requestedBy,
    event_type: "privacy.requested",
    metadata: { requestType: input.requestType },
  });
  return data as PrivacyRequestRecord;
}

async function loadExportPayload(
  service: SupabaseClient,
  request: PrivacyRequestRecord,
) {
  const studentQuery = service
    .from("students")
    .select(
      "id, lead_id, full_name, email, phone, postcode, address_line, city, pickup_address, active, created_at, updated_at",
    )
    .eq("tenant_id", request.tenant_id);
  const { data: students, error: studentError } = request.subject_student_id
    ? await studentQuery.eq("id", request.subject_student_id)
    : await studentQuery.eq("user_id", request.subject_user_id);
  if (studentError) throw new Error("Subject profile export failed.");

  const studentIds = (students ?? []).map((student) => student.id as string);
  const leadIds = (students ?? [])
    .map((student) => student.lead_id as string | null)
    .filter((id): id is string => Boolean(id));
  const { data: lessons, error: lessonError } = studentIds.length
    ? await service
        .from("lessons")
        .select(
          "id, student_id, instructor_id, starts_at, ends_at, status, created_at, updated_at",
        )
        .eq("tenant_id", request.tenant_id)
        .in("student_id", studentIds)
    : { data: [], error: null };
  if (lessonError) throw new Error("Lesson export failed.");
  const lessonIds = (lessons ?? []).map((lesson) => lesson.id as string);
  const [
    { data: trialLessons, error: trialLessonError },
    { data: agendaAppointments, error: agendaError },
    { data: moduleTests, error: moduleTestError },
    { data: bookingRequests, error: bookingRequestError },
    { data: intakeDetails, error: intakeError },
  ] = await Promise.all([
    leadIds.length
      ? service
          .from("trial_lessons")
          .select(
            "id, lead_id, instructor_id, status, starts_at, ends_at, pickup_location, created_at, updated_at",
          )
          .eq("tenant_id", request.tenant_id)
          .in("lead_id", leadIds)
      : Promise.resolve({ data: [], error: null }),
    studentIds.length
      ? service
          .from("agenda_appointments")
          .select(
            "id, student_id, instructor_id, type, status, starts_at, ends_at, location, created_at, updated_at",
          )
          .eq("tenant_id", request.tenant_id)
          .in("student_id", studentIds)
      : Promise.resolve({ data: [], error: null }),
    studentIds.length
      ? service
          .from("ris_module_tests")
          .select(
            "id, student_id, module_number, test_type, planned_at, completed_at, result, instructor_id, created_at, updated_at",
          )
          .eq("tenant_id", request.tenant_id)
          .in("student_id", studentIds)
      : Promise.resolve({ data: [], error: null }),
    studentIds.length || leadIds.length
      ? service
          .from("booking_requests")
          .select(
            "id, source, requester_type, entity_type, status, lead_id, student_id, pickup_location, pickup_lat, pickup_lng, pickup_place_id, pickup_formatted_address, created_at, updated_at",
          )
          .eq("tenant_id", request.tenant_id)
          .or(
            [
              studentIds.length
                ? `student_id.in.(${studentIds.join(",")})`
                : null,
              leadIds.length ? `lead_id.in.(${leadIds.join(",")})` : null,
            ]
              .filter(Boolean)
              .join(","),
          )
      : Promise.resolve({ data: [], error: null }),
    leadIds.length
      ? service
          .from("lead_intake_details")
          .select(
            "id, lead_id, city, pickup_location, pickup_lat, pickup_lng, pickup_place_id, pickup_formatted_address, created_at, updated_at",
          )
          .eq("tenant_id", request.tenant_id)
          .in("lead_id", leadIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (
    trialLessonError ||
    agendaError ||
    moduleTestError ||
    bookingRequestError ||
    intakeError
  ) {
    throw new Error("Related subject location export failed.");
  }
  const trialLessonIds = (trialLessons ?? []).map(
    (lesson) => lesson.id as string,
  );
  const agendaAppointmentIds = (agendaAppointments ?? []).map(
    (appointment) => appointment.id as string,
  );
  const moduleTestIds = (moduleTests ?? []).map(
    (moduleTest) => moduleTest.id as string,
  );

  const { data: locationLinks, error: locationLinkError } = studentIds.length
    ? await service
        .from("entity_location_links")
        .select(
          "id, student_id, location_record_id, role, label, is_default, valid_from, valid_until, created_at",
        )
        .eq("tenant_id", request.tenant_id)
        .in("student_id", studentIds)
        .order("created_at")
    : { data: [], error: null };
  if (locationLinkError) throw new Error("Location relation export failed.");

  const linkedLocationRecordIds = [
    ...new Set(
      (locationLinks ?? []).map((link) => link.location_record_id as string),
    ),
  ];
  const stopSelect =
    "id, appointment_type, appointment_id, lesson_id, trial_lesson_id, agenda_appointment_id, module_test_id, stop_type, sequence_number, source_location_record_id, source_location_version_id, label_snapshot, formatted_address_snapshot, latitude_snapshot, longitude_snapshot, publication_status, published_at, superseded_at, created_at";
  const stopResults = await Promise.all([
    lessonIds.length
      ? service
          .from("appointment_stops")
          .select(stopSelect)
          .eq("tenant_id", request.tenant_id)
          .in("lesson_id", lessonIds)
      : Promise.resolve({ data: [], error: null }),
    trialLessonIds.length
      ? service
          .from("appointment_stops")
          .select(stopSelect)
          .eq("tenant_id", request.tenant_id)
          .in("trial_lesson_id", trialLessonIds)
      : Promise.resolve({ data: [], error: null }),
    agendaAppointmentIds.length
      ? service
          .from("appointment_stops")
          .select(stopSelect)
          .eq("tenant_id", request.tenant_id)
          .in("agenda_appointment_id", agendaAppointmentIds)
      : Promise.resolve({ data: [], error: null }),
    moduleTestIds.length
      ? service
          .from("appointment_stops")
          .select(stopSelect)
          .eq("tenant_id", request.tenant_id)
          .in("module_test_id", moduleTestIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (stopResults.some((result) => result.error)) {
    throw new Error("Published appointment location export failed.");
  }
  const appointmentStops = [
    ...new Map(
      stopResults
        .flatMap((result) => result.data ?? [])
        .map((stop) => [stop.id as string, stop]),
    ).values(),
  ];
  const stopLocationRecordIds = (appointmentStops ?? [])
    .map((stop) => stop.source_location_record_id as string | null)
    .filter((id): id is string => Boolean(id));
  const locationRecordIds = [
    ...new Set([...linkedLocationRecordIds, ...stopLocationRecordIds]),
  ];
  const [
    { data: locationRecords, error: locationRecordError },
    { data: locationVersions, error: locationVersionError },
    { data: locationProposals, error: proposalError },
    { data: travelStatuses, error: travelStatusError },
    { data: stopConfirmations, error: stopConfirmationError },
  ] = await Promise.all([
    locationRecordIds.length
      ? service
          .from("location_records")
          .select(
            "id, status, canonical_version_id, merged_into_location_id, created_at, updated_at",
          )
          .eq("tenant_id", request.tenant_id)
          .in("id", locationRecordIds)
      : Promise.resolve({ data: [], error: null }),
    locationRecordIds.length
      ? service
          .from("location_versions")
          .select(
            "id, location_record_id, version_number, label, formatted_address, street, house_number, house_number_addition, postal_code, city, region, country_code, latitude, longitude, source, provider, provider_place_id, validation_status, provider_obtained_at, provider_expires_at, user_confirmed_at, confirmed_by, change_reason, created_at",
          )
          .eq("tenant_id", request.tenant_id)
          .in("location_record_id", locationRecordIds)
          .order("version_number")
      : Promise.resolve({ data: [], error: null }),
    studentIds.length
      ? service
          .from("location_change_proposals")
          .select(
            "id, student_id, appointment_stop_id, proposed_location_record_id, proposed_location_version_id, status, explanation, route_impact_status, route_impact_document, expires_at, created_at, reviewed_at, reviewed_by, review_reason",
          )
          .eq("tenant_id", request.tenant_id)
          .in("student_id", studentIds)
          .order("created_at")
      : Promise.resolve({ data: [], error: null }),
    lessonIds.length
      ? service
          .from("appointment_travel_status_events")
          .select(
            "id, appointment_type, appointment_id, instructor_user_id, status, occurred_at",
          )
          .eq("tenant_id", request.tenant_id)
          .in("appointment_id", lessonIds)
          .order("occurred_at")
      : Promise.resolve({ data: [], error: null }),
    studentIds.length
      ? service
          .from("appointment_stop_confirmations")
          .select(
            "id, appointment_stop_id, student_id, status, entry_mode, confirmed_at, confirmed_by",
          )
          .eq("tenant_id", request.tenant_id)
          .in("student_id", studentIds)
          .order("confirmed_at")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (locationRecordError || locationVersionError) {
    throw new Error("Versioned location export failed.");
  }
  if (proposalError) throw new Error("Location proposal export failed.");
  if (travelStatusError) throw new Error("Travel status export failed.");
  if (stopConfirmationError) {
    throw new Error("Appointment stop confirmation export failed.");
  }

  const { data: validationEvents, error: validationError } =
    locationRecordIds.length
      ? await service
          .from("location_validation_events")
          .select(
            "id, location_record_id, location_version_id, provider, validation_status, result_codes, manually_confirmed, manual_reason, occurred_at, actor_user_id",
          )
          .eq("tenant_id", request.tenant_id)
          .in("location_record_id", locationRecordIds)
          .order("occurred_at")
      : { data: [], error: null };
  if (validationError) throw new Error("Location validation export failed.");

  const { data: profile, error: profileError } = request.subject_user_id
    ? await service
        .from("profiles")
        .select("id, email, full_name, created_at")
        .eq("id", request.subject_user_id)
        .maybeSingle()
    : { data: null, error: null };
  if (profileError) throw new Error("Account profile export failed.");

  return {
    schemaVersion: "2.0",
    generatedAt: new Date().toISOString(),
    scope: {
      tenantId: request.tenant_id,
      subjectUserId: request.subject_user_id,
      subjectStudentId: request.subject_student_id,
    },
    data: {
      account: profile,
      studentProfiles: students ?? [],
      lessons: lessons ?? [],
      trialLessons: trialLessons ?? [],
      agendaAppointments: agendaAppointments ?? [],
      moduleTests: moduleTests ?? [],
      bookingRequests: bookingRequests ?? [],
      intakeDetails: intakeDetails ?? [],
      locations: {
        records: locationRecords ?? [],
        versions: locationVersions ?? [],
        relations: locationLinks ?? [],
        validationEvents: validationEvents ?? [],
        changeProposals: locationProposals ?? [],
      },
      appointmentLocationSnapshots: appointmentStops ?? [],
      appointmentStopConfirmations: stopConfirmations ?? [],
      manualTravelStatuses: travelStatuses ?? [],
    },
    limitations: [
      "Maps usage and cost events are deliberately PII-free and cannot be attributed to an individual subject.",
      "Published historical appointment snapshots may remain during the configured lesson-record retention period so operational history is not silently rewritten.",
      "Financial and statutory records remain subject to tenant authorization, legal retention and a separate legal review.",
    ],
  };
}

export async function processDataExportRequest(
  service: SupabaseClient,
  requestId: string,
): Promise<void> {
  const { data, error } = await service
    .from("privacy_requests")
    .select(
      "id, tenant_id, request_type, status, subject_user_id, subject_student_id, requested_by, export_storage_path, export_expires_at",
    )
    .eq("id", requestId)
    .single();
  if (error || !data || data.request_type !== "DATA_EXPORT") {
    throw new Error("Data export request was not found.");
  }
  const request = data as PrivacyRequestRecord;
  if (!["requested", "validating", "processing"].includes(request.status))
    return;
  await service
    .from("privacy_requests")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", request.id);

  const payload = await loadExportPayload(service, request);
  const storagePath = `${request.tenant_id}/${request.id}/${crypto.randomUUID()}.json`;
  const { error: uploadError } = await service.storage
    .from("privacy-exports")
    .upload(storagePath, JSON.stringify(payload, null, 2), {
      contentType: "application/json; charset=utf-8",
      cacheControl: "private, no-store",
      upsert: false,
    });
  if (uploadError) throw new Error("Temporary privacy export upload failed.");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { error: updateError } = await service
    .from("privacy_requests")
    .update({
      status: "ready",
      export_storage_path: storagePath,
      export_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", request.id);
  if (updateError) throw new Error("Data export status update failed.");
  await service.from("privacy_audit_events").insert({
    tenant_id: request.tenant_id,
    request_id: request.id,
    actor_user_id: null,
    event_type: "privacy.export_ready",
    metadata: { expiresAt },
  });
}

export async function createTemporaryDownloadUrl(
  service: SupabaseClient,
  input: { requestId: string; actorUserId: string; tenantIds: string[] },
): Promise<string> {
  const { data, error } = await service
    .from("privacy_requests")
    .select(
      "id, tenant_id, request_type, status, subject_user_id, subject_student_id, requested_by, export_storage_path, export_expires_at",
    )
    .eq("id", input.requestId)
    .single();
  if (error || !data) throw new Error("Export not found.");
  const request = data as PrivacyRequestRecord;
  const authorized = mayAccessPrivacyRequest(
    request,
    input.actorUserId,
    input.tenantIds,
  );
  if (
    !authorized ||
    request.status !== "ready" ||
    !request.export_storage_path
  ) {
    throw new Error("Export is not available.");
  }
  if (
    !request.export_expires_at ||
    new Date(request.export_expires_at).getTime() <= Date.now()
  ) {
    await service
      .from("privacy_requests")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", request.id);
    throw new Error("Export has expired.");
  }
  const { data: signed, error: signedError } = await service.storage
    .from("privacy-exports")
    .createSignedUrl(request.export_storage_path, 60, {
      download: `nxtdrive-data-export-${request.id}.json`,
    });
  if (signedError || !signed?.signedUrl) {
    throw new Error("Temporary export link could not be created.");
  }
  await service
    .from("privacy_requests")
    .update({ status: "downloaded", updated_at: new Date().toISOString() })
    .eq("id", request.id);
  await service.from("privacy_audit_events").insert({
    tenant_id: request.tenant_id,
    request_id: request.id,
    actor_user_id: input.actorUserId,
    event_type: "privacy.export_downloaded",
    metadata: {},
  });
  return signed.signedUrl;
}

export async function executeApprovedDeletion(
  service: SupabaseClient,
  input: { requestId: string; actorUserId: string },
): Promise<Record<string, unknown>> {
  const { data: request, error } = await service
    .from("privacy_requests")
    .select("request_type, subject_user_id, status")
    .eq("id", input.requestId)
    .single();
  if (error || !request || request.status !== "processing") {
    throw new Error("Approved deletion request was not found.");
  }
  const { data, error: rpcError } = await service.rpc(
    "execute_student_anonymization",
    { p_request_id: input.requestId, p_actor: input.actorUserId },
  );
  if (rpcError) throw new Error("Deletion request could not be completed.");
  if (request.request_type === "ACCOUNT_DELETION" && request.subject_user_id) {
    const { error: authError } = await service.auth.admin.deleteUser(
      request.subject_user_id,
    );
    if (authError) {
      throw new Error("Profile was anonymized, but account removal failed.");
    }
  }
  return (data ?? {}) as Record<string, unknown>;
}
