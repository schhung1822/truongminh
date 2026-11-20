import { describe, expect, it } from "vitest";
import { formatKnowledge, formatMaterials, profileLines, type ProfileData } from "./format";
import { articleWhere } from "./query";
import { buildKnowledgeSystemPrompt, CHECK_WITH_TECH_REPLY, extractUnknown, gapKey, UNKNOWN_MARKER } from "./rules";
import { AI_ROLES, CATEGORIES, isVisibleTo, ROLE_INFO, visibilitiesFor, VISIBILITIES } from "./roles";
import { selectWithinBudget, tokenize, type Candidate } from "./select";

const cand = (over: Partial<Candidate> & { id: string }): Candidate => ({
  title: over.id,
  category: "faq",
  body: "nội dung",
  tags: [],
  priority: 0,
  alwaysInclude: false,
  updatedAt: new Date("2026-11-01"),
  ...over,
});

describe("mức hiển thị theo vai AI", () => {
  it("không vai nào được đọc ADMIN_ONLY", () => {
    for (const role of AI_ROLES) expect(visibilitiesFor(role)).not.toContain("ADMIN_ONLY");
  });

  it("vai có chữ tới khách chỉ được đọc PUBLIC", () => {
    for (const role of AI_ROLES.filter((r) => ROLE_INFO[r].audience === "CUSTOMER")) expect(visibilitiesFor(role)).toEqual(["PUBLIC"]);
  });

  it("trợ lý sale đọc được PUBLIC và INTERNAL", () => {
    expect(visibilitiesFor("SALE_ASSISTANT")).toEqual(["PUBLIC", "INTERNAL"]);
  });

  it("isVisibleTo: mọi tổ hợp (vai x mức x vai của bài) chỉ cho qua khi cả mức và vai đều hợp", () => {
    for (const role of AI_ROLES) {
      for (const vis of VISIBILITIES) {
        for (const articleRoles of [[], [role], AI_ROLES.filter((r) => r !== role), [...AI_ROLES]]) {
          const ok = isVisibleTo(role, { visibility: vis, roles: articleRoles });
          const expected = vis !== "ADMIN_ONLY" && visibilitiesFor(role).includes(vis) && articleRoles.includes(role);
          expect(ok).toBe(expected);
        }
      }
    }
  });

  it("isVisibleTo từ chối mức lạ", () => {
    expect(isVisibleTo("SALE_ASSISTANT", { visibility: "SECRET", roles: ["SALE_ASSISTANT"] })).toBe(false);
  });
});

describe("điều kiện truy vấn", () => {
  const now = new Date("2026-11-20T00:00:00Z");

  it("chỉ lấy bài ĐANG DÙNG, đúng vai, đúng mức, đã đến ngày hiệu lực", () => {
    const w = articleWhere("DRAFT_REPLY", now);
    expect(w.status).toBe("ACTIVE");
    expect(w.visibility).toEqual({ in: ["PUBLIC"] });
    expect(w.roles).toEqual({ some: { role: "DRAFT_REPLY" } });
    expect(w.OR).toEqual([{ effectiveFrom: null }, { effectiveFrom: { lte: now } }]);
  });

  it("không vai nào có ADMIN_ONLY hoặc INTERNAL (trừ sale) trong điều kiện truy vấn", () => {
    for (const role of AI_ROLES) {
      const list = (articleWhere(role, now).visibility as { in: string[] }).in;
      expect(list).not.toContain("ADMIN_ONLY");
      if (ROLE_INFO[role].audience === "CUSTOMER") expect(list).not.toContain("INTERNAL");
    }
  });
});

describe("chọn bài trong ngân sách", () => {
  it("vừa ngân sách thì lấy hết, không bỏ bài nào", () => {
    const r = selectWithinBudget([cand({ id: "a" }), cand({ id: "b" })], 10_000, "gì đó");
    expect(r.chosen.map((c) => c.id).sort()).toEqual(["a", "b"]);
    expect(r.dropped).toEqual([]);
  });

  it("quá ngân sách thì bỏ cả bài chứ không cắt dở, ưu tiên bài liên quan câu hỏi", () => {
    const big = "x".repeat(300);
    const list = [
      cand({ id: "giao-hang", title: "Giao hàng", body: big }),
      cand({ id: "khac-laser", title: "Khắc laser", body: big, tags: ["khắc", "laser"] }),
      cand({ id: "bao-hanh", title: "Bảo hành", body: big }),
    ];
    const r = selectWithinBudget(list, 400, "Khắc laser được không?");
    expect(r.chosen.map((c) => c.id)).toEqual(["khac-laser"]);
    expect(r.dropped.map((c) => c.id).sort()).toEqual(["bao-hanh", "giao-hang"]);
  });

  it("bài luôn kèm được xếp trước bài liên quan, rồi đến ưu tiên", () => {
    const big = "y".repeat(300);
    const list = [
      cand({ id: "lq", title: "Laser", body: big }),
      cand({ id: "luon", title: "Chính sách chung", body: big, alwaysInclude: true }),
      cand({ id: "uu-tien", title: "Khác", body: big, priority: 5 }),
    ];
    const r = selectWithinBudget(list, 400, "laser");
    expect(r.chosen.map((c) => c.id)).toEqual(["luon"]);
  });

  it("bài to không vừa thì bỏ nhưng bài nhỏ phía sau vẫn được thử", () => {
    const list = [cand({ id: "to", body: "z".repeat(900), alwaysInclude: true }), cand({ id: "nho", body: "ngắn" })];
    const r = selectWithinBudget(list, 200, "");
    expect(r.chosen.map((c) => c.id)).toEqual(["nho"]);
    expect(r.dropped.map((c) => c.id)).toEqual(["to"]);
  });

  it("tokenize bỏ dấu và từ thừa", () => {
    expect(tokenize("Khắc laser được không?")).toEqual(["khac", "laser"]);
  });
});

