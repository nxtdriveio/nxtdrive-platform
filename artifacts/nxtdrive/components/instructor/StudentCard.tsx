import Link from "next/link";
import { Mail, Phone, User, MessageCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatTegoed, type Student } from "@/lib/students/types";
import { cn } from "@/lib/utils";

/**
 * Normalise a Dutch phone number to E.164-ish digits for wa.me links.
 * "06 12345678" / "0612345678" -> "31612345678". Falls back to digit-stripped
 * input when the format is unexpected. Returns null when there is nothing
 * dialable so the WhatsApp/Bellen buttons can hide gracefully.
 */
function toWhatsAppNumber(phone: string | null): string | null {
  if (!phone) return null;
  let digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = `31${digits.slice(1)}`;
  return digits.length >= 8 ? digits : null;
}

export function InstructorStudentCard({
  student,
  balance,
}: {
  student: Pick<Student, "id" | "full_name" | "email" | "phone" | "active">;
  balance: number;
}) {
  const waNumber = toWhatsAppNumber(student.phone);

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <User className="h-6 w-6" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-foreground">
                {student.full_name}
              </h2>
              <Badge variant={student.active ? "success" : "default"}>
                {student.active ? "Actief" : "Inactief"}
              </Badge>
            </div>
            <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
              {student.email ? (
                <div className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" aria-hidden />
                  <span className="truncate">{student.email}</span>
                </div>
              ) : null}
              {student.phone ? (
                <div className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" aria-hidden />
                  <span>{student.phone}</span>
                </div>
              ) : null}
            </div>
          </div>
          <Badge
            variant={balance > 300 ? "success" : balance > 0 ? "warning" : "danger"}
          >
            {formatTegoed(balance)}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/backoffice/leerlingen/${student.id}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <User className="h-4 w-4" aria-hidden />
            Profiel openen
          </Link>
          {student.phone ? (
            <a
              href={`tel:${student.phone.replace(/\s+/g, "")}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Phone className="h-4 w-4" aria-hidden />
              Bellen
            </a>
          ) : null}
          {waNumber ? (
            <a
              href={`https://wa.me/${waNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "text-success",
              )}
            >
              <MessageCircle className="h-4 w-4" aria-hidden />
              WhatsApp
            </a>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
