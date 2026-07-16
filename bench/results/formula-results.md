# Formula engine benchmark

Bun 1.3.14 · linux/x64 · median (p95) ms · raw samples in JSON.

| workload | size | median (p95) ms | samples |
|---|---:|---:|---:|
| independent-parse-load | 1,000 | 2.23 (2.99) | 5 |
| independent-first-recompute | 1,000 | 1.20 (1.90) | 5 |
| independent-parse-load | 10,000 | 7.43 (7.96) | 5 |
| independent-first-recompute | 10,000 | 8.42 (9.61) | 5 |
| independent-parse-load | 100,000 | 86.12 (95.98) | 5 |
| independent-first-recompute | 100,000 | 155 (160) | 5 |
| linear-chain | 8 | 0.016 (0.029) | 5 |
| linear-chain | 16 | 0.046 (0.052) | 5 |
| linear-chain | 32 | 0.071 (0.085) | 5 |
| linear-chain | 64 | 0.073 (0.075) | 5 |
| wide-fan-out-edit | 1,000 | 0.595 (0.622) | 5 |
| wide-fan-out-edit | 100,000 | 115 (116) | 5 |
| diamond-edit | 32 | 0.095 (0.107) | 5 |
| shared-range-edit | 1,000 | 2.99 (4.20) | 5 |
| distinct-range-edit | 1,000 | 0.013 (0.014) | 5 |
| cross-sheet-range-edit | 1,000 | 1.96 (2.26) | 5 |
| scalar-edit-affects-0 | 1,000 | 0.002 (0.003) | 5 |
| scalar-edit-affects-1 | 1 | 0.003 (0.004) | 5 |
| scalar-edit-affects-1000 | 1,000 | 0.594 (0.639) | 5 |
| scalar-edit-affects-100000 | 100,000 | 118 (121) | 5 |
| topology-remove-add | 10,000 | 10.80 (11.22) | 5 |
| cycles | 1,000 | 1.71 (2.25) | 5 |
| removed-sheet-ref | 1,000 | 0.699 (0.711) | 5 |
| error-propagation | 1,000 | 0.930 (0.943) | 5 |
| criteria-range-edit | 100,000 | 5.59 (5.70) | 5 |
| lookup-range-edit | 100,000 | 5.70 (6.09) | 5 |

## Isolated formula memory

| formulas | WASM delta |
|---:|---:|
| 1,000 | 0.88 MiB |
| 10,000 | 7.31 MiB |
| 100,000 | 62.00 MiB |

Gates use broad absolute ceilings (100K parse/recompute/criteria/lookup <5 s; 100K formula memory <256 MiB). Tiny timer-floor workloads are recorded but not ratio-gated.

