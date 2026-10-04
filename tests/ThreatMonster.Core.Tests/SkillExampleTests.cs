using System.Text.RegularExpressions;
using ThreatMonster.Core.Analysis;
using ThreatMonster.Core.Cvss;
using ThreatMonster.Core.Model;
using ThreatMonster.Core.Stride;

namespace ThreatMonster.Core.Tests;

/// <summary>
/// The AI skill (skills/threatmonster/SKILL.md) contains a complete example file. These tests apply the skill's own
/// self-check list to it, so the skill keeps describing the format the app actually loads.
/// </summary>
public class SkillExampleTests
{
    static readonly string SkillPath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../skills/threatmonster/SKILL.md"));

    static ThreatModel LoadExample()
    {
        var markdown = File.ReadAllText(SkillPath);
        var section = markdown[markdown.IndexOf("## Complete example", StringComparison.Ordinal)..];
        var json = Regex.Match(section, "```json\\n(.*?)\\n```", RegexOptions.Singleline).Groups[1].Value;
        return ThreatModelJson.Deserialize(json);
    }

    [Fact]
    public void Example_loads_and_passes_the_self_check()
    {
        var model = LoadExample();
        Assert.NotEmpty(model.Diagrams);
        Assert.NotEmpty(model.Threats);

        var ids = model.Diagrams.Select(d => d.Id)
            .Concat(model.Diagrams.SelectMany(d => d.Elements.Select(e => e.Id).Concat(d.Flows.Select(f => f.Id))))
            .Concat(model.Threats.Select(t => t.Id))
            .ToList();
        Assert.Equal(ids.Count, ids.Distinct().Count());

        Assert.Equal(Enumerable.Range(1, model.Threats.Count), model.Threats.Select(t => t.Number).Order());

        foreach (var diagram in model.Diagrams)
        {
            var targets = diagram.Elements
                .Where(e => e.Kind is ElementKind.Actor or ElementKind.Process or ElementKind.Store)
                .ToDictionary(e => e.Id);

            foreach (var f in diagram.Flows)
            {
                Assert.True(targets.ContainsKey(f.SourceId), $"Flow {f.Id} source");
                Assert.True(targets.ContainsKey(f.TargetId), $"Flow {f.Id} target");
                Assert.NotEqual(f.SourceId, f.TargetId);
            }

            foreach (var e in diagram.Elements)
            {
                Assert.True(e.Width > 0 && e.Height > 0, $"{e.Id} has no size");
                Assert.Equal(ExpectedParent(diagram, e), e.ParentId);
            }

            var boxes = targets.Values.ToList();
            for (var i = 0; i < boxes.Count; i++)
                for (var j = i + 1; j < boxes.Count; j++)
                    Assert.False(Overlap(boxes[i], boxes[j]), $"{boxes[i].Id} overlaps {boxes[j].Id}");

            foreach (var f in diagram.Flows.Where(f => ModelAnalysis.CrossesBoundary(diagram, f)))
                Assert.Contains(model.Threats, t => t.TargetId == f.Id);
        }

        foreach (var t in model.Threats)
        {
            var diagram = Assert.Single(model.Diagrams, d => d.Id == t.DiagramId);
            var applicable = diagram.Flows.Any(f => f.Id == t.TargetId)
                ? StrideRules.ApplicableToFlow
                : StrideRules.ApplicableTo(Assert.Single(diagram.Elements, e => e.Id == t.TargetId).Kind);
            Assert.Contains(t.Category, applicable);

            if (t.Cvss is not null)
            {
                Assert.True(Cvss31.TryCalculate(t.Cvss.Vector, out var cvss, out var error), error);
                Assert.Equal(cvss!.BaseScore, t.Cvss.BaseScore);
                Assert.Equal(cvss.Severity, t.Severity);
            }
        }

        Assert.DoesNotContain(ModelAnalysis.Completeness(model), f => f.Message.Contains("crosses a trust boundary"));
    }

    /// <summary>The geometry rule from the skill (and the editor): smallest boundary containing the centre, or fully containing a boundary.</summary>
    static string? ExpectedParent(Diagram diagram, Element e)
    {
        double cx = e.X + e.Width / 2, cy = e.Y + e.Height / 2;
        return diagram.Elements
            .Where(b => b.Kind == ElementKind.Boundary && b != e)
            .Where(b => e.Kind == ElementKind.Boundary
                ? e.X >= b.X && e.Y >= b.Y && e.X + e.Width <= b.X + b.Width && e.Y + e.Height <= b.Y + b.Height && b.Width * b.Height > e.Width * e.Height
                : cx >= b.X && cy >= b.Y && cx <= b.X + b.Width && cy <= b.Y + b.Height)
            .OrderBy(b => b.Width * b.Height)
            .FirstOrDefault()?.Id;
    }

    static bool Overlap(Element a, Element b) =>
        a.X < b.X + b.Width && b.X < a.X + a.Width && a.Y < b.Y + b.Height && b.Y < a.Y + a.Height;
}
