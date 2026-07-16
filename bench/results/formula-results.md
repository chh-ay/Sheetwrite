# Formula engine benchmark

Bun 1.3.14 · linux/x64 · median (p95) ms · raw samples in JSON.

| workload | size | median (p95) ms | samples |
|---|---:|---:|---:|
| independent-parse-load | 1,000 | 2.55 (4.81) | 5 |
| independent-first-recompute | 1,000 | 1.12 (2.06) | 5 |
| independent-parse-load | 10,000 | 7.76 (8.42) | 5 |
| independent-first-recompute | 10,000 | 12.53 (13.99) | 5 |
| independent-parse-load | 100,000 | 87.57 (89.60) | 5 |
| independent-first-recompute | 100,000 | 168 (176) | 5 |
| linear-chain | 8 | 0.013 (0.024) | 5 |
| linear-chain | 16 | 0.022 (0.031) | 5 |
| linear-chain | 32 | 0.039 (0.050) | 5 |
| linear-chain | 64 | 0.111 (0.150) | 5 |
| wide-fan-out-edit | 1,000 | 0.585 (0.593) | 5 |
| wide-fan-out-edit | 100,000 | 113 (127) | 5 |
| diamond-edit | 32 | 0.089 (0.101) | 5 |
| shared-range-edit | 1,000 | 3.25 (3.38) | 5 |
| distinct-range-edit | 1,000 | 0.012 (0.019) | 5 |
| cross-sheet-range-edit | 1,000 | 2.00 (2.27) | 5 |
| scalar-edit-affects-0 | 1,000 | 0.002 (0.003) | 5 |
| scalar-edit-affects-1 | 1 | 0.005 (0.007) | 5 |
| scalar-edit-affects-1000 | 1,000 | 0.684 (0.850) | 5 |
| scalar-edit-affects-100000 | 100,000 | 123 (128) | 5 |
| topology-remove-add | 10,000 | 11.60 (12.52) | 5 |
| cycles | 1,000 | 1.94 (2.12) | 5 |
| removed-sheet-ref | 1,000 | 0.599 (0.894) | 5 |
| error-propagation | 1,000 | 0.914 (1.30) | 5 |
| criteria-range-edit | 100,000 | 5.05 (5.35) | 5 |
| lookup-range-edit | 100,000 | 5.93 (7.53) | 5 |

## Isolated formula memory

| formulas | WASM delta |
|---:|---:|
| 1,000 | 0.88 MiB |
| 10,000 | 7.31 MiB |
| 100,000 | 62.00 MiB |

Gates use broad absolute ceilings (100K parse/recompute/criteria/lookup <5 s; 100K formula memory <256 MiB). Tiny timer-floor workloads are recorded but not ratio-gated.

