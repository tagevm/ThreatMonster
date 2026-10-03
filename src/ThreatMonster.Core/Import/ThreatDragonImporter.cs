using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using ThreatMonster.Core.Cvss;
using ThreatMonster.Core.Model;

namespace ThreatMonster.Core.Import;

public sealed record ImportResult(ThreatModel Model, IReadOnlyList<string> Warnings);

/// <summary>
/// Converts OWASP Threat Dragon v2.x models (AntV X6 based) to ThreatMonster models.
/// </summary>
public static class ThreatDragonImporter
{
    /// <exception cref="InvalidDataException">The JSON is not a supported Threat Dragon model.</exception>
    public static ImportResult Import(string json)
    {
        JsonNode? root;
        try
        {
            root = JsonNode.Parse(json);
        }
        catch (JsonException e)
        {
            throw new InvalidDataException($"Not valid JSON: {e.Message}", e);
        }

        var detail = root?["detail"] as JsonObject
            ?? throw new InvalidDataException("Not a Threat Dragon model (missing \"detail\").");
        if (detail["diagrams"] is not JsonArray diagrams)
            throw new InvalidDataException("Not a Threat Dragon model (missing \"detail.diagrams\").");
        if (diagrams.OfType<JsonObject>().Any(d => d["diagramJson"] is not null))
            throw new InvalidDataException("Threat Dragon v1 models are not supported. Open and save the model in Threat Dragon 2.x first.");

        var warnings = new List<string>();
        var summary = root!["summary"];
        var model = new ThreatModel
        {
            Summary = new ModelSummary
            {
                Title = Str(summary?["title"]) ?? "Imported threat model",
                Owner = Str(summary?["owner"]),
                Description = Str(summary?["description"]),
                Reviewer = Str(detail["reviewer"]),
                Contributors = (detail["contributors"] as JsonArray ?? [])
                    .Select(c => Str(c?["name"]))
                    .OfType<string>()
                    .ToList(),
                CreatedAt = DateTimeOffset.UtcNow,
            },
        };

        var pendingThreats = new List<(Threat Threat, int? Number)>();
        foreach (var diagramNode in diagrams.OfType<JsonObject>())
            model.Diagrams.Add(ImportDiagram(diagramNode, pendingThreats, warnings));

        AssignNumbers(pendingThreats);
        model.Threats.AddRange(pendingThreats.Select(p => p.Threat));
        return new ImportResult(model, warnings);
    }

