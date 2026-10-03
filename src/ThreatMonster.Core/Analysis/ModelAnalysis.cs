using System.Text.Json.Serialization;
using ThreatMonster.Core.Model;
using ThreatMonster.Core.Stride;

namespace ThreatMonster.Core.Analysis;

[JsonConverter(typeof(JsonStringEnumConverter<FindingLevel>))]
public enum FindingLevel { Info, Warning }

/// <summary>A completeness gap, e.g. an element without any threats.</summary>
public sealed record Finding(FindingLevel Level, string DiagramId, string? TargetId, string Message);

public static class ModelAnalysis
{
    /// <summary>Ids of the boundaries enclosing an element, innermost first.</summary>
    public static IReadOnlyList<string> BoundaryChain(Diagram diagram, string elementId)
    {
        var byId = diagram.Elements.ToDictionary(e => e.Id);
        var chain = new List<string>();
        var current = byId.GetValueOrDefault(elementId)?.ParentId;
        while (current is not null && byId.TryGetValue(current, out var parent) && !chain.Contains(current))
        {
            chain.Add(current);
            current = parent.ParentId;
        }
        return chain;
    }

    /// <summary>A flow crosses a trust boundary when its ends sit in different sets of boundaries.</summary>
    public static bool CrossesBoundary(Diagram diagram, Flow flow) =>
        !BoundaryChain(diagram, flow.SourceId).ToHashSet().SetEquals(BoundaryChain(diagram, flow.TargetId));

    public static IReadOnlyList<Finding> Completeness(ThreatModel model)
    {
        var findings = new List<Finding>();
        var threatsByTarget = model.Threats.ToLookup(t => t.TargetId);

        foreach (var diagram in model.Diagrams)
        {
            var connected = diagram.Flows.SelectMany(f => new[] { f.SourceId, f.TargetId }).ToHashSet();

            foreach (var element in diagram.Elements.Where(e => e.Kind is ElementKind.Actor or ElementKind.Process or ElementKind.Store))
            {
                var label = DisplayName(element.Name, element.Kind.ToString().ToLowerInvariant());
                if (!connected.Contains(element.Id))
                    findings.Add(new(FindingLevel.Info, diagram.Id, element.Id, $"{label} has no data flows."));
                if (element.OutOfScope)
                {
                    if (string.IsNullOrWhiteSpace(element.OutOfScopeReason))
                        findings.Add(new(FindingLevel.Info, diagram.Id, element.Id, $"{label} is out of scope without a reason."));
                    continue;
                }

                var covered = threatsByTarget[element.Id].Select(t => t.Category).ToHashSet();
                if (covered.Count == 0)
                    findings.Add(new(FindingLevel.Warning, diagram.Id, element.Id, $"{label} has no threats."));
                else
                {
                    var missing = StrideRules.ApplicableTo(element.Kind).Where(c => !covered.Contains(c)).ToList();
                    if (missing.Count > 0)
                        findings.Add(new(FindingLevel.Info, diagram.Id, element.Id,
                            $"{label} has no {string.Join(", ", missing.Select(StrideRules.Label))} threats."));
                }
            }

            foreach (var flow in diagram.Flows.Where(f => !f.OutOfScope))
            {
                if (CrossesBoundary(diagram, flow) && !threatsByTarget[flow.Id].Any())
                    findings.Add(new(FindingLevel.Warning, diagram.Id, flow.Id,
                        $"{DisplayName(flow.Name, "flow")} crosses a trust boundary but has no threats."));
            }
        }

        foreach (var threat in model.Threats)
        {
            if (threat.Status == ThreatStatus.Open && string.IsNullOrWhiteSpace(threat.Mitigation))
                findings.Add(new(FindingLevel.Info, threat.DiagramId, threat.TargetId, $"Threat #{threat.Number} is open with no mitigation."));
        }

        return findings;
    }

    static string DisplayName(string name, string fallback) =>
        string.IsNullOrWhiteSpace(name) ? $"Unnamed {fallback}" : $"'{name}'";
}
