import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { exportToCsv } from "../lib/exportUtils";

/** Runs fn while capturing the CSV text handed to URL.createObjectURL. */
function captureCsv(fn: () => void): string {
  let csv = "";
  const RealBlob = globalThis.Blob;
  vi.stubGlobal("Blob", class extends RealBlob {
    constructor(parts: BlobPart[], options?: BlobPropertyBag) {
      super(parts, options);
      csv = String(parts[0]);
    }
  });
  try {
    fn();
  } finally {
    vi.unstubAllGlobals();
  }
  return csv;
}

describe("exportToCsv", () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.fn<() => void>>;
  let appended: HTMLElement[];
  let removed: HTMLElement[];

  beforeEach(() => {
    createObjectURL = vi.fn(() => "blob:mock-url");
    revokeObjectURL = vi.fn();
    clickSpy = vi.fn<() => void>();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      clickSpy();
    });
    appended = [];
    removed = [];
    vi.spyOn(document.body, "appendChild").mockImplementation((node: Node) => {
      const el = node as HTMLElement;
      appended.push(el);
      return node;
    });
    vi.spyOn(document.body, "removeChild").mockImplementation((node: Node) => {
      const el = node as HTMLElement;
      removed.push(el);
      return node;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes the header row from the first record's keys plus one row per record", () => {
    const csv = captureCsv(() =>
      exportToCsv("report", [
        { name: "Ada", score: 95 },
        { name: "Alan", score: 88 },
      ])
    );
    expect(csv).toBe('"name","score"\r\n"Ada","95"\r\n"Alan","88"');
  });

  it("doubles double quotes in keys and values per RFC 4180", () => {
    const csv = captureCsv(() =>
      exportToCsv("quoted", [{ 'the "name"': 'He said "hi"' }])
    );
    expect(csv).toBe('"the ""name"""\r\n"He said ""hi"""');
  });

  it("maps null and undefined values to empty cells", () => {
    const csv = captureCsv(() =>
      exportToCsv("nulls", [{ a: null, b: undefined, c: 1 }])
    );
    expect(csv).toBe('"a","b","c"\r\n"","","1"');
  });

  it("serializes object values as JSON strings (quotes doubled)", () => {
    const csv = captureCsv(() =>
      exportToCsv("objs", [{ meta: { tags: ["x", "y"] } }])
    );
    expect(csv).toBe('"meta"\r\n"{""tags"":[""x"",""y""]}"');
  });

  it("booleans and zeros are exported, not dropped", () => {
    const csv = captureCsv(() => exportToCsv("flags", [{ pass: true, tries: 0 }]));
    expect(csv).toBe('"pass","tries"\r\n"true","0"');
  });

  it("does nothing for an empty or missing row list", () => {
    exportToCsv("empty", []);
    exportToCsv("empty2", undefined as unknown as Record<string, unknown>[]);
    expect(clickSpy).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("downloads a date-suffixed file and cleans up the object URL", () => {
    exportToCsv("results", [{ a: 1 }]);
    const link = appended[0] as HTMLAnchorElement;
    expect(link.getAttribute("download")).toBe(
      `results_${new Date().toISOString().slice(0, 10)}.csv`
    );
    expect(link.getAttribute("href")).toBe("blob:mock-url");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(removed).toContain(link);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });
});
