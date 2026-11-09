package com.nitrorush.backend.protocol.payload;

import java.util.ArrayList;
import java.util.List;

public class RaceResultsPayload {

    private String trackId;
    private List<CompetitorResultItem> results = new ArrayList<>();

    public RaceResultsPayload() {}

    public RaceResultsPayload(String trackId, List<CompetitorResultItem> results) {
        this.trackId = trackId;
        this.results = results != null ? results : new ArrayList<>();
    }

    public String getTrackId() { return trackId; }
    public void setTrackId(String trackId) { this.trackId = trackId; }

    public List<CompetitorResultItem> getResults() { return results; }
    public void setResults(List<CompetitorResultItem> results) { this.results = results; }
}

