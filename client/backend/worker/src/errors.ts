import { jsonResponse } from './http';

/**
 * Every user-facing failure the Worker can return, as a stable machine code.
 *
 * The Worker used to reply with English prose, which made the backend the
 * owner of copy in a bilingual app: adding Arabic would have meant either
 * teaching the Worker every language or leaving a third of the app's error
 * surface untranslatable. Codes move that decision to the client, where the
 * locale actually lives, and mean a new language never requires a deploy.
 *
 * The English text stays here and is still sent as `message`. That is
 * deliberate, not redundancy: builds already in testing read `message` and
 * know nothing about `code`, so dropping it would turn every error in those
 * builds into a blank line. It also gives a newer client something honest to
 * show if the Worker ever returns a code that build has no string for.
 */
export const ERROR_MESSAGES = {
  // Extraction
  extractionUnreachable: 'Could not reach the extraction service.',
  extractionUnreadable: 'Extraction service returned an unreadable response.',
  extractionTruncated: 'Extraction was truncated — the receipt may have too many items.',
  extractionMalformed: 'Extraction service response was malformed.',
  extractionUnreadablePrice: 'Extraction service returned an unreadable price.',
  extractionNotConfigured: 'Extraction service is not configured.',
  photoUnreadable: 'Could not read the uploaded photo(s).',
  photoMissing: 'No image received.',
  // The client knows its own upload cap, so it interpolates its own number
  // rather than the Worker's — the code alone is enough to identify this.
  tooManyPhotos: 'Too many photos at once.',
  extractionUpstreamError: 'The extraction service returned an error.',

  // Auth and access
  signInRequired: 'Sign-in required.',
  notGroupMember: 'Not a member of this group.',
  groupAdminOnly: 'Only the group creator can do this.',
  unauthorized: 'Unauthorized.',
  emailRequired: 'A valid email address is required.',
  emailAndCodeRequired: 'Email and code are required.',
  tooManyCodes: 'Too many codes requested — try again later.',
  codeSendFailed: 'Could not send the verification code.',

  // Account
  accountNotFound: 'Account not found.',
  nameRequired: 'Enter a name.',
  nameTooLong: 'Name is too long.',
  nameLengthExceeded: 'That name is too long.',

  // Groups
  groupNameRequired: 'A group name is required.',
  groupKindInvalid: 'Invalid group kind.',
  groupNotFound: 'Group not found.',
  inviteNotFound: 'No pending invite found for this group.',
  inviteFieldsRequired: 'A valid email address and display name are required.',
  alreadyMember: 'That email address is already a member.',

  // Expenses and settlements
  expensePayloadMalformed: 'Malformed expense payload.',
  expenseNotFound: 'Expense not found in this group.',
  settlementPayloadInvalid: 'A valid settlement payload is required.',
  settlementNotParty: 'You can only record a settlement you are a party to.',
  settlementMembersInvalid: 'Both members must belong to this group.',

  // Routing
  notFound: 'Not found.',
} as const;

export type ErrorCode = keyof typeof ERROR_MESSAGES;

export type ErrorBody = {
  status: 'error';
  code: ErrorCode;
  /** English fallback — see the note above on why this is still sent. */
  message: string;
};

/** The error shape, for callers that need the object rather than a Response. */
export function errorBody(code: ErrorCode): ErrorBody {
  return { status: 'error', code, message: ERROR_MESSAGES[code] };
}

/** The common case: an error as an HTTP response. */
export function errorResponse(code: ErrorCode, status: number): Response {
  return jsonResponse(errorBody(code), status);
}
