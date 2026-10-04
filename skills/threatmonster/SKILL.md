---
name: threatmonster-model
description: Generate a STRIDE threat model as a ThreatMonster file (*.tm.json) from a system description such as a design document, architecture notes or a diagram. Use when asked to create, draft or extend a threat model for ThreatMonster, or to turn a design into data flow diagram elements, trust boundaries and STRIDE threats that ThreatMonster can open.
---

# Generating ThreatMonster threat models

ThreatMonster is a threat modelling tool. A model is one JSON file (`*.tm.json`) containing one or more **data
flow diagrams** (DFDs) and a list of **STRIDE threats** attached to the diagram's elements and flows. Your job is to
read the material you are given (design document, architecture description, README, diagram, conversation) and
produce a file that ThreatMonster can open directly: a correct, complete diagram of the system and specific,
well-reasoned threats against it.

Output **only the JSON document** (no comments, no trailing commas, no Markdown fences unless you are asked to show
it inline). Suggest the file name `<system-name>.tm.json`.

## Concepts

### Diagram elements

| Kind | Use it for | Examples |
|---|---|---|
| `actor` | Anything outside your control that interacts with the system. Also called an external entity. | End user, administrator, partner system, payment provider, identity provider, AI agent calling your API |
| `process` | Code that you run and that transforms or routes data | Web app, API, microservice, serverless function, batch job, worker, API gateway, mobile app |
| `store` | Where data rests | Database, cache, message queue/topic, blob/file storage, audit log, secrets vault, config file |
| `boundary` | A **trust boundary**: a perimeter where the level of trust changes. Drawn as a box that contains the elements inside it. | Internet vs. company network, DMZ, private VNet/VPC, Kubernetes cluster, cloud account, user's device, third-party SaaS |
| `annotation` | Free text note on the canvas, with no security meaning. Use sparingly. | "All traffic passes through Azure Front Door" |

**Data flows** (`flows`) connect two elements and point in the direction the data travels. A flow is always between
two of `actor`, `process` or `store`; never draw a flow to or from a `boundary` or `annotation`. Data stores and
actors do not talk to each other directly: put a process between them. A request/response pair can be one
bidirectional flow (`isBidirectional: true`) if the same data concerns apply both ways. Use two flows when the
directions carry different data, e.g. "Order request" and "Order confirmation".

**Trust boundaries contain elements.** Nesting is expressed with `parentId` and must agree with the geometry, as
described in the layout rules below. A flow **crosses a trust boundary** when its two ends are in different sets of
boundaries. These flows are where attacks happen, and ThreatMonster highlights them in amber. Every crossing flow
should have threats.

### STRIDE

| Category (`category` value) | Threat to | Question to ask |
|---|---|---|
| `spoofing` | Authentication | Can someone pretend to be this element or user? |
| `tampering` | Integrity | Can data or code be modified in storage, in transit or in memory? |
| `repudiation` | Non-repudiation | Can someone deny an action because there is no trustworthy record? |
| `informationDisclosure` | Confidentiality | Can data leak to someone who should not see it? |
| `denialOfService` | Availability | Can it be made slow or unavailable? |
| `elevationOfPrivilege` | Authorization | Can someone gain rights they should not have? |

**STRIDE per element.** Only these categories apply to each target. ThreatMonster's completeness check uses this
table:

| Target | Applicable categories |
|---|---|
| actor | spoofing, repudiation |
| process | all six |
| store | tampering, repudiation, informationDisclosure, denialOfService (repudiation mainly for logs) |
| flow | tampering, informationDisclosure, denialOfService |

Threats can only be attached to actors, processes, stores and flows, never to boundaries or annotations.

### Severity, status and CVSS

- `severity`: `low`, `medium`, `high` or `critical`. Omit it if you cannot judge it. Base it on likelihood and
  impact **in this system**: what the attacker gains, how exposed the element is (internet-facing? crosses a
  boundary?), and what data is involved.
- `status`:
  - `open`: not yet addressed.
  - `mitigated`: the design **already** describes a control that addresses it. Say which control in `mitigation`.
  - `accepted`: the document explicitly accepts the risk.
  - `notApplicable`: does not apply. Explain why in `description`.
  - When unsure, use `open`.
- `cvss` (optional, CVSS v3.1 only): `{ "vector": "CVSS:3.1/AV:…/AC:…/PR:…/UI:…/S:…/C:…/I:…/A:…", "baseScore": 7.5 }`.
  Only include it when asked, or when you are confident in every metric. `baseScore` **must** be the correct CVSS
  3.1 base score for the vector, and `severity` must match it: 0.1–3.9 `low`, 4.0–6.9 `medium`, 7.0–8.9 `high`,
  9.0–10.0 `critical`. If in doubt, leave `cvss` out and set only `severity`; users can score in the app.

