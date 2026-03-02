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
  const url = `${BASE_URL}/chat`;
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
        onChunk(data);
      }
    }
  }
}

// --------------- Image upload ---------------

export async function uploadImage(
  file: File
): Promise<{ url: string; analysis: string }> {
  validateFileSize(file);

  const formData = new FormData();
  formData.append("file", file);

  const url = `${BASE_URL}/upload`;
  const res = await fetch(url, { method: "POST", body: formData });

  if (!res.ok) {
    const body = await res.text().catch(() => "Upload failed");
    throw new ApiError(body, res.status);
  }

  return res.json();
}

// --------------- User profile ---------------

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  age?: number;
  gender?: string;
  medical_history?: string[];
  allergies?: string[];
  created_at?: string;
  updated_at?: string;
}

export async function getProfile(uid: string): Promise<UserProfile> {
  return request<UserProfile>(`/profile/${uid}`);
}

export async function createProfile(
  profile: Omit<UserProfile, "created_at" | "updated_at">
): Promise<UserProfile> {
  return request<UserProfile>("/profile", {
    method: "POST",
    body: JSON.stringify(profile),
  });
}

export async function updateProfile(
  uid: string,
  data: Partial<UserProfile>
): Promise<UserProfile> {
  return request<UserProfile>(`/profile/${uid}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

// --------------- Diagnosis models ---------------

export interface DiagnosisInput {
  symptoms: string;
  image?: string;
  patient_info?: Record<string, unknown>;
}

export interface DiagnosisResult {
  diagnosis: string;
  confidence: number;
  recommendations: string[];
  model: string;
}

export async function diagnose(
  model: string,
  input: DiagnosisInput
): Promise<DiagnosisResult> {
  return request<DiagnosisResult>(`/diagnose/${model}`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// --------------- Nearby places ---------------

export interface Place {
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating?: number;
  type: string;
}

export async function getNearbyPlaces(
  lat: number,
  lng: number,
  radius: number = 5000
): Promise<Place[]> {
  return request<Place[]>(
    `/places/nearby?lat=${lat}&lng=${lng}&radius=${radius}`
  );
}

// --------------- Diagnose with image file ---------------

export async function diagnoseImage(
  modelType: string,
  file: File
): Promise<DiagnosisResult> {
  validateFileSize(file);

  const formData = new FormData();
  formData.append("file", file);

  const url = `${BASE_URL}/diagnose/${modelType}`;
  const res = await fetch(url, { method: "POST", body: formData });

  if (!res.ok) {
    const body = await res.text().catch(() => "Diagnosis failed");
    throw new ApiError(body, res.status);
  }

  return res.json();
}

export { ApiError };
