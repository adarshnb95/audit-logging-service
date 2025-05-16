# Requires Pester v5 (PowerShell 7+)
# Save this as Tests/AuditService.Tests.ps1

Describe "Audit-Logging Service Tests" {
  BeforeAll {
    # Base URL for API
    $baseUrl = 'http://localhost:3000'
  }

  Context "HTTP /audit endpoint" {
    It "should accept a valid payload and return 201 with an _id" {
      $validBody = @{ 
        timestamp = (Get-Date).ToString("o");
        service   = "pester-test";
        eventType = "VALID_PAYLOAD";
        userId    = "tester";
        payload   = @{ foo = "bar" }
      } | ConvertTo-Json -Compress

      $uri = "${baseUrl}/audit"
      Write-Host "Calling API at $uri"
      $resp = Invoke-RestMethod -Method Post -Uri $uri -ContentType 'application/json' -Body $validBody

      # Assert we got an _id back
      $resp._id | Should -Not -BeNullOrEmpty
    }

    It "should reject an invalid payload (missing userId) with 400" {
      $invalidBody = @{ 
        timestamp = (Get-Date).ToString("o");
        service   = "pester-test";
        eventType = "MISSING_USER";
        payload   = @{ x = 1 }
      } | ConvertTo-Json -Compress

      $uri = "${baseUrl}/audit"
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

  Context "Kafka ingestion & search" {
    BeforeAll {
      # Base URL for API
      $baseUrl = 'http://localhost:3000'
      # Produce a test message into Kafka
      $msg = @{ 
        timestamp = (Get-Date).ToString("o");
        service   = "pester-kafka";
        eventType = "KAFKA_TEST";
        userId    = "tester";
        payload   = @{ x = "y" }
      } | ConvertTo-Json -Compress

      $msg | docker exec -i kafka /opt/bitnami/kafka/bin/kafka-console-producer.sh `
        --bootstrap-server localhost:9092 --topic audit-events

      # Give the consumer a moment to process
      Start-Sleep -Seconds 2
    }

    It "should find the Kafka-produced event via /logs/search" {
      $uri = "${baseUrl}/logs/search?q=KAFKA_TEST"
      Write-Host "Calling API at $uri"
      $search = Invoke-RestMethod -Uri $uri -TimeoutSec 5
      $search.logs | Where-Object { $_.eventType -eq "KAFKA_TEST" } | Should -Not -BeNullOrEmpty
    }
  }
}
