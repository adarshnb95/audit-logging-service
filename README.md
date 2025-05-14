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
6. [Lint & Format](#lint--format)  
7. [Health Check](#health-check)  

---

## Overview

This service provides:

- **`POST /audit`** (coming Day 2): Ingest audit events as JSON.  
- **`GET /logs`** (coming Day 2): Query stored events with pagination and filters.  
- **`GET /health`**: Liveness/readiness check.

---

## Prerequisites

- Node.js v16+ & npm  
- Docker Desktop (optional)  
- MongoDB Atlas URI (for Day 2)

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

1. **Ingest an audit event**

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

    ```bash
    curl "http://localhost:3000/logs?service=orders&page=1&limit=20"
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

# Run the container (reads your .env file)
docker run -p 3000:3000 --env-file .env audit-logging-service

Health Check

   ```bash
   curl http://localhost:3000/health
   # → { "status": "ok" }
   ```