## File format

All property names are camelCase and all enum values are the exact lowercase/camelCase strings shown. Omit
optional properties rather than writing `null`.

```text
ThreatModel
  format        "threatmonster"                     required, exactly this value
  version       1                                   required
  summary       ModelSummary                        required
  diagrams      Diagram[]                           required, at least one
  threats       Threat[]                            required (may be empty)

ModelSummary
  title         string                              required: name of the system
  owner         string?                             team or person owning the system, if known
  reviewer      string?
  description   string?                             what is modelled, scope, key assumptions
  contributors  string[]                            required (may be empty)
  createdAt     string?                             ISO 8601, e.g. "2026-10-04T09:00:00Z"
  modifiedAt    string?                             ISO 8601

Diagram
  id            string                              required, unique in the file
  title         string                              required
  description   string?
  elements      Element[]                           required
  flows         Flow[]                              required

Element
  id            string                              required, unique in the file
  kind          "actor"|"process"|"store"|"boundary"|"annotation"
  name          string                              required; short label shown on the canvas
  description   string?                             what it is / does, technology, data handled
  parentId      string?                             id of the innermost boundary containing it (see layout rules)
  x, y          number                              top-left corner, absolute canvas coordinates
  width, height number                              required, > 0
  outOfScope    boolean                             required (normally false)
  outOfScopeReason string?                          required in practice when outOfScope is true
  -- kind-specific flags (omit when false) --
  actorType     "human"|"system"|"agent"            actor only; default human
  providesAuthentication true                       actor: it is an identity provider for the system
  isWebApplication       true                       process: serves web pages/browser clients
  privileged             true                       process: runs as root/admin/with high privileges
  storesCredentials      true                       store: holds passwords, keys, tokens, secrets
  isLog                  true                       store: audit or application log
  isEncrypted            true                       store: encrypted at rest
  isSigned               true                       store: integrity protected

Flow
  id            string                              required, unique in the file
  sourceId      string                              required: id of an actor/process/store in the same diagram
  targetId      string                              required: id of an actor/process/store in the same diagram, ≠ sourceId
  name          string                              required; the data, e.g. "Order details", "JWT + search query"
  description   string?
  protocol      string?                             e.g. "HTTPS", "gRPC", "AMQP", "SQL/TLS"
  isEncrypted   boolean                             required: encrypted in transit (TLS etc.)
  isPublicNetwork boolean                           required: travels over the internet
  isBidirectional boolean                           required
  outOfScope    boolean                             required (normally false)
  outOfScopeReason string?

Threat
  id            string                              required, unique in the file
  number        integer                             required: 1, 2, 3, … unique; users refer to threats by number
  title         string                              required: short, specific statement of the threat
  category      "spoofing"|"tampering"|"repudiation"|"informationDisclosure"|"denialOfService"|"elevationOfPrivilege"
  diagramId     string                              required: id of the diagram containing the target
  targetId      string                              required: id of an actor, process, store or flow
  description   string?                             attacker, entry point, what goes wrong, impact
  mitigation    string?                             existing or recommended controls, concrete and actionable
  severity      "low"|"medium"|"high"|"critical"?
  status        "open"|"mitigated"|"accepted"|"notApplicable"   required
  cvss          { vector: string, baseScore: number }?           optional, see above
  catalogId     string?                             omit; used by the app's built-in suggestions
```

**IDs** can be any strings. Use short, readable, prefixed slugs so references are easy to keep consistent:
`d-main`, `a-customer`, `p-api`, `s-orders-db`, `b-vpc`, `f-api-db`, `t-1`. IDs must be unique across the
whole file, not just within one diagram.

## Layout rules

ThreatMonster draws exactly what the coordinates say, so the layout must be readable without manual fixing.

1. **Sizes** (width × height): actor 150×70, process 120×120 (drawn as an ellipse), store 160×70, annotation about
   200×50. Use multiples of 10 for all coordinates.
2. **Arrange by trust zone, left to right**: external actors on the left, then the internet-facing zone, then
   internal zones, then external services on the right or bottom. Flow labels are drawn at the middle of each
   arrow, so leave **160–240 px** between connected elements horizontally and about **120 px** vertically. Never
   let elements overlap. Put elements that talk to each other next to each other, and line up the centres of
   elements in the same row or column so arrows are straight.
