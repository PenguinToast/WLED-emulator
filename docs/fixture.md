# Fixture Model

The emulator models the LED hardware as seven daisy-chained rings. The physical wiring is one continuous LED strip, but WLED sees each ring as its own segment.

| Segment | Name | Start | Stop | LEDs |
| --- | --- | ---: | ---: | ---: |
| 0 | Center | 0 | 1 | 1 |
| 1 | Ring 1 | 1 | 9 | 8 |
| 2 | Ring 2 | 9 | 21 | 12 |
| 3 | Ring 3 | 21 | 37 | 16 |
| 4 | Ring 4 | 37 | 61 | 24 |
| 5 | Ring 5 | 61 | 93 | 32 |
| 6 | Ring 6 | 93 | 133 | 40 |

Total LED count: 133.

The authoritative fixture constants live in `src/server/fixture.mjs`. Browser rendering uses `state.seg` from the WLED JSON state, so changing the server fixture changes the visible emulator layout without duplicating ring counts in the browser.

## Segment Defaults

Every ring segment starts selected, enabled, and set to WLED mode `9` (`Rainbow`) with palette `1` (`Aurora`). WLED UI updates can address a specific segment by `id`, or apply a segment object to all currently selected segments.