    static Diagram ImportDiagram(JsonObject node, List<(Threat, int?)> threats, List<string> warnings)
    {
        var diagram = new Diagram
        {
            Title = Str(node["title"]) ?? "Diagram",
            Description = Str(node["description"]),
        };
        var diagramType = Str(node["diagramType"]);
        if (diagramType is not null && diagramType != "STRIDE")
            warnings.Add($"Diagram '{diagram.Title}' is a {diagramType} diagram; its threats were mapped to STRIDE categories.");

        var cells = (node["cells"] as JsonArray ?? []).OfType<JsonObject>().ToList();
        var nodeIds = new HashSet<string>();

        foreach (var cell in cells)
        {
            var data = cell["data"] as JsonObject;
            var type = Str(data?["type"]);
            var kind = type switch
            {
                "tm.Actor" => ElementKind.Actor,
                "tm.Process" => ElementKind.Process,
                "tm.Store" => ElementKind.Store,
                "tm.BoundaryBox" => ElementKind.Boundary,
                "tm.Text" => ElementKind.Annotation,
                _ => (ElementKind?)null,
            };

            if (kind is { } k)
            {
                var element = ImportElement(cell, data!, k);
                diagram.Elements.Add(element);
                nodeIds.Add(element.Id);
                CollectThreats(data!, diagram.Id, element.Id, element.Name, threats, warnings);
            }
            else if (type == "tm.Boundary")
            {
                diagram.Elements.Add(ImportBoundaryCurve(cell, data!));
            }
            else if (type != "tm.Flow")
            {
                warnings.Add($"Skipped unsupported cell type '{type ?? Str(cell["shape"]) ?? "unknown"}' in '{diagram.Title}'.");
            }
        }

        foreach (var cell in cells.Where(c => Str(c["data"]?["type"]) == "tm.Flow"))
        {
            var data = (JsonObject)cell["data"]!;
            var flow = new Flow
            {
                Id = Str(cell["id"]) ?? Guid.NewGuid().ToString(),
                SourceId = Str(cell["source"]?["cell"]) ?? "",
                TargetId = Str(cell["target"]?["cell"]) ?? "",
                Name = CleanName(Str(data["name"]) ?? FlowLabel(cell) ?? ""),
                Description = Str(data["description"]),
                Protocol = Str(data["protocol"]),
                IsEncrypted = Bool(data["isEncrypted"]) ?? false,
                IsPublicNetwork = Bool(data["isPublicNetwork"]) ?? false,
                IsBidirectional = Bool(data["isBidirectional"]) ?? false,
                OutOfScope = Bool(data["outOfScope"]) ?? false,
                OutOfScopeReason = Str(data["reasonOutOfScope"]),
            };

            if (!nodeIds.Contains(flow.SourceId) || !nodeIds.Contains(flow.TargetId))
            {
                // Threat Dragon allows flows from or to a bare point; we need both ends.
                var anchor = new[] { flow.SourceId, flow.TargetId }.FirstOrDefault(nodeIds.Contains);
                var threatCount = CountThreats(data);
                if (anchor is not null && threatCount > 0)
                {
                    var anchorName = diagram.Elements.First(e => e.Id == anchor).Name;
                    CollectThreats(data, diagram.Id, anchor, anchorName, threats, warnings,
                        note: $"Originally on flow '{flow.Name}', which was not connected at both ends.");
                    warnings.Add($"Flow '{flow.Name}' in '{diagram.Title}' is not connected at both ends and was skipped; its {threatCount} threat(s) were moved to '{anchorName}'.");
                }
                else
                {
                    warnings.Add($"Skipped flow '{flow.Name}' in '{diagram.Title}' because it is not connected at both ends"
                        + (threatCount > 0 ? $" (and its {threatCount} threat(s))." : "."));
                }
                continue;
            }
            diagram.Flows.Add(flow);
            CollectThreats(data, diagram.Id, flow.Id, flow.Name, threats, warnings);
        }

        AssignParents(diagram);
        return diagram;
    }

    static Element ImportElement(JsonObject cell, JsonObject data, ElementKind kind)
    {
        var name = Str(data["name"]) ?? Str(cell["attrs"]?["text"]?["text"]) ?? "";
        var element = new Element
        {
            Id = Str(cell["id"]) ?? Guid.NewGuid().ToString(),
            Kind = kind,
            // Text blocks keep their line breaks; for shapes they were only a manual wrapping aid.
            Name = kind == ElementKind.Annotation ? name.Trim() : CleanName(name),
            Description = Str(data["description"]),
            X = Num(cell["position"]?["x"]) ?? 0,
            Y = Num(cell["position"]?["y"]) ?? 0,
            Width = Num(cell["size"]?["width"]) ?? 120,
            Height = Num(cell["size"]?["height"]) ?? 60,
            OutOfScope = Bool(data["outOfScope"]) ?? false,
            OutOfScopeReason = Str(data["reasonOutOfScope"]),
        };

        switch (kind)
        {
            case ElementKind.Actor:
                element.ProvidesAuthentication = TrueOrNull(data["providesAuthentication"]);
                break;
            case ElementKind.Process:
                element.IsWebApplication = TrueOrNull(data["isWebApplication"]);
                element.Privileged = Str(data["privilegeLevel"]) is { } level
                    && (level.Contains("admin", StringComparison.OrdinalIgnoreCase)
                        || level.Contains("root", StringComparison.OrdinalIgnoreCase)
                        || level.Contains("system", StringComparison.OrdinalIgnoreCase))
                    ? true
                    : null;
                break;
            case ElementKind.Store:
                element.IsLog = TrueOrNull(data["isALog"]);
                element.StoresCredentials = TrueOrNull(data["storesCredentials"]);
                element.IsEncrypted = TrueOrNull(data["isEncrypted"]);
                element.IsSigned = TrueOrNull(data["isSigned"]);
                break;
        }
        return element;
    }

