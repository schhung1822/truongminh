/** Chạy `fn` cho từng phần tử, tối đa `limit` việc cùng lúc. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

export type Limiter = <T>(fn: () => Promise<T>) => Promise<T>;

/**
 * Bộ giới hạn dùng chung: gọi `run(fn)` từ bao nhiêu nơi cũng được, nhưng tối đa `max` việc chạy cùng lúc,
 * phần còn lại xếp hàng theo thứ tự đến.
 */
export function createLimiter(max: number): Limiter {
  let active = 0;
  const queue: (() => void)[] = [];
  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= max) {
      // chờ người đi trước nhường chỗ (nhường thẳng suất, không để người khác chen vào giữa)
      await new Promise<void>((resolve) => queue.push(resolve));
    } else {
      active++;
    }
    try {
      return await fn();
    } finally {
      const next = queue.shift();
      if (next) next();
      else active--;
    }
  };
}
