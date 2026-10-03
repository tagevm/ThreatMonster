using System.Text.Json.Serialization;

namespace ThreatMonster.Core.Model;

/// <summary>
/// Root of a ThreatMonster file (*.tm.json). Positions are absolute canvas
/// coordinates so the format does not depend on any particular diagram library.
/// </summary>
public sealed class ThreatModel
{
    public const string FormatName = "threatmonster";
    public const int CurrentVersion = 1;

    public string Format { get; set; } = FormatName;
    public int Version { get; set; } = CurrentVersion;
    public ModelSummary Summary { get; set; } = new();
    public List<Diagram> Diagrams { get; set; } = [];

    /// <summary>All threats in the model, linked to elements or flows by <see cref="Threat.TargetId"/>.</summary>
    public List<Threat> Threats { get; set; } = [];
}

public sealed class ModelSummary
{
    public string Title { get; set; } = "Untitled threat model";
    public string? Owner { get; set; }
    public string? Reviewer { get; set; }
    public string? Description { get; set; }
    public List<string> Contributors { get; set; } = [];
    public DateTimeOffset? CreatedAt { get; set; }
    public DateTimeOffset? ModifiedAt { get; set; }
}

public sealed class Diagram
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Title { get; set; } = "Main diagram";
    public string? Description { get; set; }
    public List<Element> Elements { get; set; } = [];
    public List<Flow> Flows { get; set; } = [];
}

[JsonConverter(typeof(JsonStringEnumConverter<ElementKind>))]
public enum ElementKind
{
    [JsonStringEnumMemberName("actor")] Actor,
    [JsonStringEnumMemberName("process")] Process,
    [JsonStringEnumMemberName("store")] Store,
    [JsonStringEnumMemberName("boundary")] Boundary,

    /// <summary>Free text or a dashed line (e.g. an imported ThreatDragon boundary curve). Has no STRIDE semantics.</summary>
    [JsonStringEnumMemberName("annotation")] Annotation,
}

[JsonConverter(typeof(JsonStringEnumConverter<ActorType>))]
public enum ActorType
{
    [JsonStringEnumMemberName("human")] Human,
    [JsonStringEnumMemberName("system")] System,
    [JsonStringEnumMemberName("agent")] Agent,
}

public sealed class Element
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public ElementKind Kind { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }

    /// <summary>Id of the boundary this element is nested in, if any.</summary>
    public string? ParentId { get; set; }

    public double X { get; set; }
    public double Y { get; set; }
    public double Width { get; set; }
    public double Height { get; set; }

    public bool OutOfScope { get; set; }
    public string? OutOfScopeReason { get; set; }

    // Kind-specific properties. Null means "not set" and is omitted from the file.
    public ActorType? ActorType { get; set; }
    public bool? ProvidesAuthentication { get; set; }
    public bool? IsWebApplication { get; set; }
    public bool? Privileged { get; set; }
    public bool? StoresCredentials { get; set; }
    public bool? IsLog { get; set; }
    public bool? IsEncrypted { get; set; }
    public bool? IsSigned { get; set; }

    /// <summary>Polyline points (absolute) for line annotations.</summary>
    public List<Point>? Points { get; set; }
}

public sealed record Point(double X, double Y);

public sealed class Flow
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string SourceId { get; set; } = "";
    public string TargetId { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public string? Protocol { get; set; }
    public bool IsEncrypted { get; set; }
    public bool IsPublicNetwork { get; set; }
    public bool IsBidirectional { get; set; }
    public bool OutOfScope { get; set; }
    public string? OutOfScopeReason { get; set; }
}

[JsonConverter(typeof(JsonStringEnumConverter<StrideCategory>))]
public enum StrideCategory
{
    [JsonStringEnumMemberName("spoofing")] Spoofing,
    [JsonStringEnumMemberName("tampering")] Tampering,
    [JsonStringEnumMemberName("repudiation")] Repudiation,
    [JsonStringEnumMemberName("informationDisclosure")] InformationDisclosure,
    [JsonStringEnumMemberName("denialOfService")] DenialOfService,
    [JsonStringEnumMemberName("elevationOfPrivilege")] ElevationOfPrivilege,
}

[JsonConverter(typeof(JsonStringEnumConverter<Severity>))]
public enum Severity
{
    [JsonStringEnumMemberName("low")] Low,
    [JsonStringEnumMemberName("medium")] Medium,
    [JsonStringEnumMemberName("high")] High,
    [JsonStringEnumMemberName("critical")] Critical,
}

[JsonConverter(typeof(JsonStringEnumConverter<ThreatStatus>))]
public enum ThreatStatus
{
    [JsonStringEnumMemberName("open")] Open,
    [JsonStringEnumMemberName("mitigated")] Mitigated,
    [JsonStringEnumMemberName("accepted")] Accepted,
    [JsonStringEnumMemberName("notApplicable")] NotApplicable,
}

public sealed class Threat
{
    public string Id { get; set; } = Guid.NewGuid().ToString();

    /// <summary>Human friendly sequence number, unique within the model.</summary>
    public int Number { get; set; }

    public string Title { get; set; } = "";
    public StrideCategory Category { get; set; }
    public string DiagramId { get; set; } = "";

    /// <summary>Id of the element or flow the threat applies to.</summary>
    public string TargetId { get; set; } = "";

    public string? Description { get; set; }
    public string? Mitigation { get; set; }

    /// <summary>Null means "not yet assessed". Derived from <see cref="Cvss"/> when that is set.</summary>
    public Severity? Severity { get; set; }

    public ThreatStatus Status { get; set; } = ThreatStatus.Open;

    /// <summary>Optional CVSS assessment.</summary>
    public CvssScore? Cvss { get; set; }

    /// <summary>Id of the catalog entry this threat was created from, if any.</summary>
    public string? CatalogId { get; set; }
}

public sealed class CvssScore
{
    public string Vector { get; set; } = "";

    /// <summary>Base score computed from <see cref="Vector"/>; stored so the file is readable outside the tool.</summary>
    public double? BaseScore { get; set; }
}
