import { createFileRoute } from "@tanstack/react-router";
import { ShowcasePage } from "../showcases/ShowcasePage.js";
import VanillaShowcase from "../showcases/VanillaShowcase.js";

const description =
  "Mount the framework-neutral core, then compose toolbar, formula bar, policy controls, and exports around one live Grid handle.";

export const Route = createFileRoute("/vanilla")({
  head: () => ({
    meta: [
      { title: "Vanilla imperative workbook — Sheetwrite" },
      { name: "description", content: description },
    ],
  }),
  component: VanillaShowcaseRoute,
});

function VanillaShowcaseRoute() {
  return (
    <ShowcasePage
      active="vanilla"
      description={description}
      eyebrow="VANILLA / IMPERATIVE WORKBOOK"
      guide="/docs/frameworks/vanilla/"
      packageName="@sheetwrite/core"
      proof={[
        {
          title: "One mount call",
          detail: "createSpreadsheetShell owns one Grid and all disposable chrome.",
        },
        {
          title: "Real commands",
          detail: "Search, sorting, export, and editing policy call the live Grid handle.",
        },
        {
          title: "Headless ownership",
          detail: "The host owns lifecycle, events, theme, and document state.",
        },
        {
          title: "No imitation menus",
          detail: "Every visible control has a wired product behavior.",
        },
      ]}
      prompt="Jump to B2 in the name box, enter a value in the formula bar, then undo the change."
      sourcePath="docs/src/showcases/VanillaShowcase.tsx"
      title="Own the workbook shell your product needs."
    >
      <VanillaShowcase />
    </ShowcasePage>
  );
}
