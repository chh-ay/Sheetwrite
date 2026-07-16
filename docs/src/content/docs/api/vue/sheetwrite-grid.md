---
title: "SheetwriteGrid | @sheetwrite/vue"
description: "Advanced framework component for workbook data or datasource input."
---
<!-- api-export:@sheetwrite/vue|.|SheetwriteGrid -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/vue/">@sheetwrite/vue</a><span class="api-status" data-kind="variable">variable</span></div>

Advanced framework component for workbook data or datasource input.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/vue</code></dd></div>
<div><dt>Source</dt><dd><code>packages/vue/src/index.ts#L263</code></dd></div>
</dl>

## Signature

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
const SheetwriteGrid: ComponentPublicInstanceConstructor<CreateComponentPublicInstanceWithMixins<ToResolvedProps<ExtractPropTypes<{
    workbook: {
        type: PropType<Workbook>;
        required: true;
    };
    data: {
        type: PropType<ColumnarData>;
        default: undefined;
    };
    datasource: {
        type: PropType<DataSource>;
        default: undefined;
    };
    datasourceStorage: {
        type: PropType<DataSourceStorageOptions>;
        default: undefined;
    };
    renderer: {
        type: PropType<GridOptions["renderer"]>;
        default: undefined;
    };
    workerUrl: {
        type: PropType<GridOptions["workerUrl"]>;
        default: undefined;
    };
    theme: {
        type: PropType<Partial<Theme>>;
        default: undefined;
    };
    readOnly: {
        type: BooleanConstructor;
        default: undefined;
    };
    protectionResolver: {
        type: PropType<GridOptions["protectionResolver"]>;
        default: undefined;
    };
    mutationPolicy: {
        type: PropType<GridOptions["mutationPolicy"]>;
        default: undefined;
    };
    renderers: {
        type: PropType<Record<string, CellRenderer>>;
        default: undefined;
    };
    overscan: {
        type: NumberConstructor;
        default: undefined;
    };
    minColumns: {
        type: NumberConstructor;
        default: undefined;
    };
    config: {
        type: PropType<GridOptions["config"]>;
        default: undefined;
    };
    wasmSource: {
        type: PropType<SheetwriteInitializationProps["wasmSource"]>;
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
}>, {
    "grid-change": (_event: ChangeEvent) => boolean;
    "selection-change": (_selection: Selection | null) => boolean;
    "viewport-change": (_event: GridEvents["scroll"]) => boolean;
    "edit-begin": (_event: GridEvents["edit-begin"]) => boolean;
    "edit-commit": (_event: GridEvents["edit-commit"]) => boolean;
    search: (_result: GridEvents["search"]) => boolean;
    "active-sheet-change": (_event: GridEvents["active-sheet"]) => boolean;
    ready: (_event: GridReadyEvent) => boolean;
    "initialization-error": (_error: unknown) => boolean;
}>, () => VNode<RendererNode, RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, ComponentOptionsMixin, ComponentOptionsMixin, {
    "grid-change": (_event: ChangeEvent) => boolean;
    "selection-change": (_selection: Selection | null) => boolean;
    "viewport-change": (_event: GridEvents["scroll"]) => boolean;
    "edit-begin": (_event: GridEvents["edit-begin"]) => boolean;
    "edit-commit": (_event: GridEvents["edit-commit"]) => boolean;
    search: (_result: GridEvents["search"]) => boolean;
    "active-sheet-change": (_event: GridEvents["active-sheet"]) => boolean;
    ready: (_event: GridReadyEvent) => boolean;
    "initialization-error": (_error: unknown) => boolean;
}, PublicProps, {
    fill: boolean;
    data: ColumnarData;
    height: string | number;
    datasource: DataSource;
    datasourceStorage: DataSourceStorageOptions;
    renderer: "worker" | "canvas" | undefined;
    workerUrl: string | URL | undefined;
    theme: Partial<Theme>;
    readOnly: boolean;
    protectionResolver: ProtectionResolver | undefined;
    mutationPolicy: MutationPolicyMode | undefined;
    renderers: Record<string, CellRenderer>;
    overscan: number;
    minColumns: number;
    config: GridConfig | undefined;
    wasmSource: string | BufferSource | Request | URL | WebAssembly.Module | undefined;
}, true, {}, {}, GlobalComponents, GlobalDirectives, string, {}, any, ComponentProvideOptions, OptionTypesType<{}, {}, {}, {}, {}, {}>, Readonly<ExtractPropTypes<{
    workbook: {
        type: PropType<Workbook>;
        required: true;
    };
    data: {
        type: PropType<ColumnarData>;
        default: undefined;
    };
    datasource: {
        type: PropType<DataSource>;
        default: undefined;
    };
    datasourceStorage: {
        type: PropType<DataSourceStorageOptions>;
        default: undefined;
    };
    renderer: {
        type: PropType<GridOptions["renderer"]>;
        default: undefined;
    };
    workerUrl: {
        type: PropType<GridOptions["workerUrl"]>;
        default: undefined;
    };
    theme: {
        type: PropType<Partial<Theme>>;
        default: undefined;
    };
    readOnly: {
        type: BooleanConstructor;
        default: undefined;
    };
    protectionResolver: {
        type: PropType<GridOptions["protectionResolver"]>;
        default: undefined;
    };
    mutationPolicy: {
        type: PropType<GridOptions["mutationPolicy"]>;
        default: undefined;
    };
    renderers: {
        type: PropType<Record<string, CellRenderer>>;
        default: undefined;
    };
    overscan: {
        type: NumberConstructor;
        default: undefined;
    };
    minColumns: {
        type: NumberConstructor;
        default: undefined;
    };
    config: {
        type: PropType<GridOptions["config"]>;
        default: undefined;
    };
    wasmSource: {
        type: PropType<SheetwriteInitializationProps["wasmSource"]>;
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
}>> & Readonly<{
    onSearch?: ((_result: SearchResult) => any) | undefined;
    onReady?: ((_event: GridReadyEvent) => any) | undefined;
    "onEdit-begin"?: ((_event: {
        addr: CellAddress;
    }) => any) | undefined;
    "onEdit-commit"?: ((_event: {
        addr: CellAddress;
        value: CellValue;
    }) => any) | undefined;
    "onGrid-change"?: ((_event: ChangeEvent) => any) | undefined;
    "onSelection-change"?: ((_selection: Selection | null) => any) | undefined;
    "onViewport-change"?: ((_event: {
        scrollTop: number;
        firstRow: number;
        lastRow: number;
    }) => any) | undefined;
    "onActive-sheet-change"?: ((_event: {
        sheet: SheetId;
    }) => any) | undefined;
    "onInitialization-error"?: ((_error: unknown) => any) | undefined;
}>, () => VNode<RendererNode, RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, {
    fill: boolean;
    data: ColumnarData;
    height: string | number;
    datasource: DataSource;
    datasourceStorage: DataSourceStorageOptions;
    renderer: "worker" | "canvas" | undefined;
    workerUrl: string | URL | undefined;
    theme: Partial<Theme>;
    readOnly: boolean;
    protectionResolver: ProtectionResolver | undefined;
    mutationPolicy: MutationPolicyMode | undefined;
    renderers: Record<string, CellRenderer>;
    overscan: number;
    minColumns: number;
    config: GridConfig | undefined;
    wasmSource: string | BufferSource | Request | URL | WebAssembly.Module | undefined;
}>, any, any, any, ComputedOptions, MethodOptions> & ComponentOptionsBase<ToResolvedProps<ExtractPropTypes<{
    workbook: {
        type: PropType<Workbook>;
        required: true;
    };
    data: {
        type: PropType<ColumnarData>;
        default: undefined;
    };
    datasource: {
        type: PropType<DataSource>;
        default: undefined;
    };
    datasourceStorage: {
        type: PropType<DataSourceStorageOptions>;
        default: undefined;
    };
    renderer: {
        type: PropType<GridOptions["renderer"]>;
        default: undefined;
    };
    workerUrl: {
        type: PropType<GridOptions["workerUrl"]>;
        default: undefined;
    };
    theme: {
        type: PropType<Partial<Theme>>;
        default: undefined;
    };
    readOnly: {
        type: BooleanConstructor;
        default: undefined;
    };
    protectionResolver: {
        type: PropType<GridOptions["protectionResolver"]>;
        default: undefined;
    };
    mutationPolicy: {
        type: PropType<GridOptions["mutationPolicy"]>;
        default: undefined;
    };
    renderers: {
        type: PropType<Record<string, CellRenderer>>;
        default: undefined;
    };
    overscan: {
        type: NumberConstructor;
        default: undefined;
    };
    minColumns: {
        type: NumberConstructor;
        default: undefined;
    };
    config: {
        type: PropType<GridOptions["config"]>;
        default: undefined;
    };
    wasmSource: {
        type: PropType<SheetwriteInitializationProps["wasmSource"]>;
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
}>, {
    "grid-change": (_event: ChangeEvent) => boolean;
    "selection-change": (_selection: Selection | null) => boolean;
    "viewport-change": (_event: GridEvents["scroll"]) => boolean;
    "edit-begin": (_event: GridEvents["edit-begin"]) => boolean;
    "edit-commit": (_event: GridEvents["edit-commit"]) => boolean;
    search: (_result: GridEvents["search"]) => boolean;
    "active-sheet-change": (_event: GridEvents["active-sheet"]) => boolean;
    ready: (_event: GridReadyEvent) => boolean;
    "initialization-error": (_error: unknown) => boolean;
}>, () => VNode<RendererNode, RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, ComponentOptionsMixin, ComponentOptionsMixin, {
    "grid-change": (_event: ChangeEvent) => boolean;
    "selection-change": (_selection: Selection | null) => boolean;
    "viewport-change": (_event: GridEvents["scroll"]) => boolean;
    "edit-begin": (_event: GridEvents["edit-begin"]) => boolean;
    "edit-commit": (_event: GridEvents["edit-commit"]) => boolean;
    search: (_result: GridEvents["search"]) => boolean;
    "active-sheet-change": (_event: GridEvents["active-sheet"]) => boolean;
    ready: (_event: GridReadyEvent) => boolean;
    "initialization-error": (_error: unknown) => boolean;
}, string, {
    fill: boolean;
    data: ColumnarData;
    height: string | number;
    datasource: DataSource;
    datasourceStorage: DataSourceStorageOptions;
    renderer: "worker" | "canvas" | undefined;
    workerUrl: string | URL | undefined;
    theme: Partial<Theme>;
    readOnly: boolean;
    protectionResolver: ProtectionResolver | undefined;
    mutationPolicy: MutationPolicyMode | undefined;
    renderers: Record<string, CellRenderer>;
    overscan: number;
    minColumns: number;
    config: GridConfig | undefined;
    wasmSource: string | BufferSource | Request | URL | WebAssembly.Module | undefined;
}, {}, string, {}, GlobalComponents, GlobalDirectives, string, ComponentProvideOptions> & VNodeProps & AllowedComponentProps & ComponentCustomProps & (new () => InstanceType<typeof SheetwriteGridComponent> & SheetwriteGridExpose);
```

</details>
