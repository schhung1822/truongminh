import { describe, expect, it } from "vitest";
import { confirmQuestion, CONFIRM_FROM_TASKS, HISTORY_MAX_MATERIALS, needsConfirm, PENDING_MAX_AGE_MS, pendingAlive, planFromHistory, rankMaterials, whyMaterial, type MaterialSignal, type PendingPlan } from "./plan";

const sig = (code: string, source: MaterialSignal["source"], over: Partial<MaterialSignal> = {}): MaterialSignal => ({ materialId: code.toLowerCase(), code, name: `Chất liệu ${code}`, usable: true, source, sameLogo: false, at: 1000, ...over });

describe("rankMaterials", () => {
  it("chốt báo giá nặng hơn gửi báo giá, nặng hơn chọn làm thiết kế", () => {
    const r = rankMaterials([sig("A", "design"), sig("B", "quote_sent"), sig("C", "quote_won")]);
    expect(r.map((m) => m.code)).toEqual(["C", "B", "A"]);
    expect(r[0]).toMatchObject({ won: true, times: 1 });
  });

  it("chọn nhiều lần thì cộng dồn; dấu vết ở đúng logo đang làm được ưu tiên", () => {
    const r = rankMaterials([sig("A", "design"), sig("A", "design"), sig("A", "design"), sig("B", "design", { sameLogo: true }), sig("B", "design", { sameLogo: true })]);
    expect(r.map((m) => [m.code, m.score, m.times])).toEqual([["B", 4, 2], ["A", 3, 3]]);
  });

  it("bằng điểm thì cái gần đây hơn đứng trước", () => {
    expect(rankMaterials([sig("A", "design", { at: 1 }), sig("B", "design", { at: 9 })]).map((m) => m.code)).toEqual(["B", "A"]);
  });

  it("chất liệu đã tắt hoặc mất ảnh tham chiếu bị loại", () => {
    expect(rankMaterials([sig("A", "quote_won", { usable: false }), sig("B", "design")]).map((m) => m.code)).toEqual(["B"]);
  });
});

describe("planFromHistory", () => {
  const ranked = rankMaterials(["A", "B", "C", "D", "E", "F"].map((c, i) => sig(c, "design", { at: 100 - i })));

  it("có chất liệu từng ưng: lấy tối đa 4 cái đứng đầu, kèm mẫu Pinterest đã thích (không lặp, tối đa theo giới hạn)", () => {
    const p = planFromHistory(ranked, ["p1", "p2", "p1", "p3", "p4"], 3);
    expect(p.kind).toBe("materials");
    if (p.kind === "materials") {
      expect(p.materials.map((m) => m.code)).toEqual(["A", "B", "C", "D"]);
      expect(p.materials).toHaveLength(HISTORY_MAX_MATERIALS);
      expect(p.pinIds).toEqual(["p1", "p2", "p3"]);
    }
  });

  it("chưa có chất liệu nhưng có mẫu Pinterest: để AI chọn chất liệu theo mẫu", () => {
    expect(planFromHistory([], ["p1"], 3)).toEqual({ kind: "pins", pinIds: ["p1"] });
  });

  it("không có gì thì không lập được", () => {
    expect(planFromHistory([], [], 3)).toEqual({ kind: "none" });
  });
});

describe("needsConfirm", () => {
  it("lệnh nói rõ và tốn ít lượt thì làm luôn", () => {
    expect(needsConfirm({ tasks: 3, inferred: false })).toBe(false);
    expect(needsConfirm({ tasks: CONFIRM_FROM_TASKS - 1, inferred: false })).toBe(false);
  });

  it("bot tự suy ra từ lịch sử, tạo tất cả chất liệu, hoặc tốn nhiều lượt thì hỏi trước", () => {
    expect(needsConfirm({ tasks: 1, inferred: true })).toBe(true);
    expect(needsConfirm({ tasks: 2, inferred: false, allMaterials: true })).toBe(true);
    expect(needsConfirm({ tasks: CONFIRM_FROM_TASKS, inferred: false })).toBe(true);
  });
});

describe("việc chờ xác nhận", () => {
  const plan = (createdAt: string): PendingPlan => ({ exec: { kind: "catalog_ai", logoId: "l1" }, summary: "Em sẽ tạo catalog cho logo Gió.", tasks: 3, createdAt });

  it("quá 30 phút thì hết hiệu lực", () => {
    const now = Date.parse("2026-11-27T03:00:00Z");
    expect(pendingAlive(plan(new Date(now - 60_000).toISOString()), now)).toBe(true);
    expect(pendingAlive(plan(new Date(now - PENDING_MAX_AGE_MS - 1).toISOString()), now)).toBe(false);
    expect(pendingAlive(plan("không phải ngày"), now)).toBe(false);
    expect(pendingAlive(null, now)).toBe(false);
  });

  it("câu hỏi xác nhận ghi rõ việc, số lượt và lượt còn lại", () => {
    expect(confirmQuestion(plan("x"), 12)).toBe('Em sẽ tạo catalog cho logo Gió.\nTốn khoảng 3 lượt tạo ảnh (hôm nay còn 12 lượt). Anh/chị nhắn "ok" để em làm, hoặc nói cần đổi gì ạ.');
    expect(confirmQuestion(plan("x"), null)).not.toContain("hôm nay còn"); // quản trị viên không có hạn mức
  });

  it("lý do chọn chất liệu", () => {
    const [won, chosen] = rankMaterials([sig("A", "quote_won"), sig("B", "design"), sig("B", "design")]);
    expect(whyMaterial(won)).toBe("đã chốt báo giá");
    expect(whyMaterial(chosen)).toBe("chọn 2 lần");
  });
});
