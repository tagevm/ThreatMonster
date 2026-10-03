using ThreatMonster.Core.Analysis;
using ThreatMonster.Core.Model;
using ThreatMonster.Core.Reports;
using ThreatMonster.Core.Stride;

namespace ThreatMonster.Core.Tests;

public class AnalysisAndReportTests
{
    /// <summary>User (outside) → Web app (in DMZ) → Database (in internal zone, nested in DMZ).</summary>
    static ThreatModel SampleModel()
    {
        var diagram = new Diagram { Id = "d1", Title = "Web shop" };
        diagram.Elements.AddRange(
        [
            new Element { Id = "user", Kind = ElementKind.Actor, Name = "Customer \"Bob\"" },
            new Element { Id = "dmz", Kind = ElementKind.Boundary, Name = "DMZ" },
            new Element { Id = "internal", Kind = ElementKind.Boundary, Name = "Internal", ParentId = "dmz" },
            new Element { Id = "web", Kind = ElementKind.Process, Name = "Web app", ParentId = "dmz" },
            new Element { Id = "api", Kind = ElementKind.Process, Name = "API", ParentId = "dmz" },
            new Element { Id = "db", Kind = ElementKind.Store, Name = "Orders DB", ParentId = "internal" },
        ]);
        diagram.Flows.AddRange(
        [
            new Flow { Id = "f1", SourceId = "user", TargetId = "web", Name = "HTTPS | orders", IsEncrypted = true },
            new Flow { Id = "f2", SourceId = "web", TargetId = "api", Name = "REST" },
            new Flow { Id = "f3", SourceId = "web", TargetId = "db", Name = "SQL" },
        ]);
        return new ThreatModel
        {
            Summary = new ModelSummary { Title = "Shop <model>", Owner = "Team A" },
            Diagrams = [diagram],
            Threats =
            [
                new Threat
                {
                    Number = 1, Title = "SQL injection", Category = StrideCategory.Tampering, DiagramId = "d1", TargetId = "web",
                    Severity = Severity.High, Mitigation = "Parameterised queries",
                    Cvss = new CvssScore { Vector = "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N", BaseScore = 9.1 },
                },
                new Threat { Number = 2, Title = "<script>alert(1)</script>", Category = StrideCategory.Spoofing, DiagramId = "d1", TargetId = "user" },
            ],
        };
    }

    [Fact]
    public void Detects_boundary_crossings_including_nested_boundaries()
    {
        var diagram = SampleModel().Diagrams[0];
        Assert.Equal(["internal", "dmz"], ModelAnalysis.BoundaryChain(diagram, "db"));
        Assert.True(ModelAnalysis.CrossesBoundary(diagram, diagram.Flows[0]));  // outside → DMZ
        Assert.False(ModelAnalysis.CrossesBoundary(diagram, diagram.Flows[1])); // DMZ → DMZ
        Assert.True(ModelAnalysis.CrossesBoundary(diagram, diagram.Flows[2]));  // DMZ → internal
    }

    [Fact]
    public void Reports_completeness_gaps()
    {
        var findings = ModelAnalysis.Completeness(SampleModel());

        Assert.Contains(findings, f => f.TargetId == "api" && f.Message.Contains("has no threats") && f.Level == FindingLevel.Warning);
        Assert.Contains(findings, f => f.TargetId == "f1" && f.Message.Contains("crosses a trust boundary"));
        Assert.Contains(findings, f => f.TargetId == "f3" && f.Message.Contains("crosses a trust boundary"));
        Assert.DoesNotContain(findings, f => f.TargetId == "f2");
        Assert.Contains(findings, f => f.TargetId == "user" && f.Message.Contains("Repudiation"));
        Assert.Contains(findings, f => f.Message.Contains("Threat #2 is open with no mitigation"));
    }

    [Fact]
    public void Stride_per_element_table()
    {
        Assert.Equal([StrideCategory.Spoofing, StrideCategory.Repudiation], StrideRules.ApplicableTo(ElementKind.Actor));
        Assert.Equal(6, StrideRules.ApplicableTo(ElementKind.Process).Count);
        Assert.DoesNotContain(StrideCategory.Spoofing, StrideRules.ApplicableTo(ElementKind.Store));
        Assert.Empty(StrideRules.ApplicableTo(ElementKind.Boundary));
    }

