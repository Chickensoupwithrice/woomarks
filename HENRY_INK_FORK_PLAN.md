# henry.ink Fork & Adaptation Plan

## Executive Summary

Fork henry.ink and adapt it to use `com.woomarks.annotation.annotation` lexicon with W3C Web Annotation selectors. Keep the existing UX (text selection, highlighting, sidebar) but replace the data layer to use proper W3C selectors instead of fuzzy text matching.

**Estimated Effort:** 1-2 weeks for core functionality, 2-3 weeks for polish and testing

---

## Phase 1: Fork & Setup (Day 1)

### 1.1 Fork Repository

```bash
# Fork on GitHub: https://github.com/hzoo/henry.ink → your-org/woomarks-annotate

# Clone your fork
git clone https://github.com/your-org/woomarks-annotate.git
cd woomarks-annotate

# Install dependencies
npm install

# Test that it runs
npm run dev
```

### 1.2 Rename Project

**Files to update:**

1. **`package.json`**
   ```json
   {
     "name": "woomarks-annotate",
     "description": "Decentralized web annotation tool using AT Protocol",
     "repository": "your-org/woomarks-annotate"
   }
   ```

2. **`extension/wxt.config.ts`**
   ```typescript
   export default defineConfig({
     manifest: {
       name: "Woomarks Annotate",
       description: "Web annotations on AT Protocol"
     }
   });
   ```

3. **Update branding in UI components** (deferred to Phase 5)

### 1.3 Create Feature Branch

```bash
git checkout -b feature/w3c-selectors
```

---

## Phase 2: Add W3C Data Model (Days 2-3)

### 2.1 Create Type Definitions

**Create: `src/types/annotation.ts`**

```typescript
/**
 * W3C Web Annotation Data Model types
 * Based on com.woomarks.annotation.annotation lexicon
 */

export interface Annotation {
  $type: 'com.woomarks.annotation.annotation';
  target: Target[];
  body?: string;
  tags?: string[];
  document?: DocumentMetadata;
  createdAt: string;
  
  // ATProto metadata (not in W3C spec)
  uri?: string;  // AT-URI of this record
  cid?: string;  // Content ID
  author?: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
}

export interface Target {
  source: string;  // The URL being annotated
  selector?: Selector[];
}

export type Selector = 
  | TextQuoteSelector 
  | TextPositionSelector 
  | RangeSelector 
  | FragmentSelector
  | CssSelector
  | XPathSelector;

export interface TextQuoteSelector {
  type: 'TextQuoteSelector';
  exact: string;
  prefix?: string;
  suffix?: string;
}

export interface TextPositionSelector {
  type: 'TextPositionSelector';
  start: number;
  end: number;
}

export interface RangeSelector {
  type: 'RangeSelector';
  startSelector: XPathSelector | CssSelector | TextPositionSelector;
  endSelector: XPathSelector | CssSelector | TextPositionSelector;
}

export interface FragmentSelector {
  type: 'FragmentSelector';
  value: string;
  conformsTo?: string;
}

export interface CssSelector {
  type: 'CssSelector';
  value: string;
}

export interface XPathSelector {
  type: 'XPathSelector';
  value: string;
}

export interface DocumentMetadata {
  title?: string;
  doi?: string;
  canonicalUri?: string;
}

/**
 * Helper to check if a record is an annotation
 */
export function isAnnotation(record: unknown): record is Annotation {
  return (
    typeof record === 'object' &&
    record !== null &&
    '$type' in record &&
    record.$type === 'com.woomarks.annotation.annotation'
  );
}

/**
 * Extract text from annotation body
 */
export function getAnnotationText(annotation: Annotation): string {
  return annotation.body || '';
}

/**
 * Extract the selected/quoted text from selectors
 */
export function getQuotedText(annotation: Annotation): string | null {
  const target = annotation.target?.[0];
  if (!target?.selector) return null;
  
  const textQuote = target.selector.find(
    (s): s is TextQuoteSelector => s.type === 'TextQuoteSelector'
  );
  
  return textQuote?.exact || null;
}

/**
 * Get all selectors from annotation
 */
export function getSelectors(annotation: Annotation): Selector[] {
  return annotation.target?.[0]?.selector || [];
}
```

