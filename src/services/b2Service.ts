import crypto from "crypto";
import B2 from "backblaze-b2";

async function withB2<T>(fn: (b2: B2) => Promise<T>): Promise<T> {
  const applicationKeyId = process.env.B2_APPLICATION_KEY_ID;
  const applicationKey = process.env.B2_APPLICATION_KEY;
  if (!applicationKeyId || !applicationKey) {
    throw new Error("B2_APPLICATION_KEY_ID and B2_APPLICATION_KEY must be set");
  }
  const b2 = new B2({ applicationKeyId, applicationKey });
  await b2.authorize();
  return fn(b2);
}

export async function uploadDigitalToB2(params: {
  buffer: Buffer;
  fileName: string;
  contentType: string;
}): Promise<{
  fileId: string;
  fileName: string;
  bucketId: string;
  contentType: string;
}> {
  const bucketId = process.env.B2_BUCKET_ID;
  if (!bucketId) {
    throw new Error("B2_BUCKET_ID must be set");
  }
  return withB2(async (b2) => {
    const { data: upload } = await b2.getUploadUrl({ bucketId });
    const { data } = await b2.uploadFile({
      uploadUrl: upload.uploadUrl,
      uploadAuthToken: upload.authorizationToken,
      fileName: params.fileName,
      data: params.buffer,
      mime: params.contentType,
    });
    return {
      fileId: data.fileId,
      fileName: data.fileName,
      bucketId,
      contentType: params.contentType,
    };
  });
}

/**
 * Upload a storefront image (physical products). Returns a **public** friendly URL
 * (`{downloadUrl}/file/{bucket}/{path}`). The bucket should allow public read for these objects
 * (typical for product photos).
 */
export async function uploadProductImageToB2(params: {
  buffer: Buffer;
  fileName: string;
  contentType: string;
}): Promise<{ publicUrl: string; fileName: string; fileId: string }> {
  const bucketId = process.env.B2_BUCKET_ID;
  const bucketName = process.env.B2_BUCKET_NAME;
  if (!bucketId || !bucketName) {
    throw new Error("B2_BUCKET_ID and B2_BUCKET_NAME must be set");
  }
  return withB2(async (b2) => {
    const { data: upload } = await b2.getUploadUrl({ bucketId });
    const { data } = await b2.uploadFile({
      uploadUrl: upload.uploadUrl,
      uploadAuthToken: upload.authorizationToken,
      fileName: params.fileName,
      data: params.buffer,
      mime: params.contentType,
    });
    const downloadUrl = b2.downloadUrl;
    if (!downloadUrl) {
      throw new Error("B2 downloadUrl missing after authorize");
    }
    const pathFile = data.fileName
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    const publicUrl = `${downloadUrl}/file/${bucketName}/${pathFile}`;
    return {
      publicUrl,
      fileName: data.fileName,
      fileId: data.fileId,
    };
  });
}

export function uniquePhysicalImageKey(originalName: string): string {
  const safe =
    originalName.replace(/[^a-zA-Z0-9._-]/g, "_") || "image";
  const id = crypto.randomBytes(8).toString("hex");
  return `physical/${Date.now()}-${id}-${safe}`;
}

/**
 * Time-limited download URL for a private B2 file (e-books / PDFs).
 * @see https://www.backblaze.com/b2/docs/b2_get_download_authorization.html
 */
export async function getAuthorizedDownloadUrl(params: {
  bucketId: string;
  fileName: string;
  validDurationInSeconds?: number;
}): Promise<{ url: string; expiresInSeconds: number }> {
  const bucketName = process.env.B2_BUCKET_NAME;
  if (!bucketName) {
    throw new Error("B2_BUCKET_NAME must be set for download URLs");
  }
  const validDurationInSeconds = params.validDurationInSeconds ?? 3600;
  return withB2(async (b2) => {
    const downloadUrl = b2.downloadUrl;
    if (!downloadUrl) {
      throw new Error("B2 download URL missing after authorize");
    }
    const { data } = await b2.getDownloadAuthorization({
      bucketId: params.bucketId,
      fileNamePrefix: params.fileName,
      validDurationInSeconds,
    });
    const pathFile = params.fileName
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    const url = `${downloadUrl}/file/${bucketName}/${pathFile}?Authorization=${encodeURIComponent(data.authorizationToken)}`;
    return { url, expiresInSeconds: validDurationInSeconds };
  });
}
