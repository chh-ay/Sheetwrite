/**
 * Fail-closed validation for the capability inventory.
 *
 * Two layers:
 * - `collectCapabilityIssues` — pure structural checks, safe in the browser.
 *   The /showcases/ route asserts these at module scope, so a broken contract
 *   fails prerender (and therefore the docs build) before it ships.
 * - `collectMissingCapabilityFiles` — filesystem existence checks with an
 *   injected `exists`, run by scripts/docs.ts check and the inventory tests.
 *   Deleting an owner route, a browser contract, or a shared scenario/protocol
 *   binding fails the build.
 */

import type { Capability, CapabilityOwner } from "./capabilities.js";

/** Structural contract violations. Empty result = valid inventory. */
export function collectCapabilityIssues(
  inventory: readonly Capability[],
  owners: readonly CapabilityOwner[],
): string[] {
  const issues: string[] = [];
  const ownerIds = new Set(owners.map((owner) => owner.id));

  if (inventory.length === 0) issues.push("capability inventory is empty");

  const ownerDuplicates = new Set<string>();
  for (const owner of owners) {
    if (ownerDuplicates.has(owner.id)) issues.push(`owner ${owner.id}: registered twice`);
    ownerDuplicates.add(owner.id);
    if (!/^\/(?:[a-z-]+\/)+$/.test(owner.href)) {
      issues.push(
        `owner ${owner.id}: href "${owner.href}" must be an absolute trailing-slash path`,
      );
    }
    if (owner.routeFile.length === 0) issues.push(`owner ${owner.id}: route file is missing`);
    if (owner.responsibility.length === 0) {
      issues.push(`owner ${owner.id}: bounded responsibility is missing`);
    }
  }

  const seenIds = new Set<string>();
  for (const capability of inventory) {
    const label = capability.id.length > 0 ? capability.id : `<untitled: ${capability.title}>`;

    if (!/^[a-z]+(?:-[a-z]+)*\.[a-z]+(?:-[a-z]+)*$/.test(capability.id)) {
      issues.push(`${label}: id must be a stable "area.name" identifier`);
    }
    if (seenIds.has(capability.id)) issues.push(`${label}: duplicate capability id`);
    seenIds.add(capability.id);

    if (!ownerIds.has(capability.primary)) {
      issues.push(`${label}: primary owner "${capability.primary}" is not a registered showcase`);
    }
    if (capability.interaction.length === 0) {
      issues.push(`${label}: required interaction is missing`);
    }
    if (capability.accessibility.length === 0) {
      issues.push(`${label}: accessibility contract is missing`);
    }
    if (capability.boundary.length === 0) {
      issues.push(`${label}: host-owned/unsupported boundary is missing`);
    }
    if (capability.testPath.length === 0) {
      issues.push(`${label}: executable test path is missing`);
    } else if (
      capability.scope.startsWith("browser") &&
      !capability.testPath.startsWith("test/browser/") &&
      !capability.testPath.startsWith("docs/test/")
    ) {
      issues.push(
        `${label}: browser-scoped interaction needs a browser contract, got "${capability.testPath}"`,
      );
    }
    if (capability.sharedModules.length === 0) {
      issues.push(`${label}: no shared scenario/protocol binding declared`);
    }
    for (const module of capability.sharedModules) {
      if (!module.startsWith("docs/src/showcases/")) {
        issues.push(`${label}: shared binding "${module}" must live under docs/src/showcases/`);
      }
    }

    const secondaries = capability.secondary ?? [];
    const seenSecondary = new Set<string>();
    for (const secondary of secondaries) {
      if (secondary.owner === capability.primary) {
        issues.push(`${label}: secondary coverage duplicates the primary owner`);
      }
      if (seenSecondary.has(secondary.owner)) {
        issues.push(`${label}: secondary owner "${secondary.owner}" declared twice`);
      }
      seenSecondary.add(secondary.owner);
      if (!ownerIds.has(secondary.owner)) {
        issues.push(`${label}: secondary owner "${secondary.owner}" is not a registered showcase`);
      }
      if (secondary.reason.length === 0) {
        issues.push(
          `${label}: secondary coverage by "${secondary.owner}" must declare its intent — accidental duplicate ownership fails`,
        );
      }
    }
  }

  for (const owner of owners) {
    if (!inventory.some((capability) => capability.primary === owner.id)) {
      issues.push(`owner ${owner.id}: owns no capability — remove the route or assign its story`);
    }
  }

  return issues;
}

/**
 * Referenced-artifact existence: owner routes, executable contracts, and
 * shared scenario/protocol modules must exist on disk. Paths are repo-relative.
 */
export function collectMissingCapabilityFiles(
  inventory: readonly Capability[],
  owners: readonly CapabilityOwner[],
  exists: (repoRelativePath: string) => boolean,
): string[] {
  const issues: string[] = [];
  for (const owner of owners) {
    if (!exists(owner.routeFile)) {
      issues.push(`owner ${owner.id}: route file ${owner.routeFile} does not exist`);
    }
  }
  const checked = new Set<string>();
  for (const capability of inventory) {
    for (const path of [capability.testPath, ...capability.sharedModules]) {
      if (checked.has(path)) continue;
      checked.add(path);
      if (!exists(path)) issues.push(`${capability.id}: referenced ${path} does not exist`);
    }
  }
  return issues;
}

/** Browser-safe assertion used at /showcases/ module scope: throw = no ship. */
export function assertCapabilityInventory(
  inventory: readonly Capability[],
  owners: readonly CapabilityOwner[],
): void {
  const issues = collectCapabilityIssues(inventory, owners);
  if (issues.length > 0) {
    throw new Error(`Capability inventory is invalid:\n${issues.join("\n")}`);
  }
}
