# Audit Logging Service

A Node.js/Express microservice for ingesting, storing, and notifying on audit events.

---

## Table of Contents
1. [Overview](#overview)  
2. [Prerequisites](#prerequisites)  
3. [Setup](#setup)  
4. [Usage](#usage)  
5. [Query Logs](#querylogs)
6. [Docker](#docker)  
7. [Search Logs](#search-logs)
8. [Kafka Ingestion](#kafka-ingestion)  
9. [Validation and Dead-Letter Handling](#validation-&-dead--letter-handling)  

---

## Overview

This service provides:

- **`POST /audit`** : Ingest audit events as JSON.  
- **`GET /logs`** : Query stored events with pagination and filters.  
- **`GET /health`**: Liveness/readiness check.

---

## Prerequisites

- Node.js v16+ & npm  
- Docker Desktop (optional)  
- MongoDB Atlas URI

---

## Setup

1. **Clone & branch**
```bash
   git clone git@github.com:<your-username>/audit-logging-service.git
   cd audit-logging-service
   git checkout -b dev
```

2. **Install dependencies**
```bash
    npm install
```

3. **Configure environment**

Create a `.env` file in the project root:
```env
# .env files (key=value pairs)
PORT=3000
MONGODB_URI=<your MongoDB Atlas connection string>
```

4. **Start the service**

```bash
   npm start
```

   The service listens on `http://localhost:3000`.

---

## Usage

**Ingest an audit event**

   ```bash
   curl.exe -X POST "http://localhost:3000/audit" \
      -H "Content-Type: application/json" \
      -d "@payload.json"
   ```

**Response**:

   ```json
    { "_id": "<generated_document_id>" }
   ```

## Query logs

**Examples:**

   ```bash
   curl "http://localhost:3000/logs?service=orders&page=1&limit=20"
   ```

   Page 1 of 5 logs
   ```bash
   curl "http://localhost:3000/logs?page=1&limit=5"
   ```

   Only events from service "orders"
   ```bash
   curl "http://localhost:3000/logs?service=orders"
   ```

   Date-range filter
   ```bash
   curl "http://localhost:3000/logs?start=2025-05-10T00:00:00Z&end=2025-05-12T23:59:59Z"
   ```


   **Query params:**

   **`service`** – (optional) filter by service name

   **`eventType`** – (optional) filter by event type

   **`start`/`end`** – (optional) ISO date range

   **`page`** – page number (default: 1)

   **`limit`** – page size (default: 20)

---

## Docker

**Build & run container**

   ```bash
   # Build the Docker image
   docker build -t audit-logging-service .
   ```

   ```bash
   # Build & run service + ES
   docker-compose up --build
   ```

---

## Run the container (reads your .env file)

```bash
docker run -p 3000:3000 --env-file .env audit-logging-service
```

Health Check

   ```bash
   curl http://localhost:3000/health
   # → { "status": "ok" }
   ```
---

## Search logs

```bash
curl "http://localhost:3000/logs/search?q=order&service=orders&page=1&limit=10"
```
Query params:

**`q`** – (optional) full-text search string

**`service`** – (optional) exact service filter

**`eventType`** – (optional) exact event type filter

**`start`**/**`end`** – (optional) ISO date range

**`page`** – page number (default: 1)

**`limit`** – page size (default: 20)

```bash
curl.exe "http://localhost:3000/logs/search?q=test&service=test&page=1&limit=5"
```
## Kafka Ingestion

1. Start Zookeeper & Kafka via Docker Compose:
   ```bash
   docker-compose up -d zookeeper kafka
   ```

2. Produce an audit event:
   ```bash
   echo '{"timestamp":"…","service":"…","eventType":"…","userId":"…","payload":{}}' \
  | docker exec -i kafka \
      /opt/bitnami/kafka/bin/kafka-console-producer.sh \
        --bootstrap-server localhost:9092 \
        --topic audit-events
   ```

3. Search it:
   ```bash
   curl "http://localhost:3000/logs/search?q=<yourEventType>"
   ```

## Validation & Dead-Letter Handling

- Incoming events (HTTP & Kafka) are validated against a JSON schema.
- Malformed events are rejected (HTTP 400) or skipped (Kafka) and stored in `audit_dead_letters`.
- Those records include the raw payload, validation errors, and timestamp.