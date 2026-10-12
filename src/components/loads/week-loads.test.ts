import { describe, expect, it } from "vitest";
import { weekLoadRows, type LoadListRow } from "@/components/loads/loads-client";

function row(partial: Partial<LoadListRow> & Pick<LoadListRow, "id" | "load_id" | "delivery_date">): LoadListRow {
  return {
    manifest_friendly_id: null,
    week_start: "2026-10-05",
    pickup_date: null,
    driver_name: null,
    broker_name: null,
    origin_city: null,
    origin_state: null,
    destination_city: null,
    destination_state: null,
    loaded_distance_mi: null,
    deadhead_miles: null,
    rate_cents: 0,
    truck_unit_number: "8",
    status: "Delivered",
    ...partial,
  };
}

describe("loads week list", () => {
  it("uses the sheet rows, including pending and TONU, and does not keep a database delivery date", () => {
    const sheet = [
      row({ id: "sheet:6:TBH--1178", load_id: "TBH--1178", delivery_date: "2026-10-06", status: "Delivered", truck_unit_number: "6" }),
      row({ id: "sheet:6:TBH--1181", load_id: "TBH--1181", delivery_date: "2026-10-12", status: "Pending", truck_unit_number: "6" }),
      row({ id: "sheet:6:TBH--1191", load_id: "TBH--1191", delivery_date: "2026-10-12", status: "Pending", truck_unit_number: "6" }),
      row({ id: "sheet:8:TBH--1173", load_id: "TBH--1173", delivery_date: "2026-10-07", status: "Delivered" }),
      row({ id: "sheet:8:TBH--1180", load_id: "TBH--1180", delivery_date: "2026-10-08", status: "Delivered" }),
      row({ id: "sheet:7:TBH--1179", load_id: "TBH--1179", delivery_date: "2026-10-08", status: "Delivered", truck_unit_number: "7" }),
      row({ id: "sheet:7:TBH--1199", load_id: "TBH--1199", delivery_date: "2026-10-09", status: "Delivered", truck_unit_number: "7" }),
      row({ id: "sheet:8:TBH--1201", load_id: "TBH--1201", delivery_date: "2026-10-09", status: "TONU" }),
    ];
    const db = [
      row({
        id: "db-1181",
        load_id: "TBH--1181",
        delivery_date: "2026-10-07",
        status: "Delivered",
        broker_name: "Stored Broker",
        truck_unit_number: "6",
      }),
      row({ id: "db-only", load_id: "TBH--9999", delivery_date: "2026-10-07", status: "Delivered" }),
    ];
    const shown = weekLoadRows(sheet, db);
    expect(shown.map((item) => item.load_id)).toEqual([
      "TBH--1178",
      "TBH--1181",
      "TBH--1191",
      "TBH--1173",
      "TBH--1180",
      "TBH--1179",
      "TBH--1199",
      "TBH--1201",
    ]);
    expect(shown.find((item) => item.load_id === "TBH--1181")).toMatchObject({
      delivery_date: "2026-10-12",
      status: "Pending",
      broker_name: "Stored Broker",
    });
    expect(shown.find((item) => item.load_id === "TBH--1191")?.status).toBe("Pending");
    expect(shown.find((item) => item.load_id === "TBH--1201")?.status).toBe("TONU");
    expect(shown.some((item) => item.load_id === "TBH--9999")).toBe(false);
    expect(shown.filter((item) => item.status === "Delivered")).toHaveLength(5);
  });
});
