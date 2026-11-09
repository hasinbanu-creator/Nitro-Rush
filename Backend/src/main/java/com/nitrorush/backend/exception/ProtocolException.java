package com.nitrorush.backend.exception;

import com.nitrorush.backend.protocol.ErrorCode;

public class ProtocolException extends RuntimeException {

    private final ErrorCode errorCode;

    public ProtocolException(ErrorCode errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }

    public ProtocolException(ErrorCode errorCode, String message, Throwable cause) {
        super(message, cause);
        this.errorCode = errorCode;
    }

    public ErrorCode getErrorCode() {
        return errorCode;
    }
}

