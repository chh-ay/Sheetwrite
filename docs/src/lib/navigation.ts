export interface NavigationItem {
  label: string;
  href: string;
}

export interface NavigationSection {
  label: string;
  items: readonly NavigationItem[];
}

export const DOCS_NAVIGATION: readonly NavigationSection[] = [
  {
    label: "Start",
    items: [
      { label: "Installation", href: "/docs/start/installation/" },
      { label: "First grid", href: "/docs/start/first-grid/" },
    ],
  },
  {
    label: "Understand",
    items: [
      { label: "Runtime ownership", href: "/docs/concepts/runtime-ownership/" },
      { label: "Adapter lifecycle", href: "/docs/frameworks/lifecycle/" },
    ],
  },
  {
    label: "Frameworks",
    items: [
      { label: "Vanilla", href: "/docs/frameworks/vanilla/" },
      { label: "React", href: "/docs/frameworks/react/" },
      { label: "Vue", href: "/docs/frameworks/vue/" },
      { label: "Svelte", href: "/docs/frameworks/svelte/" },
    ],
  },
  {
    label: "Build",
    items: [
      { label: "Configuration", href: "/docs/guides/configuration/" },
      { label: "Interaction", href: "/docs/guides/interaction/" },
      { label: "Data operations", href: "/docs/guides/data-operations/" },
      { label: "Formulas", href: "/docs/guides/formulas/" },
      { label: "Styling", href: "/docs/guides/styling/" },
      { label: "Persistence", href: "/docs/guides/persistence/" },
      { label: "Collaboration", href: "/docs/guides/collaboration/" },
      { label: "Worker rendering", href: "/docs/guides/worker-rendering/" },
      { label: "XLSX export", href: "/docs/guides/xlsx-export/" },
      { label: "Accessibility", href: "/docs/guides/accessibility/" },
      { label: "Performance", href: "/docs/guides/performance-resources/" },
    ],
  },
  {
    label: "Reference",
    items: [
      { label: "API contract", href: "/docs/reference/api-contract/" },
      { label: "Generated API", href: "/docs/api/" },
      { label: "Document operations", href: "/docs/reference/document-operations/" },
      { label: "Events and errors", href: "/docs/reference/events-errors/" },
      { label: "Migration matrix", href: "/docs/reference/migration-matrix/" },
    ],
  },
];

export const SHOWCASE_NAVIGATION: readonly NavigationItem[] = [
  { label: "Vanilla", href: "/vanilla/" },
  { label: "React", href: "/react/" },
  { label: "Vue", href: "/vue/" },
  { label: "Svelte", href: "/svelte/" },
];