### 2.2 Create Selector Generator

**Note: Use Hypothesis Anchoring Libraries**

Rather than implementing selector generation from scratch, use the battle-tested Hypothesis libraries:

```bash
npm install dom-anchor-text-quote dom-anchor-text-position
```

These libraries handle edge cases, Unicode normalization, and whitespace handling correctly.

**Create: `src/lib/selectors/generateSelectors.ts`**

```typescript
import * as textQuote from 'dom-anchor-text-quote';
import * as textPosition from 'dom-anchor-text-position';
import type { Selector, TextQuoteSelector, TextPositionSelector, RangeSelector } from '@/types/annotation';

/**
 * Generate W3C selectors from a DOM selection using Hypothesis libraries
 */
export function generateSelectors(selection: Selection): Selector[] {
  if (!selection.rangeCount) return [];
  
  const range = selection.getRangeAt(0);
  const selectors: Selector[] = [];
  
  // 1. TextQuoteSelector (most robust)
  const textQuote = generateTextQuoteSelector(range);
  if (textQuote) selectors.push(textQuote);
  
  // 2. TextPositionSelector (precise but fragile)
  const textPosition = generateTextPositionSelector(range);
  if (textPosition) selectors.push(textPosition);
  
  // 3. RangeSelector (DOM-based, good for structured content)
  const rangeSelector = generateRangeSelector(range);
  if (rangeSelector) selectors.push(rangeSelector);
  
  return selectors;
}

/**
 * Generate TextQuoteSelector with context using Hypothesis library
 */
function generateTextQuoteSelector(range: Range): TextQuoteSelector | null {
  const exact = range.toString().trim();
  if (!exact) return null;
  
  const root = document.querySelector('main') || document.body;
  
  try {
    // Use Hypothesis library to generate selector with proper context
    const selector = textQuote.fromRange(root, range);
    
    return {
      type: 'TextQuoteSelector',
      exact: selector.exact,
      prefix: selector.prefix || undefined,
      suffix: selector.suffix || undefined
    };
  } catch (error) {
    console.warn('Failed to generate TextQuoteSelector:', error);
    return null;
  }
}

/**
 * Generate TextPositionSelector using Hypothesis library
 */
function generateTextPositionSelector(range: Range): TextPositionSelector | null {
  const exact = range.toString().trim();
  if (!exact) return null;
  
  const root = document.querySelector('main') || document.body;
  
  try {
    // Use Hypothesis library for precise character position calculation
    const selector = textPosition.fromRange(root, range);
    
    return {
      type: 'TextPositionSelector',
      start: selector.start,
      end: selector.end
    };
  } catch (error) {
    console.warn('Failed to generate TextPositionSelector:', error);
    return null;
  }
}

/**
 * Generate RangeSelector using XPath
 */
function generateRangeSelector(range: Range): RangeSelector | null {
  try {
    const startXPath = getXPath(range.startContainer);
    const endXPath = getXPath(range.endContainer);
    
    if (!startXPath || !endXPath) return null;
    
    return {
      type: 'RangeSelector',
      startSelector: {
        type: 'XPathSelector',
        value: startXPath
      },
      endSelector: {
        type: 'XPathSelector',
        value: endXPath
      }
    };
  } catch (e) {
    console.warn('Failed to generate RangeSelector:', e);
    return null;
  }
}

/**
 * Generate XPath for a DOM node
 */
function getXPath(node: Node): string | null {
  if (node.nodeType === Node.DOCUMENT_NODE) return '/';
  
  const parts: string[] = [];
  let current: Node | null = node;
  
  while (current && current.nodeType !== Node.DOCUMENT_NODE) {
    let index = 1;
    let sibling = current.previousSibling;
    
    while (sibling) {
      if (sibling.nodeName === current.nodeName) {
        index++;
      }
      sibling = sibling.previousSibling;
    }
    
    const tagName = current.nodeType === Node.ELEMENT_NODE
      ? (current as Element).tagName.toLowerCase()
      : 'text()';
    
    parts.unshift(`${tagName}[${index}]`);
    current = current.parentNode;
  }
  
  return '/' + parts.join('/');
}
```

