using System.Text;
using ThreatMonster.Core.Analysis;
using ThreatMonster.Core.Model;
using static ThreatMonster.Core.Reports.ReportContext;

namespace ThreatMonster.Core.Reports;

public static class MarkdownReport
{
    public static string Generate(ThreatModel model)
    {
        var ctx = new ReportContext(model);
        var s = model.Summary;
        var sb = new StringBuilder();

        sb.Append("# ").AppendLine(Inline(s.Title)).AppendLine();
        var meta = new List<string>();
        if (!string.IsNullOrWhiteSpace(s.Owner)) meta.Add($"**Owner:** {Inline(s.Owner)}");
        if (!string.IsNullOrWhiteSpace(s.Reviewer)) meta.Add($"**Reviewer:** {Inline(s.Reviewer)}");
        if (s.Contributors.Count > 0) meta.Add($"**Contributors:** {Inline(string.Join(", ", s.Contributors))}");
        if (s.ModifiedAt is { } modified) meta.Add($"**Last modified:** {modified:yyyy-MM-dd}");
        if (meta.Count > 0) sb.AppendLine(string.Join("  \n", meta)).AppendLine();
        if (!string.IsNullOrWhiteSpace(s.Description)) sb.AppendLine(s.Description.Trim()).AppendLine();

        AppendOverview(sb, ctx);

        foreach (var diagram in model.Diagrams)
        {
            sb.Append("## ").AppendLine(Inline(diagram.Title)).AppendLine();
            if (!string.IsNullOrWhiteSpace(diagram.Description)) sb.AppendLine(diagram.Description.Trim()).AppendLine();
            sb.AppendLine("```mermaid").Append(MermaidDiagram.Render(diagram)).AppendLine("```").AppendLine();

            foreach (var target in ctx.Targets(diagram))
            {
                var threats = ctx.ThreatsFor(target.Id).ToList();
                if (threats.Count == 0 && !target.OutOfScope)
                    continue;
                sb.Append("### ").Append(Inline(target.Name)).Append(" (").Append(target.Kind).AppendLine(")").AppendLine();
                if (target.OutOfScope)
                {
                    sb.Append("_Out of scope").Append(string.IsNullOrWhiteSpace(target.OutOfScopeReason) ? "" : $": {Inline(target.OutOfScopeReason)}").AppendLine("_").AppendLine();
                }
                foreach (var t in threats)
                {
                    sb.Append("#### #").Append(t.Number).Append(' ').AppendLine(Inline(t.Title)).AppendLine();
                    sb.Append("| Category | Severity | Status").Append(t.Cvss is null ? "" : " | CVSS").AppendLine(" |");
                    sb.Append("|---|---|---").Append(t.Cvss is null ? "" : "|---").AppendLine("|");
                    sb.Append("| ").Append(CategoryLabel(t.Category)).Append(" | ").Append(SeverityLabel(t)).Append(" | ").Append(StatusLabel(t.Status));
                    if (t.Cvss is not null) sb.Append(" | ").Append(CvssLabel(t)).Append(" `").Append(t.Cvss.Vector).Append('`');
                    sb.AppendLine(" |").AppendLine();
                    if (!string.IsNullOrWhiteSpace(t.Description)) sb.AppendLine(t.Description.Trim()).AppendLine();
                    if (!string.IsNullOrWhiteSpace(t.Mitigation)) sb.Append("**Mitigation:** ").AppendLine(t.Mitigation.Trim()).AppendLine();
                }
            }
        }

        if (ctx.Findings.Count > 0)
        {
            sb.AppendLine("## Open analysis points").AppendLine();
            foreach (var f in ctx.Findings)
                sb.Append("- ").Append(f.Level == FindingLevel.Warning ? "⚠️ " : "").AppendLine(Inline(f.Message));
            sb.AppendLine();
        }

        return sb.ToString();
    }

    static void AppendOverview(StringBuilder sb, ReportContext ctx)
    {
        var model = ctx.Model;
        sb.AppendLine("## Threat summary").AppendLine();
        if (model.Threats.Count == 0)
        {
            sb.AppendLine("No threats have been recorded yet.").AppendLine();
            return;
        }

        sb.AppendLine("| # | Threat | Target | Category | Severity | Status |");
        sb.AppendLine("|---|---|---|---|---|---|");
        foreach (var t in model.Threats.OrderByDescending(t => t.Severity ?? (Severity)(-1)).ThenBy(t => t.Number))
        {
            sb.Append("| ").Append(t.Number)
              .Append(" | ").Append(Cell(t.Title))
              .Append(" | ").Append(Cell(ctx.TargetName(t.TargetId)))
              .Append(" | ").Append(CategoryLabel(t.Category))
              .Append(" | ").Append(SeverityLabel(t)).Append(t.Cvss is null ? "" : $" ({CvssLabel(t)})")
              .Append(" | ").Append(StatusLabel(t.Status))
              .AppendLine(" |");
        }
        sb.AppendLine();
    }

    static string Inline(string text) => text.Replace("\r", "").Replace("\n", " ").Trim();

    static string Cell(string text) => Inline(text).Replace("|", "\\|");
}
