import { GoogleGenAI } from "@google/genai";

const LOCAL_STORAGE_KEY = 'user_gemini_api_key';

/**
 * Returns a new GoogleGenAI instance configured with the appropriate API key.
 * It prioritizes the user-provided key from localStorage and falls back to 
 * the environment variable. This function is called before every API request
 * to ensure the latest key is always used.
 * @throws {Error} if no API key is available.
 */
export function getAiInstance(): GoogleGenAI {
    const userKey = localStorage.getItem(LOCAL_STORAGE_KEY);
    const keyToUse = userKey || process.env.API_KEY;

    if (!keyToUse) {
        // Throw a clear error that can be caught by the UI later if needed.
        throw new Error("API 키가 설정되지 않았습니다. 설정에서 키를 입력해주세요.");
    }
    
    return new GoogleGenAI({ apiKey: keyToUse });
}

/**
 * Sets the user-provided API key and saves it to localStorage.
 * Pass null or an empty string to clear the user's key and revert to the default.
 * @param key The API key string.
 */
export function setUserApiKey(key: string | null): void {
    if (key && key.trim()) {
        localStorage.setItem(LOCAL_STORAGE_KEY, key.trim());
    } else {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
}

/**
 * Gets the user-provided API key from localStorage.
 * Returns an empty string if not set.
 */
export function getUserApiKey(): string {
    return localStorage.getItem(LOCAL_STORAGE_KEY) || '';
}
