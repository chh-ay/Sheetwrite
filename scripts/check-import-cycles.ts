import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, relative, resolve, sep } from "node:path";

export interface ImportGraphIssue {
  readonly kind:
    | "cycle"
    | "generic-module"
    | "leaf-facade"
    | "store-edge"
    | "type-barrel"
    | "type-edge"
    | "type-owner";
  readonly message: string;
}

const STORE_EDGES: Readonly<Record<string, readonly string[]>> = {
  "mutation-policy.ts": [
    "../types/cell.ts",
    "../types/coordinates.ts",
    "../types/document.ts",
    "ranges.ts",
  ],
  "ranges.ts": ["../types/cell.ts", "../types/coordinates.ts", "../types/document.ts"],
  "snapshot-codec.ts": [
    "../document-protocol.ts",
    "../reference.ts",
    "../types/cell.ts",
    "../types/coordinates.ts",
    "../types/document.ts",
    "window-reader.ts",
  ],
  "view-state.ts": [
    "../types/cell.ts",
    "../types/coordinates.ts",
    "../types/document.ts",
    "wasm-contract.ts",
    "../types/store.ts",
  ],
  "wasm-contract.ts": [],
  "window-reader.ts": [
    "../style-dictionary.ts",
    "../types/cell.ts",
    "../types/coordinates.ts",
    "../types/document.ts",
    "../types/store.ts",
    "wasm-contract.ts",
  ],
};

export interface PublicTypeDomain {
  readonly source: string;
  readonly dependencies: readonly string[];
  readonly exports: readonly string[];
}

/** Canonical source ownership consumed by the import checker and future API documentation. */
export const PUBLIC_TYPE_DOMAINS: Readonly<Record<string, PublicTypeDomain>> = {
  coordinates: {
    source: "packages/core/src/types/coordinates.ts",
    dependencies: [],
    exports: [
      "CellAddress",
      "HighlightRange",
      "MergeRange",
      "PresenceOverlay",
      "Range",
      "Selection",
      "SheetId",
    ],
  },
  table: {
    source: "packages/core/src/types/table.ts",
    dependencies: ["coordinates"],
    exports: [
      "WorkbookTable",
      "WorkbookTableColumn",
      "WorkbookTableId",
      "WorkbookTablePatch",
      "WorkbookTableStyle",
      "WorkbookTableUnsupportedFeature",
    ],
  },
  cell: {
    source: "packages/core/src/types/cell.ts",
    dependencies: ["coordinates"],
    exports: [
      "CellAlign",
      "CellBorder",
      "CellBorders",
      "CellFormat",
      "CellScalar",
      "CellHyperlink",
      "CellStyle",
      "CellValue",
      "Column",
      "ConditionalFormatPredicate",
      "ConditionalFormatRule",
      "HyperlinkTarget",
    ],
  },
  document: {
    source: "packages/core/src/types/document.ts",
    dependencies: ["cell", "coordinates", "table"],
    exports: [
      "AddSheetInput",
      "CellBlock",
      "CellNote",
      "ColumnFilter",
      "CommitReason",
      "DataValidationComparison",
      "DataValidationCondition",
      "DataValidationRule",
      "DocumentOp",
      "MutationIssue",
      "MutationPolicyMode",
      "NamedRangeSnapshot",
      "PackedCellBlock",
      "ProtectedRange",
      "ProtectionRequest",
      "ProtectionResolver",
      "SheetLifecycleIssueCode",
      "SheetNameIssueCode",
      "SheetNameValidationResult",
      "RowGroup",
      "RowMetadata",
      "Sheet",
      "SheetSnapshot",
      "SheetVisibility",
      "SnapshotCell",
      "SortKey",
      "ValidationPolicy",
      "Workbook",
      "WorkbookSnapshot",
    ],
  },
  transaction: {
    source: "packages/core/src/types/transaction.ts",
    dependencies: ["cell", "coordinates", "document"],
    exports: [
      "ApplyTransactionResult",
      "CellChange",
      "ChangeEvent",
      "GridTransaction",
      "OperationSource",
      "PendingCommit",
      "PersistenceAdapter",
      "PersistenceCommitRequest",
      "PersistenceCommitResponse",
      "RemoteOperationOptions",
      "RemoteOperationSource",
      "SyncMutationRecord",
      "SyncMutationStatus",
      "Transaction",
      "TransactionApplicationOptions",
      "TransactionResourceLimits",
      "VersionedOperation",
    ],
  },
  data: {
    source: "packages/core/src/types/data.ts",
    dependencies: ["cell", "coordinates"],
    exports: [
      "AggregateOp",
      "ColumnarData",
      "DataCell",
      "DataSource",
      "DataSourcePage",
      "DataSourceRequest",
      "DataSourceStorageOptions",
      "RowData",
    ],
  },
  store: {
    source: "packages/core/src/types/store.ts",
    dependencies: ["cell", "coordinates", "document", "transaction"],
    exports: [
      "CellLoadState",
      "ClipboardFormulaEntry",
      "ClipboardRefEntry",
      "ClipboardWindowView",
      "PagedStoreStats",
      "QueryCapability",
      "ResolvedCell",
      "Store",
      "ResourceOwnerBytes",
      "VisibleWindowView",
    ],
  },
  render: {
    source: "packages/core/src/types/render.ts",
    dependencies: ["cell", "store"],
    exports: [
      "CellPaintContext",
      "CellRenderer",
      "PanePaint",
      "Renderer",
      "RenderLayout",
      "Theme",
      "Viewport",
    ],
  },
  grid: {
    source: "packages/core/src/types/grid.ts",
    dependencies: ["cell", "coordinates", "data", "document", "render", "store", "transaction"],
    exports: [
      "CellEditor",
      "CellEditorContext",
      "CellEditorInstance",
      "CellEditorNavigation",
      "CellEditorRect",
      "CellInputSnapshot",
      "ClipboardOutcome",
      "ContextMenuActionName",
      "ContextMenuContext",
      "ContextMenuItem",
      "GridCommandName",
      "GridCommandState",
      "GridCommandStateChangeEvent",
      "ContextMenuItems",
      "Grid",
      "GridActions",
      "GridPresentation",
      "HyperlinkActivationEvent",
      "GridConfig",
      "GridEvents",
      "GridOptions",
      "ReplaceResult",
      "SearchOptions",
      "SheetLifecycleResult",
      "SearchResult",
      "ToolbarActionName",
      "ToolbarIcon",
      "ToolbarItem",
    ],
  },
};

