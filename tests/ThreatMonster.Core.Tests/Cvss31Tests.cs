using ThreatMonster.Core.Cvss;
using ThreatMonster.Core.Model;

namespace ThreatMonster.Core.Tests;

public class Cvss31Tests
{
    [Theory]
    [InlineData("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", 9.8, Severity.Critical)]
    [InlineData("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H", 10.0, Severity.Critical)]
    [InlineData("CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N", 6.1, Severity.Medium)]
    [InlineData("CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:L/I:L/A:N", 6.4, Severity.Medium)]
    [InlineData("CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H", 7.8, Severity.High)]
    [InlineData("CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N", 5.9, Severity.Medium)]
    [InlineData("CVSS:3.1/AV:P/AC:H/PR:H/UI:R/S:U/C:L/I:N/A:N", 1.6, Severity.Low)]
    [InlineData("CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", 9.8, Severity.Critical)]
    public void Calculates_base_score(string vector, double expected, Severity severity)
    {
        Assert.True(Cvss31.TryCalculate(vector, out var result, out var error), error);
        Assert.Equal(expected, result!.BaseScore);
        Assert.Equal(severity, result.Severity);
    }

    [Fact]
    public void No_impact_scores_zero_with_no_severity()
    {
        Assert.True(Cvss31.TryCalculate("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N", out var result, out _));
        Assert.Equal(0, result!.BaseScore);
        Assert.Null(result.Severity);
    }

    [Fact]
    public void Ignores_temporal_metrics_but_keeps_them_in_the_vector()
    {
        const string vector = "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/E:P/RL:O";
        Assert.True(Cvss31.TryCalculate(vector, out var result, out _));
        Assert.Equal(9.8, result!.BaseScore);
        Assert.Equal(vector, result.Vector);
    }

    [Theory]
    [InlineData("AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", "must start")]
    [InlineData("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H", "Missing base metric(s): A")]
    [InlineData("CVSS:3.1/AV:X/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", "Invalid value 'X' for metric AV")]
    [InlineData("CVSS:3.1/AV:N/AV:L/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", "more than once")]
    [InlineData("CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N", "must start")]
    public void Rejects_invalid_vectors(string vector, string message)
    {
        Assert.False(Cvss31.TryCalculate(vector, out _, out var error));
        Assert.Contains(message, error);
    }
}
