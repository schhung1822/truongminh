/** Thực hiện một thao tác cuộn/bấm rồi chờ DOM ngừng thay đổi; trả false nếu hết thời gian mà không có mutation. */
export function actAndWaitForDom(
  action: () => void,
  opts: { root?: Node; timeoutMs?: number; quietMs?: number; onMutation?: () => void } = {},
): Promise<boolean> {
  const root = opts.root ?? document.body;
  const timeoutMs = opts.timeoutMs ?? 4_500;
  const quietMs = opts.quietMs ?? 600;

  return new Promise<boolean>((resolve, reject) => {
    let changed = false;
    let quietTimer: ReturnType<typeof setTimeout> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let finished = false;

    const finish = (result: boolean) => {
      if (finished) return;
      finished = true;
      observer.disconnect();
      if (quietTimer) clearTimeout(quietTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      resolve(result);
    };
    const observer = new MutationObserver(() => {
      changed = true;
      opts.onMutation?.();
      if (quietTimer) clearTimeout(quietTimer);
      quietTimer = setTimeout(() => finish(true), quietMs);
    });

    // Không theo dõi attribute: Facebook đổi style/aria liên tục và có thể làm thời gian "yên" không bao giờ tới.
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    timeoutTimer = setTimeout(() => finish(changed), timeoutMs);
    try {
      action();
    } catch (error) {
      observer.disconnect();
      if (quietTimer) clearTimeout(quietTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      reject(error);
    }
  });
}
