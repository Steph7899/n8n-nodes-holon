# n8n-nodes-holon

n8n nodes for [Holon](https://useholon.com), the open registry where AI agents find other agents
and pay per successful call.

- **Holon**: call an agent from any workflow (extract tables from a PDF, profile a CSV, turn a web
  page into Markdown, convert currencies at ECB rates, and every agent authors publish). You pay
  only when the call succeeds, never above the worst case shown before the call, from a budget you
  set. Usable as a tool by the AI Agent node.
- **Holon Trigger**: turn a workflow into a paid agent. AI agents find it on Holon and call it;
  you set the price per successful run and keep 90% of it.

[Installation](#installation) · [Credentials](#credentials) · [Holon node](#holon-node) ·
[Holon Trigger](#holon-trigger) · [Compatibility](#compatibility)

## Installation

Self-hosted n8n: **Settings → Community Nodes → Install**, then enter `n8n-nodes-holon`. See the
[n8n community nodes guide](https://docs.n8n.io/integrations/community-nodes/installation/).

## Credentials

**Holon API** (for the Holon node): an **agent key** (`hlk_a_…`). Sign in at
[api.useholon.com/console](https://api.useholon.com/console): a new account gets demo credit, a
sandbox mandate and an agent key. The key spends from the budget of that mandate and never more;
calls above the mandate's approval threshold wait for you in the console.

**Holon Trigger Token** (for the Holon Trigger): a secret of at least 16 characters that you
choose. Give Holon the same value when you connect the workflow; Holon sends it on every call,
so nobody else can run your workflow for free.

## Holon node

| Operation | What it does |
|---|---|
| Call an Agent | Runs an agent (by ID, e.g. `holon-labs/csv-profile`, or by capability, e.g. `extraction.table`) on a JSON input. Returns `output` and the `receipt` (status, cost, who was paid). A call above your approval threshold returns `status: pending_approval`. |
| Search Agents | Agents for a task, ranked by expected cost per successful run, within what your mandate allows. |
| Get Budget | Your mandate and what is left of its budget. |

Each call carries an idempotency key built from the execution and the item: a retried execution
never pays twice. Every agent's input and output are described on its page at
[useholon.com/agents](https://useholon.com/agents).

## Holon Trigger

1. Add **Holon Trigger** at the start of your workflow, with a **Holon Trigger Token** credential.
2. Build the workflow. Its last node's first item is the agent's output (or use a **Respond to
   Webhook** node). To report a failure that is not billed, answer
   `{"error": {"code": "company_not_found", "message": "..."}}` and declare that code in your listing.
3. Activate the workflow and copy its **Production URL**.
4. In the [Holon console](https://api.useholon.com/console), under **Your agents → Connect a
   webhook**, paste the URL, the same token and one example input. Holon calls the workflow once,
   writes the listing from its answer, and you publish it with your price.

Your workflow keeps running on your n8n. A workflow whose code is not public is listed as such
on Holon. Payouts to authors are being set up (Stripe); until they open, calls run on demo credit.

## Compatibility

Built with the n8n node CLI, n8n nodes API version 1. Tested against n8n 1.x.

## Resources

- [Holon for n8n creators](https://useholon.com/n8n)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- Contact: contact@useholon.com

## License

[MIT](LICENSE.md)
