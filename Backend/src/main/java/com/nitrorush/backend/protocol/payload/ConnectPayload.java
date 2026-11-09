package com.nitrorush.backend.protocol.payload;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;

public class ConnectPayload {

    @NotBlank
    @JsonProperty("clientVersion")
    private String clientVersion;

    @JsonProperty("platform")
    private String platform;

    public ConnectPayload() {
    }

    public ConnectPayload(String clientVersion, String platform) {
        this.clientVersion = clientVersion;
        this.platform = platform;
    }

    public String getClientVersion() {
        return clientVersion;
    }

    public void setClientVersion(String clientVersion) {
        this.clientVersion = clientVersion;
    }

    public String getPlatform() {
        return platform;
    }

    public void setPlatform(String platform) {
        this.platform = platform;
    }
}