### 2.3 Create Selector Matcher (Anchoring)

**Note: Use Hypothesis Libraries for Matching**

The Hypothesis libraries handle fuzzy matching, normalization, and edge cases:

```bash
npm install dom-anchor-text-quote dom-anchor-text-position
```

**Create: `src/lib/selectors/matchSelectors.ts`**

```typescript
import * as textQuote from 'dom-anchor-text-quote';
import * as textPosition from 'dom-anchor-text-position';
import type { Selector, Annotation, TextQuoteSelector, TextPositionSelector, RangeSelector } from '@/types/annotation';

/**
 * Find the DOM Range for an annotation using its selectors
 * Tries multiple strategies in order of precision using Hypothesis libraries
 */
export function findAnnotationRange(
  annotation: Annotation,
  container: HTMLElement = document.body
): Range | null {
  const selectors = annotation.target?.[0]?.selector;
  if (!selectors || selectors.length === 0) return null;
  
  // Try each selector type in order of precision
  for (const selector of selectors) {
    let range: Range | null = null;
    
    switch (selector.type) {
      case 'RangeSelector':
        range = matchRangeSelector(selector as RangeSelector, container);
        break;
      case 'TextPositionSelector':
        range = matchTextPositionSelector(selector as TextPositionSelector, container);
        break;
      case 'TextQuoteSelector':
        range = matchTextQuoteSelector(selector as TextQuoteSelector, container);
        break;
    }
    
    if (range) return range;
  }
  
  // Fallback to fuzzy matching (legacy)
  const quote = annotation.target?.[0]?.selector?.find(
    (s): s is TextQuoteSelector => s.type === 'TextQuoteSelector'
  );
  
  if (quote?.exact) {
    return fuzzyMatchText(quote.exact, container);
  }
  
  return null;
}

/**
 * Match using RangeSelector (XPath-based)
 */
function matchRangeSelector(selector: RangeSelector, container: HTMLElement): Range | null {
  try {
    const startNode = evaluateXPath(selector.startSelector, container);
    const endNode = evaluateXPath(selector.endSelector, container);
    
    if (!startNode || !endNode) return null;
    
    const range = document.createRange();
    range.setStart(startNode, 0);
    range.setEnd(endNode, endNode.textContent?.length || 0);
    
    return range;
  } catch (e) {
    console.warn('RangeSelector match failed:', e);
    return null;
  }
}

/**
 * Match using TextPositionSelector using Hypothesis library
 */
function matchTextPositionSelector(
  selector: TextPositionSelector,
  container: HTMLElement
): Range | null {
  try {
    // Use Hypothesis library for precise position matching
    const range = textPosition.toRange(container, selector);
    return range;
  } catch (e) {
    console.warn('TextPositionSelector match failed:', e);
    return null;
  }
}

/**
 * Match using TextQuoteSelector using Hypothesis library
 */
function matchTextQuoteSelector(
  selector: TextQuoteSelector,
  container: HTMLElement
): Range | null {
  try {
    // Use Hypothesis library for fuzzy text matching with context
    const range = textQuote.toRange(container, selector);
    return range;
  } catch (e) {
    console.warn('TextQuoteSelector match failed:', e);
    return null;
  }
}

/**
 * Create a DOM Range from text positions
 */
function createRangeFromTextPosition(
  container: HTMLElement,
  start: number,
  end: number
): Range | null {
  let currentPos = 0;
  let startNode: Node | null = null;
  let startOffset = 0;
  let endNode: Node | null = null;
  let endOffset = 0;
  
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null
  );
  
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.textContent || '';
    const normalizedText = text.replace(/\s+/g, ' ').toLowerCase();
    const textLength = normalizedText.length;
    
    if (!startNode && currentPos + textLength >= start) {
      startNode = node;
      startOffset = start - currentPos;
    }
    
    if (!endNode && currentPos + textLength >= end) {
      endNode = node;
      endOffset = end - currentPos;
      break;
    }
    
    currentPos += textLength;
  }
  
  if (!startNode || !endNode) return null;
  
  try {
    const range = document.createRange();
    range.setStart(startNode, Math.min(startOffset, startNode.textContent?.length || 0));
    range.setEnd(endNode, Math.min(endOffset, endNode.textContent?.length || 0));
    return range;
  } catch (e) {
    return null;
  }
}

/**
 * Evaluate XPath selector
 */
function evaluateXPath(selector: any, container: HTMLElement): Node | null {
  if (selector.type !== 'XPathSelector') return null;
  
  try {
    const result = document.evaluate(
      selector.value,
      container,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    return result.singleNodeValue;
  } catch (e) {
    return null;
  }
}

/**
 * Fuzzy text matching (fallback)
 * Reuses existing henry.ink logic
 */
function fuzzyMatchText(text: string, container: HTMLElement): Range | null {
  // Import existing matchContent logic
  // This is the fallback when precise selectors fail
  const normalized = text.toLowerCase().replace(/\s+/g, ' ');
  const fullText = (container.textContent || '').toLowerCase().replace(/\s+/g, ' ');
  
  const index = fullText.indexOf(normalized);
  if (index === -1) return null;
  
  return createRangeFromTextPosition(container, index, index + normalized.length);
}
```

