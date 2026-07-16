import { autoUpdate, computePosition, flip, offset, shift, size } from "@floating-ui/dom";

interface OpenPopover {
  trigger: HTMLElement;
  panel: HTMLElement;
  stopPositioning: () => void;
}

const initializedTriggers = new WeakSet<HTMLElement>();
let activePopover: OpenPopover | null = null;
let closeTimer: number | undefined;
let codeMutationObserver: MutationObserver | null = null;

function cancelScheduledClose(): void {
  if (closeTimer === undefined) return;
  window.clearTimeout(closeTimer);
  closeTimer = undefined;
}

function closePopover(): void {
  cancelScheduledClose();
  if (!activePopover) return;
  activePopover.stopPositioning();
  activePopover.panel.hidden = true;
  activePopover.panel.setAttribute("aria-hidden", "true");
  activePopover.trigger.removeAttribute("data-popover-open");
  activePopover = null;
}

function scheduleClose(trigger: HTMLElement, panel: HTMLElement): void {
  cancelScheduledClose();
  closeTimer = window.setTimeout(() => {
    if (trigger.matches(":hover, :focus") || panel.matches(":hover")) return;
    closePopover();
  }, 90);
}

async function positionPopover(trigger: HTMLElement, panel: HTMLElement): Promise<void> {
  const { x, y, placement } = await computePosition(trigger, panel, {
    strategy: "fixed",
    placement: "bottom-start",
    middleware: [
      offset(8),
      flip({ padding: 12, fallbackPlacements: ["top-start", "bottom-end", "top-end"] }),
      shift({ padding: 12 }),
      size({
        padding: 12,
        apply({ availableHeight, availableWidth, elements }) {
          Object.assign(elements.floating.style, {
            // 544px = the 34rem design cap; inline style wins over the CSS max-width.
            maxWidth: `${Math.min(544, availableWidth)}px`,
            maxHeight: `${Math.min(480, availableHeight)}px`,
          });
        },
      }),
    ],
  });
  panel.dataset.placement = placement;
  Object.assign(panel.style, { position: "fixed", left: `${x}px`, top: `${y}px` });
}

function openPopover(trigger: HTMLElement, panel: HTMLElement): void {
  cancelScheduledClose();
  if (activePopover?.trigger === trigger) return;
  closePopover();
  document.body.append(panel);
  panel.hidden = false;
  panel.setAttribute("aria-hidden", "false");
  trigger.setAttribute("data-popover-open", "true");
  activePopover = {
    trigger,
    panel,
    stopPositioning: autoUpdate(trigger, panel, () => void positionPopover(trigger, panel)),
  };
}

export function initializeCodePopovers(root: ParentNode = document): void {
  const triggers = root.querySelectorAll<HTMLElement>("[data-sw-code-popover-trigger]");
  for (const trigger of triggers) {
    if (initializedTriggers.has(trigger)) continue;
    const panelId = trigger.dataset.swCodePopoverTrigger;
    const panel = panelId ? document.getElementById(panelId) : null;
    if (!(panel instanceof HTMLElement)) continue;
    initializedTriggers.add(trigger);
    trigger.addEventListener("pointerenter", () => openPopover(trigger, panel));
    trigger.addEventListener("pointerleave", () => scheduleClose(trigger, panel));
    trigger.addEventListener("focus", () => openPopover(trigger, panel));
    trigger.addEventListener("blur", () => scheduleClose(trigger, panel));
    trigger.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || activePopover?.trigger !== trigger) return;
      event.preventDefault();
      closePopover();
    });
    trigger.addEventListener("click", () => {
      if (!window.matchMedia("(hover: none)").matches) return;
      if (activePopover?.trigger !== trigger) openPopover(trigger, panel);
    });
    panel.addEventListener("pointerenter", cancelScheduledClose);
    panel.addEventListener("pointerleave", () => scheduleClose(trigger, panel));
  }
}

function synchronizeCodeBlockFocus(pre: HTMLPreElement): void {
  if (pre.scrollWidth > pre.clientWidth) {
    pre.tabIndex = 0;
    pre.setAttribute("role", "region");
  } else {
    pre.removeAttribute("tabindex");
    pre.removeAttribute("role");
  }
}

function observeCodeBlocks(root: ParentNode, observer: ResizeObserver): void {
  for (const pre of root.querySelectorAll<HTMLPreElement>(".expressive-code pre")) {
    observer.observe(pre);
    synchronizeCodeBlockFocus(pre);
  }
}

export function initializeCodeEnhancements(): () => void {
  initializeCodePopovers();
  if (codeMutationObserver) return () => {};

  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      if (entry.target instanceof HTMLPreElement) synchronizeCodeBlockFocus(entry.target);
    }
  });
  observeCodeBlocks(document, resizeObserver);

  codeMutationObserver = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        initializeCodePopovers(node);
        observeCodeBlocks(node, resizeObserver);
      }
    }
  });
  codeMutationObserver.observe(document.body, { childList: true, subtree: true });

  return () => {
    codeMutationObserver?.disconnect();
    codeMutationObserver = null;
    resizeObserver.disconnect();
  };
}
