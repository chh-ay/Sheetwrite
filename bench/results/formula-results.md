# Formula engine benchmark

Bun 1.3.14 · linux/x64 · median (p95) ms · raw samples in JSON.

| workload | size | median (p95) ms | samples |
|---|---:|---:|---:|
| independent-parse-load | 1,000 | 2.44 (4.26) | 5 |
| independent-first-recompute | 1,000 | 1.75 (1.94) | 5 |
| independent-parse-load | 10,000 | 11.05 (14.86) | 5 |
| independent-first-recompute | 10,000 | 14.25 (16.51) | 5 |
| independent-parse-load | 100,000 | 75.58 (87.92) | 5 |
| independent-first-recompute | 100,000 | 173 (227) | 5 |
| linear-chain | 8 | 0.013 (0.028) | 5 |
| linear-chain | 16 | 0.025 (0.030) | 5 |
| linear-chain | 32 | 0.046 (0.057) | 5 |
| linear-chain | 64 | 0.073 (0.074) | 5 |
| wide-fan-out-edit | 1,000 | 0.805 (0.991) | 5 |
| wide-fan-out-edit | 100,000 | 136 (146) | 5 |
| diamond-edit | 32 | 0.099 (0.107) | 5 |
| shared-range-edit | 1,000 | 3.02 (3.36) | 5 |
| distinct-range-edit | 1,000 | 0.013 (0.025) | 5 |
| cross-sheet-range-edit | 1,000 | 2.23 (4.02) | 5 |
| scalar-edit-affects-0 | 1,000 | 0.005 (0.008) | 5 |
| scalar-edit-affects-1 | 1 | 0.005 (0.006) | 5 |
| scalar-edit-affects-1000 | 1,000 | 0.636 (1.53) | 5 |
| scalar-edit-affects-100000 | 100,000 | 115 (124) | 5 |
| topology-remove-add | 10,000 | 9.23 (14.96) | 5 |
| cycles | 1,000 | 1.69 (2.40) | 5 |
| removed-sheet-ref | 1,000 | 0.724 (1.03) | 5 |
| error-propagation | 1,000 | 0.946 (1.76) | 5 |
| criteria-range-edit | 100,000 | 5.59 (5.75) | 5 |
| lookup-range-edit | 100,000 | 6.18 (6.71) | 5 |

## Isolated formula memory

| formulas | WASM delta |
|---:|---:|
| 1,000 | 0.88 MiB |
| 10,000 | 7.31 MiB |
| 100,000 | 62.00 MiB |

Gates use broad absolute ceilings (100K parse/recompute/criteria/lookup <5 s; 100K formula memory <256 MiB). Tiny timer-floor workloads are recorded but not ratio-gated.

