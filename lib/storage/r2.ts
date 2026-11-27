import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { contentTypeOf, isPublicKey } from "./keys";
import { sanitizeKey } from "./local";
import { StorageNotFoundError, type PutOptions, type StorageDriver } from "./types";

/** R2 báo "không có file này": 404, NotFound (lệnh HEAD) hoặc NoSuchKey (lệnh GET). */
function isMissing(e: unknown): boolean {
  const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
  const name = (e as { name?: string }).name;
  return status === 404 || name === "NotFound" || name === "NoSuchKey";
}

export type R2Settings = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string };

/** Ảnh công khai đặt tên ngẫu nhiên và không bao giờ ghi đè (đổi ảnh = key mới), nên cho trình duyệt/CDN lưu đệm lâu. */
const CACHE_PUBLIC = "public, max-age=31536000, immutable";
/** Ảnh riêng của khách (Zalo) nằm cùng bucket nhưng không cho CDN/máy chung lưu đệm. */
const CACHE_PRIVATE = "private, max-age=3600";

/**
 * Cloudflare R2 qua API S3. Endpoint https://{accountId}.r2.cloudflarestorage.com, region "auto".
 * Tắt tính checksum tự động của SDK mới (R2 không cần và có bản từng từ chối).
 */
export class R2Storage implements StorageDriver {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(settings: R2Settings, client?: S3Client) {
    this.bucket = settings.bucket;
    this.client =
      client ??
      new S3Client({
        region: "auto",
        endpoint: `https://${settings.accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
        forcePathStyle: true,
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
      });
  }

  async put(key: string, data: Buffer, opts?: PutOptions): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: sanitizeKey(key),
        Body: data,
        ContentType: opts?.contentType ?? contentTypeOf(key),
        CacheControl: isPublicKey(key) ? CACHE_PUBLIC : CACHE_PRIVATE,
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    let res;
    try {
      res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: sanitizeKey(key) }));
    } catch (e) {
      if (isMissing(e)) throw new StorageNotFoundError(key);
      throw e;
    }
    if (!res.Body) throw new Error(`File rỗng: ${key}`);
    return Buffer.from(await res.Body.transformToByteArray());
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: sanitizeKey(key) }));
      return true;
    } catch (e) {
      if (isMissing(e)) return false;
      throw e;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: sanitizeKey(key) }));
  }
}
