# Formula engine benchmark

Bun 1.3.14 · linux/x64 · median (p95) ms · raw samples in JSON.

| workload | size | median (p95) ms | samples |
|---|---:|---:|---:|
| independent-parse-load | 1,000 | 2.45 (2.69) | 5 |
| independent-first-recompute | 1,000 | 2.03 (2.41) | 5 |
| independent-parse-load | 10,000 | 9.40 (12.88) | 5 |
| independent-first-recompute | 10,000 | 10.14 (13.47) | 5 |
| independent-parse-load | 100,000 | 100 (122) | 5 |
| independent-first-recompute | 100,000 | 225 (235) | 5 |
| linear-chain | 8 | 0.023 (0.041) | 5 |
| linear-chain | 16 | 0.037 (0.042) | 5 |
| linear-chain | 32 | 0.065 (0.068) | 5 |
| linear-chain | 64 | 0.070 (0.074) | 5 |
| wide-fan-out-edit | 1,000 | 0.572 (0.604) | 5 |
| wide-fan-out-edit | 100,000 | 139 (157) | 5 |
| diamond-edit | 32 | 0.110 (0.126) | 5 |
| shared-range-edit | 1,000 | 3.72 (3.82) | 5 |
| distinct-range-edit | 1,000 | 0.011 (0.018) | 5 |
| cross-sheet-range-edit | 1,000 | 2.25 (3.07) | 5 |
| scalar-edit-affects-0 | 1,000 | 0.003 (0.008) | 5 |
| scalar-edit-affects-1 | 1 | 0.005 (0.014) | 5 |
| scalar-edit-affects-1000 | 1,000 | 0.749 (0.788) | 5 |
| scalar-edit-affects-100000 | 100,000 | 143 (177) | 5 |
| topology-remove-add | 10,000 | 14.25 (15.03) | 5 |
| cycles | 1,000 | 2.09 (2.16) | 5 |
| removed-sheet-ref | 1,000 | 0.704 (0.743) | 5 |
| error-propagation | 1,000 | 0.909 (0.962) | 5 |
| criteria-range-edit | 100,000 | 5.73 (7.33) | 5 |
| lookup-range-edit | 100,000 | 7.12 (9.78) | 5 |

## Isolated formula memory

| formulas | WASM delta |
|---:|---:|
| 1,000 | 0.88 MiB |
| 10,000 | 7.31 MiB |
| 100,000 | 62.00 MiB |

Gates use broad absolute ceilings (100K parse/recompute/criteria/lookup <5 s; 100K formula memory <256 MiB). Tiny timer-floor workloads are recorded but not ratio-gated.

