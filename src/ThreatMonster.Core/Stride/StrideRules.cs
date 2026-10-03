using ThreatMonster.Core.Model;

namespace ThreatMonster.Core.Stride;

public static class StrideRules
{
    public static readonly IReadOnlyList<StrideCategory> All = Enum.GetValues<StrideCategory>();

    public static string Label(StrideCategory category) => category switch
    {
        StrideCategory.Spoofing => "Spoofing",
        StrideCategory.Tampering => "Tampering",
        StrideCategory.Repudiation => "Repudiation",
        StrideCategory.InformationDisclosure => "Information disclosure",
        StrideCategory.DenialOfService => "Denial of service",
        StrideCategory.ElevationOfPrivilege => "Elevation of privilege",
        _ => category.ToString(),
    };

    public static char Letter(StrideCategory category) => Label(category)[0];

    /// <summary>The classic STRIDE-per-element table (Microsoft SDL).</summary>
    public static IReadOnlyList<StrideCategory> ApplicableTo(ElementKind kind) => kind switch
    {
        ElementKind.Actor => [StrideCategory.Spoofing, StrideCategory.Repudiation],
        ElementKind.Process => All,
        ElementKind.Store =>
        [
            StrideCategory.Tampering, StrideCategory.Repudiation,
            StrideCategory.InformationDisclosure, StrideCategory.DenialOfService,
        ],
        _ => [],
    };

    public static readonly IReadOnlyList<StrideCategory> ApplicableToFlow =
    [
        StrideCategory.Tampering, StrideCategory.InformationDisclosure, StrideCategory.DenialOfService,
    ];
}
