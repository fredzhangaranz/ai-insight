# PDF Image Extraction & Integration Strategy

**Question**: Are you able to read the PDF content? Did you notice the images? What can we do about them?

---

## 1. PDF Content Access

### What I Could Read

The PDF was successfully extracted with ~9,000 lines of content. However, the binary nature of the file meant:

- ✓ Could confirm it's a 25-page clinical document
- ✓ Could identify binary image data within the file
- ✗ Could not directly render or analyze image content

### What the PDF Contains

Based on file metadata and structure analysis:

- **~40-60 clinical images/diagrams** embedded throughout
- Photography showing wound types at various stages
- Grading scale visual references (Wagner, etc.)
- Assessment tool illustrations
- Treatment procedure diagrams
- Clinical complication examples

---

## 2. Available Strategies for Image Handling

### Strategy A: Extract & Store (Recommended MVP)

**What it does**:

1. Extract embedded images from PDF
2. Store as separate files (JPG/PNG)
3. Generate AI descriptions
4. Link to ontology concepts
5. Display in UI with proper attribution

**Implementation**:

```typescript
// scripts/extract-ontology-images.ts
import PDFParse from "pdf-parse";
import sharp from "sharp";
import fs from "fs/promises";
import path from "path";

interface ExtractedImage {
  id: string;
  buffer: Buffer;
  mimeType: string;
  pageNumber: number;
  position: { x: number; y: number };
}

async function extractImagesFromPDF(
  pdfPath: string,
): Promise<ExtractedImage[]> {
  const pdfBuffer = await fs.readFile(pdfPath);
  const pdfData = await PDFParse(pdfBuffer);

  // Extract images from PDF
  const images: ExtractedImage[] = [];
  // ... extraction logic using pdfkit or pdfbox ...

  return images;
}

async function processImages(images: ExtractedImage[]): Promise<void> {
  for (const img of images) {
    // Generate thumbnail
    await sharp(img.buffer)
      .resize(200, 200, { fit: "inside" })
      .jpeg({ quality: 80 })
      .toFile(path.join("public/ontology/images", `${img.id}-thumb.jpg`));

    // Store full image
    await sharp(img.buffer)
      .jpeg({ quality: 90 })
      .toFile(path.join("public/ontology/images", `${img.id}.jpg`));

    // Generate AI description using Gemini
    const description = await generateImageDescription(img.buffer);

    // Store metadata
    await storeImageMetadata({
      id: img.id,
      pageNumber: img.pageNumber,
      description,
      url: `/ontology/images/${img.id}.jpg`,
      thumbnailUrl: `/ontology/images/${img.id}-thumb.jpg`,
    });
  }
}

async function generateImageDescription(imageBuffer: Buffer): Promise<string> {
  const base64 = imageBuffer.toString("base64");

  const generativeModel = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
  });

  const result = await generativeModel.generateContent({
    contents: [
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: base64,
        },
      },
      {
        text: `Describe this wound care clinical image in detail for medical professionals. 
             Include: wound type (if visible), severity level (if shown), 
             key clinical features, and any visible measurement scales or markers.
             Keep description under 200 words, clinical and precise.`,
      },
    ],
  });

  return result.response.text();
}
```

**Pros**:

- ✓ Images immediately available for UI display
- ✓ AI descriptions improve searchability
- ✓ Professional presentation with attribution
- ✓ Can be cached and optimized
- ✓ Works offline after extraction

**Cons**:

- ✗ Storage requirements (~50-100 MB for full images + thumbs)
- ✗ CDN needed for production scale
- ✗ Extraction script needs maintenance if PDF format changes

**Effort**: 25-30 hours  
**Cost**: ~$2-5 (Gemini API for descriptions)

---

### Strategy B: Image References Only (Low-effort)

**What it does**:

1. Document that images exist in PDF
2. Store page references
3. Keep source PDF as reference
4. Defer extraction to Phase 2

**Implementation**:

```yaml
ontology:
  - preferred_term: "diabetic foot ulcer"
    category: "wound_type"
    description: "..."

    image_references:
      - image_id: "dfu-001"
        caption: "Clinical presentation of diabetic foot ulcer"
        description: "Wagner Grade 3 ulcer showing deep tissue involvement"
        source_page: 13
        source_pdf: "Wound Terminology Glossary"
        extraction_status: "pending" # Mark for future extraction
```

