import Link from "next/link";
import { Mail, Phone, MessageCircle, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { type Student } from "@/lib/students/types";
import { cn } from "@/lib/utils";

function toWhatsAppNumber(phone: string | null): string | null {
  if (!phone) return null;
  let digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = `31${digits.slice(1)}`;
  return digits.length >= 8 ? digits : null;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function InstructorStudentCard({
  student,
}: {
  student: Pick<Student, "id" | "full_name" | "email" | "phone" | "active">;
  balance?: number;
}) {
  const waNumber = toWhatsAppNumber(student.phone);
  const initials = getInitials(student.full_name);

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start gap-4">
          {/* Amber initials avatar */}
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-lg font-bold select-none">
            {initials || "?"}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold leading-tight text-foreground">
                {student.full_name}
              </h2>
              <Badge variant={student.active ? "success" : "default"} className="shrink-0">
                {student.active ? "Actief" : "Inactief"}
              </Badge>
            </div>

            <div className="mt-1.5 space-y-0.5 text-sm text-muted-foreground">
              {student.email ? (
                <div className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{student.email}</span>
                </div>
              ) : null}
              {student.phone ? (
                <div className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>{student.phone}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/instructor/leerlingen/${student.id}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            Profiel openen
          </Link>
          {student.phone ? (
            <a
              href={`tel:${student.phone.replace(/\s+/g, "")}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
            >
              <Phone className="h-3.5 w-3.5" aria-hidden />
              Bellen
            </a>
          ) : null}
          {waNumber ? (
            <a
              href={`https://wa.me/${waNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5 text-success")}
            >
              <MessageCircle className="h-3.5 w-3.5" aria-hidden />
              WhatsApp
            </a>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
