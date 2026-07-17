import { useState } from "react";

/** Click-to-copy install command; shared by the landing and showcase pages. */
export function InstallCommand({ packageName }: Readonly<{ packageName: string }>) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  const command = `npm install ${packageName}`;
  const feedback = state === "copied" ? "Copied" : state === "error" ? "Try again" : "Copy";

  return (
    <button
      className="sw-install-command"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(command);
          setState("copied");
          window.setTimeout(() => setState("idle"), 1600);
        } catch {
          setState("error");
          window.setTimeout(() => setState("idle"), 2400);
        }
      }}
      type="button"
    >
      <span aria-hidden="true">$</span>
      <code>{command}</code>
      <strong aria-live="polite">{feedback}</strong>
      <span className="sw-visually-hidden"> install command</span>
    </button>
  );
}
