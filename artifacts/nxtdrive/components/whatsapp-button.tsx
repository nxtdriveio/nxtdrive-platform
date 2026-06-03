import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { buildWhatsAppLink } from "@/lib/notifications/whatsapp";

/**
 * Click-to-chat WhatsApp button. Renders an anchor styled like a Button that
 * opens WhatsApp with a pre-filled message via a wa.me deeplink. Renders
 * nothing when the phone number cannot be normalised to a usable number, so it
 * only appears when there is actually someone to message.
 */
export function WhatsAppButton({
  phone,
  message,
  label = "WhatsApp",
  size = "sm",
  variant = "outline",
  className,
}: {
  phone: string | null | undefined;
  message: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary" | "outline" | "ghost" | "soft";
  className?: string;
}) {
  const href = buildWhatsAppLink(phone, message);
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(buttonVariants({ variant, size }), className)}
    >
      <MessageCircle className="h-4 w-4" aria-hidden />
      {label}
    </a>
  );
}
