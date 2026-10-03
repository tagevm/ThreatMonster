# ThreatMonster

A friendlier threat modelling tool, inspired by [OWASP Threat Dragon](https://github.com/OWASP/threat-dragon).
Draw a data flow diagram with actors, processes, data stores and trust boundaries, then record threats per
element using STRIDE, with suggestions for each element type and a model-wide threat overview.

## Features

- **Diagram editor**: drag from the palette or use keyboard shortcuts (`A`ctor, `P`rocess, `S`tore, `B`oundary,
  `N`ote) to add elements at the mouse pointer. Drag from an element's edge dot to draw a data flow, and double-click to
  rename. Undo/redo, copy/paste/duplicate, snap to grid, and several diagrams per model are supported.
- **Trust boundaries that contain things**: drop an element inside a boundary to put it in that zone, and moving a
  boundary moves its contents. Flows that cross a boundary are highlighted in amber.
- **STRIDE per element**: selecting an element shows the STRIDE categories that apply to its type, with one-click
  suggestions from a built-in threat catalog. Suggestions depend on the element's properties, e.g. XSS and CSRF only
  for web applications and sniffing only for unencrypted flows.
- **Threat overview**: one table of all threats with search, STRIDE/severity/status filters, sorting, inline
  editing, and a jump to the element on the diagram.
- **Optional CVSS 3.1** scoring per threat. When a threat uses CVSS, its severity is derived from the score.
- **Analysis gaps**: lists elements without threats, uncovered STRIDE categories, boundary-crossing flows with no
  threats, and open threats without mitigation.
- **Reports**: an HTML report (print it to PDF from the browser) and a Markdown report whose diagrams are Mermaid,
  so they render in GitHub, GitLab and Azure DevOps.
- **Threat Dragon import**: open a Threat Dragon v2 `.json` file and it is converted, including nesting elements in
  boundary boxes. Anything that could not be converted exactly is listed in the import notes.
- **Local files**: models are plain JSON (`*.tm.json`) that you open and save on disk, so they can live in git
  next to the code. Chromium browsers save in place; other browsers download the file. Unsaved work is kept as a
  draft in the browser and offered for restore.

## Running it

Prerequisites: .NET 10 SDK and Node.js 20+.

**Development** uses two terminals:

```sh
# 1. API on http://localhost:5203
cd src/ThreatMonster.Api && dotnet run

# 2. UI with hot reload on http://localhost:5173 (proxies /api to the API)
cd web && npm install && npm run dev
```

**Single process**: build the UI into the API's `wwwroot`, then run only the API:

```sh
cd web && npm install && npm run build
cd ../src/ThreatMonster.Api && dotnet run   # open http://localhost:5203
```

**Tests**:

```sh
dotnet test          # core: CVSS, Threat Dragon import, analysis, reports, schema
cd web && npm test   # frontend: nesting, boundary crossing, suggestions
```

## Project layout

| Path | Contents |
|---|---|
| `src/ThreatMonster.Core` | Domain model and file format, STRIDE rules and threat catalog (`Stride/catalog.json`), CVSS 3.1 calculator, Threat Dragon importer, completeness analysis, HTML/Markdown/SVG/Mermaid report generators |
| `src/ThreatMonster.Api` | ASP.NET Core minimal API; also serves the built UI |
| `tests/ThreatMonster.Core.Tests` | xUnit tests; Threat Dragon demo models are used as import fixtures |
| `web` | React + TypeScript (Vite), React Flow canvas, Zustand store with undo history, Tailwind CSS |
| `docs/threatmonster.schema.json` | JSON Schema of the file format, generated from the C# model (a test keeps it in sync; regenerate with `UPDATE_SCHEMA=1 dotnet test`) |

## File format

```jsonc
{
  "format": "threatmonster",
  "version": 1,
  "summary": { "title": "…", "owner": "…", "reviewer": "…", "contributors": [] },
  "diagrams": [{
    "id": "…", "title": "Main diagram",
    "elements": [
      // kind: actor | process | store | boundary | annotation; x/y are absolute canvas coordinates
      { "id": "…", "kind": "process", "name": "API", "x": 100, "y": 80, "width": 120, "height": 120,
        "parentId": "<boundary id>", "outOfScope": false, "isWebApplication": true }
    ],
    "flows": [{ "id": "…", "sourceId": "…", "targetId": "…", "name": "HTTPS", "isEncrypted": true,
                "isPublicNetwork": false, "isBidirectional": false, "outOfScope": false }]
  }],
  // Threats sit at the top level and point to an element or flow, so they are easy to list and filter.
  "threats": [{ "id": "…", "number": 1, "title": "…", "category": "tampering", "diagramId": "…", "targetId": "…",
                "severity": "high", "status": "open", "mitigation": "…",
                "cvss": { "vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N", "baseScore": 6.1 } }]
}
```

The format does not depend on the diagram library: positions are absolute and nesting is an explicit `parentId`
derived from geometry.

## Extending the threat catalog

Add entries to `src/ThreatMonster.Core/Stride/catalog.json`. `appliesTo` lists the target kinds (`actor`, `process`,
`store`, `flow`). The optional `when` lists conditions that must all hold, and a `!` prefix negates one. The available
conditions are `isHuman`, `isAgent`, `providesAuthentication`, `isWebApplication`, `privileged`, `storesCredentials`,
`isLog`, `isEncrypted`, `isSigned`, `isPublicNetwork` and `crossesBoundary`. A test checks that every entry's category
is valid for its target kinds.
