using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Schema;
using System.Text.Json.Serialization.Metadata;
using ThreatMonster.Core.Model;

namespace ThreatMonster.Core.Tests;

public class SchemaTests
{
    static readonly string SchemaPath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../docs/threatmonster.schema.json"));

    static string Generate()
    {
        var options = new JsonSerializerOptions(ThreatModelJson.Options) { TypeInfoResolver = new DefaultJsonTypeInfoResolver() };
        var schema = (JsonObject)options.GetJsonSchemaAsNode(typeof(ThreatModel), new JsonSchemaExporterOptions
        {
            TreatNullObliviousAsNonNullable = true,
        });
        var ordered = new JsonObject
        {
            ["$schema"] = "https://json-schema.org/draft/2020-12/schema",
            ["title"] = "ThreatMonster threat model (*.tm.json)",
        };
        foreach (var (key, value) in schema.ToList())
        {
            schema.Remove(key);
            ordered[key] = value;
        }
        return ordered.ToJsonString(new JsonSerializerOptions { WriteIndented = true }) + "\n";
    }

    /// <summary>Run with UPDATE_SCHEMA=1 to regenerate docs/threatmonster.schema.json after changing the model.</summary>
    [Fact]
    public void Published_schema_matches_the_model()
    {
        var generated = Generate();
        if (Environment.GetEnvironmentVariable("UPDATE_SCHEMA") == "1")
        {
            Directory.CreateDirectory(Path.GetDirectoryName(SchemaPath)!);
            File.WriteAllText(SchemaPath, generated);
        }
        Assert.True(File.Exists(SchemaPath), $"Missing {SchemaPath}; run the tests with UPDATE_SCHEMA=1.");
        Assert.Equal(generated, File.ReadAllText(SchemaPath));
    }
}
