# Formula engine benchmark

Bun 1.3.14 · linux/x64 · median (p95) ms · raw samples in JSON.

| workload | size | median (p95) ms | samples |
|---|---:|---:|---:|
| independent-parse-load | 1,000 | 1.43 (2.64) | 5 |
| independent-first-recompute | 1,000 | 0.928 (1.68) | 5 |
| independent-parse-load | 10,000 | 6.61 (6.82) | 5 |
| independent-first-recompute | 10,000 | 8.65 (10.43) | 5 |
| independent-parse-load | 100,000 | 73.79 (78.18) | 5 |
| independent-first-recompute | 100,000 | 151 (155) | 5 |
| linear-chain | 8 | 0.014 (0.031) | 5 |
| linear-chain | 16 | 0.023 (0.031) | 5 |
| linear-chain | 32 | 0.043 (0.045) | 5 |
| linear-chain | 64 | 0.073 (0.078) | 5 |
| wide-fan-out-edit | 1,000 | 0.693 (0.741) | 5 |
| wide-fan-out-edit | 100,000 | 110 (115) | 5 |
| diamond-edit | 32 | 0.188 (0.217) | 5 |
| shared-range-edit | 1,000 | 3.27 (5.76) | 5 |
| distinct-range-edit | 1,000 | 0.009 (0.014) | 5 |
| cross-sheet-range-edit | 1,000 | 2.13 (2.67) | 5 |
| scalar-edit-affects-0 | 1,000 | 0.003 (0.004) | 5 |
| scalar-edit-affects-1 | 1 | 0.006 (0.007) | 5 |
| scalar-edit-affects-1000 | 1,000 | 0.599 (0.763) | 5 |
| scalar-edit-affects-100000 | 100,000 | 107 (113) | 5 |
| topology-remove-add | 10,000 | 8.94 (9.13) | 5 |
| cycles | 1,000 | 1.47 (1.58) | 5 |
| removed-sheet-ref | 1,000 | 0.574 (1.02) | 5 |
| error-propagation | 1,000 | 1.36 (1.38) | 5 |

## Isolated formula memory

| formulas | WASM delta |
|---:|---:|
| 1,000 | 0.88 MiB |
| 10,000 | 7.13 MiB |
| 100,000 | 59.56 MiB |

Gates use broad absolute ceilings (100K parse/recompute <5 s; 100K formula memory <256 MiB). Tiny timer-floor workloads are recorded but not ratio-gated.