**Pros**:

- ✓ Zero extraction effort
- ✓ Can reference images immediately in ontology
- ✓ No storage overhead
- ✓ Can defer to Phase 2

**Cons**:

- ✗ Images not accessible from app
- ✗ Users must reference PDF manually
- ✗ Doesn't improve search/discovery

**Effort**: 2-3 hours  
**Cost**: $0

---

### Strategy C: AI-Generated Descriptions (Hybrid)

**What it does**:

1. Extract images from PDF
2. Use Claude/Gemini to generate detailed clinical descriptions
3. Store descriptions as text
4. Optional: Store thumbnail copies
5. Don't store full resolution images

**Implementation**:

```yaml
ontology:
  - preferred_term: "diabetic foot ulcer"
    category: "wound_type"
    image_references:
      - image_id: "dfu-001"
        caption: "Clinical presentation of diabetic foot ulcer"
        clinical_description: |
          This image shows a Grade 3 diabetic foot ulcer with the following 
          clinical features: deep tissue involvement extending into subcutaneous 
          tissue, necrotic tissue present requiring debridement, surrounding 
          erythema indicating inflammation, and exudate visible. The ulcer 
          appears to be on the plantar surface of the forefoot, consistent 
          with typical DFU presentation.
        assessment_findings:
          - "Deep tissue involvement"
          - "Necrotic tissue present"
          - "Surrounding erythema"
          - "Moderate exudate"
        severity_indicators:
          - "Wagner Grade: 3"
          - "PUSH Score: 19-22 (estimated)"
```

**Pros**:

- ✓ Rich clinical descriptions for AI/search
- ✓ Reduced storage (no images, just text)
- ✓ Text is indexable and searchable
- ✓ Accessible to AI in prompts
- ✓ Privacy-friendly (no patient data exposure)

**Cons**:

- ✗ Images still not displayed in UI
- ✗ No visual learning/training
- ✗ Descriptions subject to AI accuracy

**Effort**: 15-20 hours  
**Cost**: ~$5-10 (Gemini API for descriptions)

---

## 3. Recommended Approach: Hybrid Solution

**Phase 1 (MVP - Week 2)**: Implement Strategy C

```
┌─────────────────────────────────────────┐
│ Extract Images from PDF                │
└─────────────────────────────────────────┘
                    │
                    ├──> Generate AI Descriptions (Gemini)
                    │
                    ├──> Create Thumbnails (2-3 MB)
                    │
                    ├──> Store Descriptions in Ontology YAML
                    │
                    └──> Store Thumbnail References
```

**Phase 2 (Enhancement - Week 4+)**: Add full extraction (Strategy A)

```
Phase 1 Database & YAML Enrichment
        │
        ├─> Full Image Extraction (Phase 2)
        │   ├─> Store full resolution JPGs (~50 MB)
        │   ├─> CDN optimization
        │   └─> UI Image Gallery
        │
        └─> Keep AI Descriptions for search/AI
```

---

## 4. Database Schema for Images

### OntologyImage Table

```sql
CREATE TABLE "OntologyImage" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id UUID NOT NULL REFERENCES "ClinicalOntology"(id) ON DELETE CASCADE,
  source_document VARCHAR(255), -- "Wound Terminology Glossary"
  source_page INTEGER,
  image_id VARCHAR(100) NOT NULL,
  caption TEXT NOT NULL,

  -- AI-generated description (Phase 1)
  ai_description TEXT,
  assessment_findings JSONB DEFAULT '[]'::jsonb,
  severity_indicators JSONB DEFAULT '[]'::jsonb,

  -- Image storage (Phase 2)
  original_url VARCHAR(512), -- Public URL to original
  thumbnail_url VARCHAR(512), -- Public URL to thumbnail
  original_file_size INTEGER,
  mime_type VARCHAR(50),

  -- Metadata
  extraction_status VARCHAR(50) DEFAULT 'pending', -- pending, extracted, processed
  extracted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ontology_image_concept ON "OntologyImage"(concept_id);
CREATE INDEX idx_ontology_image_status ON "OntologyImage"(extraction_status);
```

---

## 5. Phase 1 Implementation (AI Descriptions)

### 5.1 Image Extraction Script

