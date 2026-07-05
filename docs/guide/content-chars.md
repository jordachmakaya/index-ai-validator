# content_chars

`content_chars` is how an agent knows the token cost of a node before fetching
it. If your declared count is wrong, agents budget wrong. This check keeps it
honest.

`content_chars` is the declared Unicode code point count for a clean `llm_url`
response.

>[!important]
>The validator checks `content_chars` as part of Level 2a Agent Index
validation through both `validateIndexAi()` and the `index-ai` CLI.


<div class="audio-explainer">
  <video controls playsinline style="width: 100%; height: auto; border-radius: 12px;" aria-label="Why AI agents prioritize content_chars — audio explainer">
    <source src="/content-chars-explained.mp4" type="video/mp4">
    Your browser does not support the video tag. Listen to the audio explainer: <a href="/why_AI_agents_prioritize_contentchars.m4a">why_AI_agents_prioritize_contentchars.m4a</a>.
  </video>
  <p class="audio-explainer-caption">🔊 Audio explainer — why <code>content_chars</code> matters to AI agents.</p>
</div>

<div class="illustration-note">
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="12" y1="16" x2="12" y2="12"></line>
    <line x1="12" y1="8" x2="12.01" y2="8"></line>
  </svg>
  <span>Illustrative example — for visual reference only.</span>
</div>

## What is implemented now

The validator now checks `content_chars` for fetched clean endpoints.

Implemented behavior:

- clean endpoint fetch through each node `content.llm_url`
- allowed clean endpoint content types: `text/markdown` and `text/plain`
- Unicode NFC normalization before counting
- code point counting, not UTF-16 `.length`
- `content_chars_mode: exact`
- `content_chars_mode: max`
- `content_chars` must be an integer greater than or equal to `1`
- emoji counts as one code point
- decomposed accents are normalized before counting

## Why `.length` is not enough

JavaScript string `.length` counts UTF-16 code units. That is not the same as
the character count required for `content_chars`.

Examples:

```txt
abc        -> 3 code points
e + accent -> normalized, then 1 code point
rocket     -> 1 code point, but JavaScript .length is 2
```

The validator normalizes text to Unicode NFC before counting code points. This
makes composed and decomposed accented text count consistently.

## STEP-1 - Fetch the clean content

For Level 2a, each graph node declares:

```txt
content.llm_url
```

The validator resolves that URL, fetches it, and checks that the response is
served as one of:

```txt
text/markdown
text/plain
```

## STEP-2 - Normalize and count

The fetched body is normalized to Unicode NFC before counting.

```txt
e + combining acute accent -> one normalized code point
```

The count must be a whole number. Decimal values such as `1.5` are invalid, and
`0` is invalid because zero is only a placeholder.

## STEP-3 - Compare by mode

`content_chars_mode` controls how the declared value is compared.

| Mode | Rule |
| --- | --- |
| `exact` | The measured count must equal `content_chars`. |
| `max` | The measured count must be less than or equal to `content_chars`. |

## Measurement flow

```mermaid
flowchart TD
  A["llm_url"] --> B["Fetch clean endpoint"]
  B --> C["Check text/markdown or text/plain"]
  C --> D["Normalize NFC"]
  D --> E["Count code points"]
  E --> F["Compare using exact or max"]
```

## Scope

`content_chars` validation runs on Level 2a Agent Index clean endpoints through
`validateIndexAi()`. This is experimental documentation of current validator
behavior, not compliance certification or a traffic promise. See
[Scope](/guide/scope).
