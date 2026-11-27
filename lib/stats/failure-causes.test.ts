import { describe, expect, it } from "vitest";
import { classifyFailure, failureCauseByKey, failuresByDay, materialCodesInMessage, modelFailureRates, pageOf, summarizeFailures, type FailureInput } from "./failure-causes";

// Nguyên văn câu của lib/jobs/references.ts (file đó chỉ chạy trên máy chủ nên không import được vào test thuần).
const missingReferenceMessage = (codes: string[]) =>
  `Ảnh của chất liệu ${codes.join(", ")} không còn trong kho ảnh (file đã bị xóa, hoặc dữ liệu chất liệu của máy này chưa được đồng bộ). Quản trị viên cần đồng bộ lại dữ liệu chất liệu, hoặc vào Quản trị > Chất liệu tải lại ảnh hai lớp của ${codes.length > 1 ? "các chất liệu này" : "chất liệu này"}.`;

const key = (m: string | null) => classifyFailure(m).key;

describe("classifyFailure", () => {
  it("nhận ra các câu lỗi hệ thống tự viết", () => {
    expect(key("Tài khoản kie.ai đã hết credits (Credits insufficient). Hãy nạp thêm rồi bấm Tạo lại.")).toBe("credits");
    expect(key("Khóa API kie.ai không hợp lệ hoặc đã bị thu hồi (Unauthorized).")).toBe("api_key");
    expect(key(missingReferenceMessage(["ZY-HT-001", "SU-BAC"]))).toBe("missing_file");
    expect(key("Chất liệu ZY-12 chưa có ảnh tham chiếu.")).toBe("no_reference");
    expect(key("Chất liệu (quá giới hạn 16 ảnh tham chiếu) chưa có ảnh tham chiếu.")).toBe("too_many_refs");
    expect(key("kie.ai chỉ nhận tối đa 16 ảnh tham chiếu mỗi lượt.")).toBe("too_many_refs");
    expect(key("Một ảnh phong cách Pinterest đã chọn không còn trong thư viện. Hãy chọn lại ảnh rồi tạo thiết kế mới.")).toBe("pinterest");
    expect(key("Hệ thống đang đông, ảnh đang xếp hàng. Đã chờ quá lâu, vui lòng bấm Tạo lại.")).toBe("queue");
    expect(key("kie.ai đang giới hạn tốc độ, sẽ thử lại (Too many requests). Đã chờ quá lâu, vui lòng bấm Tạo lại.")).toBe("queue");
    expect(key("Quá thời gian chờ nhà cung cấp tạo ảnh.")).toBe("timeout");
    expect(key("Seedream 5 không hỗ trợ độ phân giải 4K.")).toBe("resolution");
    expect(key("Không kết nối được kie.ai: fetch failed")).toBe("network");
    expect(key("kie.ai trả về dữ liệu không đọc được (HTTP 502).")).toBe("network");
    expect(key("kie.ai báo lỗi (mã 500) (Internal error).")).toBe("provider");
    expect(key("Thiếu mã tác vụ của mảnh 2.")).toBe("provider");
  });

  it("kiểu cụ thể thắng kiểu chung", () => {
    // câu thật trong CSDL: "từ chối yêu cầu" nhưng lý do là lời dặn quá dài
    expect(key("kie.ai từ chối yêu cầu (mã 422) (The text length cannot exceed the maximum limit).")).toBe("prompt_too_long");
    expect(key("Prompt dài 21500 ký tự, vượt giới hạn 20000 của kie.ai. Rút gọn prompt ở Quản trị > Prompt hoặc chọn model khác.")).toBe("prompt_too_long");
    expect(key("kie.ai từ chối yêu cầu (mã 422) (aspect_ratio is invalid).")).toBe("rejected");
    // lỗi mạng lúc tải ảnh kết quả là lỗi ở bước ảnh kết quả, không phải mất kết nối lúc gửi
    expect(key("Không xử lý được ảnh kết quả: Không tải được ảnh kết quả: fetch failed")).toBe("result");
    expect(key("Tải ảnh kết quả thất bại (HTTP 403).")).toBe("result");
  });

  it("nhận ra AI từ chối vì nội dung từ câu tiếng Anh của kie.ai", () => {
    expect(key("Your request was rejected as a result of our safety system. (mã 400)")).toBe("content");
    expect(key("The content was flagged as violating content policies (mã 501)")).toBe("content");
  });

  it("câu lạ hoặc trống rơi vào Lỗi khác", () => {
    expect(key("Có gì đó rất lạ")).toBe("other");
    expect(key(null)).toBe("other");
    expect(key("")).toBe("other");
  });

  it("tra theo khóa", () => {
    expect(failureCauseByKey("credits")?.label).toMatch(/token/);
    expect(failureCauseByKey("khong-co")).toBeNull();
    expect(failureCauseByKey(undefined)).toBeNull();
  });
});

describe("materialCodesInMessage", () => {
  it("đọc mã chất liệu trong câu lỗi thiếu ảnh", () => {
    expect(materialCodesInMessage(missingReferenceMessage(["ZY-HT-001", "SU-BAC"]))).toEqual(["ZY-HT-001", "SU-BAC"]);
    expect(materialCodesInMessage("Chất liệu ZY-12 chưa có ảnh tham chiếu.")).toEqual(["ZY-12"]);
  });

  it("câu không nêu chất liệu thì rỗng", () => {
    expect(materialCodesInMessage("Quá thời gian chờ nhà cung cấp tạo ảnh.")).toEqual([]);
    expect(materialCodesInMessage("Chất liệu (quá giới hạn 16 ảnh tham chiếu) chưa có ảnh tham chiếu.")).toEqual([]);
    expect(materialCodesInMessage(null)).toEqual([]);
  });
});

