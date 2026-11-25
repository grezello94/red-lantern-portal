const GEMINI_KEY_STORAGE = 'red_lantern_gemini_api_key';

export function getStoredGeminiKey() {
  try {
    return localStorage.getItem(GEMINI_KEY_STORAGE) || import.meta.env.VITE_GEMINI_API_KEY || '';
  } catch {
    return import.meta.env.VITE_GEMINI_API_KEY || '';
  }
}

export function saveStoredGeminiKey(key) {
  try {
    if (key && typeof key === 'string') {
      localStorage.setItem(GEMINI_KEY_STORAGE, key.trim());
    } else {
      localStorage.removeItem(GEMINI_KEY_STORAGE);
    }
  } catch {
    // Ignore localStorage restrictions
  }
}

/**
 * Compress an image file to a lightweight JPEG Base64 string directly in browser memory.
 * Maximum dimension 960px, JPEG quality 0.72 (~50-80KB).
 */
export async function compressImageToBase64(file, maxDimension = 960, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const base64Data = dataUrl.split(',')[1] || '';
        resolve({
          dataUrl,
          base64: base64Data,
          mimeType: 'image/jpeg',
          width,
          height,
        });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Analyze today's stock photo against catalog & reference photo using Google Gemini Vision.
 * Today's photo is processed in memory and NEVER saved or uploaded to the database.
 */
export async function analyzeShelfPhoto({
  apiKey, supplier, currentPhotoBase64, referencePhotos = [], referencePhotoBase64 = null,
}) {
  const activeKey = apiKey || getStoredGeminiKey();
  if (!activeKey) {
    throw new Error('Please enter a Google Gemini API Key to use photo analysis.');
  }

  const suppliesList = Array.isArray(supplier.supplies) ? supplier.supplies : [];
  if (!suppliesList.length) {
    throw new Error('No items registered in this supplier catalog to analyze.');
  }

  const catalogSummary = suppliesList.map((item) => {
    const target = item.targetQuantity ? ` (standard full capacity: ${item.targetQuantity} ${item.unit})` : '';
    return `- ID: "${item.id}", Name: "${item.name}", Unit: "${item.unit}"${target}`;
  }).join('\n');

  const systemPrompt = `You are an expert restaurant inventory specialist for "Red Lantern Restaurant".
We are inspecting current pantry / crates / stock for supplier: "${supplier.name}".

Registered items in this supplier catalog:
${catalogSummary}

CRITICAL RULES FOR 100% ACCURACY & ZERO GUESSWORK:
1. PHOTO CLARITY CHECK FIRST:
   - If the photo is too blurry, dark, shaky, obstructed, out-of-focus, or has severe glare preventing you from identifying labels or counting items accurately, set "photoQuality": "unclear" and describe the specific problem in "clarityIssue" (e.g. "Image has motion blur making sauce labels unreadable" or "Pantry is too dark to count bottles in crates").
   - If the photo is sufficiently clear to inspect, set "photoQuality": "clear" and "clarityIssue": "".
2. VISUAL GROUNDING WITH REFERENCE BENCHMARK PHOTOS:
   - Carefully cross-reference the bottles, packets, labels, cap colors, branding logos, and pouch shapes in the CURRENT stock photo against each REFERENCE photo.
   - Recognize that items may be standing upright, tilted, lying flat, stacked, or upside down. Use the reference angles to identify them in any orientation.
   - Do NOT guess or hallucinate items that are not visible in the photo. If an item from the catalog is not visible in the current photo, set "level": "Not visible / Unknown" and "suggestedQuantity": 0.
3. ACCURATE REORDER CALCULATION:
   - Count visible remaining units.
   - If an item has a "standard full capacity" (targetQuantity / par level), calculate replenishment: Math.max(0, targetQuantity - remainingCount).
   - If an item is Empty (0 visible or crate empty), suggest its standard capacity or a reasonable replenish quantity.
   - If an item is Plenty (>80% full), suggestedQuantity MUST be 0.
4. REASONING:
   - Provide a concise 1-sentence explanation of what you see (e.g., "Found 2 bottles standing and 1 lying down; 7 needed to reach par level of 10").

Respond ONLY with a valid JSON object conforming to this exact schema:
{
  "photoQuality": "clear" or "unclear",
  "clarityIssue": "" or "specific description of blur/darkness/glare",
  "items": [
    {
      "id": "item id matching the catalog exactly",
      "name": "item name",
      "level": "Low (~20% left)" | "Empty" | "Half (~50% left)" | "Plenty (>80%)" | "Not visible / Unknown",
      "suggestedQuantity": 5,
      "unit": "PIECES",
      "reason": "Visible count: 3 items (2 standing, 1 lying down)."
    }
  ]
}`;

  const refList = (Array.isArray(referencePhotos) && referencePhotos.length)
    ? referencePhotos
    : (referencePhotoBase64 ? [referencePhotoBase64] : []);

  const parts = [{ text: systemPrompt }];

  if (refList.length > 0) {
    parts.push({
      text: `REFERENCE BENCHMARK PHOTOS (${refList.length} photos showing how items look when stocked, from different angles or standing/laying states):`,
    });
    refList.forEach((refImg, index) => {
      parts.push({ text: `Reference photo ${index + 1} of ${refList.length}:` });
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: refImg.replace(/^data:image\/[a-z]+;base64,/, ''),
        },
      });
    });
  }

  parts.push({ text: 'CURRENT STOCK PHOTO (snapped right now in kitchen to place order):' });
  parts.push({
    inlineData: {
      mimeType: 'image/jpeg',
      data: currentPhotoBase64.replace(/^data:image\/[a-z]+;base64,/, ''),
    },
  });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(activeKey)}`;

  const controller = new AbortController();
  const timeoutTimer = setTimeout(() => controller.abort(), 16000);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
          topP: 0.8,
        },
      }),
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Analysis timed out. Please check your network connection and try again.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutTimer);
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody?.error?.message || `Gemini API request failed (${response.status})`;
    if (response.status === 400 && message.includes('API_KEY_INVALID')) {
      throw new Error('Invalid Gemini API Key. Please verify your free key in AI Settings.');
    }
    throw new Error(message);
  }

  const result = await response.json();
  const textContent = result?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textContent) {
    throw new Error('Gemini was unable to analyze the stock photo. Please try a clearer picture.');
  }

  try {
    const parsed = JSON.parse(textContent);
    if (Array.isArray(parsed)) {
      return {
        isUnclear: false,
        clarityIssue: '',
        suggestions: parsed,
      };
    }
    if (parsed && typeof parsed === 'object') {
      const isUnclear = parsed.photoQuality === 'unclear' || Boolean(parsed.clarityIssue && (!parsed.items || !parsed.items.length));
      return {
        isUnclear,
        clarityIssue: parsed.clarityIssue || (isUnclear ? 'Photo is blurry or too dark to verify items with 100% accuracy.' : ''),
        suggestions: Array.isArray(parsed.items) ? parsed.items : [],
      };
    }
    throw new Error('Unexpected response format from Gemini.');
  } catch (err) {
    throw new Error(`Failed to parse AI analysis: ${err.message}`);
  }
}
