---
title: "Sheetwrite | @sheetwrite/vue"
description: "Convenience component for local object rows with live option updates."
---
<!-- api-export:@sheetwrite/vue|.|Sheetwrite -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/vue/">@sheetwrite/vue</a><span class="api-status" data-kind="variable">variable</span></div>

Convenience component for local object rows with live option updates.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/vue</code></dd></div>
<div><dt>Source</dt><dd><code>packages/vue/src/index.ts#L268</code></dd></div>
</dl>

## Signature

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
const Sheetwrite: DefineComponent<ExtractPropTypes<{
    columns: {
        type: PropType<readonly {
            key: string;
            title: string;
        }[]>;
        required: true;
    };
    defaultRows: {
        type: PropType<readonly Record<string, CellScalar>[]>;
        required: true;
    };
    sheetName: {
        type: StringConstructor;
        default: undefined;
    };
    height: {
        type: (StringConstructor | NumberConstructor)[];
        default: undefined;
    };
    fill: {
        type: BooleanConstructor;
        default: undefined;
    };
}>, () => VNode<RendererNode, RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, ComponentOptionsMixin, ComponentOptionsMixin, {}, string, PublicProps, ToResolvedProps<ExtractPropTypes<{
    columns: {
        type: PropType<readonly {
            key: string;
            title: string;
        }[]>;
        required: true;
    };
    defaultRows: {
        type: PropType<readonly Record<string, CellScalar>[]>;
        required: true;
    };
    sheetName: {
        type: StringConstructor;
        default: undefined;
    };
    height: {
        type: (StringConstructor | NumberConstructor)[];
        default: undefined;
    };
    fill: {
        type: BooleanConstructor;
        default: undefined;
    };
}>, {}>, {
    fill: boolean;
    height: string | number;
    sheetName: string;
}, {}, {}, {}, string, ComponentProvideOptions, true, {}, any>;
```

</details>
