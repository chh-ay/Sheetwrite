---
title: "Sheetwrite | @sheetwrite/vue"
description: "Convenience component for local object rows with live option updates."
tableOfContents: false
---
<!-- api-export:@sheetwrite/vue|.|Sheetwrite -->
[← @sheetwrite/vue](/docs/api/vue/)

<span class="api-status">variable</span>

Convenience component for local object rows with live option updates.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/vue</code></dd></div>
<div><dt>Source</dt><dd><code>packages/vue/src/index.ts#L250</code></dd></div>
</dl>

## Signature

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
DefineComponent<ExtractPropTypes<{
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
