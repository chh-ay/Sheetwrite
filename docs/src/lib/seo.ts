/**
 * Page title/description mirrored into the OG/Twitter card tags. Route-level
 * meta overrides the root defaults key-by-key, so every page shares one
 * social-card contract without repeating the tag list.
 */
export function pageMeta(title: string, description: string) {
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];
}