    [Fact]
    public void Catalog_loads_and_only_suggests_applicable_categories()
    {
        Assert.NotEmpty(ThreatCatalog.Entries);
        Assert.Equal(ThreatCatalog.Entries.Count, ThreatCatalog.Entries.Select(e => e.Id).Distinct().Count());
        foreach (var entry in ThreatCatalog.Entries)
        {
            foreach (var kind in entry.AppliesTo)
            {
                var applicable = kind == "flow"
                    ? StrideRules.ApplicableToFlow
                    : StrideRules.ApplicableTo(Enum.Parse<ElementKind>(kind, ignoreCase: true));
                Assert.Contains(entry.Category, applicable);
            }
        }
    }

    [Fact]
    public void Mermaid_nests_boundaries_and_escapes_labels()
    {
        var mermaid = MermaidDiagram.Render(SampleModel().Diagrams[0]);

        Assert.StartsWith("flowchart LR", mermaid);
        Assert.Contains("[\"Customer #quot;Bob#quot;\"]", mermaid);
        Assert.Contains("subgraph", mermaid);
        Assert.Contains("[(\"Orders DB\")]", mermaid);
        Assert.Contains("((\"Web app\"))", mermaid);
        // The internal zone is nested inside the DMZ: two "end" lines, the inner one indented deeper.
        Assert.Contains("        end", mermaid);
    }

    [Fact]
    public void Markdown_report_contains_summary_diagram_and_threats()
    {
        var md = MarkdownReport.Generate(SampleModel());

        Assert.StartsWith("# Shop <model>", md);
        Assert.Contains("```mermaid", md);
        Assert.Contains("| 1 | SQL injection | Web app | Tampering | High (9.1) | Open |", md);
        Assert.Contains("**Mitigation:** Parameterised queries", md);
        Assert.Contains("## Open analysis points", md);
    }

    [Fact]
    public void Html_report_encodes_user_content_and_embeds_diagrams()
    {
        var html = HtmlReport.Generate(SampleModel());

        Assert.Contains("Shop &lt;model&gt;", html);
        Assert.Contains("&lt;script&gt;alert(1)&lt;/script&gt;", html);
        Assert.DoesNotContain("<script>alert(1)", html);
        Assert.Contains("<figure><svg", html);
    }

    [Fact]
    public void Svg_diagram_draws_every_element_and_highlights_crossing_flows()
    {
        var model = SampleModel();
        var svg = SvgDiagram.Render(model.Diagrams[0], model.Threats);

        Assert.StartsWith("<svg", svg);
        Assert.EndsWith("</svg>", svg);
        Assert.Contains("&quot;Bob&quot;", svg);                       // encoded
        Assert.Equal(2, CountOf(svg, "<ellipse"));                    // two processes
        Assert.Equal(2, CountOf(svg, "stroke-dasharray=\"8 5\""));    // two boundaries
        Assert.Equal(2, CountOf(svg, "marker-end=\"url(#arrow-x)\"")); // f1 and f3 cross a boundary
        Assert.Equal(1, CountOf(svg, "marker-end=\"url(#arrow)\""));   // f2 stays in the DMZ
        Assert.Contains("HTTPS | orders", svg);
    }

    [Fact]
    public void Svg_diagram_renders_every_threat_dragon_demo()
    {
        foreach (var file in Directory.GetFiles(Path.Combine(AppContext.BaseDirectory, "Fixtures", "ThreatDragon"), "*.json"))
        {
            var model = Import.ThreatDragonImporter.Import(File.ReadAllText(file)).Model;
            foreach (var d in model.Diagrams)
                Assert.NotNull(System.Xml.Linq.XDocument.Parse(SvgDiagram.Render(d, model.Threats).Replace("&nbsp;", " ")));
        }
    }

    static int CountOf(string text, string needle) => (text.Length - text.Replace(needle, "").Length) / needle.Length;
}
