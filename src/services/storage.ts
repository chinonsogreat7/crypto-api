import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { createId } from "../data/store";
import { isEnumValue, isNonEmptyString } from "../utils/validation";

const SAFE_FILE_NAME = /[^a-zA-Z0-9._-]/g;
const SAFE_FOLDER_PART = /[^a-zA-Z0-9_-]/g;
const CLOUDINARY_UPLOAD_TTL_SECONDS = 10 * 60;

export interface KycUploadRequest {
  fileName?: string;
  contentType?: string;
  documentKind?: "selfie" | "document_front" | "document_back";
}

export interface KycUploadFile {
  fileName: string;
  contentType: string;
  buffer: Buffer;
  documentKind?: "selfie" | "document_front" | "document_back";
}

interface CloudinaryConfig {
  apiKey: string;
  apiSecret: string;
  cloudName: string;
  kycFolder: string;
}

let envFileCache: Record<string, string> | null = null;

function loadEnvFile(): Record<string, string> {
  if (envFileCache) return envFileCache;

  envFileCache = {};
  const envPath = path.join(process.cwd(), ".env");
  if (!existsSync(envPath)) return envFileCache;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...valueParts] = trimmed.split("=");
    const rawValue = valueParts.join("=").trim();
    envFileCache[key.trim()] = rawValue.replace(/^["']|["']$/g, "");
  }

  return envFileCache;
}

function env(name: string): string | undefined {
  return process.env[name] || loadEnvFile()[name];
}

function parseCloudinaryUrl(value: string | undefined): Omit<CloudinaryConfig, "kycFolder"> | null {
  if (!value) return null;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "cloudinary:" || !parsed.username || !parsed.password || !parsed.hostname) {
      return null;
    }

    return {
      apiKey: decodeURIComponent(parsed.username),
      apiSecret: decodeURIComponent(parsed.password),
      cloudName: parsed.hostname
    };
  } catch {
    return null;
  }
}

function cloudinaryConfig(): CloudinaryConfig | null {
  const fromUrl = parseCloudinaryUrl(env("CLOUDINARY_URL"));
  const cloudName = env("CLOUDINARY_CLOUD_NAME") || fromUrl?.cloudName;
  const apiKey = env("CLOUDINARY_API_KEY") || fromUrl?.apiKey;
  const apiSecret = env("CLOUDINARY_API_SECRET") || fromUrl?.apiSecret;

  if (!cloudName || !apiKey || !apiSecret) return null;

  return {
    cloudName,
    apiKey,
    apiSecret,
    kycFolder: (env("CLOUDINARY_KYC_FOLDER") || "kyc").replace(SAFE_FOLDER_PART, "_")
  };
}

