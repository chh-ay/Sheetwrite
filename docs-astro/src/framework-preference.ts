export const FRAMEWORKS = [
  { id: "vanilla", label: "Vanilla", guide: "/docs/frameworks/vanilla/", example: "/vanilla/" },
  { id: "react", label: "React", guide: "/docs/frameworks/react/", example: "/react/" },
  { id: "vue", label: "Vue", guide: "/docs/frameworks/vue/", example: "/vue/" },
  { id: "svelte", label: "Svelte", guide: "/docs/frameworks/svelte/", example: "/svelte/" },
] as const;

export type FrameworkId = (typeof FRAMEWORKS)[number]["id"];

export const FRAMEWORK_STORAGE_KEY = "sheetwrite-docs-framework";
export const FRAMEWORK_TAB_STORAGE_KEY = "starlight-synced-tabs__sheetwrite-framework";

export function frameworkById(value: string | null | undefined) {
  return FRAMEWORKS.find((framework) => framework.id === value);
}

export function frameworkByPath(pathname: string) {
  return FRAMEWORKS.find((framework) => pathname.includes(framework.guide));
}
