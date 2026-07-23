---
title: "SheetwriteComponentConstructor | @sheetwrite/vue"
description: "Vue constructor type for Sheetwrite components: Sheetwrite-owned props, emitted events exposed as on listener props, and the exposed instance surface reachable through a template ref."
---
<!-- api-export:@sheetwrite/vue|.|SheetwriteComponentConstructor -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/vue/">@sheetwrite/vue</a><span class="api-status" data-kind="type">type</span></div>

Vue constructor type for Sheetwrite components: Sheetwrite-owned props,
emitted events exposed as `on*` listener props, and the exposed instance
surface reachable through a template ref.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/vue</code></dd></div>
<div><dt>Source</dt><dd><code>packages/vue/src/index.ts#L159</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type SheetwriteComponentConstructor<
  Props,
  Emits,
  Expose = object,
> = new () => Expose &
  ComponentPublicInstance & {
    $props: AllowedComponentProps &
      Props &
      VNodeProps & {
        [
          EventName in keyof Emits & string as `on${Capitalize<EventName>}`
        ]?: (payload: Emits[EventName]) => void;
      };
  };
```

</div>
