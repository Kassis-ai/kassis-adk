/** FR-22. Reject always needs 10 characters. Approve needs them only when settings say so. */
export function commentRejection(
  decision: 'approve' | 'reject',
  comment: string,
  requireApproveComment: boolean
): 'reject-comment-short' | 'approve-comment-required' | null {
  const text = comment.trim();
  if (decision === 'reject' && text.length < 10) return 'reject-comment-short';
  if (decision === 'approve' && requireApproveComment && text.length < 10) {
    return 'approve-comment-required';
  }
  return null;
}
