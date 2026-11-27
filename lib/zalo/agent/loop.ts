import "server-only";
import { ChatError, text as textPart, type ChatMessage, type ChatProvider } from "@/lib/ai/chat";
import {
  buildSystemPrompt,
  clip,
  commandJson,
  confirmIntent,
  DODGE_FALLBACK,
  FORMAT_REMINDER,
  parseAction,
  refLegend,
  skipsTools,
  STEP_SUFFIX,
  TOOL_NUDGE,
  TOOL_RESULT_PREFIX,
  toolResultMessage,
  trimThread,
  type PromptFacts,
  type ThreadMsg,
} from "./protocol";
import type { IssueKind } from "./issue-kinds";
import { logIssue } from "./issues";
import { executePlan, runTool, TOOL_NAMES, TOOL_SPECS, type ToolCtx } from "./tools";

/**
 * Một lượt của trợ lý Zalo (docs/DECISIONS.md D129): nhận một tin của người ra lệnh, cho AI chọn công cụ từng bước cho tới
 * khi có câu trả lời, hoặc tới khi một công cụ tự báo người ra lệnh. Trí nhớ của mạch (ctx.thread) được cập nhật tại chỗ;
 * nơi gọi lưu lại sau khi lượt kết thúc.
 *
 * Trí nhớ lưu giữa các tin giữ lại CÁC BƯỚC AI đã chọn và lời đã nói với người ra lệnh, nhưng bỏ phần dữ liệu của kết quả
 * công cụ (thay bằng một dòng "đã lược bỏ"). Các điều dưới đây đều rút ra khi thử với model thật của kie.ai, vốn hay bắt
 * chước chính các lượt trước của nó:
 *  - dữ liệu cũ nằm lại thì AI lấy nó ra trả lời thay vì tra lại (đã gặp: báo sai số lượt còn lại);
 *  - chỉ giữ lời nói mà bỏ hẳn các bước gọi công cụ thì các tin sau AI toàn "nói" chứ không gọi công cụ nữa;
 *  - một lần AI tự bảo "em chưa kết nối được công cụ" mà được cất lại thì mọi tin sau nó lặp lại đúng câu đó. Vì vậy lượt
 *    AI né công cụ (skipsTools) được nhắc một lần, vẫn né thì máy chủ tự trả lời và KHÔNG cất lượt đó vào trí nhớ.
 * Đối tượng đã tra (khách, logo...) vẫn gọi lại được ở tin sau nhờ bảng mã tham chiếu trong lời dặn.
 */

/** Số lần hỏi AI tối đa cho một tin (mỗi lần là một bước: gọi công cụ hoặc trả lời). */
export const MAX_STEPS = 6;

export type TurnUsage = { promptTokens: number; completionTokens: number; steps: number };

const NOT_UNDERSTOOD = 'Em chưa hiểu ý anh/chị. Nói rõ hơn giúp em, ví dụ "tạo ảnh cho khách Minh theo mẫu khách từng ưng" hoặc "làm catalog cho logo này".';
const TOO_LONG = "Việc này em xử lý chưa xong trong một lượt. Anh/chị nhắn lại ngắn gọn từng bước giúp em nhé.";
const OLD_RESULT = "(dữ liệu cũ đã lược bỏ; cần số liệu thì gọi lại công cụ)";

/** Đổi các bước thành tin gửi AI, gắn câu nhắc quy ước vào cuối tin sau cùng. */
function toChat(messages: ThreadMsg[]): ChatMessage[] {
  return messages.map((m, i) => ({ role: m.r === "a" ? "assistant" : "user", content: [textPart(i === messages.length - 1 && m.r !== "a" ? m.c + STEP_SUFFIX : m.c)] }));
}

/** Dòng kết quả công cụ sau khi lượt đã xong: chỉ còn tên công cụ, phần dữ liệu được lược bỏ. */
function stubResult(c: string): string {
  const end = c.startsWith(TOOL_RESULT_PREFIX) ? c.indexOf("]") : -1;
  return end > 0 ? `${c.slice(0, end + 1)} ${OLD_RESULT}` : c;
}

