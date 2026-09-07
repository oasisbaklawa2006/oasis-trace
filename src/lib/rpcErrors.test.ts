import { describe, expect, it } from "vitest";
import { isRpcNotDeployedError } from "./rpcErrors";

describe("rpcErrors", () => {
  it("identifies missing Core RPC errors", () => {
    expect(isRpcNotDeployedError(new Error("function trace_add_carton_content_v1() does not exist"))).toBe(true);
    expect(isRpcNotDeployedError(new Error("Trace operation rejected: could not find the function"))).toBe(true);
  });

  it("does not treat timeouts as not-deployed", () => {
    expect(isRpcNotDeployedError(new Error("Trace operation rejected: request timeout"))).toBe(false);
  });
});
