# Formula engine benchmark

Bun 1.3.14 · linux/x64 · median (p95) ms · raw samples in JSON.

| workload | size | median (p95) ms | samples |
|---|---:|---:|---:|
| independent-parse-load | 1,000 | 2.89 (3.23) | 5 |
| independent-first-recompute | 1,000 | 2.21 (3.01) | 5 |
| independent-parse-load | 10,000 | 10.05 (12.91) | 5 |
| independent-first-recompute | 10,000 | 10.59 (11.37) | 5 |
| independent-parse-load | 100,000 | 91.92 (105) | 5 |
| independent-first-recompute | 100,000 | 161 (165) | 5 |
| linear-chain | 8 | 0.024 (0.030) | 5 |
| linear-chain | 16 | 0.038 (0.043) | 5 |
| linear-chain | 32 | 0.063 (0.072) | 5 |
| linear-chain | 64 | 0.109 (0.115) | 5 |
| wide-fan-out-edit | 1,000 | 0.675 (0.953) | 5 |
| wide-fan-out-edit | 100,000 | 115 (116) | 5 |
| diamond-edit | 32 | 0.117 (0.126) | 5 |
| shared-range-edit | 1,000 | 3.10 (3.58) | 5 |
| distinct-range-edit | 1,000 | 0.015 (0.020) | 5 |
| cross-sheet-range-edit | 1,000 | 1.97 (2.11) | 5 |
| scalar-edit-affects-0 | 1,000 | 0.003 (0.003) | 5 |
| scalar-edit-affects-1 | 1 | 0.004 (0.004) | 5 |
| scalar-edit-affects-1000 | 1,000 | 0.567 (0.590) | 5 |
| scalar-edit-affects-100000 | 100,000 | 110 (117) | 5 |
| topology-remove-add | 10,000 | 11.44 (11.68) | 5 |
| cycles | 1,000 | 1.95 (3.42) | 5 |
| removed-sheet-ref | 1,000 | 0.647 (0.945) | 5 |
| error-propagation | 1,000 | 0.803 (0.864) | 5 |
| criteria-range-edit | 100,000 | 4.76 (4.91) | 5 |
| lookup-range-edit | 100,000 | 5.18 (6.30) | 5 |

## Isolated formula memory

| formulas | WASM delta |
|---:|---:|
| 1,000 | 0.88 MiB |
| 10,000 | 7.31 MiB |
| 100,000 | 62.00 MiB |

Gates use broad absolute ceilings (100K parse/recompute/criteria/lookup <5 s; 100K formula memory <256 MiB). Tiny timer-floor workloads are recorded but not ratio-gated.

