type ToastInput = {
  title?: string;
  description?: string;
  variant?: "default" | "destructive" | string;
};

function emitToast(input: ToastInput) {
  const title = input.title || "Aviso";
  const description = input.description || "";
  const variant = input.variant || "default";

  const detail = { title, description, variant };

  try {
    window.dispatchEvent(new CustomEvent("grupmar-toast", { detail }));
  } catch {
    // noop
  }

  if (variant === "destructive") {
    console.error(`[GrupMar Time] ${title}`, description);
  } else {
    console.info(`[GrupMar Time] ${title}`, description);
  }
}

export function toast(input: ToastInput) {
  emitToast(input);
}

export function useToast() {
  return {
    toast: emitToast,
  };
}
