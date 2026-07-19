import apiNav from "../generated/api-nav.json";

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
      { label: "Overview", href: "/docs/" },
      { label: "Installation", href: "/docs/start/installation/" },
      { label: "First grid", href: "/docs/start/first-grid/" },
      { label: "Performance", href: "/docs/guides/performance-resources/" },
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
    ],
  },
  {
    label: "Reference",
    items: [
      { label: "API contract", href: "/docs/reference/api-contract/" },
      { label: "Document operations", href: "/docs/reference/document-operations/" },
      { label: "Events and errors", href: "/docs/reference/events-errors/" },
      { label: "Compatibility limits", href: "/docs/reference/compatibility-limits/" },
      { label: "Moved guides", href: "/docs/reference/moved-guides/" },
    ],
  },
  {
    // Generated from package exports; api-nav.json is emitted by docs:generate.
    label: "API packages",
    items: [{ label: "All entry points", href: "/docs/api/" }, ...apiNav],
  },
];

/**
 * Framework workbench deep links. The global topbar links to /showcases/
 * instead; these power in-page cross-links (ShowcasePage next/prev) and the
 * landing/hub link graphs. Every href here is a preserved public URL.
 */
export const SHOWCASE_NAVIGATION: readonly NavigationItem[] = [
  { label: "Vanilla", href: "/vanilla/" },
  { label: "React", href: "/react/" },
  { label: "Vue", href: "/vue/" },
  { label: "Svelte", href: "/svelte/" },
];
