---
"@sheetwrite/core": patch
---

Fall back observably to the main-thread renderer when a paint worker cannot initialize, cannot create a 2D context, or loses its context. The public worker acknowledgement type now includes `ready` and `fatal` lifecycle messages.
