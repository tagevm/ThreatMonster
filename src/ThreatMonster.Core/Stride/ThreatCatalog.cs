using System.Text.Json;
using ThreatMonster.Core.Model;

namespace ThreatMonster.Core.Stride;

/// <summary>
/// A canned threat that can be added to an element with one click.
/// </summary>
/// <param name="AppliesTo">Target kinds: actor, process, store or flow.</param>
/// <param name="When">
/// Optional conditions that make the suggestion relevant, all of which must hold. Each is a target
/// property name (e.g. "storesCredentials", "crossesBoundary"), optionally prefixed with "!" for negation.
/// Evaluated by the client, which knows about live diagram state such as boundary crossings.
/// </param>
public sealed record CatalogEntry(
    string Id,
    StrideCategory Category,
    IReadOnlyList<string> AppliesTo,
    string Title,
    string Description,
    string Mitigation,
    IReadOnlyList<string>? When = null);

public static class ThreatCatalog
{
    static readonly Lazy<IReadOnlyList<CatalogEntry>> entries = new(Load);

    public static IReadOnlyList<CatalogEntry> Entries => entries.Value;

    static IReadOnlyList<CatalogEntry> Load()
    {
        using var stream = typeof(ThreatCatalog).Assembly.GetManifestResourceStream("ThreatMonster.Core.Stride.catalog.json")
            ?? throw new InvalidOperationException("Embedded threat catalog is missing.");
        return JsonSerializer.Deserialize<List<CatalogEntry>>(stream, ThreatModelJson.Options)
            ?? throw new InvalidOperationException("Embedded threat catalog is empty.");
    }
}