---

## Phase 3: Modify Annotation Creation (Days 4-5)

### 3.1 Update QuotePopup Component

**Modify: `src/components/QuotePopup.tsx`**

```typescript
// Add imports
import { generateSelectors } from '@/lib/selectors/generateSelectors';
import type { Annotation } from '@/types/annotation';

// Replace the post creation logic (around line 269-299)
async function createAnnotation() {
  if (!atCuteState.value) {
    // Not logged in - show Bluesky compose intent
    const blueskyText = `> ${truncatedQuote.value}\n\n${userText.value}\n\n[h↗]`;
    window.open(
      `https://bsky.app/intent/compose?text=${encodeURIComponent(blueskyText)}`,
      '_blank'
    );
    return;
  }

  const { rpc, session } = atCuteState.value;
  
  // Get current selection (need to store this earlier)
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return;
  
  // Generate W3C selectors
  const selectors = generateSelectors(selection);
  
  if (selectors.length === 0) {
    console.error('Failed to generate selectors');
    return;
  }
  
  // Get page metadata
  const pageTitle = document.title;
  const canonicalUrl = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
  
  // Create annotation record
  const annotation: Annotation = {
    $type: 'com.woomarks.annotation.annotation',
    target: [{
      source: window.location.href,
      selector: selectors
    }],
    body: userText.value.trim() || undefined,
    tags: [], // TODO: Extract from text or add tag input
    document: {
      title: pageTitle || undefined,
      canonicalUri: canonicalUrl || undefined
    },
    createdAt: new Date().toISOString()
  };
  
  try {
    // Create record via AT Protocol
    const response = await rpc.post('com.atproto.repo.createRecord', {
      input: {
        repo: session.info.sub,
        collection: 'com.woomarks.annotation.annotation',
        rkey: TID.nextStr(), // Generate new TID
        record: annotation
      }
    });
    
    console.log('Annotation created:', response.data.uri);
    
    // Close popup and refresh annotations
    quotedSelection.value = null;
    userText.value = '';
    
    // Trigger refresh of annotation list
    // TODO: Add signal to reload annotations
    
  } catch (error) {
    console.error('Failed to create annotation:', error);
    // TODO: Show error to user
  }
}

// Store selection when popup opens (add to useEffect)
useEffect(() => {
  if (quotedSelection.value) {
    // Store the selection and range for later use
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      // Store in a ref or state
      storedRange.current = selection.getRangeAt(0).cloneRange();
    }
  }
}, [quotedSelection.value]);
```

### 3.2 Store Selection State

**Add to `QuotePopup.tsx`:**

```typescript
// Add ref to store selection
const storedRange = useRef<Range | null>(null);
const storedSelection = useRef<Selection | null>(null);

