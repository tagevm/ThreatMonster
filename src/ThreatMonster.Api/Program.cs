using ThreatMonster.Core.Analysis;
using ThreatMonster.Core.Cvss;
using ThreatMonster.Core.Import;
using ThreatMonster.Core.Model;
using ThreatMonster.Core.Reports;
using ThreatMonster.Core.Stride;

var builder = WebApplication.CreateBuilder(args);
builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.DefaultIgnoreCondition = ThreatModelJson.Options.DefaultIgnoreCondition;
});

var app = builder.Build();
app.UseDefaultFiles();
app.UseStaticFiles();

var api = app.MapGroup("/api");

api.MapGet("/catalog", () => new
{
    Applicability = new Dictionary<string, IReadOnlyList<StrideCategory>>
    {
        ["actor"] = StrideRules.ApplicableTo(ElementKind.Actor),
        ["process"] = StrideRules.ApplicableTo(ElementKind.Process),
        ["store"] = StrideRules.ApplicableTo(ElementKind.Store),
        ["flow"] = StrideRules.ApplicableToFlow,
    },
    Entries = ThreatCatalog.Entries,
});

api.MapPost("/cvss", (CvssRequest request) =>
    Cvss31.TryCalculate(request.Vector, out var result, out var error)
        ? Results.Ok(result)
        : Results.BadRequest(new ErrorResponse(error!)));

// Validates and normalises a ThreatMonster file read by the browser.
api.MapPost("/models/open", async (HttpRequest request) =>
{
    try
    {
        var model = ThreatModelJson.Deserialize(await ReadBody(request));
        return Results.Text(ThreatModelJson.Serialize(model), "application/json");
    }
    catch (InvalidDataException e)
    {
        return Results.BadRequest(new ErrorResponse(e.Message));
    }
});

api.MapPost("/import/threatdragon", async (HttpRequest request) =>
{
    try
    {
        var result = ThreatDragonImporter.Import(await ReadBody(request));
        return Results.Text(
            $$"""{"model":{{ThreatModelJson.Serialize(result.Model)}},"warnings":{{System.Text.Json.JsonSerializer.Serialize(result.Warnings)}}}""",
            "application/json");
    }
    catch (InvalidDataException e)
    {
        return Results.BadRequest(new ErrorResponse(e.Message));
    }
});

api.MapPost("/analysis", async (HttpRequest request) =>
{
    var model = await ReadModel(request);
    return model is null ? Results.BadRequest(new ErrorResponse("Invalid model.")) : Results.Ok(ModelAnalysis.Completeness(model));
});

api.MapPost("/reports/markdown", async (HttpRequest request) =>
{
    var model = await ReadModel(request);
    return model is null
        ? Results.BadRequest(new ErrorResponse("Invalid model."))
        : Results.Text(MarkdownReport.Generate(model), "text/markdown; charset=utf-8");
});

api.MapPost("/reports/html", async (HttpRequest request) =>
{
    var model = await ReadModel(request);
    return model is null
        ? Results.BadRequest(new ErrorResponse("Invalid model."))
        : Results.Text(HtmlReport.Generate(model), "text/html; charset=utf-8");
});

// Unknown API routes are errors; everything else is a client-side route of the SPA.
app.MapFallback("/api/{**path}", () => Results.NotFound(new ErrorResponse("Unknown API endpoint.")));
app.MapFallbackToFile("index.html");
app.Run();

static async Task<string> ReadBody(HttpRequest request)
{
    using var reader = new StreamReader(request.Body);
    return await reader.ReadToEndAsync();
}

static async Task<ThreatModel?> ReadModel(HttpRequest request)
{
    try
    {
        return ThreatModelJson.Deserialize(await ReadBody(request));
    }
    catch (InvalidDataException)
    {
        return null;
    }
}

record CvssRequest(string Vector);

record ErrorResponse(string Error);
