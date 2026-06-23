type GrupmarErrorOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

type GrupmarEvents = {
  captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
    options?: GrupmarErrorOptions,
  ) => void;
};

declare global {
  interface Window {
    __grupmarTimeEvents?: GrupmarEvents;
  }
}

export function reportGrupmarTimeError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;

  window.__grupmarTimeEvents?.captureException?.(
    error,
    {
      source: "react_error_boundary",
      route: window.location.pathname,
      ...context,
    },
    {
      mechanism: "react_error_boundary",
      handled: false,
      severity: "error",
    },
  );
}
