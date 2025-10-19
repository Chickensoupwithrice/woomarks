# Web Annotation Lexicon for AT Protocol

A comprehensive lexicon implementing the [W3C Web Annotation Data Model](https://www.w3.org/TR/annotation-model/) on AT Protocol, designed as a decentralized alternative to [Hypothesis](https://hypothes.is/).

## Overview

This lexicon provides a complete implementation of web annotation functionality, supporting:

- **W3C Standard Compliance**: Full support for W3C Web Annotation Data Model including annotations, selectors, targets, and bodies
- **Rich Selectors**: Text quotes, XPath, CSS selectors, fragments, ranges, PDF pages, media time codes, EPUB chapters, and SVG shapes
- **Threading & Replies**: Full conversation threading with reference chains
- **Groups & Communities**: Scoped collaboration spaces with membership roles and permissions
- **Moderation**: Flag/report system with moderator actions and pre-moderation support
- **Multiple Content Types**: HTML, PDF, EPUB, video/audio, and images
- **Privacy Controls**: Public, group-only, and private annotations
- **Document Equivalence**: Multiple URI support (canonical, DOI, PDF fingerprints)

## Lexicon Structure

### Core Records

#### `com.woomarks.annotation.annotation`
Main annotation record implementing W3C Annotation type.

**Key Features:**
- W3C-compliant target and body structure
- Multiple selector types for precise content location
- Threading via `references` array (first item = thread root, last = direct parent)
- Visibility controls (public/group/private)
- Document metadata with equivalence support
- Motivation types (commenting, highlighting, tagging, etc.)
- CSS stylesheets for custom rendering

**Example:**
```json
{
  "target": [{
    "source": "https://example.com/article.html",
    "selector": [
      {
        "type": "TextQuoteSelector",
        "exact": "the selected text",
        "prefix": "text before ",
        "suffix": " text after"
      },
      {
        "type": "TextPositionSelector",
        "start": 1234,
        "end": 1250
      }
    ]
  }],
  "body": [
    {
      "type": "TextualBody",
      "value": "This is an interesting point!",
      "format": "text/markdown",
      "purpose": "commenting"
    }
  ],
  "motivation": "commenting",
  "visibility": "public",
  "tags": ["research", "important"],
  "createdAt": "2024-01-15T10:30:00Z"
}
```

#### `com.woomarks.annotation.defs`
Selector and state definitions following W3C specifications.

**Selector Types:**
- **TextQuoteSelector**: Identifies text by quoting it with prefix/suffix context
- **TextPositionSelector**: Character position offsets (start/end)
- **RangeSelector**: Defines ranges using start/end selectors
- **FragmentSelector**: URI fragment identifiers (e.g., `#section-2`, `t=30,60`)
- **CssSelector**: DOM element selection via CSS selectors
- **XPathSelector**: XML/HTML element selection via XPath
- **DataPositionSelector**: Byte ranges in binary data
- **SvgSelector**: SVG shapes for region selection
- **PageSelector**: PDF page numbers (Hypothesis extension)
- **MediaTimeSelector**: Video/audio timestamps (Hypothesis extension)
- **EPUBContentSelector**: EPUB chapter/section identification (Hypothesis extension)
- **ShapeSelector**: Geometric shapes for image/PDF regions (Hypothesis extension)

**State Descriptors:**
- **TimeState**: Temporal version (timestamp or interval + cached copy URI)
- **HttpRequestState**: HTTP headers needed to retrieve specific representation

**Selector Refinement:**
All selectors support `refinedBy` for chaining to create more precise selections.

#### `com.woomarks.annotation.group`
Annotation groups/communities for scoped collaboration.

**Group Types:**
- **open**: World-readable, authority/admin-controlled writing
- **restricted**: World-readable, members-only writing
- **private**: Members-only reading and writing

**Features:**
- URL scope restrictions (e.g., only annotate within `https://example.com/docs/*`)
- Pre-moderation (annotations require approval before visible)
- Role-based permissions
- Avatar and banner images
- Group rules/guidelines

#### `com.woomarks.annotation.membership`
Group membership with role-based access control.

**Roles:**
- **owner**: Full control over group
- **admin**: Manage members and settings
- **moderator**: Manage content and moderation
- **member**: Standard annotation access

**Statuses:**
- **active**: Full access
- **pending**: Awaiting approval
- **suspended**: Temporarily revoked

### Interaction Records

#### `com.woomarks.annotation.flag`
Report annotations for moderation review.

**Reasons:** spam, abuse, harassment, off-topic, misinformation, hate-speech, illegal-content, other

#### `com.woomarks.annotation.moderation`
Moderation actions taken by group moderators.

**Actions:** approve, hide, delete, mark-spam

#### `com.woomarks.annotation.mention`
User mentions within annotation text (creates notifications).

Tracks DID, handle at time of mention, and position in text.

### Organizational Records

#### `com.woomarks.annotation.collection`
W3C AnnotationCollection: ordered lists of annotations.

Use cases:
- Reading lists
- Curated collections
- Shared annotation sets
- Export/import groupings

#### `com.woomarks.annotation.search`
Query procedure for searching annotations.

**Search Parameters:**
- `uri`: Exact URI match
- `wildcardUri`: Pattern matching (e.g., `https://example.com/*`)
- `group`: Filter by group
- `user`: Filter by user DID
- `tags`: Tag filtering (AND logic)
- `text`: Full-text search in body
- `quote`: Search in selected/quoted text
- `any`: Search across quote/tags/text/url
- `references`: Find replies to specific annotation
- `motivation`: Filter by motivation type
- `sort`: created, updated, user
- `separateReplies`: Return top-level and replies separately

## Design Decisions & Tradeoffs

### W3C Standard Fidelity
✅ **Decision**: Strict adherence to W3C Web Annotation Data Model
- Uses W3C property names and structure where possible
- Supports full selector vocabulary
- Implements SpecificResource, TimeState, HttpRequestState

⚖️ **Tradeoff**: Some atproto-specific additions needed:
- `references` array for threading (W3C has `replyTo` but different model)
- `visibility` instead of complex permission arrays
- `groupUri` for atproto group references
- DID-based identity instead of IRIs

### Hypothesis Feature Parity
✅ **Implemented**:
- All Hypothesis selector types including custom extensions
- Threading and reply chains
- Group/community system with scopes
- Moderation and flagging
- Mentions and notifications (via record creation)
- Document metadata and equivalence
- PDF, EPUB, media annotations
- Tag-based organization
- Public/private/group visibility

❌ **Deferred** (AppView/service layer concerns):
- Real-time WebSocket updates (use atproto firehose)
- Elasticsearch indexing (AppView responsibility)
- Email notifications (client implementation)
- OAuth flows (use atproto auth)

### Decentralization Challenges

**Document Identification:**
- No central document registry
- Solution: Multiple URIs in `document.link` array with `rel` types (canonical, doi, self-claim)
- Each PDS can claim document equivalences
- AppView aggregates claims for search

**Group Moderation:**
- Who has authority to moderate?
- Solution: Group record creator has inherent authority, delegates via membership roles
- Each PDS enforces based on membership records
- Conflicts handled at AppView layer

**Cross-PDS Threading:**
- Annotations may reference records on different PDSs
- Solution: Use AT-URIs in `references` array
- AppView assembles threads from distributed records

**Permission Enforcement:**
- No global ACL system
- Solution: Simple `visibility` enum + `groupUri`
- PDS enforces on write, AppView enforces on read
- Group membership checked via membership records

### Selector Strategy

**Multiple Selectors per Target:**
- Array of selectors provides fallback options
- Recommended order: RangeSelector → TextPositionSelector → TextQuoteSelector
- TextQuoteSelector most robust to content changes (fuzzy matching possible)
- XPath/CSS selectors for DOM structure
- PageSelector for PDF page-level anchoring

**Selector Refinement:**
- Use `refinedBy` to chain selectors for precision
- Example: PageSelector → TextPositionSelector → TextQuoteSelector

### Storage Considerations

**Blob Usage:**
- Group avatars/banners use blob storage
- CSS stylesheets embedded as strings (W3C allows both)
- Large SVG selectors should reference external resources via `id`

**Record Size:**
- `selector` array max 10 items (provides redundancy without bloat)
- `body` array max 20 items (supports rich multi-part annotations)
- `references` array max 100 items (handles deep threads)
- Text fields use both `maxLength` (bytes) and `maxGraphemes` (display characters)

### Privacy Model

**Three Visibility Levels:**
1. **public**: Discoverable by anyone (W3C: `audience: world`)
2. **group**: Only group members (W3C: `audience: [group members]`)
3. **private**: Only author (W3C: `audience: [author]`)

**Group Scopes:**
- Optional URL pattern restrictions
- Enforced at write time by PDS
- Prevents annotations outside approved domains
- Useful for institutional deployments

## Implementation Guide

### Creating an Annotation

1. **Extract Document Metadata**: Parse page for title, DOI, canonical links
2. **Generate Selectors**: Create multiple selector types for robustness
3. **Build Target**: Combine source URI with selector array
4. **Construct Body**: Create TextualBody items for text, tags, etc.
5. **Set Threading**: If reply, populate `references` with [root, ...ancestors, parent]
6. **Choose Visibility**: Set `visibility` and `groupUri` if applicable
7. **Create Record**: Write to PDS with `createdAt` timestamp

### Anchoring (Finding Selection in Page)

1. **Try Each Selector in Order**: Start with most precise (Range/XPath)
2. **Fallback Chain**: Range → TextPosition → TextQuote
3. **TextQuote Fuzzy Matching**: Use prefix/suffix for context
4. **Mark Orphans**: If all selectors fail, mark annotation as "orphan"
5. **Visual Highlighting**: Apply CSS via `styleClass` or `stylesheet`

### Threading & Replies

1. **Top-Level**: `references` is empty array or omitted
2. **Direct Reply**: `references: ["at://did/collection/root"]`
3. **Nested Reply**: `references: ["root", "grandparent", "parent"]`
4. **Thread Assembly**: Group by `references[0]`, sort by `createdAt`
5. **Deleted Parents**: Handle missing refs gracefully (show placeholder)

### Group Management

1. **Create Group**: Write `com.woomarks.annotation.group` record
2. **Add Members**: Create `com.woomarks.annotation.membership` records
3. **Scope Enforcement**: Check `scopes` array on annotation creation
4. **Permission Checks**: Verify membership and role before allowing actions
5. **Pre-moderation**: If enabled, set initial status to `pending`

### Search Implementation (AppView)

1. **Index Records**: Subscribe to firehose for annotation records
2. **Extract Searchable Fields**: text, tags, uri, quote (from TextQuoteSelector)
3. **Normalize URIs**: Implement document equivalence matching
4. **Apply Filters**: Combine user, group, uri, tag filters
5. **Full-Text Search**: Index body text and quoted text
6. **Threading**: Optionally separate top-level and replies
7. **Pagination**: Use cursor-based pagination for large result sets

### Moderation Workflow

1. **User Flags**: Create `com.woomarks.annotation.flag` record
2. **Moderator Notification**: AppView detects flags, alerts moderators
3. **Review**: Moderator examines annotation and flag details
4. **Action**: Create `com.woomarks.annotation.moderation` record with action
5. **Enforcement**: AppView filters hidden/spam annotations from results
6. **Appeals**: User can dispute via new flag with details

## Migration from Hypothesis

### Data Mapping

| Hypothesis | AT Protocol Lexicon |
|------------|-------------------|
| `id` (URL) | AT-URI (at://did/collection/tid) |
| `userid` (acct:user@domain) | DID |
| `groupid` | `groupUri` (AT-URI) |
| `target_uri` | `target[].source` |
| `target_selectors` | `target[].selector[]` |
| `text` | `body[]{type: TextualBody, value}` |
| `tags` | `tags[]` or `body[]{purpose: tagging}` |
| `references` | `references[]` (same concept) |
| `shared` | `visibility` (false → private, true → public/group) |
| `document` | `document` (similar structure) |
| `permissions.read` | `visibility` + `groupUri` |

### API Endpoint Equivalents

| Hypothesis API | AT Protocol |
|----------------|-------------|
| `POST /api/annotations` | `com.atproto.repo.createRecord` |
| `GET /api/annotations/:id` | `com.atproto.repo.getRecord` |
| `PATCH /api/annotations/:id` | `com.atproto.repo.putRecord` |
| `DELETE /api/annotations/:id` | `com.atproto.repo.deleteRecord` |
| `GET /api/search` | `com.woomarks.annotation.search` (query) |
| WebSocket `/ws` | AT Protocol firehose subscription |

## Future Extensions

### Potential Additions
- **Peer Review**: Structured review annotations with ratings
- **Version Control**: Track annotation edits with full history
- **Collaborative Editing**: Multi-author annotations with conflict resolution
- **Annotation Graphs**: Link annotations together (not just linear threads)
- **Private Notes**: End-to-end encrypted personal annotations
- **Annotation Templates**: Structured annotation types (book reviews, code comments)
- **Badges/Reputation**: Contributor reputation systems
- **Annotation Analytics**: Usage stats and impact metrics

### AppView Features
- **Document Discovery**: Find heavily annotated resources
- **User Profiles**: Annotation activity, followers
- **Trending**: Popular annotations and discussions
- **Feeds**: Algorithmic or chronological annotation feeds
- **Notifications**: Real-time mention/reply notifications
- **Export**: Download annotations in W3C JSON-LD format

## W3C Compliance Notes

### Fully Implemented
- Annotation structure (type, id, body, target, motivation)
- SpecificResource with selectors
- All standard selector types
- TimeState and HttpRequestState
- TextualBody and External Web Resource bodies
- Agent/creator metadata
- Rights and licensing
- Canonical URIs and via provenance

### Adapted for ATProtocol
- **Identity**: Uses DIDs instead of IRIs for agents
- **Permissions**: Simplified to visibility enum instead of complex ACLs
- **Collections**: Simplified from full AnnotationCollection/Page structure
- **JSON-LD Context**: Implied by lexicon definition, not embedded in records

### Compatible Export
Records can be transformed to W3C-compliant JSON-LD for interoperability:
- Map DID to IRI format (`https://plc.directory/{did}`)
- Expand `visibility` to `audience` arrays
- Add `@context: "http://www.w3.org/ns/anno.jsonld"`
- Convert AT-URIs to HTTP URLs for annotation IDs

## License

This lexicon is designed for use with the AT Protocol and follows W3C Web Annotation standards. The W3C Web Annotation Data Model is available under the [W3C Document License](https://www.w3.org/Consortium/Legal/2015/doc-license).
