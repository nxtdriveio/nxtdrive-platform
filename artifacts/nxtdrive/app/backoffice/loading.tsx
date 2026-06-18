export default function BackofficeLoading() {
  return (
    <>
      <div
        aria-label="Backoffice laden"
        role="progressbar"
        className="h-1 w-full overflow-hidden rounded-full bg-primary/10"
      >
        <div className="h-full w-2/5 rounded-full bg-[linear-gradient(90deg,var(--brand-primary),var(--brand-secondary),var(--info))] shadow-[0_0_18px_color-mix(in_oklab,var(--brand-primary)_42%,transparent)] motion-safe:animate-[backoffice-loading-bar_1.15s_ease-in-out_infinite]" />
      </div>
      <style>
        {`
          @keyframes backoffice-loading-bar {
            0% { transform: translateX(-110%); }
            55% { transform: translateX(95%); }
            100% { transform: translateX(260%); }
          }
        `}
      </style>
    </>
  );
}
