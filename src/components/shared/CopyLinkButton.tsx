/* CopyLinkButton — copies a URL to clipboard, swaps to "Copied" for 2.0s.
   Ported from app/detail.jsx copy behavior. Falls back gracefully (legacy
   execCommand) when the async Clipboard API is unavailable or denied; if every
   path fails it surfaces a "Press ⌘C" fallback rather than failing silently. */
"use client";
import * as React from "react";
import { Icons } from "@/components/icons/icons";

export interface CopyLinkButtonProps {
  /** defaults to window.location.href */
  url?: string;
  /** called on every successful copy */
  onCopied?: () => void;
}

/** Legacy fallback for when navigator.clipboard is unavailable or rejects
    (e.g. permission denied, insecure context). Returns true on success. */
function legacyCopy(text: string): boolean {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

type Status = "idle" | "copied" | "failed";

export function CopyLinkButton({ url, onCopied }: CopyLinkButtonProps) {
  const [status, setStatus] = React.useState<Status>("idle");
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = (next: Status) => {
    setStatus(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus("idle"), 2000);
  };

  // clear a pending revert timeout if we unmount mid-flash
  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = () => {
    const target = url ?? window.location.href;
    const succeed = () => {
      onCopied?.();
      flash("copied");
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(target)
        .then(succeed)
        .catch(() => {
          // permission denied / insecure context → try the legacy path, else surface failure
          if (legacyCopy(target)) succeed();
          else flash("failed");
        });
    } else if (legacyCopy(target)) {
      succeed();
    } else {
      flash("failed");
    }
  };

  const label =
    status === "copied" ? "Copied" : status === "failed" ? "Copy failed — press ⌘C" : "Share";

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      aria-label={status === "idle" ? "Copy link to this page" : label}
      onClick={copy}
    >
      <span className="sr-only" role="status" aria-live="polite">
        {status === "copied" ? "Copied" : status === "failed" ? "Copy failed" : ""}
      </span>
      {status === "copied" ? (
        <>
          <Icons.check size={15} /> Copied
        </>
      ) : status === "failed" ? (
        <>
          <Icons.alert size={15} /> Press ⌘C
        </>
      ) : (
        <>
          <Icons.link size={15} /> Share
        </>
      )}
    </button>
  );
}
