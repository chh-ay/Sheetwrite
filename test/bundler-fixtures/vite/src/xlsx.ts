const button = document.querySelector<HTMLButtonElement>("#load-xlsx");
if (!button) throw new Error("missing XLSX loader button");
button.addEventListener("click", async () => {
  const backend = await import("@sheetwrite/xlsx");
  button.dataset.ready = String(typeof backend.registerXlsxBackends === "function");
});
