const browserHost =
  typeof window !== "undefined" ? window.location.hostname : "localhost";
const RAW_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || `http://${browserHost}:3000`;
const DEFAULT_BASE_URL = String(RAW_BASE_URL).trim().replace(/\/+$/, "");
const REQUEST_TIMEOUT_MS = 20000;

export async function apiRequest(path, { method = "GET", body, token, headers } = {}) {
  const safePath = String(path || "").trim();
  const url = `${DEFAULT_BASE_URL}${safePath.startsWith("/") ? "" : "/"}${safePath}`;

  const hasBody = body !== undefined && body !== null;
  const isFormData =
    typeof FormData !== "undefined" && typeof body?.append === "function";

  const finalHeaders = {
    ...(!isFormData && hasBody ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...headers
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: finalHeaders,
      body: !hasBody ? undefined : isFormData ? body : JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("La solicitud tardó demasiado. Inténtalo de nuevo.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const contentType = response.headers.get("Content-Type") || "";
  const isJson = contentType.includes("application/json");

  if (!response.ok) {
    let message = `Error HTTP ${response.status}`;
    try {
      const data = isJson ? await response.json() : await response.text();
      if (data && typeof data === "object" && data.message) {
        message = data.message;
      } else if (typeof data === "string" && data.trim()) {
        message = data;
      }
    } catch {
      // ignorar errores de parseo
    }
    throw new Error(message);
  }

  if (!isJson) {
    return response.text();
  }

  return response.json();
}