/** Thu gọn các bước của một lượt đã xong để cất vào trí nhớ: bỏ dữ liệu kết quả công cụ, bỏ các lần AI trả lời hỏng và câu nhắc. */
function compactTurn(turn: ThreadMsg[]): ThreadMsg[] {
  const out: ThreadMsg[] = [];
  for (const m of turn) {
    if (m.r === "t" && (m.c === FORMAT_REMINDER || m.c === TOOL_NUDGE)) {
      if (out.at(-1)?.r === "a") out.pop(); // câu trả lời hỏng / câu né công cụ đứng ngay trước câu nhắc
      continue;
    }
    out.push(m.r === "t" ? { r: "t", c: stubResult(m.c) } : m);
  }
  return out;
}

export async function runAssistantTurn(input: {
  chat: ChatProvider;
  model: string;
  ctx: ToolCtx;
  /** tin của người ra lệnh (đã bỏ @tag) */
  text: string;
  /** bối cảnh để dựng lời dặn; việc đang chờ và bảng mã tham chiếu được điền ở đây theo trạng thái hiện tại của mạch */
  facts: Omit<PromptFacts, "pending" | "knownRefs">;
  /** báo "đang soạn tin" trước mỗi lần hỏi AI (không bắt buộc) */
  typing?: () => Promise<void>;
}): Promise<TurnUsage> {
  const { ctx, chat, model } = input;
  const usage: TurnUsage = { promptTokens: 0, completionTokens: 0, steps: 0 };
  const thread = ctx.thread;
  const history = thread.state.messages;
  /** các bước của riêng lượt này: lời người ra lệnh, bước AI chọn, kết quả công cụ */
  const turn: ThreadMsg[] = [{ r: "u", c: input.text }];
  /** ghi một sự cố của lượt này vào nhật ký để quản trị viên xem lại ở Cài đặt Zalo (D130); không bao giờ ném lỗi */
  const note = (kind: IssueKind, extra: { detail?: string | null; tool?: string } = {}) =>
    logIssue({ kind, chatId: ctx.chat.chatId, isGroup: ctx.isGroup, chatName: ctx.groupName, staffName: ctx.user.name, command: input.text, model, ...extra });

  /**
   * Kết thúc lượt: nói với người ra lệnh (nếu có lời) và cất lượt vào trí nhớ. `byTool` = tên công cụ đã tự viết lời này
   * (ghi thành kết quả của công cụ đó); bỏ trống = lời của chính AI. `forget` = không cất lượt này (lượt hỏng).
   */
  const finish = async (botText: string, opts: { byTool?: string; forget?: boolean } = {}) => {
    if (!opts.forget) {
      const done = compactTurn(turn);
      if (opts.byTool) done.push({ r: "t", c: `${TOOL_RESULT_PREFIX} ${opts.byTool}] hệ thống đã ${botText ? `gửi người ra lệnh: ${clip(botText, 700)}` : "bắt đầu gửi ảnh vào cuộc chat"}` });
      else done.push({ r: "a", c: JSON.stringify({ say: botText }) });
      history.push(...done);
    }
    if (botText) await ctx.say(botText, usage);
    return usage;
  };

  // Đồng ý / từ chối việc đang chờ bằng một tin ngắn: làm thẳng, khỏi hỏi AI (nhanh hơn và không thể hiểu nhầm).
  if (thread.pending) {
    const answer = confirmIntent(input.text);
    if (answer) {
      const pending = thread.pending;
      thread.pending = null;
      const tool = answer === "yes" ? "xac_nhan" : "huy";
      turn.push({ r: "a", c: commandJson(tool) });
      return finish(answer === "yes" ? await executePlan(ctx, pending.exec) : "Dạ, em bỏ việc đó rồi ạ.", { byTool: tool });
    }
  }

  let formatRemindersLeft = 1;
  let nudgesLeft = 1;
  let lastCall = "";
  for (let step = 0; step < MAX_STEPS; step++) {
    const system = buildSystemPrompt(TOOL_SPECS, { ...input.facts, pending: thread.pending?.summary ?? null, knownRefs: refLegend(thread.state) });
    let raw: string;
    try {
      await input.typing?.();
      const r = await chat.complete({ model, messages: [{ role: "system", content: [textPart(system)] }, ...toChat([...trimThread(history), ...turn])] });
      usage.promptTokens += r.promptTokens;
      usage.completionTokens += r.completionTokens;
      usage.steps++;
      raw = r.text;
    } catch (e) {
      await note("AI_UNREACHABLE", { detail: e instanceof Error ? e.message : String(e) });
      return finish(`Em chưa gọi được AI để xử lý (${e instanceof ChatError ? e.message : "lỗi mạng"}). Anh/chị thử lại sau ít phút nhé.`, { forget: true });
    }

    const action = parseAction(raw, TOOL_NAMES);
    if (!action) {
      console.error(`Zalo agent (model ${model}): câu trả lời không đúng quy ước:`, raw.slice(0, 1000));
      const remind = formatRemindersLeft-- > 0;
      await note(remind ? "BAD_FORMAT" : "NOT_UNDERSTOOD", { detail: raw });
      if (remind) {
        turn.push({ r: "a", c: raw.slice(0, 1500) }, { r: "t", c: FORMAT_REMINDER });
        continue;
      }
      return finish(NOT_UNDERSTOOD, { forget: true });
    }
    if (action.kind === "say") {
      // AI né công cụ ("để em kiểm tra", "em chưa kết nối được công cụ") khi chưa gọi công cụ nào: nhắc một lần cho gọi
      // luôn; vẫn né thì máy chủ tự trả lời và bỏ lượt này khỏi trí nhớ.
      const usedTool = turn.some((m) => m.r === "t" && m.c.startsWith(TOOL_RESULT_PREFIX));
      if (!usedTool && skipsTools(action.text)) {
        console.error(`Zalo agent (model ${model}): AI né công cụ:`, action.text.slice(0, 300));
        const nudge = nudgesLeft-- > 0;
        await note(nudge ? "DODGE" : "DODGE_FALLBACK", { detail: action.text });
        if (nudge) {
          turn.push({ r: "a", c: JSON.stringify({ say: action.text }) }, { r: "t", c: TOOL_NUDGE });
          continue;
        }
        return finish(DODGE_FALLBACK, { forget: true });
      }
      // đã phải nhắc mà lượt vẫn kết thúc không có lệnh nào: vẫn chuyển lời (có thể là một câu hỏi lại hợp lý) nhưng không cất
      // lượt này vào trí nhớ, để một lần AI lưỡng lự không thành thói quen của cả mạch
      return finish(action.text, { forget: !usedTool && nudgesLeft < 1 });
    }

    const call = commandJson(action.tool, action.args);
    if (call === lastCall) break; // AI gọi lại y hệt bước vừa rồi: dừng để khỏi lặp vô ích (và khỏi tốn token)
    lastCall = call;
    turn.push({ r: "a", c: call });

    const outcome = await runTool(ctx, action.tool, action.args);
    if ("final" in outcome) return finish(outcome.final, { byTool: action.tool });
    if ("error" in outcome && outcome.fault) await note(outcome.fault === "crash" ? "TOOL_CRASH" : "BAD_ARGS", { tool: action.tool, detail: outcome.detail });
    turn.push({ r: "t", c: toolResultMessage(action.tool, "error" in outcome ? { loi: outcome.error } : outcome.data) });
  }
  await note("TOO_LONG", { detail: lastCall ? `Lệnh cuối: ${lastCall}` : null });
  return finish(TOO_LONG, { forget: true });
}
