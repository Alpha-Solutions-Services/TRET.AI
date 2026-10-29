/**
 * TBH--1201 from Truck #08 Load Ledger row 11, the only row for that load.
 * Legacy Inc Accounting, live T8 sheet read-only export, 10/29 12:21 PM PDT.
 * Pickup is A11. Delivery is B11. Week is C11. The TONU amount is Q11 and BB11.
 * The owner confirmed it on 10/14/2026 (AR11).
 * Older fixtures used 10/09 as the delivery date. That cell is the pickup.
 */
export const TBH_1201 = {
  loadId: "TBH--1201",
  pickupDay: "2026-10-09",
  deliveryDay: "2026-10-12",
  pickupSheet: "10/09/2026",
  deliverySheet: "10/12/2026",
  /** Week 42 Monday. */
  weekStart: "2026-10-12",
  weekEnd: "2026-10-18",
  rateCents: 25_000,
  tollCents: 5_000,
  deadheadHundredths: 1_000,
} as const;