const at = (iso: string) => new Date(iso);
const rows: FailureInput[] = [
  { at: at("2026-11-20T02:00:00Z"), kind: "SHEET", message: "Prompt dài 21500 ký tự, vượt giới hạn 20000 của kie.ai. Rút gọn prompt ở Quản trị > Prompt hoặc chọn model khác.", retry: "none" },
  { at: at("2026-11-22T02:00:00Z"), kind: "SHEET", message: "Prompt dài 20900 ký tự, vượt giới hạn 20000 của kie.ai. Rút gọn prompt ở Quản trị > Prompt hoặc chọn model khác.", retry: "failed" },
  { at: at("2026-11-21T02:00:00Z"), kind: "DESIGN", message: "kie.ai từ chối yêu cầu (mã 422) (The text length cannot exceed the maximum limit).", materialCode: "ZY-12", retry: "ok" },
  { at: at("2026-11-23T02:00:00Z"), kind: "DESIGN", message: "Quá thời gian chờ nhà cung cấp tạo ảnh.", materialCode: "ZY-12", retry: "ok" },
  { at: at("2026-11-23T03:00:00Z"), kind: "SHEET", message: missingReferenceMessage(["SU-BAC", "ZY-12"]), retry: "running" },
];

describe("summarizeFailures", () => {
  const out = summarizeFailures(rows);

  it("nhóm nhiều ảnh nhất đứng trước, kèm tỉ lệ và loại ảnh", () => {
    expect(out.map((c) => [c.key, c.count])).toEqual([
      ["prompt_too_long", 3],
      ["missing_file", 1],
      ["timeout", 1],
    ]);
    expect(out[0]).toMatchObject({ share: 60, sheet: 2, design: 1 });
    expect(out.reduce((s, c) => s + c.count, 0)).toBe(rows.length);
  });

  it("đếm kết quả tạo lại: chỉ tính ảnh đã có kết quả, ảnh đang tạo lại không tính", () => {
    expect(out[0]).toMatchObject({ retried: 2, retryOk: 1 });
    expect(out.find((c) => c.key === "missing_file")).toMatchObject({ retried: 0, retryOk: 0 });
  });

  it("lấy mốc gần nhất, câu lỗi hay gặp nhất và số kiểu câu (không phân biệt con số)", () => {
    expect(out[0].lastAt.toISOString()).toBe("2026-11-22T02:00:00.000Z");
    expect(out[0].sample).toMatch(/^Prompt dài/);
    expect(out[0].variants).toBe(2);
  });

  it("gom chất liệu từ ảnh thiết kế và từ tên nêu trong câu lỗi", () => {
    expect(out[0].materials).toEqual([{ code: "ZY-12", count: 1 }]);
    expect(out.find((c) => c.key === "missing_file")!.materials).toEqual([
      { code: "SU-BAC", count: 1 },
      { code: "ZY-12", count: 1 },
    ]);
  });

  it("không có ảnh lỗi thì rỗng", () => {
    expect(summarizeFailures([])).toEqual([]);
  });
});

describe("modelFailureRates", () => {
  it("tính tỉ lệ lỗi trên ảnh đã có kết quả, model lỗi nhiều đứng trước", () => {
    const out = modelFailureRates([
      { model: "a", status: "SUCCESS", count: 45 },
      { model: "a", status: "FAILED", count: 5 },
      { model: "a", status: "PROCESSING", count: 3 },
      { model: "b", status: "FAILED", count: 2 },
      { model: "c", status: "SUCCESS", count: 10 },
      { model: "d", status: "PENDING", count: 4 },
    ]);
    expect(out).toEqual([
      { model: "b", total: 2, failed: 2, rate: 100 },
      { model: "a", total: 50, failed: 5, rate: 10 },
      { model: "c", total: 10, failed: 0, rate: 0 },
    ]);
  });
});

describe("failuresByDay", () => {
  it("mỗi ngày một điểm, bỏ ảnh ngoài khoảng", () => {
    const dayOf = (d: Date) => d.toISOString().slice(0, 10);
    expect(failuresByDay(rows, ["2026-11-21", "2026-11-22", "2026-11-23"], dayOf)).toEqual([
      { day: "2026-11-21", failed: 1 },
      { day: "2026-11-22", failed: 1 },
      { day: "2026-11-23", failed: 2 },
    ]);
  });
});

describe("pageOf", () => {
  const items = Array.from({ length: 45 }, (_, i) => i + 1);

  it("cắt đúng trang", () => {
    expect(pageOf(items, 2, 20)).toMatchObject({ page: 2, pages: 3, from: 21, to: 40 });
    expect(pageOf(items, 3, 20).items).toEqual([41, 42, 43, 44, 45]);
  });

  it("số trang sai thì đưa về trang hợp lệ gần nhất", () => {
    expect(pageOf(items, 99, 20).page).toBe(3);
    expect(pageOf(items, 0, 20).page).toBe(1);
    expect(pageOf(items, Number.NaN, 20).page).toBe(1);
  });

  it("danh sách rỗng vẫn có một trang", () => {
    expect(pageOf([], 1, 20)).toEqual({ items: [], page: 1, pages: 1, from: 0, to: 0 });
  });
});
