using System.Text;
using ThreatMonster.Core.Model;

namespace ThreatMonster.Core.Reports;

/// <summary>Renders a diagram as a Mermaid flowchart, with trust boundaries as subgraphs.</summary>
public static class MermaidDiagram
{
    public static string Render(Diagram diagram)
    {
        var ids = new Dictionary<string, string>();
        string Id(string elementId) => ids.TryGetValue(elementId, out var id) ? id : ids[elementId] = $"n{ids.Count + 1}";

        var children = diagram.Elements
            .Where(e => e.Kind != ElementKind.Annotation)
            .ToLookup(e => e.ParentId is { } p && diagram.Elements.Any(b => b.Id == p) ? p : null);

        var sb = new StringBuilder("flowchart LR\n");

        void Emit(string? parentId, int depth, HashSet<string> visited)
        {
            var indent = new string(' ', depth * 4);
            foreach (var e in children[parentId])
            {
                if (!visited.Add(e.Id))
                    continue;
                var label = Escape(string.IsNullOrWhiteSpace(e.Name) ? ReportContext.KindLabel(e.Kind) : e.Name);
                switch (e.Kind)
                {
                    case ElementKind.Boundary:
                        sb.Append(indent).Append("subgraph ").Append(Id(e.Id)).Append("[\"").Append(label).Append("\"]\n");
                        Emit(e.Id, depth + 1, visited);
                        sb.Append(indent).Append("end\n");
                        sb.Append(indent).Append("style ").Append(Id(e.Id)).Append(" stroke:#dc2626,stroke-dasharray:6 4,fill:none\n");
                        break;
                    case ElementKind.Actor:
                        sb.Append(indent).Append(Id(e.Id)).Append("[\"").Append(label).Append("\"]\n");
                        break;
                    case ElementKind.Process:
                        sb.Append(indent).Append(Id(e.Id)).Append("((\"").Append(label).Append("\"))\n");
                        break;
                    case ElementKind.Store:
                        sb.Append(indent).Append(Id(e.Id)).Append("[(\"").Append(label).Append("\")]\n");
                        break;
                }
            }
        }

        Emit(null, 1, []);

        foreach (var f in diagram.Flows)
        {
            if (!ids.ContainsKey(f.SourceId) || !ids.ContainsKey(f.TargetId))
                continue;
            var arrow = f.IsBidirectional ? "<-->" : "-->";
            sb.Append("    ").Append(Id(f.SourceId)).Append(' ').Append(arrow);
            if (!string.IsNullOrWhiteSpace(f.Name))
                sb.Append("|\"").Append(Escape(f.Name)).Append("\"|");
            sb.Append(' ').Append(Id(f.TargetId)).Append('\n');
        }

        return sb.ToString();
    }

    static string Escape(string text) =>
        text.Replace("\"", "#quot;").Replace("\r", "").Replace("\n", "<br/>");
}
