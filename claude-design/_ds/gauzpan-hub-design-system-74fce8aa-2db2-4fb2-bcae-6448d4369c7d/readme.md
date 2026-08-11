# Gauzpan Hub Design System

## What this is, and an important caveat

This project was seeded from one repo: **[gauzpan/agent-management-portal](https://github.com/gauzpan/agent-management-portal)**. Explore it further yourself for a deeper build — the repo contains almost no code: `.gitignore`, `LICENSE`, and a single file, **`design-sh.md`**, which is a *design-language analysis document* — not the actual Gauzpan Hub product source, screens, logo, or component code. That document analyzes a brand it calls "Superh" (an editorial dark-hero / white-body / teal-CTA marketing aesthetic) and expresses it as tokens and component specs.

There is no Gauzpan Hub logo, no Gauzpan Hub screenshots, no Gauzpan Hub codebase in the repo. Everything visual in this design system — colors, type scale, spacing, component shapes — is lifted directly from `design-sh.md`'s token/component spec, and the "Gauzpan Hub" name is applied on top of it as a wordmark only. **Treat the visual identity here as a placeholder inspired by that analysis, not as Gauzpan Hub's real brand**, until real brand assets (logo, product screens, an actual codebase or Figma) are attached.

The one product surface referenced anywhere is the repo's own name — "agent management portal" — so the UI kit in this project is a *composition* of the design tokens/components into typical agent-portal screens (login, dashboard, agent detail, settings). It is not a recreation of any real Gauzpan Hub screen, because none was provided.

## Components

- **Button** (`components/buttons/`) — `primary-dark`, `secondary-outline`, `on-dark-pill` (hero only), `on-teal`
- **TextInput** (`components/forms/`) — standard form field
- **Card** (`components/cards/`) — `feature-light`, `pricing`, `pricing-featured`, `teal-band`, `feature-row`
- **NavBar** (`components/navigation/`) — `dark` (hero) / `light` (body) top nav
- **PillTab** (`components/navigation/`) — feature-category pill selector
- **Link** (`components/navigation/`) — underlined inline link
- **Footer** (`components/layout/`) — 4-column site footer

This is the full inventory `design-sh.md` defines. No components beyond it were invented.

## Content fundamentals

`design-sh.md` is a visual spec, not a copy deck, so tone is inferred narrowly from its own prose and component naming:
- Headlines are short, declarative, one idea per band ("Ready to get started?"). Never a long headline.
- Single CTA language per band — never "Sign up" and "Learn more" competing for attention in the hero.
- No emoji anywhere in the spec or its examples.
- The spec's own voice is precise and technical/editorial ("a soft indigo-to-violet-to-sky-blue radial wash") — treat marketing copy the same way: specific, unhurried, no hype adjectives.

## Visual foundations

**Three-canvas system.** Every page rotates through exactly three surfaces: Australian green `#00843d` (hero), white `#ffffff` (body), flag blue `#00247d` (closing CTA band). No fourth accent color.

**Color.** Ink text is warm dark grey `#292827`, never pure black. Gold `#ffcd00` is reserved for the hero's pill CTA only. Body surfaces alternate white and a barely-warm off-white `#fafaf8` for feature rows. *(Palette recolored to Australia's national colours — green, gold, flag blue — replacing the original indigo/violet/teal from the source spec.)*

**Type.** A single variable sans (spec calls it "Super Sans VF"; substituted with Inter Variable — see Fonts below) at unusual sub-default weights: 460, 540, 600 — never plain 400/500/700. Display sizes carry negative tracking (-1.32px at 48px) and unusually tight line-height (0.96) — an editorial compression rather than airy SaaS type.

**Spacing.** 8px base unit (2/4/12px sub-tokens). Section padding runs 64–96px; the closing teal band alone stretches to 96–128px — the brand's signature "editorial slowness."

**Backgrounds.** The hero is the only place with imagery: a half-bleed portrait subject (person at twilight, looking off-frame) over a soft indigo→violet→sky-blue radial atmospheric wash. No patterns, no textures, no gradients elsewhere. The body is flat white/off-white.

**Animation.** No animation guidance exists in the source; none is prescribed here. Keep transitions to simple opacity/color fades under 150ms if any are needed (see Button component's press-state fade) — don't invent bounce or spring easing the source doesn't describe.

**Hover / press states.** Hover states aren't specified; press state is: `button-primary-dark` shifts to a deeper navy (`#0e0c1f`) — a straightforward darken, not a shrink or shadow change.

**Borders & shadows.** 1px hairline borders (`#e8e4dd` light surfaces, `#3f3a52` dark) on cards and inputs. Shadow use is minimal: `shadow-1` (0 1px 3px) for card lift, `shadow-2` (0 8px 24px) for floating panels/modals — the white body is otherwise flat.

**Corner radii.** Buttons are the signature shape: 8px rounded rectangles everywhere *except* the hero, where the CTA is pill-shaped (`radius-full`) — the ONLY place a pill button appears. Cards use 12px, modals 16px, tags 4px.

**Cards.** Flat white background, 1px hairline border, 12px radius, no drop shadow by default (shadow reserved for floating/modal contexts) — the featured pricing tier inverts to solid indigo instead of adding elevation.

**Imagery color vibe.** Cool, twilight, slightly desaturated — implied by "indigo navy" + "violet-sky" + "portrait subject at twilight." No warm/grainy/black-and-white treatment is described.

**Transparency/blur.** Not used in the source spec — surfaces are flat opaque color; the only "atmosphere" is the hero's gradient wash, not blur.

## Iconography

**No icon system, icon font, or icon assets exist anywhere in the source repo.** `design-sh.md` doesn't mention icons at all. Per design-system policy, no icons were drawn or fabricated. The UI kit avoids icons entirely (text-only nav labels) rather than inventing a fake icon language. If Gauzpan Hub uses an icon set (Lucide, Heroicons, a proprietary sprite, etc.), attach it and this system will adopt it directly instead of substituting.

## Fonts

The spec names a proprietary variable sans, **"Super Sans VF,"** which isn't available to this project. **Substituted with Inter Variable** (loaded from Google Fonts in `tokens/fonts.css`), used at the spec's own recommended sub-default weight settings (460/540/600) rather than default 400/500/700. **This is a placeholder — please attach the real Super Sans VF webfont files** (or confirm Inter as the permanent choice) so this can be corrected.

## Sources

- GitHub: [gauzpan/agent-management-portal](https://github.com/gauzpan/agent-management-portal) — `design-sh.md` (token/component spec; no code, logo, or screens found). Explore this repo further yourself — a maintained, fuller version may exist beyond what this pass found.

## Index

- `styles.css` — root stylesheet, imports everything under `tokens/`
- `tokens/` — colors, typography, spacing, radius, shadows, fonts (CSS custom properties)
- `components/` — `buttons/Button`, `forms/TextInput`, `cards/Card`, `navigation/NavBar`, `navigation/PillTab`, `navigation/Link`, `layout/Footer`
- `guidelines/` — foundation specimen cards (colors, type, spacing, shape, hero atmosphere)
- `ui_kits/agent-management-portal/` — composed portal screens (login, dashboard, agent detail, settings)
- `assets/` — empty; no logo or imagery was provided (see caveat above)
- `SKILL.md` — Claude Code / Agent Skills–compatible version of this system
- `github.md` — source repo sync record
