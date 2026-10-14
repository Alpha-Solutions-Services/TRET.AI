import { describe, expect, it } from "vitest";
import { centsPerLoadedMile } from "./format";
import { assignLoadRpms, fleetFromTrucks, fleetMpgFromTrucks, tripOpenAtSunday, tripRpmCents, weekMpg, type MetricLoad } from "./trip-metrics";

function loadRpmsAddUp(loads: readonly MetricLoad[]): boolean {
  const trip = tripRpmCents(loads);
  const parts = assignLoadRpms(loads);
  if (trip == null) return parts.every((part) => part.rpmCents == null);
  const sum = parts.reduce((total, part) => total + (part.rpmCents ?? 0), 0);
  return sum === trip;
}

describe("trip RPM and MPG", () => {
  it("divides the rate by loaded plus deadhead and adds per-load RPMs up to the trip", () => {
    const loads = [
      {
        loadId: "TBH--1",
        rateCents: 60_000,
        loadedMilesHundredths: 8_000,
        deadheadMilesHundredths: 2_000,
        tripRef: "M-1",
        sheetPrimary: true,
      },
      {
        loadId: "TBH--2",
        rateCents: 40_000,
        loadedMilesHundredths: 2_000,
        deadheadMilesHundredths: 2_000,
        tripRef: "M-1",
        sheetPrimary: false,
      },
    ];
    expect(tripRpmCents(loads)).toBe(centsPerLoadedMile(100_000, 10_000));
    expect(loadRpmsAddUp(loads)).toBe(true);
    const parts = assignLoadRpms(loads);
    expect(parts.map((part) => part.rpmCents)).toEqual([600, 400]);
    expect((parts[0]!.rpmCents ?? 0) + (parts[1]!.rpmCents ?? 0)).toBe(tripRpmCents(loads));
  });

  it("leaves MPG blank until the trip delivers", () => {
    const open = [
      { tripRef: "M-1", deliveryDay: "2026-10-06" },
      { tripRef: "M-1", deliveryDay: null },
    ];
    const settled = [{ tripRef: "M-1", deliveryDay: "2026-10-06" }];
    expect(
      weekMpg({
        tripOpen: tripOpenAtSunday(open, "2026-10-11"),
        truckMilesHundredths: 10_000,
        dieselGallonsMilli: 20_000,
      }),
    ).toBeNull();
    expect(
      weekMpg({
        tripOpen: tripOpenAtSunday(settled, "2026-10-11"),
        truckMilesHundredths: 10_000,
        dieselGallonsMilli: 20_000,
      }),
    ).toBe("5.00");
  });

  it("builds fleet RPM and MPG from per-truck miles, not loaded miles alone", () => {
    const trucks = [
      { grossCents: 100_000, totalMilesHundredths: 10_000, mainMilesHundredths: 5_000, gallonsMilli: 20_000, mpg: "2.50" },
      { grossCents: 10_000, totalMilesHundredths: 10_000, mainMilesHundredths: 10_000, gallonsMilli: 10_000, mpg: "10.00" },
    ];
    const fleet = fleetFromTrucks(trucks);
    const loadedOnly = centsPerLoadedMile(110_000, 15_000);
    expect(fleet.rpmCents).toBe(centsPerLoadedMile(110_000, 20_000));
    expect(fleet.rpmCents).not.toBe(loadedOnly);
    expect(fleet.mpg).toBe("6.67");
    expect(fleet.mpg).toBe(fleetMpgFromTrucks(trucks.map((truck) => ({
      truckMilesHundredths: truck.totalMilesHundredths,
      gallonsMilli: truck.gallonsMilli,
    }))));
  });

  it("includes a truck with a blank MPG in the fleet miles and gallons", () => {
    const fleet = fleetFromTrucks([
      { grossCents: 10_000, totalMilesHundredths: 1_159_695, mainMilesHundredths: 1_159_695, gallonsMilli: 1_637_860, mpg: null },
    ]);
    expect(fleet.mpg).toBe("7.08");
  });

  it("does not invent gallons from an MPG label", () => {
    const fleet = fleetFromTrucks([
      { grossCents: 100_000, totalMilesHundredths: 10_000, mainMilesHundredths: 10_000, gallonsMilli: 0, mpg: "5.00" },
      { grossCents: 100_000, totalMilesHundredths: 10_000, mainMilesHundredths: 10_000, gallonsMilli: 0, mpg: "10.00" },
      { grossCents: 100_000, totalMilesHundredths: 50_000, mainMilesHundredths: 50_000, gallonsMilli: 9_000_000, mpg: null },
    ]);
    expect(fleet.mpg).toBe("0.08");
    expect(fleet.rpmCents).toBe(centsPerLoadedMile(300_000, 70_000));
  });

  it("counts a shared trip once, and only after every load has delivered by Sunday", () => {
    const settledLoads = [
      { tripRef: "M-8", deliveryDay: "2026-10-07" },
      { tripRef: "M-8", deliveryDay: "2026-10-09" },
    ];
    expect(tripOpenAtSunday(settledLoads, "2026-10-11")).toBe(false);
    expect(
      weekMpg({
        tripOpen: false,
        truckMilesHundredths: 265_000,
        dieselGallonsMilli: 269_857,
        sheetMpg: "7.04",
      }),
    ).toBe("9.82");
    const openLoads = [
      { tripRef: "M-6", deliveryDay: "2026-10-06" },
      { tripRef: "M-6", deliveryDay: "2026-10-12" },
    ];
    expect(tripOpenAtSunday(openLoads, "2026-10-11")).toBe(true);
    expect(
      weekMpg({
        tripOpen: true,
        truckMilesHundredths: 69_880,
        dieselGallonsMilli: 83_616,
        sheetMpg: null,
      }),
    ).toBeNull();
    const sheetLoads = [
      { tripRef: "M-7", deliveryDay: "2026-10-08" },
      { tripRef: "M-7", deliveryDay: "2026-10-12" },
    ];
    expect(tripOpenAtSunday(sheetLoads, "2026-10-11")).toBe(true);
    expect(
      weekMpg({
        tripOpen: true,
        truckMilesHundredths: 130_076,
        dieselGallonsMilli: 158_818,
        sheetMpg: "7.42",
      }),
    ).toBe("7.42");
  });

  it("does not read today's date when deciding if a trip counts", () => {
    const openSource = tripOpenAtSunday.toString();
    const mpgSource = weekMpg.toString();
    expect(openSource).not.toContain("new Date");
    expect(openSource).not.toContain("Date.now");
    expect(mpgSource).not.toContain("new Date");
    expect(mpgSource).not.toContain("Date.now");
    const loads = [
      { tripRef: "M-3", deliveryDay: "2026-10-06" },
      { tripRef: "M-3", deliveryDay: "2026-10-11" },
    ];
    const input = {
      tripOpen: tripOpenAtSunday(loads, "2026-10-11"),
      truckMilesHundredths: 285_200,
      dieselGallonsMilli: 388_027,
      sheetMpg: "7.16",
    };
    expect(input.tripOpen).toBe(false);
    expect(weekMpg(input)).toBe("7.35");
    expect(weekMpg({ ...input, dieselGallonsMilli: 388_027 + 10_297 })).not.toBe("7.35");
  });
});
