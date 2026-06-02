import Link from "next/link";
import { Mail, Phone, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatTegoed, type Student } from "@/lib/students/types";

export function InstructorStudentCard({
  student,
  balance,
}: {
  student: Pick<Student, "id" | "full_name" | "email" | "phone" | "active">;
  balance: number;
}) {
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
          <Badge variant={balance > 300 ? "success" : balance > 0 ? "warning" : "danger"}>
            {formatTegoed(balance)}
          </Badge>
        </div>

        <Link
          href={`/backoffice/leerlingen/${student.id}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <User className="h-4 w-4" aria-hidden />
          Profiel openen
        </Link>
      </CardContent>
    </Card>
  );
}