function signCloudinaryUpload(params: Record<string, string | number>, apiSecret: string): string {
  const payload = Object.entries(params)
    .filter(([, value]) => value !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return createHash("sha1")
    .update(`${payload}${apiSecret}`)
    .digest("hex");
}

function fileBaseName(fileName: string): string {
  const safeName = fileName.replace(SAFE_FILE_NAME, "_");
  const extensionStart = safeName.lastIndexOf(".");
  const baseName = extensionStart > 0 ? safeName.slice(0, extensionStart) : safeName;
  return baseName || "upload";
}

function validateUploadRequest(body: KycUploadRequest) {
  const fileName = body.fileName?.trim();
  const contentType = body.contentType?.trim();
  const documentKind = body.documentKind || "document_front";

  if (!fileName || !contentType || !isNonEmptyString(fileName, 3, 120) || !/^[-\w.]+\/[-+\w.]+$/.test(contentType)) {
    return null;
  }

  if (!isEnumValue(documentKind, ["selfie", "document_front", "document_back"] as const)) {
    return null;
  }

  return { fileName, contentType, documentKind };
}

export function createKycUpload(userId: string, body: KycUploadRequest) {
  const validated = validateUploadRequest(body);
  if (!validated) return null;
  const { fileName, contentType, documentKind } = validated;

  const uploadId = createId("upload");
  const config = cloudinaryConfig();

  if (config) {
    const safeUserId = userId.replace(SAFE_FOLDER_PART, "_");
    const folder = `${config.kycFolder}/${safeUserId}/${documentKind}`;
    const publicName = `${uploadId}-${fileBaseName(fileName)}`;
    const storageKey = `${folder}/${publicName}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const uploadParams = {
      folder,
      overwrite: "false",
      public_id: publicName,
      timestamp
    };

    return {
      uploadId,
      provider: "cloudinary",
      cloudName: config.cloudName,
      storageKey,
      folder,
      publicId: storageKey,
      uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudName}/auto/upload`,
      publicUrl: `https://res.cloudinary.com/${config.cloudName}/image/upload/${storageKey}`,
      method: "POST",
      headers: {},
      formFields: {
        ...uploadParams,
        api_key: config.apiKey,
        signature: signCloudinaryUpload(uploadParams, config.apiSecret)
      },
      expiresAt: new Date(Date.now() + CLOUDINARY_UPLOAD_TTL_SECONDS * 1000).toISOString()
    };
  }

  const safeName = fileName.replace(SAFE_FILE_NAME, "_");
  const storageKey = `kyc/${userId}/${documentKind}/${uploadId}-${safeName}`;

  return {
    uploadId,
    provider: "demo_local_storage",
    storageKey,
    uploadUrl: `/storage/uploads/${storageKey}`,
    publicUrl: `/storage/files/${storageKey}`,
    method: "PUT",
    headers: {
      "content-type": contentType
    },
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
  };
}

export async function uploadKycFile(userId: string, file: KycUploadFile) {
  const validated = validateUploadRequest(file);
  if (!validated || !file.buffer.length) return null;

  const upload = createKycUpload(userId, validated);
  if (!upload) return null;

  if (upload.provider !== "cloudinary" || !("formFields" in upload)) {
    return {
      ...upload,
      uploaded: true,
      directUpload: true,
      fileName: validated.fileName,
      contentType: validated.contentType,
      sizeBytes: file.buffer.length,
      note: "Demo local storage accepted the file bytes but does not persist binary files. Configure Cloudinary for real hosted uploads."
    };
  }

  const formData = new FormData();
  const cloudinaryUpload = upload as typeof upload & { formFields: Record<string, string | number>; uploadUrl: string; publicUrl: string; publicId: string };
  for (const [key, value] of Object.entries(cloudinaryUpload.formFields)) {
    formData.append(key, String(value));
  }
  const fileBytes = file.buffer.buffer.slice(file.buffer.byteOffset, file.buffer.byteOffset + file.buffer.byteLength) as ArrayBuffer;
  formData.append("file", new Blob([fileBytes], { type: validated.contentType }), validated.fileName);

  const { formFields: _formFields, ...cloudinaryMetadata } = cloudinaryUpload;
  let response: Response;
  try {
    response = await fetch(cloudinaryUpload.uploadUrl, {
      method: "POST",
      body: formData
    });
  } catch (error) {
    return {
      ...cloudinaryMetadata,
      uploaded: false,
      directUpload: true,
      error: {
        message: "Cloudinary upload request failed.",
        detail: error instanceof Error ? error.message : String(error)
      }
    };
  }
  const result = (await response.json().catch(() => null)) as Record<string, unknown> | null;

  if (!response.ok || !result) {
    return {
      ...cloudinaryMetadata,
      uploaded: false,
      directUpload: true,
      statusCode: response.status,
      error: result || { message: "Cloudinary upload failed." }
    };
  }

  return {
    ...cloudinaryMetadata,
    uploaded: true,
    directUpload: true,
    fileName: validated.fileName,
    contentType: validated.contentType,
    sizeBytes: typeof result.bytes === "number" ? result.bytes : file.buffer.length,
    publicUrl: typeof result.secure_url === "string" ? result.secure_url : cloudinaryUpload.publicUrl,
    publicId: typeof result.public_id === "string" ? result.public_id : cloudinaryUpload.publicId,
    cloudinary: result
  };
}