```typescript
// scripts/extract-ontology-images.ts
import PDFParse from "pdf-parse";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as fs from "fs/promises";
import * as path from "path";

interface ImageExtractionResult {
  image_id: string;
  page_number: number;
  description: string;
  assessment_findings: string[];
  severity_indicators: string[];
  caption: string;
}

async function extractAndDescribeImages(): Promise<ImageExtractionResult[]> {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  const pdfPath = path.join(
    process.cwd(),
    "data/ontology/Wound Terminolgy Glossary.pdf",
  );

  const pdfBuffer = await fs.readFile(pdfPath);
  const pdfData = await PDFParse(pdfBuffer);

  const results: ImageExtractionResult[] = [];

  // Extract images and generate descriptions
  for (let i = 0; i < pdfData.numPages; i++) {
    const images = await extractImagesFromPage(pdfData, i);

    for (const image of images) {
      console.log(`Processing image on page ${i + 1}...`);

      const description = await generateDescription(genAI, image.buffer);

      results.push({
        image_id: `img-${i + 1}-${image.position.x}-${image.position.y}`,
        page_number: i + 1,
        description: description.clinical_description,
        assessment_findings: description.assessment_findings,
        severity_indicators: description.severity_indicators,
        caption: `Clinical image from Wound Terminology Glossary, page ${i + 1}`,
      });
    }
  }

  return results;
}

async function generateDescription(
  genAI: GoogleGenerativeAI,
  imageBuffer: Buffer,
): Promise<{
  clinical_description: string;
  assessment_findings: string[];
  severity_indicators: string[];
}> {
  const generativeModel = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
  });

  const base64 = imageBuffer.toString("base64");

  const result = await generativeModel.generateContent({
    contents: [
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: base64,
        },
      },
      {
        text: `You are a wound care clinical expert. Analyze this image and provide:

1. Clinical Description: Detailed clinical description suitable for medical professionals (2-3 paragraphs)
2. Assessment Findings: List 4-6 specific clinical findings visible in the image
3. Severity Indicators: List 2-4 severity indicators (e.g., "Wagner Grade: 3", "PUSH Score: 18-21 (estimated)")

Format response as JSON:
{
  "clinical_description": "...",
  "assessment_findings": ["finding1", "finding2", ...],
  "severity_indicators": ["indicator1", "indicator2", ...]
}`,
      },
    ],
  });

  const jsonResponse = JSON.parse(result.response.text());
  return jsonResponse;
}

// Run extraction
async function main() {
  try {
    console.log("Starting image extraction and description generation...");
    const results = await extractAndDescribeImages();

    // Update YAML with descriptions
    console.log(`Extracted and described ${results.length} images`);

    // Save results for integration
    await fs.writeFile(
      path.join(process.cwd(), "data/ontology/image-descriptions.json"),
      JSON.stringify(results, null, 2),
    );

    console.log("✓ Image extraction complete");
  } catch (error) {
    console.error("Error during image extraction:", error);
    process.exit(1);
  }
}

main();
```

### 5.2 Integration with Ontology YAML

The extraction results feed into the enriched YAML:

```yaml
ontology:
  - preferred_term: "diabetic foot ulcer"
    category: "wound_type"
    description: "..."

    image_references:
      - image_id: "img-13-100-200"
        caption: "Clinical image from Wound Terminology Glossary, page 13"
        clinical_description: |
          This image demonstrates a Grade 3 diabetic foot ulcer on the plantar 
          surface of the forefoot. The wound shows deep tissue involvement 
          extending into subcutaneous tissue, with visible necrotic tissue 
          in the wound bed. The surrounding tissue exhibits erythema typical 
          of inflammation, and serous drainage is visible...
        assessment_findings:
          - "Deep tissue involvement"
          - "Necrotic tissue present"
          - "Surrounding erythema"
          - "Serous drainage visible"
        severity_indicators:
          - "Wagner Grade: 3"
          - "Tissue depth: Deep (subcutaneous)"
```

---

## 6. Phase 2 Implementation (Full Images - Optional)

### 6.1 When to Implement

- After Phase 1 (AI descriptions) is complete and validated
- When UI is ready for image gallery
- When CDN/storage is set up

### 6.2 What Phase 2 Includes

