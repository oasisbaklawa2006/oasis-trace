import { beforeEach, describe, expect, it } from "vitest";
import { captureLeap13Evidence, clearLeap13Evidence, exportLeap13EvidenceJson, listLeap13Evidence } from "./leap13Evidence";

describe("leap13Evidence", () => {
  beforeEach(() => {
    localStorage.clear();
    clearLeap13Evidence();
  });

  it("does not capture unless leap13_uat query flag is present", () => {
    expect(captureLeap13Evidence("gate", "scan", { ref: "SHP-1" })).toBeNull();
    expect(listLeap13Evidence()).toHaveLength(0);
  });

  it("captures structured records when leap13_uat flag is enabled", () => {
    window.history.pushState({}, "", "/?leap13_uat=1");
    const record = captureLeap13Evidence("gate", "scan", { ref: "SHP-1", result: "green" });
    expect(record?.integrityClass).toBe("leap13_uat_hook_v1");
    expect(listLeap13Evidence()).toHaveLength(1);
    expect(JSON.parse(exportLeap13EvidenceJson())[0].step).toBe("scan");
    window.history.pushState({}, "", "/");
  });

  it("does not throw when localStorage write fails", () => {
    window.history.pushState({}, "", "/?leap13_uat=1");
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(() => captureLeap13Evidence("gate", "scan", { ref: "SHP-1" })).not.toThrow();
    expect(captureLeap13Evidence("gate", "scan", { ref: "SHP-1" })?.step).toBe("scan");
    Storage.prototype.setItem = original;
    window.history.pushState({}, "", "/");
  });
});
