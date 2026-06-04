"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import zxcvbn from "zxcvbn";
import { cn } from "@/lib/utils";
import { Input, Label } from "@/components/ui/input";

export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  color: string;
};

export function getPasswordStrength(password: string): PasswordStrength {
  if (!password) {
    return { score: 0, label: "Zwak", color: "bg-danger" };
  }
  const result = zxcvbn(password);
  const score = result.score as 0 | 1 | 2 | 3 | 4;
  const labels: Record<number, string> = {
    0: "Zwak",
    1: "Zwak",
    2: "Matig",
    3: "Goed",
    4: "Sterk",
  };
  const colors: Record<number, string> = {
    0: "bg-danger",
    1: "bg-danger",
    2: "bg-warning",
    3: "bg-success",
    4: "bg-success",
  };
  return { score, label: labels[score], color: colors[score] };
}

type PasswordFieldProps = {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  showStrength?: boolean;
  minScore?: 0 | 1 | 2 | 3 | 4;
  error?: string | null;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
};

export function PasswordField({
  id,
  name,
  label,
  value,
  onChange,
  showStrength = false,
  minScore = 0,
  error,
  autoComplete,
  placeholder,
  required,
}: PasswordFieldProps) {
  const [show, setShow] = React.useState(false);
  const strength = showStrength && value ? getPasswordStrength(value) : null;
  const tooWeak =
    showStrength && value && strength && minScore > 0
      ? strength.score < minScore
      : false;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required={required}
          className={cn(
            "pr-10",
            (error || tooWeak) &&
              "border-danger focus-visible:ring-danger",
          )}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={show ? "Verberg wachtwoord" : "Toon wachtwoord"}
          tabIndex={-1}
        >
          {show ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      </div>

      {showStrength && value ? (
        <div className="space-y-1">
          <div className="flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={cn(
                  "h-1 flex-1 rounded-full transition-all",
                  strength && strength.score > i
                    ? strength.color
                    : "bg-muted",
                )}
              />
            ))}
          </div>
          <p
            className={cn(
              "text-xs",
              tooWeak ? "text-danger" : "text-muted-foreground",
            )}
          >
            {strength?.label}
            {tooWeak ? " \u2014 minimaal \u201cMatig\u201d vereist" : ""}
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : null}
    </div>
  );
}
