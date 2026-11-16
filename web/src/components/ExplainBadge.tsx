/** Where the explanation text comes from: Amazon Bedrock (AWS) or the deterministic fallback text. */
export function ExplainBadge({ mode }: { mode: 'bedrock' | 'offline' }) {
  return mode === 'bedrock' ? (
    <span className="badge badge--aws" data-testid="mode-badge">
      Amazon Bedrock
    </span>
  ) : (
    <span className="badge badge--mode" data-testid="mode-badge">
      Texte de secours (hors ligne)
    </span>
  );
}
