using System.Globalization;
using ThreatMonster.Core.Analysis;
using ThreatMonster.Core.Model;
using ThreatMonster.Core.Stride;

namespace ThreatMonster.Core.Reports;

/// <summary>Precomputed lookups shared by the report generators.</summary>
internal sealed class ReportContext
{
    public ThreatModel Model { get; }
    public IReadOnlyList<Finding> Findings { get; }
    readonly Dictionary<string, string> targetNames = [];

    public ReportContext(ThreatModel model)
    {
        Model = model;
        Findings = ModelAnalysis.Completeness(model);
        foreach (var diagram in model.Diagrams)
        {
            foreach (var e in diagram.Elements)
                targetNames[e.Id] = Name(e.Name, KindLabel(e.Kind));
            var elementNames = diagram.Elements.ToDictionary(e => e.Id, e => Name(e.Name, KindLabel(e.Kind)));
            foreach (var f in diagram.Flows)
                targetNames[f.Id] = !string.IsNullOrWhiteSpace(f.Name)
                    ? f.Name
                    : $"{elementNames.GetValueOrDefault(f.SourceId, "?")} → {elementNames.GetValueOrDefault(f.TargetId, "?")}";
        }
    }

    public string TargetName(string targetId) => targetNames.GetValueOrDefault(targetId, "(deleted element)");

    public IEnumerable<Threat> ThreatsFor(string targetId) =>
        Model.Threats.Where(t => t.TargetId == targetId).OrderBy(t => t.Number);

    /// <summary>Elements that can carry threats, in diagram order, followed by flows.</summary>
    public IEnumerable<(string Id, string Kind, string Name, bool OutOfScope, string? OutOfScopeReason)> Targets(Diagram diagram) =>
        diagram.Elements
            .Where(e => e.Kind is ElementKind.Actor or ElementKind.Process or ElementKind.Store)
            .Select(e => (e.Id, KindLabel(e.Kind), TargetName(e.Id), e.OutOfScope, e.OutOfScopeReason))
            .Concat(diagram.Flows.Select(f => (f.Id, "Data flow", TargetName(f.Id), f.OutOfScope, f.OutOfScopeReason)));

    public static string KindLabel(ElementKind kind) => kind switch
    {
        ElementKind.Actor => "Actor",
        ElementKind.Process => "Process",
        ElementKind.Store => "Data store",
        ElementKind.Boundary => "Trust boundary",
        _ => "Annotation",
    };

    public static string SeverityLabel(Threat t) => t.Severity switch
    {
        null => "Not rated",
        { } s => s.ToString(),
    };

    public static string StatusLabel(ThreatStatus s) => s switch
    {
        ThreatStatus.NotApplicable => "Not applicable",
        _ => s.ToString(),
    };

    public static string CategoryLabel(StrideCategory c) => StrideRules.Label(c);

    public static string CvssLabel(Threat t) =>
        t.Cvss?.BaseScore is { } score ? score.ToString("0.0", CultureInfo.InvariantCulture) : "";

    static string Name(string name, string fallback) => string.IsNullOrWhiteSpace(name) ? $"Unnamed {fallback.ToLowerInvariant()}" : name;
}