3. **Boundaries contain their elements geometrically.** These rules define `parentId`:
   - A non-boundary element belongs to the **smallest boundary that contains its centre point**. Make it fully
     inside, at least 40 px from every boundary edge.
   - A boundary nested in another must be **fully inside it and smaller**.
   - Set `parentId` to the **innermost** containing boundary. Omit it for elements outside all boundaries.
   - The boundary's name label sits on its top edge, so leave about 40 px free at the top inside each boundary.
   - Size boundaries to fit their contents plus padding; never let an element that is *not* meant to be inside
     a boundary overlap it.
4. List boundaries before other elements, outermost first. This is not required, but it keeps the file readable.
5. Use **one diagram** unless the system is large. Then split by subsystem or level, e.g. a context diagram plus
   one diagram per major component. Each diagram must contain every element its flows reference. Repeat an
   element in another diagram under a new id if needed.

## Method

1. **Understand the system.** From the material, list the users and external systems, the components you deploy,
   where data is stored, how components communicate, and where the network or privilege boundaries are. Do not
   invent components the material does not support. Put reasonable assumptions in `summary.description` or an
   element's `description`, and say they are assumptions.
2. **Draw the DFD.** Create the elements, then the trust boundaries around them, then a flow for each meaningful
   data exchange. Name flows after the **data**, not the action. Set `isEncrypted` and `isPublicNetwork`
   from what the material says; if it is not stated, use `false` and mention the uncertainty in the flow's
   `description`. Mark third-party internals you cannot influence as `outOfScope` with a reason, or simply do not
   model them.
3. **Find threats with STRIDE per element.** Walk every in-scope actor, process, store and flow, and consider each
   applicable category. Prioritize in this order:
   - flows that cross a trust boundary
   - internet-facing processes
   - stores holding credentials or personal/sensitive data
   - privileged components
   - authentication and authorization points

   Aim for threats that are **specific to this design**: name the component, the data, the entry point and the
   consequence. Avoid generic filler: "An attacker could hack the server" is not a threat. Two to four good threats
   per important element beat one weak threat per category everywhere. Skip a category for an element when there is
   genuinely nothing meaningful to say.
4. **Write mitigations.** If the material already describes a control, quote or reference it and set
   `status: "mitigated"` when it fully addresses the threat. Otherwise recommend concrete controls fitting the stated
   technology, e.g. "Use Entra ID managed identity for the Order API → SQL connection" rather than "use strong
   authentication", and leave `status: "open"`.
5. **Number threats** 1…n in a sensible reading order, e.g. by diagram position or by element.
6. **Self-check** before answering (see the checklist below).

### Threat ideas by target

Use these as prompts, not as a list to copy.

- **actor (human)**: credential phishing or stuffing, session theft, missing MFA; denying having placed an order or
  made a change (no audit trail).
- **actor (system / agent)**: impersonating a partner system with leaked API keys; webhook spoofing; an AI agent
  steered by prompt injection; disputes over who sent a message.
- **process**:
  - spoofing: unauthenticated endpoints.
  - tampering: injection (SQL, command, template), deserialization, supply chain.
  - repudiation: missing audit logs.
  - information disclosure: verbose errors, IDOR, secrets in config.
  - denial of service: missing rate limits, expensive queries, unbounded uploads.
  - elevation of privilege: broken function-level authorization, running as root, SSRF to cloud metadata.
- **store**:
  - tampering: direct write access bypassing the app.
  - repudiation: logs that can be edited or deleted.
  - information disclosure: no encryption at rest, overly broad read access, public buckets, credentials stored
    reversibly, backups.
  - denial of service: capacity exhaustion, ransomware, missing backups.
- **flow**:
  - tampering: man-in-the-middle, replay.
  - information disclosure: sniffing unencrypted traffic, sensitive data in URLs or logs, over-sharing across the
    boundary.
  - denial of service: flooding, a dependency outage cascading.

## Self-check

- [ ] `format` is `"threatmonster"`, `version` is `1`, and every required property is present with the right type.
- [ ] Every `id` is unique across the whole file.
- [ ] Every flow's `sourceId`/`targetId` is an actor, process or store **in the same diagram**, and source ≠ target.
- [ ] Every threat's `targetId` is an actor, process, store or flow, and `diagramId` is the diagram containing it.
- [ ] Every threat's `category` is applicable to its target kind (STRIDE-per-element table).
- [ ] Threat `number`s are 1…n with no duplicates.
- [ ] Every element's `parentId` matches the geometry rules, and no boundary contains an element it should not.
- [ ] No two non-boundary elements overlap, and all widths and heights are > 0.
- [ ] Every flow that crosses a trust boundary has at least one threat.
- [ ] `cvss`, if present, has a correct `baseScore`, and `severity` matches its band.
- [ ] The JSON parses: double quotes, no comments, no trailing commas.