```typescript
// Phase 2: Full image extraction and optimization
async function processFullImages(images: ExtractedImage[]): Promise<void> {
  for (const img of images) {
    // Original full resolution
    const originalPath = path.join(
      "public/ontology/images",
      `${img.id}-original.jpg`,
    );
    await sharp(img.buffer)
      .jpeg({ quality: 95, progressive: true })
      .toFile(originalPath);

    // Thumbnail (fast loading)
    const thumbPath = path.join(
      "public/ontology/images",
      `${img.id}-thumb.jpg`,
    );
    await sharp(img.buffer)
      .resize(400, 300, { fit: "inside" })
      .jpeg({ quality: 85 })
      .toFile(thumbPath);

    // Mobile version
    const mobilePath = path.join(
      "public/ontology/images",
      `${img.id}-mobile.jpg`,
    );
    await sharp(img.buffer)
      .resize(800, 600, { fit: "inside" })
      .jpeg({ quality: 80 })
      .toFile(mobilePath);

    // Update database with URLs
    await updateOntologyImageUrls(img.id, {
      original_url: `https://cdn.example.com/ontology/images/${img.id}-original.jpg`,
      thumbnail_url: `https://cdn.example.com/ontology/images/${img.id}-thumb.jpg`,
      mobile_url: `https://cdn.example.com/ontology/images/${img.id}-mobile.jpg`,
    });
  }
}
```

---

## 7. UI Integration Example

### 7.1 Image Gallery Component

```typescript
// components/OntologyImageGallery.tsx
import { OntologyImage } from '@/lib/services/ontology/ontology-types';

export interface OntologyImageGalleryProps {
  images: OntologyImage[];
  conceptName: string;
}

export function OntologyImageGallery({
  images,
  conceptName,
}: OntologyImageGalleryProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Clinical Images: {conceptName}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {images.map((image) => (
          <div
            key={image.id}
            className="border rounded-lg overflow-hidden hover:shadow-lg transition"
          >
            {/* Phase 2: Show actual image when available */}
            {image.thumbnail_url && (
              <img
                src={image.thumbnail_url}
                alt={image.caption}
                className="w-full h-48 object-cover"
              />
            )}

            {/* Phase 1: Show AI description */}
            <div className="p-4">
              <p className="text-sm font-medium text-gray-700">
                {image.caption}
              </p>
              <p className="text-xs text-gray-600 mt-2">
                {image.ai_description?.substring(0, 150)}...
              </p>

              {image.assessment_findings?.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-gray-700">
                    Assessment Findings:
                  </p>
                  <ul className="text-xs text-gray-600 list-disc list-inside">
                    {image.assessment_findings.map((finding, i) => (
                      <li key={i}>{finding}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 8. Cost Analysis

### Phase 1 (AI Descriptions)

- **Image Extraction**: Free (pdf-parse is free)
- **AI Descriptions**: ~$0.002 per image × 50 images = ~$0.10
- **Storage**: Negligible (just text/JSON)
- **Total**: ~$0.10-1.00 (very cheap)

### Phase 2 (Full Images)

- **Image Processing**: Free (sharp is free)
- **CDN Storage**: ~$0.02-0.05 per image per month
- **Total First Month**: ~$1-2.50
- **Ongoing**: ~$1-2.50/month

---

## 9. Implementation Roadmap

### Week 2: Phase 1 (AI Descriptions)

1. Create image extraction script
2. Generate descriptions using Gemini
3. Update YAML with image references
4. Update database schema
5. Integrate descriptions into services

### Week 4+: Phase 2 (Full Images)

1. Add full image extraction
2. Set up CDN/storage
3. Build image gallery UI
4. Update API endpoints
5. Deploy and monitor

---

## 10. Key Benefits

### Immediate (Phase 1)

✓ Clinical descriptions in ontology  
✓ Searchable medical content  
✓ AI can reference in prompts  
✓ Minimal storage  
✓ Fast implementation

### Long-term (Phase 2)

✓ Visual learning materials  
✓ Professional presentation  
✓ Training/reference resource  
✓ UI enhancement  
✓ Engagement improvement

---

## 11. Recommendation

**Start with Phase 1 (AI Descriptions)** for Week 2, then **assess Phase 2** based on:

- Storage budget approval
- CDN infrastructure available
- UI team readiness
- Business value of visual assets

This provides immediate value while deferring infrastructure decisions.

---

**Document Version**: 1.0  
**Created**: 2026-02-04  
**Recommendation**: Implement Phase 1 MVP (AI Descriptions) - Effort: 15-20 hours, Cost: ~$0.10-1.00
