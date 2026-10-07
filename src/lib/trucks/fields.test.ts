import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GoogleSheetLink } from "@/components/trucks/google-sheet-link";
import { TruckFieldsForm } from "@/components/trucks/truck-fields-form";
import {
  googleSheetHref,
  isMissingGoogleSheetColumn,
  parseTruckFields,
} from "./fields";

const SHEET = "https://docs.google.com/spreadsheets/d/abc123/edit?usp=sharing";

function input(overrides: Partial<Parameters<typeof parseTruckFields>[0]> = {}) {
  return {
    unitNumber: "02",
    name: "Blue",
    truckClass: "third_party",
    ownerName: "Ada",
    googleSheetUrl: "",
    ...overrides,
  };
}

describe("parseTruckFields", () => {
  it("trims fields and stores a blank owner and sheet as empty", () => {
    const result = parseTruckFields(
      input({
        unitNumber: " 02 ",
        name: " Blue ",
        ownerName: "   ",
        googleSheetUrl: "  ",
      }),
    );
    expect(result).toEqual({
      ok: true,
      value: {
        unitNumber: "02",
        name: "Blue",
        truckClass: "third_party",
        ownerName: null,
        googleSheetUrl: null,
      },
    });
  });

  it("keeps a pasted https Google Sheet link", () => {
    const result = parseTruckFields(input({ googleSheetUrl: `  ${SHEET}  ` }));
    expect(result).toEqual({
      ok: true,
      value: {
        unitNumber: "02",
        name: "Blue",
        truckClass: "third_party",
        ownerName: "Ada",
        googleSheetUrl: SHEET,
      },
    });
  });

  it("lowercases only the https scheme", () => {
    const result = parseTruckFields(
      input({ googleSheetUrl: "HTTPS://docs.google.com/spreadsheets/d/abc123" }),
    );
    expect(result.ok && result.value.googleSheetUrl).toBe(
      "https://docs.google.com/spreadsheets/d/abc123",
    );
  });

  it("rejects http, javascript, and links with a username", () => {
    expect(
      parseTruckFields(input({ googleSheetUrl: "http://docs.google.com/spreadsheets/d/abc" })),
    ).toEqual({ ok: false, error: "Google Sheet must be an https link." });
    expect(parseTruckFields(input({ googleSheetUrl: "javascript:alert(1)" }))).toEqual({
      ok: false,
      error: "Google Sheet must be an https link.",
    });
    expect(
      parseTruckFields(
        input({ googleSheetUrl: "https://user:secret@docs.google.com/spreadsheets/d/abc" }),
      ),
    ).toEqual({ ok: false, error: "Google Sheet must be an https link." });
  });

  it("rejects a link longer than 2000 characters", () => {
    const url = `https://docs.google.com/${"a".repeat(2000)}`;
    expect(parseTruckFields(input({ googleSheetUrl: url }))).toEqual({
      ok: false,
      error: "Google Sheet link is too long.",
    });
  });

  it("requires a unit number, a name, and a known class", () => {
    expect(parseTruckFields(input({ unitNumber: "  " }))).toEqual({
      ok: false,
      error: "Unit number is required.",
    });
    expect(parseTruckFields(input({ name: "" }))).toEqual({
      ok: false,
      error: "Name is required.",
    });
    expect(parseTruckFields(input({ truckClass: "company" }))).toEqual({
      ok: false,
      error: "Choose Legacy-owned or Third-party.",
    });
  });
});

describe("googleSheetHref", () => {
  it("returns an https link and refuses anything else", () => {
    expect(googleSheetHref(SHEET)).toBe(SHEET);
    expect(googleSheetHref(" javascript:alert(1) ")).toBeNull();
    expect(googleSheetHref(null)).toBeNull();
    expect(googleSheetHref("")).toBeNull();
  });
});

describe("truck sheet markup", () => {
  it("renders the Google Sheet field and opens only an https link", () => {
    const form = renderToStaticMarkup(
      createElement(TruckFieldsForm, {
        values: {
          unitNumber: "02",
          name: "Blue",
          truckClass: "third_party",
          ownerName: "",
          googleSheetUrl: "",
        },
        onChange: () => {},
        onSubmit: (event) => event.preventDefault(),
        pending: false,
        formError: null,
        submitLabel: "Save changes",
        googleSheetReady: true,
      }),
    );
    expect(form).toContain("Google Sheet");
    expect(form).toContain("Save changes");
    expect(form).toContain("Paste the Google Sheet or portal sheet link for this truck.");

    const href = "https://docs.google.com/spreadsheets/d/abc123/edit";
    const link = renderToStaticMarkup(createElement(GoogleSheetLink, { url: href }));
    expect(link).toContain(`href="${href}"`);
    expect(link).toContain('target="_blank"');

    const blocked = renderToStaticMarkup(
      createElement(GoogleSheetLink, { url: "javascript:alert(1)" }),
    );
    expect(blocked).not.toContain("href=");
  });
});

describe("isMissingGoogleSheetColumn", () => {
  it("matches a PostgREST schema-cache miss for this column", () => {
    expect(
      isMissingGoogleSheetColumn({
        code: "PGRST204",
        message:
          "Could not find the 'google_sheet_url' column of 'trucks' in the schema cache",
      }),
    ).toBe(true);
  });

  it("matches Postgres undefined_column for this column", () => {
    expect(
      isMissingGoogleSheetColumn({
        code: "42703",
        message: 'column trucks.google_sheet_url does not exist',
      }),
    ).toBe(true);
  });

  it("does not treat a missing trucks table as the sheet column", () => {
    expect(
      isMissingGoogleSheetColumn({
        code: "42P01",
        message: 'relation "trucks" does not exist',
      }),
    ).toBe(false);
  });
});
