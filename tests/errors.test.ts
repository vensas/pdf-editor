import { describe, expect, it } from 'vitest';
import { PdfError, classifyPdfError, userMessage } from '../src/pdf-core/errors';

function namedError(name: string, message = ''): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

describe('classifyPdfError', () => {
  it('detects pdf.js password errors', () => {
    expect(classifyPdfError(namedError('PasswordException')).code).toBe('encrypted');
  });

  it('detects pdf-lib encryption errors', () => {
    expect(classifyPdfError(namedError('EncryptedPDFError')).code).toBe('encrypted');
    expect(
      classifyPdfError(new Error('Input document to `PDFDocument.load` is encrypted.')).code,
    ).toBe('encrypted');
  });

  it('detects invalid/corrupt PDFs', () => {
    expect(classifyPdfError(namedError('InvalidPDFException')).code).toBe('corrupt');
    expect(classifyPdfError(new Error('Failed to parse PDF document')).code).toBe('corrupt');
    expect(classifyPdfError(new Error('No PDF header found')).code).toBe('corrupt');
  });

  it('passes existing PdfErrors through unchanged', () => {
    const original = new PdfError('export-failed');
    expect(classifyPdfError(original)).toBe(original);
  });

  it('uses the fallback code for unknown errors', () => {
    expect(classifyPdfError(new Error('wat'), 'render-failed').code).toBe('render-failed');
    expect(classifyPdfError('a string', 'unknown').code).toBe('unknown');
  });

  it('keeps the original error as cause', () => {
    const cause = namedError('InvalidPDFException');
    expect(classifyPdfError(cause).cause).toBe(cause);
  });
});

describe('userMessage', () => {
  it('gives encrypted PDFs an explicit unsupported message', () => {
    expect(userMessage(new PdfError('encrypted'))).toMatch(/password-protected/i);
  });

  it('falls back for non-errors', () => {
    expect(userMessage(42)).toMatch(/something went wrong/i);
  });
});
