# 0004: Energy is stored as whole hundredths

- Date: 2026-10-25
- Status: Accepted
- Issue: #58

## Context

Each user has an energy balance for the free models. A price can be part of one energy, such as
0.45 energy. A floating-point sum of many small prices gives a wrong balance after some time.

## Decision

- The database and the code keep each energy value as an integer of hundredths. 0.5 energy is `50`.
- Only the API edge (the zod schemas in `packages/shared/src/energy`) and the display use decimals.
- 1 energy is $0.01, so 1 hundredth is $0.0001.
- A price is `ceil(cost × (1 + markup / 100) / 0.0001)` hundredths, with a small tolerance for
  floating-point noise (`45.00000000000001` is `45`).

## Other options

- **A float column:** small errors add up in the balance.
- **A decimal column (`Decimal`):** correct, but Prisma gives a `Decimal` object, and each sum in the
  code needs a decimal library.

## Result

- Each sum and each compare is integer math, so it is exact.
- Code that shows energy must divide by 100. The shared helper `toEnergy()` does this.