const TYPE_DOMAIN_BY_SOURCE: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(PUBLIC_TYPE_DOMAINS).map(([name, domain]) => [domain.source, name]),
);
const TYPE_FACADE_IMPORTERS: Readonly<Record<string, true>> = {
  "packages/core/src/adapter.ts": true,
  "packages/core/src/index.ts": true,
};

export function analyzeImportGraph(files: ReadonlyMap<string, string>): ImportGraphIssue[] {
  const normalizedFiles = new Map<string, string>();
  for (const [file, source] of files) normalizedFiles.set(toPosix(normalize(file)), source);

  const graph = new Map<string, string[]>();
  const issues: ImportGraphIssue[] = [];
  for (const [file, source] of normalizedFiles) {
    const base = file.slice(file.lastIndexOf("/") + 1);
    if (/^(?:utils|helpers)\.ts$/.test(base)) {
      issues.push({
        kind: "generic-module",
        message: `${file}: generic helper modules are forbidden`,
      });
    }

    const imports = staticImports(source)
      .filter((specifier) => specifier.startsWith("."))
      .map((specifier) => resolveImport(file, specifier, normalizedFiles))
      .filter((target): target is string => target !== null);
    graph.set(file, imports);

    if (
      file.includes("/store/") &&
      imports.some((target) => target.endsWith("/store.ts") && !target.endsWith("/types/store.ts"))
    ) {
      issues.push({
        kind: "leaf-facade",
        message: `${file}: store collaborators must not import store.ts`,
      });
    }

    if (imports.includes("packages/core/src/types.ts") && TYPE_FACADE_IMPORTERS[file] !== true) {
      issues.push({
        kind: "type-barrel",
        message: `${file}: internal modules must import exact type-domain owners`,
      });
    }

    const typeDomainName = TYPE_DOMAIN_BY_SOURCE[file];
    if (typeDomainName !== undefined) {
      const allowedDependencies = new Set(PUBLIC_TYPE_DOMAINS[typeDomainName]!.dependencies);
      for (const target of imports) {
        const dependencyName = TYPE_DOMAIN_BY_SOURCE[target];
        if (dependencyName !== undefined && !allowedDependencies.has(dependencyName)) {
          issues.push({
            kind: "type-edge",
            message: `${file}: disallowed type-domain dependency ${dependencyName}`,
          });
        }
      }
    }

    if (file.includes("/store/") && STORE_EDGES[base]) {
      const ownerDir = dirname(file);
      const allowed = new Set(
        STORE_EDGES[base].map((target) =>
          toPosix(
            normalize(target.startsWith("../") ? join(ownerDir, target) : join(ownerDir, target)),
          ),
        ),
      );
      for (const target of imports) {
        if (!allowed.has(target)) {
          issues.push({
            kind: "store-edge",
            message: `${file}: disallowed store dependency ${target}`,
          });
        }
      }
    }
  }

  const expectedOwnerBySymbol = new Map<string, string>();
  const declaredOwners = new Map<string, string[]>();
  for (const domain of Object.values(PUBLIC_TYPE_DOMAINS)) {
    for (const name of domain.exports) expectedOwnerBySymbol.set(name, domain.source);
    const source = normalizedFiles.get(domain.source);
    if (source === undefined) continue;
    for (const match of source.matchAll(
      /\bexport\s+(?:declare\s+)?(?:interface|type)\s+([A-Za-z_$][\w$]*)/g,
    )) {
      const name = match[1]!;
      const owners = declaredOwners.get(name) ?? [];
      owners.push(domain.source);
      declaredOwners.set(name, owners);
    }
  }

  if (
    [...Object.values(PUBLIC_TYPE_DOMAINS)].some((domain) => normalizedFiles.has(domain.source))
  ) {
    for (const [name, expectedOwner] of expectedOwnerBySymbol) {
      const owners = declaredOwners.get(name) ?? [];
      if (owners.length !== 1 || owners[0] !== expectedOwner) {
        issues.push({
          kind: "type-owner",
          message: `${name}: expected one owner ${expectedOwner}; found ${owners.join(", ") || "none"}`,
        });
      }
    }
    for (const [name, owners] of declaredOwners) {
      if (expectedOwnerBySymbol.has(name)) continue;
      issues.push({
        kind: "type-owner",
        message: `${name}: undeclared public type owner ${owners.join(", ")}`,
      });
    }

    const facade = normalizedFiles.get("packages/core/src/types.ts");
    if (facade === undefined) {
      issues.push({ kind: "type-owner", message: "packages/core/src/types.ts: missing facade" });
    } else {
      const facadeTargets = staticImports(facade)
        .map((specifier) => resolveImport("packages/core/src/types.ts", specifier, normalizedFiles))
        .filter((target): target is string => target !== null)
        .sort();
      const expectedTargets = Object.values(PUBLIC_TYPE_DOMAINS)
        .map((domain) => domain.source)
        .sort();
      if (JSON.stringify(facadeTargets) !== JSON.stringify(expectedTargets)) {
        issues.push({
          kind: "type-owner",
          message:
            "packages/core/src/types.ts: facade must re-export every type domain exactly once",
        });
      }
      if (/\bexport\s+(?!type\s+\*)/.test(facade)) {
        issues.push({
          kind: "type-owner",
          message: "packages/core/src/types.ts: facade may only contain type-star re-exports",
        });
      }
    }
  }

  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const reported = new Set<string>();
  const visit = (file: string): void => {
    state.set(file, 1);
    stack.push(file);
    for (const target of graph.get(file) ?? []) {
      if (!graph.has(target)) continue;
      if (state.get(target) === 1) {
        const start = stack.indexOf(target);
        const cycle = [...stack.slice(start), target];
        const key = canonicalCycle(cycle);
        if (!reported.has(key)) {
          reported.add(key);
          issues.push({ kind: "cycle", message: `import cycle: ${cycle.join(" -> ")}` });
        }
      } else if (state.get(target) !== 2) {
        visit(target);
      }
    }
    stack.pop();
    state.set(file, 2);
  };

  for (const file of graph.keys()) if (!state.has(file)) visit(file);
  return issues;
}

