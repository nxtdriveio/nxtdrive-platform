import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function FranchiseDowngradeAlert({ planLabel }: { planLabel: string }) {
  return (
    <Alert variant="warning">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="space-y-1">
        <AlertTitle>Franchisebeheer draait nu in afschaalmodus</AlertTitle>
        <AlertDescription>
          Dit netwerk heeft al gekoppelde franchisees, maar het huidige abonnement
          mist de vereiste {planLabel}-toegang voor nieuwe franchise-uitrol. Je
          kunt bestaande governance en distributie nog bekijken, maar nieuwe
          franchise-acties blijven read-only tot het abonnement weer is opgehoogd.
        </AlertDescription>
      </div>
    </Alert>
  );
}
