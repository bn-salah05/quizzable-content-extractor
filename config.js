/* config.js
 * ─────────────────────────────────────────────────────────────────────────
 * Edit this file to change the Gemini configuration.
 *
 * A browser page cannot read a .env file — there is no filesystem access
 * and no dotenv loader. This file is the closest equivalent: edit, save,
 * reload the page. Done.
 *
 * Endpoint shape mirrors the working Laravel GeminiClient:
 *   POST {BASE_URL}/models/{MODEL}:generateContent
 *   header: x-goog-api-key
 * ─────────────────────────────────────────────────────────────────────────
 */

window.ROADMAP_CLEANER_CONFIG = {
  GEMINI_API_KEY: "AQ.Ab8RN6IOrIdor32OVnblZ17ArUCNg1XLdnwbeJljurZpbM6Q-w",

  GEMINI_MODEL:    "gemini-3.6-flash",
  GEMINI_API_BASE: "https://generativelanguage.googleapis.com/v1beta",

  TEMPERATURE:      0.7,
  THINKING_BUDGET:  0,        // 0 disables reasoning (faster, cheaper)
  REQUEST_TIMEOUT:  300000    // 5 minutes
};
