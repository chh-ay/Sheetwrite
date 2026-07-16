# Formula engine benchmark

Bun 1.3.14 · linux/x64 · median (p95) ms · raw samples in JSON.

| workload | size | median (p95) ms | samples |
|---|---:|---:|---:|
| independent-parse-load | 1,000 | 1.71 (1.98) | 5 |
| independent-first-recompute | 1,000 | 1.14 (2.05) | 5 |
| independent-parse-load | 10,000 | 9.50 (11.12) | 5 |
| independent-first-recompute | 10,000 | 10.41 (10.81) | 5 |
| independent-parse-load | 100,000 | 86.87 (96.54) | 5 |
| independent-first-recompute | 100,000 | 162 (175) | 5 |
| linear-chain | 8 | 0.022 (0.027) | 5 |
| linear-chain | 16 | 0.036 (0.043) | 5 |
| linear-chain | 32 | 0.053 (0.074) | 5 |
| linear-chain | 64 | 0.070 (0.074) | 5 |
| wide-fan-out-edit | 1,000 | 0.600 (0.619) | 5 |
| wide-fan-out-edit | 100,000 | 118 (124) | 5 |
| diamond-edit | 32 | 0.099 (0.104) | 5 |
| shared-range-edit | 1,000 | 3.38 (4.66) | 5 |
| distinct-range-edit | 1,000 | 0.010 (0.015) | 5 |
| cross-sheet-range-edit | 1,000 | 2.11 (2.37) | 5 |
| scalar-edit-affects-0 | 1,000 | 0.003 (0.004) | 5 |
| scalar-edit-affects-1 | 1 | 0.005 (0.019) | 5 |
| scalar-edit-affects-1000 | 1,000 | 0.820 (1.81) | 5 |
| scalar-edit-affects-100000 | 100,000 | 119 (128) | 5 |
| topology-remove-add | 10,000 | 10.29 (11.18) | 5 |
| cycles | 1,000 | 1.61 (1.96) | 5 |
| removed-sheet-ref | 1,000 | 0.734 (0.976) | 5 |
| error-propagation | 1,000 | 1.04 (1.14) | 5 |
| criteria-range-edit | 100,000 | 6.18 (6.33) | 5 |
| lookup-range-edit | 100,000 | 6.24 (6.56) | 5 |

## Isolated formula memory

| formulas | WASM delta |
|---:|---:|
| 1,000 | 0.88 MiB |
| 10,000 | 7.31 MiB |
| 100,000 | 62.00 MiB |

Gates use broad absolute ceilings (100K parse/recompute/criteria/lookup <5 s; 100K formula memory <256 MiB). Tiny timer-floor workloads are recorded but not ratio-gated.

