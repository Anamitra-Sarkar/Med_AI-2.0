const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:7860";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function validateFileSize(file: File): void {
  if (file.size > MAX_FILE_SIZE) {
    throw new ApiError(
      `File size exceeds the 10 MB limit. Selected file is ${(file.size / (1024 * 1024)).toFixed(1)} MB.`,
      413
    );
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "Unknown error");
    throw new ApiError(body, res.status);
  }

  return res.json() as Promise<T>;
}

// --------------- Chat (SSE streaming) ---------------

export async function chat(
  message: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
  history?: Array<{ role: string; content: string }>,
  userProfile?: UserProfile | null
): Promise<void> {
  const url = `${BASE_URL}/api/chat`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history, user_profile: userProfile }),
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "Unknown error");
    throw new ApiError(body, res.status);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new ApiError("No response body", 500);

  const decoder = new TextDecoder();
  let done = false;

  while (!done) {
    const result = await reader.read();
    done = result.done;
    if (result.value) {
      const text = decoder.decode(result.value, { stream: true });
      const lines = text.split("\n").filter((l) => l.startsWith("data: "));
      for (const line of lines) {
        const data = line.replace("data: ", "");
        if (data === "[DONE]") return;
        try {
          const parsed = JSON.parse(data);
          if (parsed.content) onChunk(parsed.content);
          if (parsed.error) throw new ApiError(parsed.error, 500);
        } catch {
          onChunk(data);
        }
      }
    }
  }
}

// --------------- Image analysis ---------------

export async function analyzeImage(
  file: File,
  prompt?: string
): Promise<{ analysis: string }> {
  validateFileSize(file);

  const formData = new FormData();
  formData.append("file", file);
  if (prompt) formData.append("prompt", prompt);

  const url = `${BASE_URL}/api/analyze-image`;
  const res = await fetch(url, { method: "POST", body: formData });

  if (!res.ok) {
    const body = await res.text().catch(() => "Analysis failed");
    throw new ApiError(body, res.status);
  }

  return res.json();
}

// --------------- User profile ---------------

export interface UserProfile {
  id?: string;
  firebase_uid: string;
  name: string;
  email: string;
  diseases?: string;
  height?: string;
  weight?: string;
  left_eye_power?: string;
  right_eye_power?: string;
}

export async function getProfile(firebaseUid: string): Promise<UserProfile> {
  return request<UserProfile>(`/api/profile/${firebaseUid}`);
}

export async function createProfile(
  profile: Omit<UserProfile, "id">
): Promise<UserProfile> {
  return request<UserProfile>("/api/profile", {
    method: "POST",
    body: JSON.stringify(profile),
  });
}

export async function updateProfile(
  firebaseUid: string,
  data: Partial<UserProfile>
): Promise<UserProfile> {
  return request<UserProfile>(`/api/profile/${firebaseUid}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

// --------------- Diagnosis models ---------------

export interface DiagnosisResult {
  model: string;
  predictions: Record<string, number>;
  summary: string;
}

export async function diagnoseImage(
  modelType: string,
  file: File
): Promise<DiagnosisResult> {
  validateFileSize(file);

  const formData = new FormData();
  formData.append("file", file);

  const url = `${BASE_URL}/api/diagnose/${modelType}`;
  const res = await fetch(url, { method: "POST", body: formData });

  if (!res.ok) {
    const body = await res.text().catch(() => "Diagnosis failed");
    throw new ApiError(body, res.status);
  }

  return res.json();
}

// --------------- Nearby places ---------------

export interface Place {
  name: string;
  address: string;
  rating?: number;
  location?: { lat: number; lng: number };
  open_now?: boolean;
  place_id?: string;
}

export async function getNearbyPlaces(
  lat: number,
  lng: number,
  type: string = "hospital",
  radius: number = 5000
): Promise<{ results: Place[] }> {
  return request<{ results: Place[] }>(
    `/api/nearby-care?lat=${lat}&lng=${lng}&type=${type}&radius=${radius}`
  );
}

export { ApiError };
