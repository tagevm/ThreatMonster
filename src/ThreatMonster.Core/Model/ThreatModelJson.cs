using System.Text.Json;
using System.Text.Json.Serialization;

namespace ThreatMonster.Core.Model;

public static class ThreatModelJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static string Serialize(ThreatModel model) => JsonSerializer.Serialize(model, Options);

    /// <exception cref="InvalidDataException">The JSON is not a ThreatMonster model.</exception>
    public static ThreatModel Deserialize(string json)
    {
        ThreatModel? model;
        try
        {
            model = JsonSerializer.Deserialize<ThreatModel>(json, Options);
        }
        catch (JsonException e)
        {
            throw new InvalidDataException($"Not a valid ThreatMonster file: {e.Message}", e);
        }

        if (model is null || model.Format != ThreatModel.FormatName)
            throw new InvalidDataException("Not a ThreatMonster file (missing \"format\": \"threatmonster\").");
        if (model.Version > ThreatModel.CurrentVersion)
            throw new InvalidDataException($"File version {model.Version} is newer than this ThreatMonster supports ({ThreatModel.CurrentVersion}).");
        return model;
    }
}
