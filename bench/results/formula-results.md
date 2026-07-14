# Formula engine benchmark

Bun 1.3.14 · linux/x64 · median (p95) ms · raw samples in JSON.

| workload | size | median (p95) ms | samples |
|---|---:|---:|---:|
| independent-parse-load | 1,000 | 1.50 (3.33) | 5 |
| independent-first-recompute | 1,000 | 1.10 (1.79) | 5 |
| independent-parse-load | 10,000 | 7.87 (9.80) | 5 |
| independent-first-recompute | 10,000 | 9.51 (11.39) | 5 |
| independent-parse-load | 100,000 | 87.17 (90.58) | 5 |
| independent-first-recompute | 100,000 | 155 (163) | 5 |
| linear-chain | 8 | 0.020 (0.035) | 5 |
| linear-chain | 16 | 0.026 (0.032) | 5 |
| linear-chain | 32 | 0.044 (0.047) | 5 |
| linear-chain | 64 | 0.070 (0.073) | 5 |
| wide-fan-out-edit | 1,000 | 0.640 (0.751) | 5 |
| wide-fan-out-edit | 100,000 | 116 (118) | 5 |
| diamond-edit | 32 | 0.102 (0.239) | 5 |
| shared-range-edit | 1,000 | 3.34 (5.34) | 5 |
| distinct-range-edit | 1,000 | 0.014 (0.024) | 5 |
| cross-sheet-range-edit | 1,000 | 2.02 (2.19) | 5 |
| scalar-edit-affects-0 | 1,000 | 0.003 (0.004) | 5 |
| scalar-edit-affects-1 | 1 | 0.004 (0.007) | 5 |
| scalar-edit-affects-1000 | 1,000 | 0.832 (0.964) | 5 |
| scalar-edit-affects-100000 | 100,000 | 114 (118) | 5 |
| topology-remove-add | 10,000 | 11.11 (11.41) | 5 |
| cycles | 1,000 | 1.84 (2.07) | 5 |
| removed-sheet-ref | 1,000 | 0.690 (0.733) | 5 |
| error-propagation | 1,000 | 0.979 (0.989) | 5 |
| criteria-range-edit | 100,000 | 4.83 (5.63) | 5 |
| lookup-range-edit | 100,000 | 5.15 (5.92) | 5 |

## Isolated formula memory

| formulas | WASM delta |
|---:|---:|
| 1,000 | 0.88 MiB |
| 10,000 | 7.31 MiB |
| 100,000 | 62.00 MiB |

Gates use broad absolute ceilings (100K parse/recompute/criteria/lookup <5 s; 100K formula memory <256 MiB). Tiny timer-floor workloads are recorded but not ratio-gated.

