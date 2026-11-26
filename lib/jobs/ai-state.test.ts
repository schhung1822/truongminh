import { describe, expect, it } from "vitest";
import { AI_STALE_MESSAGE, AI_STALE_MS, readAiState, readPinIds } from "./ai-state";

const NOW = Date.parse("2026-11-26T10:00:00.000Z");

describe("readAiState", () => {
  it("không có dữ liệu hoặc dữ liệu lạ: không phải phiên AI", () => {
    expect(readAiState(null).kind).toBe("none");
    expect(readAiState("abc").kind).toBe("none");
    expect(readAiState([]).kind).toBe("none");
    expect(readAiState({ foo: 1 }).kind).toBe("none");
  });

  it("bản ghi cũ (không có status) có picks là kết quả đã xong", () => {
    const old = { summary: "Logo đậm", isBadge: false, model: "gpt-5-2", requested: 8, picks: [{ materialId: "m1", code: "5", name: "Mica", reason: "hợp" }] };
    const s = readAiState(old, NOW);
    expect(s.kind).toBe("done");
    if (s.kind === "done") expect(s.analysis.picks).toHaveLength(1);
  });

  it("đang phân tích trong thời hạn", () => {
    const s = readAiState({ status: "ANALYZING", startedAt: new Date(NOW - 30_000).toISOString(), requested: 16, decideBadge: true }, NOW);
    expect(s).toEqual({ kind: "analyzing", startedAt: NOW - 30_000, requested: 16, decideBadge: true, quality: false, pinIds: [] });
  });

  it("đang phân tích nhưng quá hạn thì coi là hỏng, cho thử lại", () => {
    const s = readAiState({ status: "ANALYZING", startedAt: new Date(NOW - AI_STALE_MS - 1000).toISOString(), requested: 16, decideBadge: false }, NOW);
    expect(s).toEqual({ kind: "failed", error: AI_STALE_MESSAGE, requested: 16, decideBadge: false, quality: false, pinIds: [] });
  });

  it("thiếu mốc bắt đầu cũng coi là hỏng thay vì quay mãi", () => {
    expect(readAiState({ status: "ANALYZING", requested: 8 }, NOW).kind).toBe("failed");
  });

  it("phân tích lỗi: giữ câu báo lỗi và thông tin để thử lại", () => {
    const s = readAiState({ status: "FAILED", error: "Khóa API kie.ai không hợp lệ.", failedAt: new Date(NOW).toISOString(), requested: 8, decideBadge: true, quality: true }, NOW);
    expect(s).toEqual({ kind: "failed", error: "Khóa API kie.ai không hợp lệ.", requested: 8, decideBadge: true, quality: true, pinIds: [] });
  });

  it("D125: phiên thiết kế theo mẫu giữ các pin Pinterest qua mọi trạng thái, dữ liệu lạ thì bỏ", () => {
    const now = Date.parse("2026-11-26T10:00:00Z");
    const analyzing = readAiState({ status: "ANALYZING", startedAt: "2026-11-26T09:59:30Z", requested: 3, decideBadge: false, pinIds: ["a", "b"] }, now);
    expect(analyzing).toMatchObject({ kind: "analyzing", pinIds: ["a", "b"] });
    const failed = readAiState({ status: "FAILED", error: "x", requested: 3, pinIds: ["a", 5, ""] }, now);
    expect(failed).toMatchObject({ kind: "failed", pinIds: ["a"] });
    expect(readAiState({ status: "FAILED", error: "x", requested: 3 }, now)).toMatchObject({ pinIds: [] });
    expect(readPinIds({ picks: [], pinIds: ["p1"] })).toEqual(["p1"]);
    expect(readPinIds(null)).toEqual([]);
    expect(readPinIds({ pinIds: "p1" })).toEqual([]);
  });
});