    /// <summary>Threat Dragon's free-hand boundary lines become dashed line annotations.</summary>
    static Element ImportBoundaryCurve(JsonObject cell, JsonObject data)
    {
        var points = new List<Point>();
        void Add(JsonNode? p)
        {
            if (Num(p?["x"]) is { } x && Num(p?["y"]) is { } y)
                points.Add(new Point(x, y));
        }
        Add(cell["source"]);
        foreach (var v in cell["vertices"] as JsonArray ?? [])
            Add(v);
        Add(cell["target"]);

        double minX = points.Count > 0 ? points.Min(p => p.X) : 0, minY = points.Count > 0 ? points.Min(p => p.Y) : 0;
        double maxX = points.Count > 0 ? points.Max(p => p.X) : 0, maxY = points.Count > 0 ? points.Max(p => p.Y) : 0;
        return new Element
        {
            Id = Str(cell["id"]) ?? Guid.NewGuid().ToString(),
            Kind = ElementKind.Annotation,
            Name = CleanName(Str(data["name"]) ?? ""),
            Description = Str(data["description"]),
            X = minX,
            Y = minY,
            Width = maxX - minX,
            Height = maxY - minY,
            Points = points,
        };
    }

    /// <summary>
    /// Threat Dragon has no containment, so derive it from geometry with the same rule as the editor:
    /// an element belongs to the smallest boundary containing its centre, a boundary to the smallest
    /// larger boundary fully containing it.
    /// </summary>
    static void AssignParents(Diagram diagram)
    {
        var boxes = diagram.Elements.Where(e => e.Kind == ElementKind.Boundary).ToList();
        foreach (var element in diagram.Elements.Where(e => e.Points is null))
        {
            element.ParentId = boxes
                .Where(b => b != element && (element.Kind == ElementKind.Boundary ? ContainsRect(b, element) : ContainsCentre(b, element)))
                .OrderBy(b => b.Width * b.Height)
                .FirstOrDefault()?.Id;
        }
    }

    static bool ContainsRect(Element outer, Element inner) =>
        inner.X >= outer.X && inner.Y >= outer.Y
        && inner.X + inner.Width <= outer.X + outer.Width
        && inner.Y + inner.Height <= outer.Y + outer.Height
        && outer.Width * outer.Height > inner.Width * inner.Height;

    static bool ContainsCentre(Element outer, Element inner)
    {
        double cx = inner.X + inner.Width / 2, cy = inner.Y + inner.Height / 2;
        return cx >= outer.X && cy >= outer.Y && cx <= outer.X + outer.Width && cy <= outer.Y + outer.Height;
    }

    static void CollectThreats(JsonObject data, string diagramId, string targetId, string targetName,
        List<(Threat, int?)> threats, List<string> warnings, string? note = null)
    {
        foreach (var t in (data["threats"] as JsonArray ?? []).OfType<JsonObject>())
        {
            var title = Str(t["title"]) ?? "Untitled threat";
            var type = Str(t["type"]);
            var description = note is null ? Str(t["description"]) : Append(Str(t["description"]), note);

            var category = MapCategory(type);
            if (category is null)
            {
                category = StrideCategory.InformationDisclosure;
                description = Append(description, $"Imported from Threat Dragon as '{type ?? "untyped"}'.");
                warnings.Add($"Threat '{title}' on '{targetName}' has non-STRIDE type '{type ?? "none"}'; filed under Information disclosure.");
            }

            var threat = new Threat
            {
                Id = Str(t["id"]) ?? Guid.NewGuid().ToString(),
                Title = title,
                Category = category.Value,
                DiagramId = diagramId,
                TargetId = targetId,
                Description = description,
                Mitigation = Str(t["mitigation"]),
                Severity = MapSeverity(Str(t["severity"])),
                Status = MapStatus(Str(t["status"])),
            };

            var score = Str(t["score"]);
            if (score is not null && score != "None")
            {
                if (score.StartsWith("CVSS:3", StringComparison.Ordinal) && Cvss31.TryCalculate(score, out var cvss, out _))
                {
                    threat.Cvss = new CvssScore { Vector = cvss!.Vector, BaseScore = cvss.BaseScore };
                    threat.Severity = cvss.Severity ?? threat.Severity;
                }
                else
                {
                    threat.Description = Append(threat.Description, $"Threat Dragon score: {score}");
                }
            }

            int? number = t["number"] is JsonValue v && v.TryGetValue<int>(out var n) && n > 0 ? n : null;
            threats.Add((threat, number));
        }
    }

