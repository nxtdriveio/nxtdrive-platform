"use client";

import * as React from "react";

export function WidgetResizeBridge({ tenant }: { tenant: string }) {
  React.useEffect(() => {
    if (window.parent === window) return;

    let frame = 0;
    const send = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const height = Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight,
        );
        window.parent.postMessage(
          {
            type: "nxtdrive:intake:resize",
            tenant,
            height,
          },
          "*",
        );
      });
    };

    const observer = new ResizeObserver(send);
    observer.observe(document.documentElement);
    observer.observe(document.body);
    send();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [tenant]);

  return null;
}
