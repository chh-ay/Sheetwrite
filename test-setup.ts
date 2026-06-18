// Registers a DOM (happy-dom) for tests that mount the grid. Node-only logic
// tests ignore the extra globals.
import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (typeof document === "undefined") {
  GlobalRegistrator.register();
}