    static int CountThreats(JsonObject data) => (data["threats"] as JsonArray)?.Count ?? 0;

    /// <summary>Keep Threat Dragon's numbers where they are unique, number the rest after them.</summary>
    static void AssignNumbers(List<(Threat Threat, int? Number)> threats)
    {
        var used = new HashSet<int>();
        foreach (var (threat, number) in threats)
        {
            if (number is { } n && used.Add(n))
                threat.Number = n;
        }
        var next = used.Count > 0 ? used.Max() + 1 : 1;
        foreach (var (threat, _) in threats.Where(t => t.Threat.Number == 0))
            threat.Number = next++;
    }

    static StrideCategory? MapCategory(string? type) =>
        type?.Replace(" ", "").ToLowerInvariant() switch
        {
            "spoofing" => StrideCategory.Spoofing,
            "tampering" or "integrity" => StrideCategory.Tampering,
            "repudiation" => StrideCategory.Repudiation,
            "informationdisclosure" or "confidentiality" or "disclosureofinformation" => StrideCategory.InformationDisclosure,
            "denialofservice" or "availability" => StrideCategory.DenialOfService,
            "elevationofprivilege" => StrideCategory.ElevationOfPrivilege,
            _ => null,
        };

    static Severity? MapSeverity(string? severity) => severity?.ToLowerInvariant() switch
    {
        "low" => Severity.Low,
        "medium" => Severity.Medium,
        "high" => Severity.High,
        "critical" => Severity.Critical,
        _ => null,
    };

    static ThreatStatus MapStatus(string? status) => status?.Replace(" ", "").ToLowerInvariant() switch
    {
        "mitigated" => ThreatStatus.Mitigated,
        "notapplicable" or "n/a" => ThreatStatus.NotApplicable,
        _ => ThreatStatus.Open,
    };

    static string? FlowLabel(JsonObject cell) =>
        (cell["labels"] as JsonArray)?.OfType<JsonObject>()
            .Select(l => Str(l["attrs"]?["labelText"]?["text"]))
            .FirstOrDefault(s => s is not null);

    static string CleanName(string name) => string.Join(' ', name.Split((char[])['\n', '\r'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));

    static string Append(string? text, string note) => string.IsNullOrWhiteSpace(text) ? note : $"{text}\n\n{note}";

    static string? Str(JsonNode? node) =>
        node is JsonValue v && v.TryGetValue<string>(out var s) && !string.IsNullOrWhiteSpace(s) ? s
        : node is JsonValue n && n.GetValueKind() == JsonValueKind.Number ? n.ToJsonString()
        : null;

    static double? Num(JsonNode? node) =>
        node is JsonValue v && v.GetValueKind() == JsonValueKind.Number ? v.GetValue<double>()
        : double.TryParse(Str(node), NumberStyles.Float, CultureInfo.InvariantCulture, out var d) ? d
        : null;

    static bool? Bool(JsonNode? node) => node is JsonValue v && v.TryGetValue<bool>(out var b) ? b : null;

    static bool? TrueOrNull(JsonNode? node) => Bool(node) == true ? true : null;
}