export async function readTypeScriptSources(root: string): Promise<Map<string, string>> {
  const absoluteRoot = resolve(root);
  const files = new Map<string, string>();
  const walk = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && extname(entry.name) === ".ts") {
        files.set(toPosix(relative(process.cwd(), path)), await readFile(path, "utf8"));
      }
    }
  };
  await walk(absoluteRoot);
  return files;
}

function staticImports(source: string): string[] {
  const imports: string[] = [];
  const declaration = /\b(?:import|export)\s+(?:type\s+)?(?:[^"'`;]*?\s+from\s+)?["']([^"']+)["']/g;
  const dynamic = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of source.matchAll(declaration)) imports.push(match[1]!);
  for (const match of source.matchAll(dynamic)) imports.push(match[1]!);
  return imports;
}

function resolveImport(
  importer: string,
  specifier: string,
  files: ReadonlyMap<string, string>,
): string | null {
  const unresolved = toPosix(normalize(join(dirname(importer), specifier)));
  const candidates = unresolved.endsWith(".js")
    ? [`${unresolved.slice(0, -3)}.ts`]
    : [unresolved, `${unresolved}.ts`, `${unresolved}/index.ts`];
  return candidates.find((candidate) => files.has(candidate)) ?? null;
}

function canonicalCycle(cycle: readonly string[]): string {
  const nodes = cycle.slice(0, -1);
  let best = nodes.join("\0");
  for (let index = 1; index < nodes.length; index++) {
    const rotated = [...nodes.slice(index), ...nodes.slice(0, index)].join("\0");
    if (rotated < best) best = rotated;
  }
  return best;
}

function toPosix(path: string): string {
  return sep === "/" ? path : path.split(sep).join("/");
}

if (import.meta.main) {
  const files = await readTypeScriptSources("packages/core/src");
  const issues = analyzeImportGraph(files);
  if (issues.length > 0) {
    for (const issue of issues) console.error(issue.message);
    process.exitCode = 1;
  } else {
    console.log(
      `check:cycles: ${files.size} core modules are acyclic with exact store and public-type ownership`,
    );
  }
}
