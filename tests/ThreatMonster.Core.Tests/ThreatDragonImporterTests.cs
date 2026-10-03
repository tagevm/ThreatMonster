using ThreatMonster.Core.Import;
using ThreatMonster.Core.Model;

namespace ThreatMonster.Core.Tests;

public class ThreatDragonImporterTests
{
    static ImportResult ImportFixture(string name) =>
        ThreatDragonImporter.Import(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "ThreatDragon", name)));

    public static TheoryData<string> Fixtures() =>
        new(Directory.GetFiles(Path.Combine(AppContext.BaseDirectory, "Fixtures", "ThreatDragon"), "*.json").Select(Path.GetFileName)!);

    [Theory]
    [MemberData(nameof(Fixtures))]
    public void Imports_every_demo_model_and_round_trips(string fixture)
    {
        var model = ImportFixture(fixture).Model;

        Assert.NotEmpty(model.Diagrams);
        var allIds = model.Diagrams.SelectMany(d => d.Elements.Select(e => e.Id).Concat(d.Flows.Select(f => f.Id))).ToHashSet();
        Assert.All(model.Threats, t => Assert.Contains(t.TargetId, allIds));
        Assert.Equal(model.Threats.Count, model.Threats.Select(t => t.Number).Distinct().Count());
        foreach (var d in model.Diagrams)
        {
            var elementIds = d.Elements.Select(e => e.Id).ToHashSet();
            Assert.All(d.Flows, f => Assert.True(elementIds.Contains(f.SourceId) && elementIds.Contains(f.TargetId)));
        }

        var roundTripped = ThreatModelJson.Deserialize(ThreatModelJson.Serialize(model));
        Assert.Equal(ThreatModelJson.Serialize(model), ThreatModelJson.Serialize(roundTripped));
    }

    [Fact]
    public void Imports_demo_model_details()
    {
        var (model, warnings) = ImportFixture("v2-threat-model.json");

        Assert.Equal("Demo Threat Model", model.Summary.Title);
        Assert.Equal("Mike Goodwin", model.Summary.Owner);
        Assert.Equal("Jane Smith", model.Summary.Reviewer);
        Assert.Equal(["Tom Brown", "Albert Moneypenny"], model.Summary.Contributors);

        var diagram = Assert.Single(model.Diagrams);
        Assert.Equal(1, diagram.Elements.Count(e => e.Kind == ElementKind.Actor));
        Assert.Equal(2, diagram.Elements.Count(e => e.Kind == ElementKind.Process));
        Assert.Equal(4, diagram.Elements.Count(e => e.Kind == ElementKind.Store));
        Assert.Equal(9, diagram.Flows.Count);

        // Boundary curves become line annotations, the text block a text annotation.
        Assert.Equal(3, diagram.Elements.Count(e => e.Kind == ElementKind.Annotation && e.Points is { Count: >= 2 }));
        Assert.Single(diagram.Elements, e => e.Kind == ElementKind.Annotation && e.Points is null);

        // Line breaks used for wrapping in Threat Dragon are dropped from shape names.
        Assert.Contains(diagram.Elements, e => e.Name == "Background Worker Process");

        // All 14 threats survive, including the one on the half-connected flow.
        Assert.Equal(14, model.Threats.Count);
        Assert.Contains(warnings, w => w.Contains("Web Request") && w.Contains("moved"));
        var https = Assert.Single(model.Threats, t => t.Title == "Data flow should use HTTP/S" && t.TargetId == diagram.Flows.Single(f => f.Name == "Put Message").Id);
        Assert.Equal(StrideCategory.InformationDisclosure, https.Category);
        Assert.Equal(Severity.High, https.Severity);
        Assert.Equal(ThreatStatus.Open, https.Status);
    }

    [Fact]
    public void Nests_elements_in_boundary_boxes()
    {
        var diagram = ImportFixture("three-tier-web-app.json").Model.Diagrams.Single();
        var boxes = diagram.Elements.Where(e => e.Kind == ElementKind.Boundary).ToList();
        Assert.Equal(2, boxes.Count);

        Element Named(string name) => diagram.Elements.Single(e => e.Name == name);
        Assert.Equal(boxes.Single(b => b.X < 200).Id, Named("Web UI").ParentId);
        Assert.Equal(boxes.Single(b => b.X > 500).Id, Named("Web Service").ParentId);
        Assert.Equal(boxes.Single(b => b.X > 500).Id, Named("PostgresSQL").ParentId);
    }

    [Fact]
    public void Maps_non_stride_threat_types_and_free_text_scores()
    {
        const string json = """
            {
              "version": "2.3.0",
              "summary": { "title": "CIA model" },
              "detail": {
                "contributors": [],
                "diagrams": [{
                  "id": 0, "title": "D", "diagramType": "CIA",
                  "cells": [{
                    "id": "p1", "shape": "process", "position": { "x": 0, "y": 0 }, "size": { "width": 100, "height": 100 },
                    "data": { "type": "tm.Process", "name": "Proc", "threats": [
                      { "id": "a", "title": "Integrity issue", "type": "Integrity", "status": "Mitigated", "severity": "TBA", "score": "7.5", "number": 4 },
                      { "id": "b", "title": "Linkable", "type": "Linkability", "status": "Open", "severity": "Low",
                        "score": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", "number": 4 }
                    ] }
                  }]
                }]
              }
            }
            """;

        var (model, warnings) = ThreatDragonImporter.Import(json);

        var integrity = model.Threats.Single(t => t.Title == "Integrity issue");
        Assert.Equal(StrideCategory.Tampering, integrity.Category);
        Assert.Equal(ThreatStatus.Mitigated, integrity.Status);
        Assert.Null(integrity.Severity);
        Assert.Contains("Threat Dragon score: 7.5", integrity.Description);
        Assert.Equal(4, integrity.Number);

        var linkable = model.Threats.Single(t => t.Title == "Linkable");
        Assert.Equal(StrideCategory.InformationDisclosure, linkable.Category);
        Assert.Contains("Linkability", linkable.Description);
        Assert.Equal(9.8, linkable.Cvss!.BaseScore);
        Assert.Equal(Severity.Critical, linkable.Severity);
        Assert.Equal(5, linkable.Number);

        Assert.Contains(warnings, w => w.Contains("CIA diagram"));
        Assert.Contains(warnings, w => w.Contains("Linkability"));
    }

    [Theory]
    [InlineData("not json", "Not valid JSON")]
    [InlineData("""{ "summary": {} }""", "missing \"detail\"")]
    [InlineData("""{ "detail": { "diagrams": [ { "diagramJson": {} } ] } }""", "v1")]
    public void Rejects_unsupported_input(string json, string message)
    {
        var e = Assert.Throws<InvalidDataException>(() => ThreatDragonImporter.Import(json));
        Assert.Contains(message, e.Message);
    }
}