// Update when popup opens
useEffect(() => {
  if (quotedSelection.value) {
    storedSelection.current = window.getSelection();
    if (storedSelection.current && storedSelection.current.rangeCount > 0) {
      storedRange.current = storedSelection.current.getRangeAt(0).cloneRange();
    }
  }
}, [quotedSelection.value]);

// Use stored range in createAnnotation
async function createAnnotation() {
  // ...
  
  if (!storedRange.current) {
    console.error('No stored selection range');
    return;
  }
  
  const selectors = generateSelectorsFromRange(storedRange.current);
  
  // ...
}
```

---

## Phase 4: Fetch & Display Annotations (Days 6-7)

### 4.1 Create Annotation Query Service

**Create: `src/lib/api/annotations.ts`**

```typescript
import type { Annotation } from '@/types/annotation';
import { atCuteState } from '@/demo/lib/oauth';

/**
 * Query annotations for a given URL
 */
export async function getAnnotationsForUrl(url: string): Promise<Annotation[]> {
  const canonicalUrl = canonicalizeUrl(url);
  
  // Try different URL variants
  const urlVariants = [
    canonicalUrl,
    url,
    url.replace(/\/$/, ''), // without trailing slash
    url + '/', // with trailing slash
  ];
  
  const allAnnotations: Annotation[] = [];
  
  for (const variant of urlVariants) {
    const annotations = await queryAnnotations(variant);
    allAnnotations.push(...annotations);
  }
  
  // Deduplicate by URI
  const seen = new Set<string>();
  return allAnnotations.filter(ann => {
    if (!ann.uri || seen.has(ann.uri)) return false;
    seen.add(ann.uri);
    return true;
  });
}

/**
 * Query annotations using AT Protocol
 */
async function queryAnnotations(url: string): Promise<Annotation[]> {
  // Option 1: Use Bluesky search if available (temporary hack)
  try {
    const response = await fetch(
      `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?` +
      new URLSearchParams({
        q: url,
        limit: '100'
      })
    );
    
    const data = await response.json();
    
    // Filter for actual annotations
    const annotations = data.posts
      ?.map((post: any) => post.record)
      .filter((record: any) => record.$type === 'com.woomarks.annotation.annotation')
      || [];
    
    return annotations;
  } catch (error) {
    console.error('Search failed:', error);
    return [];
  }
  
  // Option 2: Query specific users (if you know DIDs)
  // TODO: Implement once you have an AppView/indexer
  
  // Option 3: Query your own annotations
  if (atCuteState.value) {
    return await queryUserAnnotations(atCuteState.value.session.info.sub, url);
  }
  
  return [];
}

/**
 * Query a specific user's annotations
 */
async function queryUserAnnotations(did: string, url: string): Promise<Annotation[]> {
  try {
    const response = await fetch(
      `https://bsky.social/xrpc/com.atproto.repo.listRecords?` +
      new URLSearchParams({
        repo: did,
        collection: 'com.woomarks.annotation.annotation',
        limit: '100'
      })
    );
    
    const data = await response.json();
    
    // Filter by target URL
    const annotations = data.records
      ?.filter((record: any) => {
        const targetUrl = record.value?.target?.[0]?.source;
        return targetUrl && matchesUrl(targetUrl, url);
      })
      .map((record: any) => ({
        ...record.value,
        uri: record.uri,
        cid: record.cid
      }))
      || [];
    
    return annotations;
  } catch (error) {
    console.error('Query user annotations failed:', error);
    return [];
  }
}

/**
 * Canonicalize URL for consistent matching
 */
function canonicalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    
    // Lowercase host
    parsed.hostname = parsed.hostname.toLowerCase();
    
    // Remove trailing slash
    parsed.pathname = parsed.pathname.replace(/\/$/, '');
    
    // Sort query parameters
    const params = new URLSearchParams(parsed.search);
    const sortedParams = new URLSearchParams(
      [...params.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    );
    parsed.search = sortedParams.toString();
    
    // Remove fragment
    parsed.hash = '';
    
    return parsed.toString();
  } catch (e) {
    return url;
  }
}

/**
 * Check if two URLs match (with fuzzy matching)
 */
function matchesUrl(url1: string, url2: string): boolean {
  const canonical1 = canonicalizeUrl(url1);
  const canonical2 = canonicalizeUrl(url2);
  return canonical1 === canonical2;
}

/**
 * Get author info for an annotation (from PDS)
 */
export async function getAuthorProfile(did: string) {
  try {
    const response = await fetch(
      `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?` +
      new URLSearchParams({ actor: did })
    );
    
    const profile = await response.json();
    
    return {
      did,
      handle: profile.handle,
      displayName: profile.displayName,
      avatar: profile.avatar
    };
  } catch (e) {
    return { did, handle: did, displayName: did };
  }
}
```

### 4.2 Update PostList to Show Annotations

**Modify: `src/components/PostList.tsx`**

```typescript
import { getAnnotationsForUrl } from '@/lib/api/annotations';
import { isAnnotation, getQuotedText, getAnnotationText } from '@/types/annotation';
import type { Annotation } from '@/types/annotation';

// Replace existing query logic
export function PostList({ url }: { url: string }) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    async function loadAnnotations() {
      setLoading(true);
      try {
        const results = await getAnnotationsForUrl(url);
        setAnnotations(results);
      } catch (error) {
        console.error('Failed to load annotations:', error);
      } finally {
        setLoading(false);
      }
    }
    
    loadAnnotations();
  }, [url]);
  
  // Extract quotes for highlighting
  useEffect(() => {
    const quotes = annotations
      .map(ann => getQuotedText(ann))
      .filter((q): q is string => q !== null);
    
    extractedQuotes.value = quotes;
  }, [annotations]);
  
  if (loading) return <div>Loading annotations...</div>;
  if (annotations.length === 0) return <div>No annotations yet</div>;
  
  return (
    <div class="annotation-list">
      {annotations.map(annotation => (
        <AnnotationCard key={annotation.uri} annotation={annotation} />
      ))}
    </div>
  );
}

// New component for displaying annotations
function AnnotationCard({ annotation }: { annotation: Annotation }) {
  const quote = getQuotedText(annotation);
  const text = getAnnotationText(annotation);
  
  return (
    <div class="annotation-card">
      {quote && (
        <blockquote class="annotation-quote">
          {quote}
        </blockquote>
      )}
      {text && (
        <p class="annotation-text">{text}</p>
      )}
      <div class="annotation-meta">
        <span class="annotation-author">
          {annotation.author?.displayName || annotation.author?.handle}
        </span>
        <span class="annotation-time">
          {new Date(annotation.createdAt).toLocaleString()}
        </span>
      </div>
    </div>
  );
}
```

---

## Phase 5: Update Highlighting (Days 8-9)

### 5.1 Replace Highlight Controller

**Modify: `src/components/highlights/HighlightController.tsx`**

```typescript
import { findAnnotationRange } from '@/lib/selectors/matchSelectors';
import type { Annotation } from '@/types/annotation';

export function HighlightController({ annotations }: { annotations: Annotation[] }) {
  const containerRef = useRef<HTMLElement | null>(null);
  
  useEffect(() => {
    // Find content container
    containerRef.current = document.querySelector('main') || document.body;
    
    if (!containerRef.current) return;
    
    // Clear existing highlights
    clearHighlights(containerRef.current);
    
    // Apply new highlights
    annotations.forEach(annotation => {
      applyAnnotationHighlight(annotation, containerRef.current!);
    });
    
  }, [annotations]);
  
  return null; // This is a logic-only component
}

