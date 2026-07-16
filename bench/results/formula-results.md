# Formula engine benchmark

Bun 1.3.14 · linux/x64 · median (p95) ms · raw samples in JSON.

| workload | size | median (p95) ms | samples |
|---|---:|---:|---:|
| independent-parse-load | 1,000 | 1.78 (3.76) | 5 |
| independent-first-recompute | 1,000 | 1.14 (1.57) | 5 |
| independent-parse-load | 10,000 | 9.38 (10.58) | 5 |
| independent-first-recompute | 10,000 | 8.37 (9.48) | 5 |
| independent-parse-load | 100,000 | 76.81 (90.96) | 5 |
| independent-first-recompute | 100,000 | 156 (173) | 5 |
| linear-chain | 8 | 0.014 (0.027) | 5 |
| linear-chain | 16 | 0.025 (0.029) | 5 |
| linear-chain | 32 | 0.044 (0.050) | 5 |
| linear-chain | 64 | 0.133 (0.149) | 5 |
| wide-fan-out-edit | 1,000 | 0.789 (0.997) | 5 |
| wide-fan-out-edit | 100,000 | 122 (127) | 5 |
| diamond-edit | 32 | 0.148 (0.176) | 5 |
| shared-range-edit | 1,000 | 3.67 (5.69) | 5 |
| distinct-range-edit | 1,000 | 0.019 (0.026) | 5 |
| cross-sheet-range-edit | 1,000 | 2.32 (2.45) | 5 |
| scalar-edit-affects-0 | 1,000 | 0.004 (0.007) | 5 |
| scalar-edit-affects-1 | 1 | 0.003 (0.006) | 5 |
| scalar-edit-affects-1000 | 1,000 | 0.822 (0.999) | 5 |
| scalar-edit-affects-100000 | 100,000 | 117 (133) | 5 |
| topology-remove-add | 10,000 | 11.72 (13.67) | 5 |
| cycles | 1,000 | 1.50 (1.53) | 5 |
| removed-sheet-ref | 1,000 | 0.585 (0.606) | 5 |
| error-propagation | 1,000 | 0.784 (0.795) | 5 |
| criteria-range-edit | 100,000 | 4.78 (4.91) | 5 |
| lookup-range-edit | 100,000 | 5.11 (5.20) | 5 |

## Isolated formula memory

| formulas | WASM delta |
|---:|---:|
| 1,000 | 0.88 MiB |
| 10,000 | 7.31 MiB |
| 100,000 | 62.00 MiB |

Gates use broad absolute ceilings (100K parse/recompute/criteria/lookup <5 s; 100K formula memory <256 MiB). Tiny timer-floor workloads are recorded but not ratio-gated.

