# docs/assets

Binary assets referenced from the README and other markdown files.

## Required

| File | How to regenerate |
|---|---|
| `demo.gif` | `asciinema rec --command "bash scripts/demo.sh" demo.cast` then `agg --speed 1.0 demo.cast docs/assets/demo.gif`. Keep ≤ 4 MB. |

Add new assets by name; do not store generated tarballs / images
larger than 5 MB here (use Releases instead).
