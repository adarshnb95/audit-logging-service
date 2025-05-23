import { Client } from '@elastic/elasticsearch';
import { ES_NODE } from '../config.js';

// Use IPv4 explicitly to avoid IPv6 resolution issues
const node = ES_NODE || 'http://127.0.0.1:9200';

const es = new Client({
  node,
  headers: { accept: 'application/vnd.elasticsearch+json;compatible-with=8' },
  sniffOnStart: false,
  sniffOnConnectionFault: false,
  sniffInterval: false
});

/**
 * Initialize the audit-logs index with the correct mappings.
 */
export async function initIndex() {
  // Wait for Elasticsearch cluster to be ready
  await es.cluster.health({ wait_for_status: 'yellow', timeout: '30s' });

  // Delete existing index if present
  await es.indices.delete({ index: 'audit-logs' }, { ignore: [404] });

  // Create index with explicit mappings
  await es.indices.create({
    index: 'audit-logs',
    body: {
      mappings: {
        properties: {
          timestamp: { type: 'date' },
          service:   { type: 'keyword' },
          eventType: { type: 'keyword' },
          userId:    { type: 'keyword' },
          payload:   { type: 'object' }
        }
      }
    }
  });
}

/**
 * Index a document into audit-logs.
 * @param {string} id - Document ID
 * @param {object} doc - Document body without _id
 */
export function indexDocument(id, doc) {
  return es.index({
    index: 'audit-logs',
    id,
    document: doc,
    refresh: 'wait_for'
  });
}

/**
 * Search for audit logs in Elasticsearch.
 * @param {object} options - Search parameters
 * @param {Array}  options.must - array of query conditions
 * @param {number} options.from - offset
 * @param {number} options.size - page size
 */
export function searchLogs({ must, from, size }) {
  return es.search({
    index: 'audit-logs',
    from,
    size,
    sort: [{ timestamp: 'desc' }],
    body: { query: { bool: { must } } }
  });
}
