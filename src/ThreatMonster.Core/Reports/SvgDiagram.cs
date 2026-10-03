using System.Globalization;
using System.Net;
using System.Text;
using ThreatMonster.Core.Analysis;
using ThreatMonster.Core.Model;

namespace ThreatMonster.Core.Reports;

/// <summary>
/// Renders a diagram as standalone SVG from the model, in the same visual language as the editor:
/// actors as boxes, processes as ellipses, stores as open-ended boxes, trust boundaries dashed red,
/// and flows that cross a boundary in amber.
/// </summary>
public static class SvgDiagram
{
    const double Pad = 30;
    const double FontSize = 13;
    const double ParallelSpacing = 50;

    static string F(double v) => v.ToString("0.#", CultureInfo.InvariantCulture);
    static string E(string s) => WebUtility.HtmlEncode(s);

    public static string Render(Diagram diagram, IReadOnlyList<Threat>? threats = null)
    {
        var elements = diagram.Elements;
        if (elements.Count == 0)
            return "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"60\"><text x=\"10\" y=\"35\" font-family=\"system-ui,sans-serif\" font-size=\"13\" fill=\"#78716c\">Empty diagram</text></svg>";

        var byId = elements.ToDictionary(e => e.Id);
        double minX = elements.Min(e => e.X), minY = elements.Min(e => e.Y);
        double maxX = elements.Max(e => e.X + e.Width), maxY = elements.Max(e => e.Y + e.Height);
        foreach (var p in elements.Where(e => e.Points is not null).SelectMany(e => e.Points!))
        {
            minX = Math.Min(minX, p.X); minY = Math.Min(minY, p.Y);
            maxX = Math.Max(maxX, p.X); maxY = Math.Max(maxY, p.Y);
        }
        // Room for boundary labels above and badges to the right.
        minX -= Pad; minY -= Pad; maxX += Pad; maxY += Pad;

        var openByTarget = (threats ?? []).Where(t => t.Status == ThreatStatus.Open)
            .GroupBy(t => t.TargetId).ToDictionary(g => g.Key, g => (Count: g.Count(), Worst: g.Max(t => t.Severity)));

        var sb = new StringBuilder();
        sb.Append($"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"{F(minX)} {F(minY)} {F(maxX - minX)} {F(maxY - minY)}\" width=\"{F(maxX - minX)}\" height=\"{F(maxY - minY)}\" font-family=\"system-ui,-apple-system,'Segoe UI',sans-serif\" font-size=\"{F(FontSize)}\">");
        sb.Append("<defs>");
        foreach (var (id, color) in new[] { ("arrow", "#57534e"), ("arrow-x", "#d97706") })
            sb.Append($"<marker id=\"{id}\" viewBox=\"0 0 10 10\" refX=\"9\" refY=\"5\" markerWidth=\"8\" markerHeight=\"8\" orient=\"auto-start-reverse\"><path d=\"M0,0 L10,5 L0,10 z\" fill=\"{color}\"/></marker>");
        sb.Append("</defs>");
        sb.Append($"<rect x=\"{F(minX)}\" y=\"{F(minY)}\" width=\"{F(maxX - minX)}\" height=\"{F(maxY - minY)}\" fill=\"#ffffff\"/>");

        // Boundaries first (outermost first) so everything else sits on top.
        int Depth(Element e) => ModelAnalysis.BoundaryChain(diagram, e.Id).Count;
        foreach (var b in elements.Where(e => e.Kind == ElementKind.Boundary).OrderBy(Depth))
        {
            sb.Append($"<rect x=\"{F(b.X)}\" y=\"{F(b.Y)}\" width=\"{F(b.Width)}\" height=\"{F(b.Height)}\" rx=\"12\" fill=\"#fef2f2\" fill-opacity=\"0.35\" stroke=\"#f87171\" stroke-width=\"2\" stroke-dasharray=\"8 5\"/>");
            if (!string.IsNullOrWhiteSpace(b.Name))
            {
                var w = TextWidth(b.Name, 11) + 12;
                sb.Append($"<rect x=\"{F(b.X + 12)}\" y=\"{F(b.Y - 9)}\" width=\"{F(w)}\" height=\"18\" rx=\"3\" fill=\"#ffffff\"/>");
                sb.Append($"<text x=\"{F(b.X + 18)}\" y=\"{F(b.Y + 4)}\" font-size=\"11\" font-weight=\"600\" fill=\"#b91c1c\">{E(b.Name)}</text>");
            }
        }

        foreach (var a in elements.Where(e => e.Kind == ElementKind.Annotation))
        {
            if (a.Points is { Count: >= 2 } pts)
            {
                sb.Append($"<polyline points=\"{string.Join(' ', pts.Select(p => $"{F(p.X)},{F(p.Y)}"))}\" fill=\"none\" stroke=\"#f87171\" stroke-width=\"2\" stroke-dasharray=\"8 5\"/>");
                if (!string.IsNullOrWhiteSpace(a.Name))
                {
                    var mid = pts[pts.Count / 2];
                    sb.Append($"<text x=\"{F(mid.X)}\" y=\"{F(mid.Y)}\" font-size=\"11\" font-weight=\"600\" fill=\"#b91c1c\">{E(a.Name)}</text>");
                }
            }
            else
            {
                var lines = a.Name.Replace("\r", "").Split('\n');
                for (int i = 0; i < lines.Length; i++)
                    sb.Append($"<text x=\"{F(a.X + 4)}\" y=\"{F(a.Y + 16 + i * 17)}\" font-style=\"italic\" fill=\"#57534e\">{E(lines[i])}</text>");
            }
        }

        RenderFlows(sb, diagram, byId, openByTarget);

        foreach (var e in elements.Where(e => e.Kind is ElementKind.Actor or ElementKind.Process or ElementKind.Store))
        {
            var opacity = e.OutOfScope ? " opacity=\"0.45\"" : "";
            sb.Append($"<g{opacity}>");
            switch (e.Kind)
            {
                case ElementKind.Actor:
                    sb.Append($"<rect x=\"{F(e.X)}\" y=\"{F(e.Y)}\" width=\"{F(e.Width)}\" height=\"{F(e.Height)}\" rx=\"5\" fill=\"#ffffff\" stroke=\"#44403c\" stroke-width=\"2\"/>");
                    WrappedText(sb, e, "#292524");
                    break;
                case ElementKind.Process:
                    sb.Append($"<ellipse cx=\"{F(e.X + e.Width / 2)}\" cy=\"{F(e.Y + e.Height / 2)}\" rx=\"{F(e.Width / 2)}\" ry=\"{F(e.Height / 2)}\" fill=\"#f5f3ff\" stroke=\"#7c3aed\" stroke-width=\"2\"/>");
                    WrappedText(sb, e, "#2e1065", inset: 0.72);
                    break;
                case ElementKind.Store:
                    sb.Append($"<rect x=\"{F(e.X)}\" y=\"{F(e.Y)}\" width=\"{F(e.Width)}\" height=\"{F(e.Height)}\" fill=\"#f0f9ff\"/>");
                    sb.Append($"<line x1=\"{F(e.X)}\" y1=\"{F(e.Y)}\" x2=\"{F(e.X + e.Width)}\" y2=\"{F(e.Y)}\" stroke=\"#0369a1\" stroke-width=\"3\"/>");
                    sb.Append($"<line x1=\"{F(e.X)}\" y1=\"{F(e.Y + e.Height)}\" x2=\"{F(e.X + e.Width)}\" y2=\"{F(e.Y + e.Height)}\" stroke=\"#0369a1\" stroke-width=\"3\"/>");
                    WrappedText(sb, e, "#082f49");
                    break;
            }
            if (e.OutOfScope)
                sb.Append($"<text x=\"{F(e.X + e.Width / 2)}\" y=\"{F(e.Y + e.Height + 14)}\" text-anchor=\"middle\" font-size=\"10\" fill=\"#57534e\">out of scope</text>");
            sb.Append("</g>");
            if (openByTarget.TryGetValue(e.Id, out var badge))
                Badge(sb, e.X + e.Width, e.Y, badge.Count, badge.Worst);
        }

        sb.Append("</svg>");
        return sb.ToString();
    }

