# Multi-stage Docker build for Nitro Rush Authoritative Java Backend
# Stage 1: Build JAR with Maven & Eclipse Temurin Java 21
FROM maven:3.9.9-eclipse-temurin-21-alpine AS builder

WORKDIR /build
COPY pom.xml .
# Download dependencies for layer caching
RUN mvn dependency:go-offline -B

COPY src ./src
RUN mvn package -DskipTests -B

# Stage 2: Minimal Distroless / Temurin JRE runtime
FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

# Run as non-root user for production security hardening
RUN addgroup -S nitrorush && adduser -S nitrorush -G nitrorush

COPY --from=builder /build/target/backend-0.0.1-SNAPSHOT.jar app.jar
RUN chown -R nitrorush:nitrorush /app

USER nitrorush

EXPOSE 8080

# Configure JVM memory and garbage collector optimized for 20 TPS game server
ENV JAVA_OPTS="-Xms256m -Xmx512m -XX:+UseG1GC -XX:+ExitOnOutOfMemoryError"

HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:8080/health || exit 1

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]