function applyAnnotationHighlight(annotation: Annotation, container: HTMLElement) {
  const range = findAnnotationRange(annotation, container);
  
  if (!range) {
    console.warn('Could not anchor annotation:', annotation.uri);
    return;
  }
  
  try {
    // Wrap range in highlight span
    const highlight = document.createElement('span');
    highlight.className = 'quote-highlight';
    highlight.dataset.annotationUri = annotation.uri || '';
    highlight.style.backgroundColor = 'rgba(59, 130, 246, 0.15)';
    highlight.style.cursor = 'pointer';
    
    // Click handler to scroll to annotation
    highlight.addEventListener('click', () => {
      const card = document.querySelector(
        `[data-annotation-uri="${annotation.uri}"]`
      );
      card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    
    range.surroundContents(highlight);
    
  } catch (error) {
    console.warn('Failed to apply highlight:', error);
    // Fallback: add background directly to range
    addBackgroundToRange(range, annotation.uri || '');
  }
}

function clearHighlights(container: HTMLElement) {
  container.querySelectorAll('.quote-highlight').forEach(el => {
    const parent = el.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(el.textContent || ''), el);
      parent.normalize();
    }
  });
}

function addBackgroundToRange(range: Range, uri: string) {
  // More complex highlighting for ranges that span multiple nodes
  // Implementation similar to existing applyHighlights.ts
}
```

---

## Phase 6: AppView Integration (Days 10-12)

### 6.1 Use Slices.network for AppView

**Note: We will use [slices.network](https://slices.network) for the AppView/indexing layer rather than building our own.**

Slices.network provides:
- Automatic firehose consumption and indexing
- Custom lexicon support
- Query API for annotations by URL
- No infrastructure to maintain

### 6.2 Configure Slices Integration

**Update: `src/lib/api/annotations.ts`**

```typescript
const SLICES_API_URL = import.meta.env.VITE_SLICES_API_URL || 'https://api.slices.network';

/**
 * Query annotations for a URL using Slices AppView
 */
export async function getAnnotationsForUrl(url: string): Promise<Annotation[]> {
  const canonicalUrl = canonicalizeUrl(url);
  
  try {
    const response = await fetch(
      `${SLICES_API_URL}/xrpc/com.woomarks.annotation.query?` + 
      new URLSearchParams({ 
        url: canonicalUrl,
        limit: '100'
      })
    );
    
    const data = await response.json();
    return data.annotations || [];
  } catch (error) {
    console.error('Slices query failed:', error);
    return [];
  }
}

/**
 * Canonicalize URL for consistent matching
 */
function canonicalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    
    // Lowercase host
    parsed.hostname = parsed.hostname.toLowerCase();
    
    // Remove trailing slash
    parsed.pathname = parsed.pathname.replace(/\/$/, '');
    
    // Remove fragment
    parsed.hash = '';
    
    return parsed.toString();
  } catch (e) {
    return url;
  }
}
```

### 6.3 Register Lexicon with Slices

Follow Slices.network documentation to register `com.woomarks.annotation.annotation` lexicon for indexing.

---

## Phase 7: Testing & Polish (Days 13-14)

### 7.1 Test Cases

Create test files:

```typescript
// tests/selectors.test.ts
describe('Selector Generation', () => {
  test('generates TextQuoteSelector with context', () => {
    // Mock DOM selection
    // Assert selector structure
  });
  
  test('generates TextPositionSelector', () => {
    // Test absolute positioning
  });
  
  test('generates RangeSelector with XPath', () => {
    // Test XPath generation
  });
});