    static void RenderFlows(StringBuilder sb, Diagram diagram, Dictionary<string, Element> byId,
        Dictionary<string, (int Count, Severity? Worst)> openByTarget)
    {
        var groups = diagram.Flows
            .GroupBy(f => string.CompareOrdinal(f.SourceId, f.TargetId) < 0 ? (f.SourceId, f.TargetId) : (f.TargetId, f.SourceId))
            .ToDictionary(g => g.Key, g => g.Select(f => f.Id).ToList());

        foreach (var f in diagram.Flows)
        {
            if (!byId.TryGetValue(f.SourceId, out var src) || !byId.TryGetValue(f.TargetId, out var tgt))
                continue;
            var key = string.CompareOrdinal(f.SourceId, f.TargetId) < 0 ? (f.SourceId, f.TargetId) : (f.TargetId, f.SourceId);
            var group = groups[key];
            var offset = (group.IndexOf(f.Id) - (group.Count - 1) / 2.0) * ParallelSpacing;

            // Same geometry as the editor: a quadratic curve bent along the normal of the id-ordered direction.
            var (ax, ay) = Centre(src);
            var (bx, by) = Centre(tgt);
            var len = Math.Max(1, Math.Sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay)));
            double sign = string.CompareOrdinal(f.SourceId, f.TargetId) < 0 ? 1 : -1;
            double nx = -(by - ay) / len * sign, ny = (bx - ax) / len * sign;
            double cx = (ax + bx) / 2 + nx * offset, cy = (ay + by) / 2 + ny * offset;
            var (sx, sy) = Exit(src, cx, cy);
            var (tx, ty) = Exit(tgt, cx, cy);

