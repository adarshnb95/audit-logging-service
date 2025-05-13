# Audit Logging Service

A Node.js/Express microservice for ingesting, storing, and notifying on audit events.

---

## Table of Contents
1. [Overview](#overview)  
2. [Prerequisites](#prerequisites)  
3. [Setup](#setup)  
4. [Usage](#usage)  
5. [Docker](#docker)  
6. [Lint & Format](#lint--format)  
7. [Health Check](#health-check)  
8. [Next Steps (Day 2)](#next-steps-day-2)

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
   
   `npm install`


3. **Configure environment variables**

Create a .env file in the project root:
   
   `PORT=3000` and `MONGODB_URI=<your MongoDB URI>`

4. **Start the service**

   `npm start`

The server listens on http://localhost:3000.


5. **Ingest event (Day 2)**

   ```curl
   curl -X POST http://localhost:3000/audit \
      -H "Content-Type: application/json" \
      -d '{
         "timestamp":"2025-05-12T12:00:00Z",
         "service":"orders",
         "eventType":"CREATE_ORDER",
         "userId":"user123",
         "payload":{ "orderId": "abc123", "amount": 49.99 }
      }'

6. **Query logs (Day 2)**

Check with `curl "http://localhost:3000/logs?service=orders&page=1&limit=20"`

7. Build & run container

   ```bash
   docker build -t audit-logging-service .
   docker run -p 3000:3000 --env-file .env audit-logging-service
   Lint & Format

8. Code quality

   ```bash
   npm run lint    # ESLint checks
   npm run format  # Prettier auto-format

Verify the service is alive: using `curl http://localhost:3000/health`
# → { "status": "ok" }
Next Steps (Day 2)
Implement POST /audit → MongoDB Atlas

Add JSON schema validation

Build GET /logs endpoint with pagination & filters
