# Level 2b Agent Graph

Level 2b adds a structural requirement on top of Level 2a: the Agent Index
graph must form a valid **DAG** (directed acyclic graph) of typed relations
between nodes, so an agent can navigate from a root to related content
without hitting a dead end, a cycle, or a dangling reference.

>[!important]
>The validator checks Level 2b relations as part of Level 2a Agent Index
validation, through both `validateIndexAi()` and the `index-ai` CLI's
`--target-level l2b` option.

## Level 2b is optional, and additive

Level 2b relations are entirely optional. An Agent Index that declares no
`relations` field on any node is fully Level 2a conformant, and running
Default validation mode against it (with or without `--target-level l2b`)
never fails or warns because of the absence of `relations` — the Level 2b
checks simply do not run at all in that case.

Level 2b checks only activate once at least one node in the graph declares
a `relations` field.

## Node required fields

Each node's optional `relations` object:

| Field | Required | Rule |
| --- | ---: | --- |
| `parent` | No | `string` (the parent node's `id`) or `null` (marks this node as a graph root). |
| `children` | No | Array of `string` ids. |
| `related` | No | Array of `string` ids. |

## The five DAG structural checks

Once at least one node declares `relations`, the validator runs five checks
against the whole graph:

| Check | Rule |
| --- | --- |
| `L2B_GRAPH_ROOT_EXISTS` | At least one node has `relations.parent` explicitly set to `null`. A node that simply omits `relations.parent` does not count as a root — only an explicit `null` does. |
| `L2B_GRAPH_RELATION_PAIR_EXISTS` | At least one parent/children pair is declared and bidirectionally consistent (see below). |
| `L2B_GRAPH_BIDIRECTIONAL` | For every node A whose `relations.children` lists id B, node B must exist and declare `relations.parent === A.id` — checked in both directions, so a node cannot fabricate a `relations.parent` claim that the named parent never reciprocates. |
| `L2B_GRAPH_ACYCLIC` | No path through `parent`/`children` edges loops back on itself, for cycles of any length — not just a direct two-node mutual reference. |
| `L2B_GRAPH_NO_ORPHANS` | Every id referenced in any node's `relations.children` or `relations.related` exists among the graph's nodes. |

All five are `must`/`fail` checks — any one failing blocks Level 2b, but
never demotes an already-earned Level 1 or Level 2a result. A Level 2b DAG
defect is invisible to `conformance` unless `--target-level l2b` (or
higher) was actually requested and reached that far in the cascade.

## Example

```json
{
  "id": "pricing",
  "type": "page",
  "label": "Pricing",
  "content": { "...": "..." },
  "meta": { "...": "..." },
  "relations": {
    "parent": "home",
    "children": ["pricing-faq"],
    "related": ["comparison"]
  }
}
```

For this to pass Level 2b: the `home` node must exist and list `"pricing"`
in its own `relations.children`; `pricing-faq` and `comparison` must both
exist as node ids somewhere in the graph; and no chain of `parent`/`children`
edges anywhere in the graph may loop back on itself.

## Conformance result

`validateIndexAi()` can return:

```txt
level-2b
```

when Level 1, Level 2a, and all five Level 2b DAG checks pass. See
[Conformance vs Passed](/guide/conformance-vs-passed).

## CLI usage

```bash
index-ai https://example.com --target-level l2b
index-ai https://example.com --target-level l2b --json
index-ai https://example.com --target-level l2b --html report.html
```

All three surfaces — human output, `--json`, and `--html` — support Level
2b: the human and HTML reports show `Level 2b` in the requested/tested/
achieved level breakdown, and `--json` includes `l2b` in `tested_levels`
and `level_results` per the same shape documented in
[JSON Output](/guide/json-output#target-level-fields). See
[Target level](/guide/cli#target-level) for cascade-skip semantics.

## Scope

Level 2b is the highest structural level the validator emits. For what it
does not implement (Level 3 / MCP), see [Scope](/guide/scope).
