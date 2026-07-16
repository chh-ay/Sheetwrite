export function withBasePath(path: string, base: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error(`Expected a root-relative path, received ${path}`);
  }
  const normalizedBase = base === "/" ? "" : `/${base.replace(/^\/+|\/+$/g, "")}`;
  return `${normalizedBase}${path}`;
}
