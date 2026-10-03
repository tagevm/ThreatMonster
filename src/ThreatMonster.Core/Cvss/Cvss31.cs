using ThreatMonster.Core.Model;

namespace ThreatMonster.Core.Cvss;

public sealed record CvssResult(string Vector, double BaseScore, Severity? Severity);

/// <summary>
/// CVSS v3.1 (and v3.0) base score calculator, following the FIRST specification
/// (https://www.first.org/cvss/v3.1/specification-document). Temporal and environmental
/// metrics are accepted in the vector but ignored.
/// </summary>
public static class Cvss31
{
    static readonly string[] BaseMetrics = ["AV", "AC", "PR", "UI", "S", "C", "I", "A"];

    static readonly Dictionary<string, string[]> AllowedValues = new()
    {
        ["AV"] = ["N", "A", "L", "P"],
        ["AC"] = ["L", "H"],
        ["PR"] = ["N", "L", "H"],
        ["UI"] = ["N", "R"],
        ["S"] = ["U", "C"],
        ["C"] = ["H", "L", "N"],
        ["I"] = ["H", "L", "N"],
        ["A"] = ["H", "L", "N"],
    };

    public static bool TryCalculate(string vector, out CvssResult? result, out string? error)
    {
        result = null;
        if (!TryParse(vector, out var m, out error))
            return false;

        double av = m["AV"] switch { "N" => 0.85, "A" => 0.62, "L" => 0.55, _ => 0.2 };
        double ac = m["AC"] == "L" ? 0.77 : 0.44;
        bool scopeChanged = m["S"] == "C";
        double pr = m["PR"] switch
        {
            "N" => 0.85,
            "L" => scopeChanged ? 0.68 : 0.62,
            _ => scopeChanged ? 0.5 : 0.27,
        };
        double ui = m["UI"] == "N" ? 0.85 : 0.62;
        double Cia(string v) => v switch { "H" => 0.56, "L" => 0.22, _ => 0 };

        double iss = 1 - (1 - Cia(m["C"])) * (1 - Cia(m["I"])) * (1 - Cia(m["A"]));
        double impact = scopeChanged
            ? 7.52 * (iss - 0.029) - 3.25 * Math.Pow(iss - 0.02, 15)
            : 6.42 * iss;
        double exploitability = 8.22 * av * ac * pr * ui;

        double score = impact <= 0
            ? 0
            : scopeChanged
                ? RoundUp(Math.Min(1.08 * (impact + exploitability), 10))
                : RoundUp(Math.Min(impact + exploitability, 10));

        result = new CvssResult(vector.Trim(), score, Rate(score));
        return true;
    }

    /// <summary>Qualitative rating; a score of 0.0 ("None") maps to null.</summary>
    public static Severity? Rate(double score) => score switch
    {
        0 => null,
        < 4.0 => Severity.Low,
        < 7.0 => Severity.Medium,
        < 9.0 => Severity.High,
        _ => Severity.Critical,
    };

    /// <summary>The spec's Roundup: smallest number with one decimal that is >= input, avoiding float artefacts.</summary>
    static double RoundUp(double value)
    {
        long intInput = (long)Math.Round(value * 100000);
        return intInput % 10000 == 0
            ? intInput / 100000.0
            : (Math.Floor(intInput / 10000.0) + 1) / 10.0;
    }

    static bool TryParse(string vector, out Dictionary<string, string> metrics, out string? error)
    {
        var parsed = new Dictionary<string, string>();
        metrics = parsed;
        error = null;
        var parts = (vector ?? "").Trim().Split('/');
        if (parts.Length == 0 || parts[0] is not ("CVSS:3.1" or "CVSS:3.0"))
        {
            error = "Vector must start with CVSS:3.1/";
            return false;
        }

        foreach (var part in parts.Skip(1))
        {
            var kv = part.Split(':');
            if (kv.Length != 2 || kv[0].Length == 0 || kv[1].Length == 0)
            {
                error = $"Malformed metric '{part}'";
                return false;
            }
            if (parsed.ContainsKey(kv[0]))
            {
                error = $"Metric {kv[0]} is specified more than once";
                return false;
            }
            if (AllowedValues.TryGetValue(kv[0], out var allowed) && !allowed.Contains(kv[1]))
            {
                error = $"Invalid value '{kv[1]}' for metric {kv[0]}";
                return false;
            }
            parsed[kv[0]] = kv[1];
        }

        var missing = BaseMetrics.Where(b => !parsed.ContainsKey(b)).ToList();
        if (missing.Count > 0)
        {
            error = $"Missing base metric(s): {string.Join(", ", missing)}";
            return false;
        }
        return true;
    }
}
