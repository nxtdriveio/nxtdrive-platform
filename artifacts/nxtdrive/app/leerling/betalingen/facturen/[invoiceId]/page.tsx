import StudentInvoicePage from "@/app/student/facturen/[id]/page";

export default async function LearnerInvoicePage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;
  return StudentInvoicePage({
    params: Promise.resolve({ id: invoiceId }),
  });
}