            var crossing = ModelAnalysis.CrossesBoundary(diagram, f);
            var color = crossing ? "#d97706" : "#57534e";
            var marker = crossing ? "arrow-x" : "arrow";
            var dash = f.OutOfScope ? " stroke-dasharray=\"4 4\" opacity=\"0.5\"" : "";
            var start = f.IsBidirectional ? $" marker-start=\"url(#{marker})\"" : "";
            sb.Append($"<path d=\"M{F(sx)},{F(sy)} Q{F(cx)},{F(cy)} {F(tx)},{F(ty)}\" fill=\"none\" stroke=\"{color}\" stroke-width=\"{(crossing ? "2.25" : "1.5")}\"{dash} marker-end=\"url(#{marker})\"{start}/>");

            double lx = 0.25 * sx + 0.5 * cx + 0.25 * tx, ly = 0.25 * sy + 0.5 * cy + 0.25 * ty;
            var label = (f.IsEncrypted ? "🔒 " : "") + f.Name;
            if (!string.IsNullOrWhiteSpace(label))
            {
                var w = TextWidth(label, 11) + 14;
                sb.Append($"<rect x=\"{F(lx - w / 2)}\" y=\"{F(ly - 10)}\" width=\"{F(w)}\" height=\"20\" rx=\"10\" fill=\"#ffffff\" stroke=\"{(crossing ? "#fcd34d" : "#e7e5e4")}\"/>");
                sb.Append($"<text x=\"{F(lx)}\" y=\"{F(ly + 4)}\" text-anchor=\"middle\" font-size=\"11\" fill=\"#44403c\">{E(label)}</text>");
                if (openByTarget.TryGetValue(f.Id, out var badge))
                    Badge(sb, lx + w / 2 + 6, ly - 4, badge.Count, badge.Worst);
            }
            else if (openByTarget.TryGetValue(f.Id, out var badge))
            {
                Badge(sb, lx, ly - 4, badge.Count, badge.Worst);
            }
        }
    }

    static (double X, double Y) Centre(Element e) => (e.X + e.Width / 2, e.Y + e.Height / 2);

    /// <summary>Where a ray from the element centre towards (x, y) leaves its outline.</summary>
    static (double X, double Y) Exit(Element e, double x, double y)
    {
        var (cx, cy) = Centre(e);
        double dx = x - cx, dy = y - cy;
        if (dx == 0 && dy == 0) return (cx, cy);
        double t = e.Kind == ElementKind.Process
            ? 1 / Math.Sqrt(Math.Pow(dx / (e.Width / 2), 2) + Math.Pow(dy / (e.Height / 2), 2))
            : Math.Min(dx == 0 ? double.PositiveInfinity : e.Width / 2 / Math.Abs(dx), dy == 0 ? double.PositiveInfinity : e.Height / 2 / Math.Abs(dy));
        return (cx + dx * t, cy + dy * t);
    }

    static void Badge(StringBuilder sb, double cx, double cy, int count, Severity? worst)
    {
        var (fill, text) = worst switch
        {
            Severity.Critical => ("#dc2626", "#ffffff"),
            Severity.High => ("#f97316", "#ffffff"),
            Severity.Medium => ("#facc15", "#422006"),
            Severity.Low => ("#3b82f6", "#ffffff"),
            _ => ("#a8a29e", "#ffffff"),
        };
        sb.Append($"<circle cx=\"{F(cx)}\" cy=\"{F(cy)}\" r=\"9\" fill=\"{fill}\" stroke=\"#ffffff\" stroke-width=\"1.5\"/>");
        sb.Append($"<text x=\"{F(cx)}\" y=\"{F(cy + 3.5)}\" text-anchor=\"middle\" font-size=\"10\" font-weight=\"700\" fill=\"{text}\">{count}</text>");
    }

    /// <summary>Centred name, greedily wrapped to the element width using an approximate glyph width.</summary>
    static void WrappedText(StringBuilder sb, Element e, string color, double inset = 0.9)
    {
        var maxWidth = e.Width * inset;
        var lines = new List<string>();
        var current = "";
        foreach (var word in (e.Name ?? "").Split(' ', StringSplitOptions.RemoveEmptyEntries))
        {
            var candidate = current.Length == 0 ? word : current + " " + word;
            if (current.Length > 0 && TextWidth(candidate, FontSize) > maxWidth)
            {
                lines.Add(current);
                current = word;
            }
            else current = candidate;
        }
        if (current.Length > 0) lines.Add(current);

        const double lineHeight = 16;
        var top = e.Y + e.Height / 2 - (lines.Count - 1) * lineHeight / 2 + 4.5;
        for (int i = 0; i < lines.Count; i++)
            sb.Append($"<text x=\"{F(e.X + e.Width / 2)}\" y=\"{F(top + i * lineHeight)}\" text-anchor=\"middle\" font-weight=\"500\" fill=\"{color}\">{E(lines[i])}</text>");
    }

    static double TextWidth(string text, double fontSize) => text.Length * fontSize * 0.56;
}
