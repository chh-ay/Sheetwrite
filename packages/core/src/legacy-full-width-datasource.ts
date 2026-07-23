import type { DataSource, DataSourcePage, DataSourceRequest, RowData } from "./types/data.js";

/** Row-only page shape accepted by the full-width compatibility adapter. */
export interface LegacyRowPage {
  readonly start: number;
  readonly rows: readonly RowData[];
}

/** Loads one row-only page for the full-width compatibility adapter. */
export type LegacyRowLoader = (
  request: DataSourceRequest,
) => Promise<LegacyRowPage> | LegacyRowPage;

/** Adapts a row loader to protocol 2; full-width loading is horizontally non-scalable. */
export function legacyFullWidthDataSource(loadRows: LegacyRowLoader): DataSource {
  return {
    capabilities: { protocol: 2, columns: "full-width" },
    getRows(request) {
      const pending = loadRows(request);
      return Promise.resolve(pending).then((page): DataSourcePage => {
        if (!page || !Number.isSafeInteger(page.start) || !Array.isArray(page.rows)) {
          throw new RangeError("Legacy datasource page must contain a safe start and rows array");
        }
        const declaredKeys = request.columns.flatMap((band) => [...band.keys]);
        const declared = new Set(declaredKeys);
        const rows = page.rows.map((row) => {
          if (row === null || typeof row !== "object" || Array.isArray(row)) {
            throw new RangeError("Legacy datasource rows must be keyed objects");
          }
          for (const key of Reflect.ownKeys(row)) {
            if (typeof key !== "string" || !declared.has(key)) {
              throw new RangeError("Legacy datasource row contains an undeclared key");
            }
          }
          const normalized: RowData = Object.create(null) as RowData;
          for (const key of declaredKeys) {
            normalized[key] = Object.hasOwn(row, key) ? row[key]! : null;
          }
          return normalized;
        });
        return {
          protocol: 2,
          start: page.start,
          columns: request.columns,
          rows,
        };
      });
    },
  };
}
