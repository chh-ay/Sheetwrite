"use client";

import { initSheetwrite } from "@sheetwrite/core";
import { useEffect, useState } from "react";

export default function Page() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void initSheetwrite().then(() => setReady(true));
  }, []);
  return <output>{ready ? "ready" : "loading"}</output>;
}
