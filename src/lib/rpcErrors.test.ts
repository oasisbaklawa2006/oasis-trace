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

  it("does not treat relation-not-found errors as not-deployed", () => {
    expect(isRpcNotDeployedError(new Error('relation "ols_cartons" does not exist'))).toBe(false);
    expect(isRpcNotDeployedError(new Error("Trace operation rejected: relation ols_cartons does not exist"))).toBe(false);
  });

  it("does not treat function permission errors as not-deployed", () => {
    expect(isRpcNotDeployedError(new Error("permission denied for function trace_add_carton_content_v1"))).toBe(false);
    expect(isRpcNotDeployedError(new Error("Trace operation rejected: permission denied for function trace_finalize_carton_v1"))).toBe(false);
  });
});
