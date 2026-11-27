import { describe, expect, it, vi } from "vitest";
import type { S3Client } from "@aws-sdk/client-s3";
import { R2Storage } from "./r2";
import { StorageNotFoundError } from "./types";

/** S3 giả: ghi lại các lệnh và trả kết quả theo từng loại lệnh. */
function fakeClient(handler: (cmd: { constructor: { name: string }; input: Record<string, unknown> }) => unknown) {
  const sent: { name: string; input: Record<string, unknown> }[] = [];
  const client = {
    send: vi.fn(async (cmd: { constructor: { name: string }; input: Record<string, unknown> }) => {
      sent.push({ name: cmd.constructor.name, input: cmd.input });
      return handler(cmd);
    }),
  } as unknown as S3Client;
  return { client, sent };
}

const settings = { accountId: "acc", accessKeyId: "k", secretAccessKey: "s", bucket: "bk" };

describe("R2Storage", () => {
  it("put: gửi đúng bucket, key, loại nội dung và cho lưu đệm lâu", async () => {
    const { client, sent } = fakeClient(() => ({}));
    await new R2Storage(settings, client).put("mockups/b/2026-11/x.webp", Buffer.from("abc"), { contentType: "image/webp" });
    expect(sent[0].name).toBe("PutObjectCommand");
    expect(sent[0].input).toMatchObject({ Bucket: "bk", Key: "mockups/b/2026-11/x.webp", ContentType: "image/webp" });
    expect(String(sent[0].input.CacheControl)).toContain("immutable");
    expect(Buffer.from(sent[0].input.Body as Buffer).toString()).toBe("abc");
  });

  it("put: ảnh riêng của khách (zalo/...) không được cho CDN lưu đệm công khai", async () => {
    const { client, sent } = fakeClient(() => ({}));
    await new R2Storage(settings, client).put("zalo/contact1/123.jpg", Buffer.from("x"));
    expect(String(sent[0].input.CacheControl)).toContain("private");
    expect(String(sent[0].input.CacheControl)).not.toContain("immutable");
  });

  it("put: không nói loại nội dung thì đoán theo đuôi file", async () => {
    const { client, sent } = fakeClient(() => ({}));
    await new R2Storage(settings, client).put("logos/c/x.png", Buffer.from("x"));
    expect(sent[0].input.ContentType).toBe("image/png");
  });

  it("get: trả về đúng nội dung", async () => {
    const { client } = fakeClient(() => ({ Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) } }));
    expect([...(await new R2Storage(settings, client).get("a/b.webp"))]).toEqual([1, 2, 3]);
  });

  it("get: file không có trong kho thì báo lỗi ghi rõ key (không còn câu 'The specified key does not exist' trống trơn)", async () => {
    const { client } = fakeClient(() => {
      throw Object.assign(new Error("The specified key does not exist."), { name: "NoSuchKey", $metadata: { httpStatusCode: 404 } });
    });
    const failed = new R2Storage(settings, client).get("materials/a/reference-x.webp");
    await expect(failed).rejects.toBeInstanceOf(StorageNotFoundError);
    await expect(failed).rejects.toThrow("Không tìm thấy file trong kho ảnh: materials/a/reference-x.webp");
    const denied = fakeClient(() => {
      throw Object.assign(new Error("denied"), { name: "AccessDenied", $metadata: { httpStatusCode: 403 } });
    });
    await expect(new R2Storage(settings, denied.client).get("a/b.webp")).rejects.toThrow("denied"); // lỗi khác giữ nguyên
  });

  it("exists: có / không có (404) / lỗi khác thì ném lên", async () => {
    const ok = fakeClient(() => ({}));
    expect(await new R2Storage(settings, ok.client).exists("a/b.webp")).toBe(true);
    const missing = fakeClient(() => {
      throw Object.assign(new Error("nf"), { name: "NotFound", $metadata: { httpStatusCode: 404 } });
    });
    expect(await new R2Storage(settings, missing.client).exists("a/b.webp")).toBe(false);
    const denied = fakeClient(() => {
      throw Object.assign(new Error("denied"), { name: "AccessDenied", $metadata: { httpStatusCode: 403 } });
    });
    await expect(new R2Storage(settings, denied.client).exists("a/b.webp")).rejects.toThrow("denied");
  });

  it("delete: gửi lệnh xóa đúng key", async () => {
    const { client, sent } = fakeClient(() => ({}));
    await new R2Storage(settings, client).delete("a/b.webp");
    expect(sent[0]).toMatchObject({ name: "DeleteObjectCommand", input: { Bucket: "bk", Key: "a/b.webp" } });
  });

  it("chặn key thoát ra ngoài (../, đường dẫn tuyệt đối, dấu \\)", async () => {
    const { client, sent } = fakeClient(() => ({}));
    const r2 = new R2Storage(settings, client);
    await expect(r2.put("../x.webp", Buffer.from("x"))).rejects.toThrow();
    await expect(r2.get("/etc/passwd")).rejects.toThrow();
    await expect(r2.delete("a\\b")).rejects.toThrow();
    expect(sent).toHaveLength(0);
  });
});
