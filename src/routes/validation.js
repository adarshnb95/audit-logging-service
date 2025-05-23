import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

// Resolve JSON schema path relative to this file
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const schemaPath = new URL('../schema/auditEvent.json', import.meta.url);

// Load and parse the JSON schema
const auditEventSchema = JSON.parse(readFileSync(schemaPath, 'utf8'));

// Initialize AJV with format support
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

// Compile the schema
const validate = ajv.compile(auditEventSchema);

/**
 * Validates an audit event payload.
 * @param {object} data - The event payload to validate.
 * @returns {{ valid: boolean, errors: import('ajv').ErrorObject[]|null }}
 */
export function validateEvent(data) {
  const valid = validate(data);
  return {
    valid,
    errors: valid ? null : validate.errors
  };
}
