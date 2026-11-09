package com.nitrorush.backend.protocol.payload;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;

public class ErrorPayload {

    @NotBlank
    @JsonProperty("errorCode")
    private String errorCode;

    @NotBlank
    @JsonProperty("message")
    private String message;

    public ErrorPayload() {
    }

    public ErrorPayload(String errorCode, String message) {
        this.errorCode = errorCode;
        this.message = message;
    }

    public String getErrorCode() {
        return errorCode;
    }

    public void setErrorCode(String errorCode) {
        this.errorCode = errorCode;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }
}

