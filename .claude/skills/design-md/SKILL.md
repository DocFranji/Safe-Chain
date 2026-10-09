---
name: design-md
description: Create, update, lint and apply a DESIGN.md, Google's open format that describes a visual identity to coding agents (YAML design tokens + markdown rationale). Use before UI work in this repo, when asked for a design system, brand tokens, theme or DESIGN.md, or when picking a visual direction and wanting real product design systems as reference.
---

# DESIGN.md

DESIGN.md is an open format from Google Stitch for telling coding agents how a product should look. One file at the repo root combines exact design tokens (YAML front matter) with the reasoning behind them (markdown prose).

## Before any UI work

1. If `DESIGN.md` exists at the repo root, read it first and follow its tokens and rules. Do not invent colors, fonts, radii or spacing outside it.
2. If the project has a Figma file and the Figma MCP is available, check that the DESIGN.md tokens match the Figma variables (`get_variable_defs`). Report mismatches instead of silently picking one.

## Creating or updating DESIGN.md

1. Read the spec: [references/spec.md](references/spec.md).
2. Look at Google's complete examples in [references/examples/](references/examples/) to see the expected structure.
3. For visual direction, browse real product design systems in [references/brands/](references/brands/) (74 files, one per product: linear.app, stripe, vercel, notion, revolut, wise, coinbase, kraken, supabase, and more). Use them as inspiration for structure, scales and rationale. Never copy a brand's identity wholesale: this product keeps its own name, colors and voice.
4. Write tokens first (color, typography, spacing, radius, elevation, motion), then the prose explaining when and why to use each.

## Validate and export

Run from the repo root (needs Node):

```bash
npx @google/design.md lint DESIGN.md                     # spec errors, broken token refs, WCAG contrast
npx @google/design.md diff DESIGN.md DESIGN-v2.md        # compare two versions
npx @google/design.md export --format css-tailwind DESIGN.md > theme.css
npx @google/design.md export --format json-tailwind DESIGN.md > tailwind.theme.json
npx @google/design.md export --format dtcg DESIGN.md > tokens.json
```

If `npx @google/design.md` fails to resolve, use the dot-free alias: `npx -p @google/design.md designmd lint DESIGN.md`.

Fix every lint error before finishing. Contrast warnings on text are errors for this project.

## Sources

- Spec and examples: google-labs-code/design.md (Apache 2.0)
- Brand references: VoltAgent/awesome-design-md (MIT)
