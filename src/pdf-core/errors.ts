/**
 * Unified, user-presentable error model for everything that can go wrong
 * while reading or writing PDFs. Both pdf-lib and pdf.js throw their own
 * error classes; classifyPdfError() folds them into one domain type.
 */

export type PdfErrorCode =
  'encrypted' | 'corrupt' | 'not-a-pdf' | 'render-failed' | 'export-failed' | 'unknown';

const USER_MESSAGES: Record<PdfErrorCode, string> = {
  encrypted:
    'This PDF is password-protected. Encrypted PDFs are not supported — remove the password first (locally, e.g. with your PDF viewer’s “export” function).',
  corrupt: 'This file looks like a damaged or incomplete PDF and could not be read.',
  'not-a-pdf': 'This file is not a PDF.',
  'render-failed': 'This page could not be rendered.',
  'export-failed': 'Something went wrong while writing the PDF.',
  unknown: 'Something went wrong while processing the PDF.',
};

export class PdfError extends Error {
  readonly code: PdfErrorCode;

  constructor(code: PdfErrorCode, message?: string, options?: { cause?: unknown }) {
    super(message ?? USER_MESSAGES[code], options);
    this.name = 'PdfError';
    this.code = code;
  }
}

/** Message safe to show in the UI. */
export function userMessage(error: unknown): string {
  if (error instanceof PdfError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return USER_MESSAGES.unknown;
}

/**
 * Maps arbitrary thrown values (pdf-lib, pdf.js, DOM) onto a PdfError.
 * Detection is name/message based because the libraries' error classes
 * are not exported consistently across bundles and workers.
 */
export function classifyPdfError(error: unknown, fallback: PdfErrorCode = 'unknown'): PdfError {
  if (error instanceof PdfError) return error;

  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);

  // pdf.js: PasswordException; pdf-lib: EncryptedPDFError
  if (
    name === 'PasswordException' ||
    name === 'EncryptedPDFError' ||
    /encrypted|password/i.test(message)
  ) {
    return new PdfError('encrypted', undefined, { cause: error });
  }

  // pdf.js: InvalidPDFException ("Invalid PDF structure"); pdf-lib parse errors
  if (
    name === 'InvalidPDFException' ||
    name === 'FormatError' ||
    /invalid pdf|no pdf header|failed to parse/i.test(message)
  ) {
    return new PdfError('corrupt', undefined, { cause: error });
  }

  if (name === 'MissingPDFException' || /missing pdf/i.test(message)) {
    return new PdfError('not-a-pdf', undefined, { cause: error });
  }

  return new PdfError(fallback, undefined, { cause: error });
}
