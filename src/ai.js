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
export async function compressImageToBase64(file, maxDimension = 1200, quality = 0.74) {
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
We are inspecting current kitchen pantry shelves / cubbies / crates / stock for supplier: "${supplier.name}".

Registered items in this supplier catalog:
${catalogSummary}

CRITICAL RULES FOR 100% ACCURACY IN DENSE PANTRY CONDITIONS:
1. PHOTO CLARITY CHECK FIRST:
   - If the photo is too blurry, dark, shaky, or out-of-focus preventing you from reading labels or counting items accurately, set "photoQuality": "unclear" and describe the specific problem in "clarityIssue" (e.g. "Image has motion blur making spice packet labels unreadable").
   - If the photo is sufficiently clear to inspect, set "photoQuality": "clear" and "clarityIssue": "".

2. DEEP SPATIAL & LAYER SCANNING (REAL RESTAURANT PANTRY RULES):
   - Multi-Cubby & Multi-Shelf Scanning: The photo may capture multiple wooden shelves, cubbies, or floor piles containing items from multiple suppliers. Focus STRICTLY on items belonging to "${supplier.name}"'s registered catalog above. Ignore unrelated items (e.g. paper boxes, napkins, or other ingredients not in this catalog).
   - Overlapping / Piled Pouches & Packets: Masala packets, spice pouches, and dal bags are often stacked in loose piles or lying flat over one another. Inspect the pile layer by layer. Identify visible packets by their distinct brand logos, header typography, colored borders, and text labels (e.g. Garam Masala, Cumin, Chinese Pepper, Kitchen King, Arhar Dal). Count each distinct visible packet even if partially overlapped or tilted.
   - Deep Rows & Stacked Bottles: Bottles of sauces, vinegar, syrups, and essence are frequently arranged in deep rows (front, middle, back) and sometimes bottles lie horizontally on top of standing bottle caps. Count both front rows, visible bottles in back rows through gaps, and any horizontal bottles lying on top. Use cap colors (e.g. green vs pink caps) and label colors to distinguish variants.
   - Grounding with Benchmark Reference Photos: If reference benchmark photos are provided, compare the current stock photo against them to verify how each item looks when standing upright, lying flat, tilted, or stacked in crates.

3. ACCURATE REORDER CALCULATION:
   - Count all visible remaining units for each catalog item across all shelves in the photo.
   - If an item has a "standard full capacity" (targetQuantity / par level), calculate replenishment needed: Math.max(0, targetQuantity - remainingCount).
   - If an item is Empty (0 visible or crate section empty), suggest its standard capacity or a reasonable replenish quantity.
   - If an item is Plenty (>80% full / at par), suggestedQuantity MUST be 0.
   - If an item from the catalog is kept in a different section NOT shown in this photo, set "level": "Not visible / Unknown" and "suggestedQuantity": 0.

4. REASONING:
   - Provide a concise 1-sentence explanation of what you see (e.g., "Found 4 bottles in front row, 3 in back row, 1 lying flat on top; 2 needed to reach par of 10" or "Counted 3 packets in spice pile").

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

/**
 * Analyze a photo of the whole kitchen rack/pantry and auto-route
 * low items to their respective suppliers.
 */
export async function analyzeWholeRackPhoto({
  apiKey, suppliers = [], currentPhotoBase64,
}) {
  const activeKey = apiKey || getStoredGeminiKey();
  if (!activeKey) {
    throw new Error('Please enter a Google Gemini API Key to use photo analysis.');
  }

  const validSuppliers = Array.isArray(suppliers) ? suppliers.filter((s) => Array.isArray(s.supplies) && s.supplies.length > 0) : [];
  if (!validSuppliers.length) {
    throw new Error('No supplier catalogs registered to analyze against.');
  }

  const catalogBreakdown = validSuppliers.map((sup) => {
    const items = sup.supplies.map((it) => {
      const target = it.targetQuantity ? ` (target full capacity: ${it.targetQuantity} ${it.unit})` : '';
      return `    - Item ID: "${it.id}", Name: "${it.name}", Unit: "${it.unit}"${target}`;
    }).join('\n');
    return `SUPPLIER: "${sup.name}" (Supplier ID: "${sup.id}")\n${items}`;
  }).join('\n\n');

  const systemPrompt = `You are the master restaurant inventory AI specialist for "Red Lantern Restaurant".
We are inspecting a single photo of the FULL KITCHEN STORAGE RACK / PANTRY SHELVES containing items from multiple different suppliers.

REGISTERED SUPPLIERS AND THEIR CATALOGS:
${catalogBreakdown}

CRITICAL RULES FOR 100% ACCURATE WHOLE-RACK ROUTING:
1. PHOTO CLARITY CHECK:
   - If the photo is too blurry, dark, shaky, or unreadable to identify items, set "photoQuality": "unclear" and describe why in "clarityIssue".
   - If sufficiently clear, set "photoQuality": "clear" and "clarityIssue": "".

2. DEEP SCANNING ACROSS MULTIPLE CUBBIES & SHELVES:
   - Overlapping / Piled Pouches: For spice masalas, dal pouches, and powders piled on shelves, scan through the layers. Match logos, header typography, and colored banners (e.g. Starzing Garam Masala, Cumin, Chinese Pepper, Kitchen King, Fortune Dal).
   - Rows & Stacked Bottles: For sauces, vinegar, syrups, and essence bottles, inspect front rows, visible bottles in back rows, and any horizontal bottles lying on top of bottle caps.
   - Separate Items by Supplier: For each item identified on the shelves, locate which supplier catalog it belongs to above.

3. REORDER CALCULATION PER SUPPLIER:
   - For each catalog item found in the photo, count visible remaining units.
   - If an item has a "target full capacity" (par level), calculate replenishment needed: Math.max(0, targetQuantity - remainingCount).
   - If an item is Empty (0 visible or shelf space empty), suggest replenishment.
   - If an item is Plenty (>80% full / at par), suggestedQuantity MUST be 0.
   - If an item from a supplier's catalog is not stored on this rack or not visible, set "suggestedQuantity": 0 and "level": "Not visible / Unknown".

Respond ONLY with a valid JSON object conforming to this exact schema:
{
  "photoQuality": "clear" or "unclear",
  "clarityIssue": "" or "description",
  "suppliers": [
    {
      "supplierId": "matching supplier id exactly",
      "supplierName": "supplier name",
      "items": [
        {
          "id": "item id matching the supplier catalog",
          "name": "item name",
          "level": "Low (~20% left)" | "Empty" | "Half (~50% left)" | "Plenty (>80%)" | "Not visible / Unknown",
          "suggestedQuantity": 8,
          "unit": "PIECES",
          "reason": "Visible count: 2 bottles on middle shelf; 8 needed to reach par of 10."
        }
      ]
    }
  ]
}`;

  const parts = [{ text: systemPrompt }];

  // Include benchmark reference photos if suppliers have them
  validSuppliers.forEach((sup) => {
    const refs = Array.isArray(sup.referencePhotos) && sup.referencePhotos.length
      ? sup.referencePhotos
      : (sup.referencePhoto ? [sup.referencePhoto] : []);
    if (refs.length > 0) {
      parts.push({
        text: `BENCHMARK REFERENCE PHOTOS for Supplier "${sup.name}":`,
      });
      refs.slice(0, 2).forEach((refImg, idx) => {
        parts.push({ text: `${sup.name} reference photo ${idx + 1}:` });
        parts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: refImg.replace(/^data:image\/[a-z]+;base64,/, ''),
          },
        });
      });
    }
  });

  parts.push({ text: 'CURRENT FULL RACK / PANTRY PHOTO (snapped in kitchen):' });
  parts.push({
    inlineData: {
      mimeType: 'image/jpeg',
      data: currentPhotoBase64.replace(/^data:image\/[a-z]+;base64,/, ''),
    },
  });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(activeKey)}`;

  const controller = new AbortController();
  const timeoutTimer = setTimeout(() => controller.abort(), 20000);

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
    throw new Error('Gemini was unable to analyze the rack photo. Please try a clearer picture.');
  }

  try {
    const parsed = JSON.parse(textContent);
    const isUnclear = parsed.photoQuality === 'unclear';
    const suppliersList = Array.isArray(parsed.suppliers) ? parsed.suppliers : [];
    return {
      isUnclear,
      clarityIssue: parsed.clarityIssue || (isUnclear ? 'Photo is blurry or too dark to verify rack items with 100% accuracy.' : ''),
      suppliers: suppliersList,
    };
  } catch (err) {
    throw new Error(`Failed to parse AI analysis: ${err.message}`);
  }
}