If you have tool access, the ThreatMonster repository contains a JSON Schema at
`docs/threatmonster.schema.json`, and the running app validates files via `POST /api/models/open`. Its
`POST /api/analysis` endpoint returns the same completeness gaps the app shows.

## Complete example

A small web shop: customers use a web front end in the cloud; it calls an order service in a private network,
which uses a database and an audit log and charges cards through an external payment provider.

```json
{
  "format": "threatmonster",
  "version": 1,
  "summary": {
    "title": "Web Shop",
    "owner": "Shop team",
    "description": "Customer-facing web shop. In scope: web front end, order service, order database and audit log. The payment provider is external and modelled only as an actor. Assumption: all components run in one cloud subscription.",
    "contributors": [],
    "createdAt": "2026-10-04T09:00:00Z"
  },
  "diagrams": [
    {
      "id": "d-main",
      "title": "Order flow",
      "elements": [
        { "id": "b-cloud", "kind": "boundary", "name": "Cloud subscription", "x": 280, "y": 40, "width": 980, "height": 500, "outOfScope": false },
        { "id": "b-private", "kind": "boundary", "name": "Private network", "x": 640, "y": 120, "width": 580, "height": 360, "parentId": "b-cloud", "outOfScope": false },
        { "id": "a-customer", "kind": "actor", "name": "Customer", "description": "Anonymous or logged-in shopper using a browser.", "actorType": "human", "x": 40, "y": 205, "width": 150, "height": 70, "outOfScope": false },
        { "id": "p-web", "kind": "process", "name": "Web front end", "description": "Server-rendered shop pages and cart (ASP.NET Core). Internet-facing.", "isWebApplication": true, "x": 400, "y": 180, "width": 120, "height": 120, "parentId": "b-cloud", "outOfScope": false },
        { "id": "p-orders", "kind": "process", "name": "Order service", "description": "REST API that validates orders, stores them and requests payment.", "x": 720, "y": 180, "width": 120, "height": 120, "parentId": "b-private", "outOfScope": false },
        { "id": "s-orders-db", "kind": "store", "name": "Orders DB", "description": "SQL database with orders and customer addresses (personal data).", "isEncrypted": true, "x": 1000, "y": 205, "width": 160, "height": 70, "parentId": "b-private", "outOfScope": false },
        { "id": "s-audit", "kind": "store", "name": "Audit log", "description": "Append-only log of order and payment events.", "isLog": true, "x": 1000, "y": 360, "width": 160, "height": 70, "parentId": "b-private", "outOfScope": false },
        { "id": "a-payment", "kind": "actor", "name": "Payment provider", "description": "External card payment service (PSP).", "actorType": "system", "x": 705, "y": 620, "width": 150, "height": 70, "outOfScope": false }
      ],
      "flows": [
        { "id": "f-customer-web", "sourceId": "a-customer", "targetId": "p-web", "name": "Browsing, cart and checkout", "protocol": "HTTPS", "isEncrypted": true, "isPublicNetwork": true, "isBidirectional": true, "outOfScope": false },
        { "id": "f-web-orders", "sourceId": "p-web", "targetId": "p-orders", "name": "Order request", "protocol": "HTTPS/REST", "isEncrypted": true, "isPublicNetwork": false, "isBidirectional": false, "outOfScope": false },
        { "id": "f-orders-db", "sourceId": "p-orders", "targetId": "s-orders-db", "name": "Order records", "protocol": "SQL/TLS", "isEncrypted": true, "isPublicNetwork": false, "isBidirectional": true, "outOfScope": false },
        { "id": "f-orders-audit", "sourceId": "p-orders", "targetId": "s-audit", "name": "Order and payment events", "isEncrypted": false, "isPublicNetwork": false, "isBidirectional": false, "outOfScope": false, "description": "Transport security not specified in the design." },
        { "id": "f-orders-payment", "sourceId": "p-orders", "targetId": "a-payment", "name": "Payment authorization", "protocol": "HTTPS", "isEncrypted": true, "isPublicNetwork": true, "isBidirectional": true, "outOfScope": false }
      ]
    }
  ],
  "threats": [
    {
      "id": "t-1", "number": 1, "title": "Account takeover through credential stuffing on the login page",
      "category": "spoofing", "diagramId": "d-main", "targetId": "a-customer",
      "description": "Attackers replay leaked username/password pairs against the shop login and take over customer accounts, gaining access to saved addresses and order history.",
      "mitigation": "Rate-limit and monitor login attempts, offer MFA, check passwords against breached-password lists.",
      "severity": "high", "status": "open"
    },
    {
      "id": "t-2", "number": 2, "title": "Customer disputes having placed an order",
      "category": "repudiation", "diagramId": "d-main", "targetId": "a-customer",
      "description": "Without a record linking the authenticated customer to the checkout, chargebacks for 'I never ordered this' cannot be contested.",
      "mitigation": "The order service writes order events with customer id, timestamp and client IP to the append-only audit log.",
      "severity": "medium", "status": "mitigated"
    },
    {
      "id": "t-3", "number": 3, "title": "Stored XSS through product reviews",
      "category": "tampering", "diagramId": "d-main", "targetId": "p-web",
      "description": "Review text rendered without encoding lets an attacker run script in other customers' browsers and steal their session cookies.",
      "mitigation": "Rely on Razor auto-encoding (never Html.Raw for user content), add a strict Content-Security-Policy, mark session cookies HttpOnly.",
      "severity": "high", "status": "open"
    },
    {
      "id": "t-4", "number": 4, "title": "Order service trusts prices sent by the front end",
      "category": "tampering", "diagramId": "d-main", "targetId": "f-web-orders",
      "description": "If the order request carries item prices, a compromised or manipulated front end can buy items for any price.",
      "mitigation": "Send only product ids and quantities; the order service looks up prices server-side.",
      "severity": "high", "status": "open"
    },
    {
      "id": "t-5", "number": 5, "title": "SQL injection in order search",
      "category": "tampering", "diagramId": "d-main", "targetId": "p-orders",
      "description": "Order search builds SQL from query parameters; injection would expose and modify all orders and addresses.",
      "mitigation": "Use parameterized queries via the ORM only; run the service with a database user limited to the orders schema.",
      "severity": "critical", "status": "open",
      "cvss": { "vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N", "baseScore": 9.1 }
    },
    {
      "id": "t-6", "number": 6, "title": "Customer addresses readable from database backups",
      "category": "informationDisclosure", "diagramId": "d-main", "targetId": "s-orders-db",
      "description": "Backups of the orders database containing personal data are accessible to all operations staff.",
      "mitigation": "Encrypt backups with a separate key and restrict restore permissions to a break-glass role.",
      "severity": "medium", "status": "open"
    },
    {
      "id": "t-7", "number": 7, "title": "Audit events altered in transit to the log",
      "category": "tampering", "diagramId": "d-main", "targetId": "f-orders-audit",
      "description": "The design does not state that the log channel is protected; an attacker in the private network could alter or drop events, undermining dispute handling (threat #2).",
      "mitigation": "Use TLS to the log endpoint and authenticate the order service to it.",
      "severity": "low", "status": "open"
    },
    {
      "id": "t-8", "number": 8, "title": "Forged payment callbacks mark unpaid orders as paid",
      "category": "tampering", "diagramId": "d-main", "targetId": "f-orders-payment",
      "description": "If payment results are accepted without verification, an attacker can send fake 'payment succeeded' responses for unpaid orders.",
      "mitigation": "Verify the provider's signature on every payment result and confirm the amount and order id server-side.",
      "severity": "high", "status": "open"
    },
    {
      "id": "t-9", "number": 9, "title": "Payment provider outage blocks all checkouts",
      "category": "denialOfService", "diagramId": "d-main", "targetId": "f-orders-payment",
      "description": "Synchronous payment calls without timeouts tie up order service threads when the provider is slow, taking the whole shop down.",
      "mitigation": "Short timeouts, a circuit breaker, and queuing orders for later payment confirmation.",
      "severity": "medium", "status": "open"
    },
    {
      "id": "t-10", "number": 10, "title": "Session cookie exposed through an HTTP downgrade",
      "category": "informationDisclosure", "diagramId": "d-main", "targetId": "f-customer-web",
      "description": "On hostile Wi-Fi an attacker strips the redirect to HTTPS and captures the session cookie sent over plain HTTP.",
      "mitigation": "Enable HSTS with preload and mark cookies Secure.",
      "severity": "medium", "status": "open"
    }
  ]
}
```

In this example:
- Both boundaries and every flow that crosses one (customer → web, web → orders, orders → payment) are modelled
  and have threats.
- Each threat names the specific component and data involved.
- Threat #2 is `mitigated` because the design already includes the audit log.
- Threat #5 carries a CVSS vector whose base score (9.1) and severity (`critical`) agree.
