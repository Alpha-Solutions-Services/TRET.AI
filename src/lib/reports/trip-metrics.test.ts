import { describe, expect, it } from "vitest";
import { centsPerLoadedMile } from "./format";
import { assignLoadRpms, fleetFromTrucks, fleetMpgFromTrucks, loadRpmsAddUp, tripRpmCents, truckMpg } from "./trip-metrics";

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
        delivered: true,
      },
      {
        loadId: "TBH--2",
        rateCents: 40_000,
        loadedMilesHundredths: 2_000,
        deadheadMilesHundredths: 2_000,
        tripRef: "M-1",
        sheetPrimary: false,
        delivered: true,
      },
    ];
    expect(tripRpmCents(loads)).toBe(centsPerLoadedMile(100_000, 10_000));
    expect(loadRpmsAddUp(loads)).toBe(true);
    const parts = assignLoadRpms(loads);
    expect(parts.map((part) => part.rpmCents)).toEqual([600, 400]);
    expect((parts[0]!.rpmCents ?? 0) + (parts[1]!.rpmCents ?? 0)).toBe(tripRpmCents(loads));
  });

  it("leaves MPG blank until the trip delivers", () => {
    const counted = [
      {
        loadId: "TBH--1",
        rateCents: 10_000,
        loadedMilesHundredths: 10_000,
        deadheadMilesHundredths: 0,
        tripRef: "M-1",
        sheetPrimary: true,
        delivered: true,
      },
    ];
    const open = [
      ...counted,
      {
        loadId: "TBH--2",
        rateCents: 0,
        loadedMilesHundredths: 0,
        deadheadMilesHundredths: 0,
        tripRef: "M-1",
        delivered: false,
      },
    ];
    expect(truckMpg(counted, open, 20_000)).toBeNull();
    expect(truckMpg(counted, counted, 20_000)).toBe("5.00");
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
      mpg: truck.mpg,
    }))));
  });

  it("leaves a truck with a blank MPG out of the fleet MPG", () => {
    const fleet = fleetFromTrucks([
      { grossCents: 10_000, totalMilesHundredths: 10_000, mainMilesHundredths: 10_000, gallonsMilli: 5_000_000, mpg: null },
      { grossCents: 10_000, totalMilesHundredths: 10_000, mainMilesHundredths: 4_000, gallonsMilli: 10_000, mpg: "4.00" },
    ]);
    expect(fleet.mpg).toBe("10.00");
  });

  it("weights fleet MPG from sheet labels when gallons were not stored", () => {
    const fleet = fleetFromTrucks([
      { grossCents: 100_000, totalMilesHundredths: 10_000, mainMilesHundredths: 10_000, gallonsMilli: 0, mpg: "5.00" },
      { grossCents: 100_000, totalMilesHundredths: 10_000, mainMilesHundredths: 10_000, gallonsMilli: 0, mpg: "10.00" },
      { grossCents: 100_000, totalMilesHundredths: 50_000, mainMilesHundredths: 50_000, gallonsMilli: 9_000_000, mpg: null },
    ]);
    expect(fleet.mpg).toBe("6.67");
    expect(fleet.rpmCents).toBe(centsPerLoadedMile(300_000, 70_000));
  });
});
