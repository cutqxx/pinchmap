import { describe, expect, it } from "vitest";
import { pickFreeName } from "./untitledName";

describe("pickFreeName", () => {
  it("returns the base name when nothing is taken", () => {
    expect(pickFreeName("Untitled", [])).toBe("Untitled");
  });

  it("returns the base name when only unrelated names exist", () => {
    expect(pickFreeName("Untitled", ["Notes", "Untitled thoughts"])).toBe("Untitled");
  });

  it("appends 1 when the base name is taken", () => {
    expect(pickFreeName("Untitled", ["Untitled"])).toBe("Untitled 1");
  });

  it("continues the numbering until the first free number", () => {
    expect(pickFreeName("Untitled", ["Untitled", "Untitled 1", "Untitled 2"])).toBe("Untitled 3");
  });

  it("picks the lowest free number when there are gaps", () => {
    expect(pickFreeName("Untitled", ["Untitled", "Untitled 2", "Untitled 3"])).toBe("Untitled 1");
  });

  it("picks the base name itself when only numbered names are taken", () => {
    expect(pickFreeName("Untitled", ["Untitled 1", "Untitled 2"])).toBe("Untitled");
  });

  it("treats names case-insensitively", () => {
    expect(pickFreeName("Untitled", ["untitled", "UNTITLED 1"])).toBe("Untitled 2");
  });

  it("works with the Russian base name", () => {
    expect(pickFreeName("Без названия", ["Без названия", "Без названия 1"])).toBe("Без названия 2");
  });

  it("treats Russian names case-insensitively", () => {
    expect(pickFreeName("Без названия", ["без названия"])).toBe("Без названия 1");
  });

  it("does not treat the other language's base name as taken", () => {
    expect(pickFreeName("Без названия", ["Untitled", "Untitled 1"])).toBe("Без названия");
  });
});
