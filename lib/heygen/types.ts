export type HeygenAvatarStatus = "processing" | "ready" | "failed";
export type HeygenVideoStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export interface CreateAvatarResult {
  assetId: string;
  avatarId: string;
  status: HeygenAvatarStatus;
}

export interface GenerateVideoInput {
  avatarId: string;
  /** "digital_twin" renders a realistic cutout avatar; default talking_photo. */
  avatarKind?: "talking_photo" | "digital_twin";
  voiceId?: string;
  script: string;
  /** Listing photo URLs shown behind/around the avatar. */
  photoUrls?: string[];
  /** Where HeyGen should POST the completion event. */
  webhookUrl?: string;
  title?: string;
}

export interface GenerateVideoResult {
  videoId: string;
  status: HeygenVideoStatus;
}

export interface VideoStatusResult {
  videoId: string;
  status: HeygenVideoStatus;
  videoUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
  error?: string;
}
