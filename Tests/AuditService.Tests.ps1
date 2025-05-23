# Tests/AuditService.Tests.ps1
# Requires Pester v5 (PowerShell 7+)

# Base URL for API
$baseUrl = 'http://localhost:3000'

Describe 'Audit-Logging Service Tests' {

  Context 'HTTP /audit endpoint' {
    It 'should accept a valid payload and return 201 with an _id' {
      $validBody = @{
        timestamp = (Get-Date).ToString('o')
        service   = 'pester-test'
        eventType = 'VALID_PAYLOAD'
        userId    = 'tester'
        payload   = @{ foo = 'bar' }
      } | ConvertTo-Json -Compress

      $uri = "$baseUrl/audit"
      Write-Host "Calling API at $uri"
      $resp = Invoke-RestMethod -Method Post -Uri $uri -ContentType 'application/json' -Body $validBody
      $resp._id | Should -Not -BeNullOrEmpty
    }

    It 'should reject an invalid payload (missing userId) with 400' {
      $invalidBody = @{
        timestamp = (Get-Date).ToString('o')
        service   = 'pester-test'
        eventType = 'MISSING_USER'
        payload   = @{ x = 1 }
      } | ConvertTo-Json -Compress

      $uri = "$baseUrl/audit"
      Write-Host "Calling API at $uri"
      $status = 0
      Try {
        Invoke-RestMethod -Method Post -Uri $uri -ContentType 'application/json' -Body $invalidBody -ErrorAction Stop
      } Catch [System.Net.WebException] {
        $status = $_.Exception.Response.StatusCode.Value__
      }
      $status | Should -Be 400
    }
  }

  Context 'HTTP /logs endpoint (MongoDB query)' {
    BeforeAll {
      $body = @{
        timestamp = (Get-Date).ToString('o')
        service   = 'query-test'
        eventType = 'QUERY_PAYLOAD'
        userId    = 'tester'
        payload   = @{ key = 'value' }
      } | ConvertTo-Json -Compress

      Invoke-RestMethod -Method Post -Uri "$baseUrl/audit" -ContentType 'application/json' -Body $body
      Start-Sleep -Seconds 1
    }

    It 'should return events via /logs filtered by service' {
      $uri = "$baseUrl/logs?service=query-test"
      Write-Host "Calling API at $uri"
      $resp = Invoke-RestMethod -Uri $uri
      $resp.logs | Should -Not -BeNullOrEmpty
      $resp.logs[0].service | Should -Be 'query-test'
    }
  }

  Context 'HTTP /logs/search endpoint (Elasticsearch)' {
    BeforeAll {
      $body = @{
        timestamp = (Get-Date).ToString('o')
        service   = 'search-test'
        eventType = 'SEARCH_PAYLOAD'
        userId    = 'tester'
        payload   = @{ match = 'yes' }
      } | ConvertTo-Json -Compress

      Invoke-RestMethod -Method Post -Uri "$baseUrl/audit" -ContentType 'application/json' -Body $body
      Start-Sleep -Seconds 2
    }

    It 'should return events via /logs/search?q=SEARCH_PAYLOAD' {
      $uri = "$baseUrl/logs/search?q=SEARCH_PAYLOAD"
      Write-Host "Calling API at $uri"
      $resp = Invoke-RestMethod -Uri $uri
      $resp.logs | Where-Object { $_.eventType -eq 'SEARCH_PAYLOAD' } | Should -Not -BeNullOrEmpty
    }
  }

  Context 'Kafka ingestion & search' {
    BeforeAll {
      $valid = @{
        timestamp = (Get-Date).ToString('o')
        service   = 'kafka-test'
        eventType = 'KAFKA_VALID'
        userId    = 'tester'
        payload   = @{ x = 'y' }
      } | ConvertTo-Json -Compress
      $valid | docker exec -i kafka /opt/bitnami/kafka/bin/kafka-console-producer.sh --bootstrap-server localhost:9092 --topic audit-events

      $invalid = @{ foo = 'bar' } | ConvertTo-Json -Compress
      $invalid | docker exec -i kafka /opt/bitnami/kafka/bin/kafka-console-producer.sh --bootstrap-server localhost:9092 --topic audit-events

      Start-Sleep -Seconds 3
    }

    It 'should find the valid Kafka-produced event via /logs/search?eventType=KAFKA_VALID' {
      $uri = "$baseUrl/logs/search?eventType=KAFKA_VALID"
      Write-Host "Calling API at $uri"
      $resp = Invoke-RestMethod -Uri $uri
      $resp.logs | Where-Object { $_.eventType -eq 'KAFKA_VALID' } | Should -Not -BeNullOrEmpty
    }

    It 'should not index invalid Kafka messages' {
      $uri = "$baseUrl/logs/search?eventType=INVALID"
      Write-Host "Calling API at $uri"
      $resp = Invoke-RestMethod -Uri $uri
      $resp.logs | Where-Object { $_.payload.foo -eq 'bar' } | Should -BeNullOrEmpty
    }
  }

}
