import { describe, expect, it } from "vitest";
import { parseCommand } from "./commands";
import { isWeakPairCode, PAIR_LOCK_MS, PAIR_MAX_FAILS, pairInstruction, pairLock, readPairCode } from "./pairing";

describe("readPairCode", () => {
  it("lệnh không kèm gì là xin ghép nối kiểu cũ", () => {
    expect(readPairCode("")).toEqual({ kind: "none" });
    expect(readPairCode("   ")).toEqual({ kind: "none" });
  });

  it("nhận mã 6 số, kể cả khi gõ cách quãng hoặc có gạch", () => {
    expect(readPairCode("482913")).toEqual({ kind: "code", code: "482913" });
    expect(readPairCode(" 482 913 ")).toEqual({ kind: "code", code: "482913" });
    expect(readPairCode("482-913")).toEqual({ kind: "code", code: "482913" });
    expect(readPairCode("048.291")).toEqual({ kind: "code", code: "048291" });
  });

  it("gõ thứ khác (mã 4 số kiểu cũ, chữ, thừa số) thì báo sai dạng chứ không coi là xin ghép nối", () => {
    for (const bad of ["1234", "4829134", "abc", "48291a", "mã 482913"]) expect(readPairCode(bad), bad).toEqual({ kind: "bad" });
  });

  it("đi cùng parseCommand: lấy được mã từ nguyên dòng nhân viên gõ", () => {
    const cmd = parseCommand("/ghepnoi 482913");
    expect(cmd?.name).toBe("pair");
    expect(readPairCode(cmd!.args)).toEqual({ kind: "code", code: "482913" });
    expect(readPairCode(parseCommand("/GhepNoi@BotXuong  482 913")!.args)).toEqual({ kind: "code", code: "482913" });
    expect(readPairCode(parseCommand("/ghépnối")!.args)).toEqual({ kind: "none" });
  });
});

describe("isWeakPairCode", () => {
  it("không cấp mã sáu số giống nhau hoặc dãy tăng, giảm dần", () => {
    for (const weak of ["000000", "777777", "123456", "012345", "654321", "987654", "890123"]) expect(isWeakPairCode(weak), weak).toBe(true);
  });

  it("mã thường thì dùng được", () => {
    for (const ok of ["482913", "100000", "112233", "135790", "000001"]) expect(isWeakPairCode(ok), ok).toBe(false);
  });
});

describe("pairLock", () => {
  const now = new Date("2026-11-28T08:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it("chưa sai lần nào thì không chặn", () => {
    expect(pairLock(0, null, now)).toEqual({ fails: 0, locked: false });
  });

  it("sai dưới giới hạn thì còn được thử, và nhớ số lần đã sai", () => {
    expect(pairLock(PAIR_MAX_FAILS - 1, ago(60_000), now)).toEqual({ fails: PAIR_MAX_FAILS - 1, locked: false });
  });

  it("sai đủ số lần thì bị chặn cho tới hết thời gian chờ", () => {
    expect(pairLock(PAIR_MAX_FAILS, ago(60_000), now).locked).toBe(true);
    expect(pairLock(PAIR_MAX_FAILS, ago(PAIR_LOCK_MS - 1), now).locked).toBe(true);
  });

  it("quá thời gian chờ kể từ lần sai gần nhất thì tính lại từ đầu", () => {
    expect(pairLock(PAIR_MAX_FAILS, ago(PAIR_LOCK_MS), now)).toEqual({ fails: 0, locked: false });
    expect(pairLock(3, ago(PAIR_LOCK_MS + 1), now)).toEqual({ fails: 0, locked: false });
  });
});

describe("pairInstruction", () => {
  it("có dòng lệnh đứng riêng một dòng để chép nguyên vào Zalo", () => {
    const t = pairInstruction("482913", ["Bot nhóm khách sỉ"]);
    expect(t.split("\n")).toContain("/ghepnoi 482913");
    expect(t).toContain('bot "Bot nhóm khách sỉ"');
    expect(t).toContain("đừng gửi vào nhóm");
  });

  it("nhiều bot thì kể tên từng bot; chưa có tên bot thì nói chung", () => {
    expect(pairInstruction("482913", ["Bot A", "Bot B"])).toContain('từng bot: "Bot A", "Bot B"');
    expect(pairInstruction("482913", [])).toContain("bot Zalo của xưởng");
    expect(pairInstruction("482913", ["  "])).toContain("bot Zalo của xưởng");
  });
});
