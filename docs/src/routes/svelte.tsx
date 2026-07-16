import { createFileRoute } from "@tanstack/react-router";
import { SvelteShowcaseIsland } from "../showcases/AdapterIslands.js";
import { ShowcasePage } from "../showcases/ShowcasePage.js";

const description =
  "Edit 500 live formulas, move between model and summary sheets, and inspect committed transactions through a bound Grid handle.";

export const Route = createFileRoute("/svelte")({
  head: () => ({
    meta: [
      { title: "Svelte formula workbook — Sheetwrite" },
      { name: "description", content: description },
    ],
  }),
  component: SvelteShowcaseRoute,
});

function SvelteShowcaseRoute() {
  return (
    <ShowcasePage
      active="svelte"
      description={description}
      eyebrow="SVELTE / FORMULA MODEL"
      guide="/docs/frameworks/svelte/"
      packageName="@sheetwrite/svelte"
      proof={[
        {
          title: "Formula graph",
          detail: "Dependencies recalculate inside the workbook engine.",
        },
        {
          title: "Workbook operations",
          detail: "Selection, edits, merges, and sheets use the Grid API.",
        },
        {
          title: "Svelte events",
          detail: "Committed transactions arrive through adapter callbacks.",
        },
        {
          title: "Canvas surface",
          detail: "The hot path stays off the component and DOM trees.",
        },
      ]}
      prompt="Select F1, change a quarter value, then open Summary and watch the cross-sheet total recalculate."
      sourcePath="docs/src/showcases/SvelteShowcase.svelte"
      title="A live formula model, composed the Svelte way."
    >
      <SvelteShowcaseIsland />
    </ShowcasePage>
  );
}
