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
      "id, full_name, email, phone, postcode, active, created_at, updated_at",
    )
    .eq("tenant_id", request.tenant_id);
  const { data: students, error: studentError } = request.subject_student_id
    ? await studentQuery.eq("id", request.subject_student_id)
    : await studentQuery.eq("user_id", request.subject_user_id);
  if (studentError) throw new Error("Subject profile export failed.");

  const studentIds = (students ?? []).map((student) => student.id as string);
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

  const { data: profile, error: profileError } = request.subject_user_id
    ? await service
        .from("profiles")
        .select("id, email, full_name, created_at")
        .eq("id", request.subject_user_id)
        .maybeSingle()
    : { data: null, error: null };
  if (profileError) throw new Error("Account profile export failed.");

  return {
    schemaVersion: "1.0",
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
    },
    limitations: [
      "This machine-readable export contains the implemented core subject-data categories.",
      "Financial and statutory records remain subject to tenant authorization and legal review.",
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
  if (!["requested", "validating", "processing"].includes(request.status)) return;
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
  if (!authorized || request.status !== "ready" || !request.export_storage_path) {
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
