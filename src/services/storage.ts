import { createId } from "../data/store";

const SAFE_FILE_NAME = /[^a-zA-Z0-9._-]/g;

export interface KycUploadRequest {
  fileName?: string;
  contentType?: string;
  documentKind?: "selfie" | "document_front" | "document_back";
}

export function createKycUpload(userId: string, body: KycUploadRequest) {
  const fileName = body.fileName?.trim();
  const contentType = body.contentType?.trim();
  const documentKind = body.documentKind || "document_front";

  if (!fileName || !contentType) {
    return null;
  }

  const safeName = fileName.replace(SAFE_FILE_NAME, "_");
  const uploadId = createId("upload");
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