// tests/matching.test.ts
describe('Selector Matching', () => {
  test('matches TextQuoteSelector precisely', () => {
    // Create annotation
    // Find in DOM
    // Assert correct range
  });
  
  test('falls back to fuzzy matching', () => {
    // Test when precise selectors fail
  });
  
  test('handles missing content gracefully', () => {
    // Test orphaned annotations
  });
});
```

### 7.2 Manual Testing Checklist

- [ ] Create annotation with text selection
- [ ] Annotation appears in sidebar
- [ ] Highlight appears in content
- [ ] Click highlight scrolls to annotation
- [ ] Refresh page - highlights persist
- [ ] Test on different websites
- [ ] Test with modified content (should show orphaned)
- [ ] Test OAuth login/logout
- [ ] Test unauthenticated viewing
- [ ] Test with multiple annotations

### 7.3 Performance Optimization

1. **Debounce highlighting**
   ```typescript
   const debouncedHighlight = useMemo(
     () => debounce(applyHighlights, 300),
     []
   );
   ```

2. **Cache selector matching results**
   ```typescript
   const matchCache = new Map<string, Range | null>();
   ```

3. **Lazy load annotations**
   ```typescript
   const [visibleAnnotations, setVisibleAnnotations] = useState<Annotation[]>([]);
   // Load more as user scrolls
   ```

---

## Phase 8: Deployment (Day 15)

### 8.1 Environment Variables

**`.env.production`**
```bash
VITE_OAUTH_CLIENT_ID=your-client-id
VITE_OAUTH_REDIRECT_URI=https://woomarks.app/oauth/callback
VITE_INDEXER_URL=https://your-worker.workers.dev
```

### 8.2 Build & Deploy

```bash
# Build web app
npm run build

# Deploy to Cloudflare Pages
wrangler pages publish dist --project-name=woomarks-annotate

# Build browser extension
npm run build:extension

# Package extension
cd extension/.output
zip -r woomarks-extension.zip chrome-mv3/
```

### 8.3 Publish Extension

1. **Chrome Web Store**
   - Upload `chrome-mv3.zip`
   - Fill in metadata
   - Submit for review

2. **Firefox Add-ons**
   - Upload `firefox-mv2.zip`
   - Submit for review

---

## Migration Strategy

### Legacy Annotation Support

**Support both formats during transition:**

```typescript
function normalizeAnnotation(record: any): Annotation {
  // New format
  if (record.$type === 'com.woomarks.annotation.annotation') {
    return record;
  }
  
  // Legacy henry.ink format
  if (record.$type === 'app.bsky.feed.post' && record._annotation) {
    return {
      $type: 'com.woomarks.annotation.annotation',
      target: [{
        source: extractUrl(record),
        selector: [{
          type: 'TextQuoteSelector',
          exact: record._annotation.quote,
          prefix: '',
          suffix: ''
        }]
      }],
      body: extractComment(record.text),
      createdAt: record.createdAt,
      uri: record.uri,
      author: extractAuthor(record)
    };
  }
  
  return null;
}
```

---

## Success Metrics

- [ ] Annotations persist across page reloads
- [ ] Highlights appear correctly 95%+ of the time
- [ ] Selection → annotation creation < 3 seconds
- [ ] Page load with 100 annotations < 2 seconds
- [ ] Works on 90%+ of tested websites
- [ ] Extension passes Chrome/Firefox review

---

## Future Enhancements

### Phase 9+ (Post-Launch)

1. **Advanced Selectors**
   - PDF.js integration for PDF annotations
   - EPUB CFI for ebook annotations
   - Media fragments for video/audio

2. **Collaboration Features**
   - Follow users
   - Group annotations
   - Annotation threads/replies

3. **Discovery**
   - Popular annotations feed
   - Tag-based browsing
   - User profiles

4. **Export/Import**
   - Export to W3C JSON-LD
   - Import from Hypothesis
   - Backup to JSON

5. **Advanced Anchoring**
   - DOM mutation observer for dynamic content
   - Multiple highlight colors
   - Annotation layers/filters

---

## Resources

- **W3C Spec**: https://www.w3.org/TR/annotation-model/
- **AT Protocol Docs**: https://atproto.com/specs/lexicon
- **henry.ink Source**: https://github.com/hzoo/henry.ink
- **Hypothesis**: https://github.com/hypothesis/h

---

## Getting Help

If you get stuck:

1. Check henry.ink's existing code for patterns
2. Review W3C Web Annotation examples
3. Test with simple HTML pages first
4. Use browser DevTools to debug selector matching
5. Check AT Protocol Discord for atproto questions
