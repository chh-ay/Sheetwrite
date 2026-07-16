/**
 * Fragment navigation must actually show the target. Generated API members
 * are collapsed `<details>` rows, and two anchor forms point at them: the
 * details id itself (`#grid-apply-transaction`) and the search-anchor h3
 * that precedes it (`#applytransaction`). Browsers scroll to closed rows
 * without opening them, so deep links land on nothing visible.
 */
function memberFor(target: Element): HTMLDetailsElement | null {
  if (target instanceof HTMLDetailsElement) return target;
  const following = target.nextElementSibling;
  if (following instanceof HTMLDetailsElement) return following;
  return target.closest("details");
}

export function revealAnchoredMember(): void {
  const id = decodeURIComponent(window.location.hash.slice(1));
  if (!id) return;
  // Content mounts lazily after route transitions; retry briefly.
  const started = performance.now();
  const attempt = (): void => {
    const target = document.getElementById(id);
    if (target === null) {
      if (performance.now() - started < 2000) requestAnimationFrame(attempt);
      return;
    }
    const member = memberFor(target);
    if (member !== null) {
      if (!member.open) member.open = true;
      // Search links target the hidden h3 anchor, so CSS :target misses the
      // row; a data flag carries the emphasis either way.
      for (const previous of document.querySelectorAll<HTMLElement>(".api-member[data-revealed]")) {
        delete previous.dataset.revealed;
      }
      member.dataset.revealed = "";
    }
    requestAnimationFrame(() => {
      (member ?? target).scrollIntoView({ block: "start" });
    });
  };
  attempt();
}

/** Window-level wiring for in-page fragment jumps (ToC, popover links). */
export function installAnchorReveal(): () => void {
  window.addEventListener("hashchange", revealAnchoredMember);
  revealAnchoredMember();
  return () => window.removeEventListener("hashchange", revealAnchoredMember);
}
