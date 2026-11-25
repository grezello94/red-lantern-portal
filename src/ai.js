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

Your mission:
1. Examine the provided "Current Stock Photo" of the crates/shelf/pantry. Notice that bottles or packets may be standing upright, tilted, lying flat, stacked, or grouped.
2. If "Reference Photos" are provided (showing items from different angles or orientations like standing upright vs lying flat or in crates), use them as the visual benchmark. These benchmark photos show how items look in real restaurant conditions (e.g. sauce pouches lying on their side, bottles seen from the cap or label).
3. For each catalog item, determine:
   - "level": One of "Empty", "Low (~20% left)", "Half (~50% left)", "Plenty (>80%)", or "Not visible / Unknown".
   - "suggestedQuantity": Recommended number to order.
     - If the item has a standard full capacity or par level, calculate the difference to reach full.
     - If low or empty, suggest a reasonable number to replenish.
     - If plenty or full, suggestedQuantity MUST be 0.
   - "reason": A short 1-sentence explanation of what you see (e.g. "Only 2 bottles visible standing, none in back row").

Respond ONLY with a valid JSON array conforming to this exact schema:
[
  {
    "id": "item id matching the catalog exactly",
    "name": "item name",
    "level": "Low (~20% left)",
    "suggestedQuantity": 5,
    "unit": "PIECES",
    "reason": "Crate appears nearly empty."
  }
]`;

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

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    }),
  });

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
    if (!Array.isArray(parsed)) {
      throw new Error('Unexpected response format from Gemini.');
    }
    return parsed;
  } catch (err) {
    throw new Error(`Failed to parse AI analysis: ${err.message}`);
  }
}