describe("hồ sơ doanh nghiệp theo mức hiển thị", () => {
  const profile: ProfileData = {
    workshopName: "Xưởng A",
    fields: { address: "Địa chỉ thử", hotline: "0123", intro: "Giới thiệu thử", payment: "Chuyển khoản" },
    visibility: { address: "PUBLIC", hotline: "INTERNAL", intro: "ADMIN_ONLY" },
  };

  it("vai chạm tới khách chỉ thấy trường PUBLIC; trường thiếu mức bị coi là INTERNAL", () => {
    const lines = profileLines("DRAFT_REPLY", profile).join("\n");
    expect(lines).toContain("Địa chỉ thử");
    expect(lines).not.toContain("0123");
    expect(lines).not.toContain("Giới thiệu thử");
    expect(lines).not.toContain("Chuyển khoản");
  });

  it("trợ lý sale thấy PUBLIC và INTERNAL nhưng không thấy ADMIN_ONLY", () => {
    const lines = profileLines("SALE_ASSISTANT", profile).join("\n");
    expect(lines).toContain("Địa chỉ thử");
    expect(lines).toContain("0123");
    expect(lines).toContain("Chuyển khoản");
    expect(lines).not.toContain("Giới thiệu thử");
  });

  it("visibility hỏng không làm lọt dữ liệu", () => {
    expect(profileLines("DRAFT_REPLY", { ...profile, visibility: null })).toEqual([]);
    expect(profileLines("DRAFT_REPLY", { ...profile, visibility: "PUBLIC" })).toEqual([]);
  });

  it("formatKnowledge rỗng khi chưa có gì", () => {
    expect(formatKnowledge("SALE_ASSISTANT", { workshopName: "A", fields: {}, visibility: {} }, [])).toBe("");
  });
});

describe("prompt và dấu chưa có thông tin", () => {
  it("không viết cứng thông tin doanh nghiệp: kho trống thì ghi rõ chưa có dữ liệu", () => {
    const s = buildKnowledgeSystemPrompt({ role: "DRAFT_REPLY", workshopName: "Xưởng A", knowledge: "", materials: "" });
    expect(s).toContain("Xưởng A");
    expect(s).toContain("chưa có dữ liệu");
    expect(s).not.toMatch(/in UV|in khắc|Hà Nội/);
  });

  it("vai nói với khách dặn câu mẫu và dấu chưa có thông tin; vai chăm sóc nhóm thì không", () => {
    const draft = buildKnowledgeSystemPrompt({ role: "DRAFT_REPLY", workshopName: "A", knowledge: "x", materials: "" });
    expect(draft).toContain(CHECK_WITH_TECH_REPLY);
    expect(draft).toContain(UNKNOWN_MARKER);
    const care = buildKnowledgeSystemPrompt({ role: "CARE_PLANNER", workshopName: "A", knowledge: "x", materials: "" });
    expect(care).not.toContain(UNKNOWN_MARKER);
  });

  it("extractUnknown tách dấu và nhận biết", () => {
    expect(extractUnknown(`Chưa có trong tài liệu. ${UNKNOWN_MARKER}`)).toEqual({ text: "Chưa có trong tài liệu.", unknown: true });
    expect(extractUnknown("Có ạ.")).toEqual({ text: "Có ạ.", unknown: false });
  });

  it("gapKey gom câu hỏi gần giống nhau theo vai", () => {
    expect(gapKey("SALE_ASSISTANT", "Khắc laser được không?")).toBe(gapKey("SALE_ASSISTANT", "khac laser duoc khong"));
    expect(gapKey("SALE_ASSISTANT", "Khắc laser")).not.toBe(gapKey("DRAFT_REPLY", "Khắc laser"));
  });
});

describe("danh sách chất liệu theo vai", () => {
  const mats = Array.from({ length: 150 }, (_, i) => ({
    code: `M${i}`,
    name: i === 140 ? "Mica trong suốt" : `Chất liệu ${i}`,
    groupName: "G",
    printTech: i === 140 ? "khắc laser" : "in UV",
    descHuman: "mô tả",
    thicknessMm: 0.5,
  }));

  it("cắt theo giới hạn của vai và ưu tiên chất liệu liên quan câu hỏi", () => {
    const text = formatMaterials("CARE_PLANNER", mats, "mica trong suốt");
    expect(text).toContain("60 trên 150");
    expect(text).toContain("Mica trong suốt");
  });

  it("vai chăm sóc chỉ cần tên", () => {
    expect(formatMaterials("CARE_PLANNER", mats.slice(0, 3))).not.toContain("|");
  });

  it("trợ lý sale có độ dày", () => {
    expect(formatMaterials("SALE_ASSISTANT", mats.slice(0, 3))).toContain("dày");
  });
});

describe("danh mục", () => {
  it("mặc định của danh mục không gán vai nào đọc được mức mà vai đó bị cấm", () => {
    for (const c of CATEGORIES) {
      for (const role of c.roles) {
        if (c.visibility === "INTERNAL") expect(ROLE_INFO[role].audience).toBe("SALE");
        expect(c.visibility).not.toBe("ADMIN_ONLY");
      }
    }
  });
});
